import "server-only";
import type { Database } from "@/types/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env/server";
import { getWhatsAppProvider, WhatsAppProviderError } from "@/lib/whatsapp/provider";
import { renderReminderBody } from "@/lib/whatsapp/message-body";

/**
 * Envío — sección 3 de kuni-plan-tecnico.md y `docs/documentacionB.md`
 * ("Qué falta de B" #3). Reclama interacciones vencidas con la RPC
 * `claim_due_interactions` (ya existente, atómica) y las manda por el
 * proveedor configurado.
 *
 * Regla de canal por interacción (WhatsApp real exige plantilla aprobada
 * para INICIAR una conversación fuera de la ventana de 24h de sesión; texto
 * libre solo vale dentro de esa ventana):
 * 1. Si el paciente escribió hace menos de 24h (`patient_messaging_state.
 *    last_inbound_at`), se manda texto libre — sirve para probar el
 *    circuito real hoy mismo con el número que ya se unió al Sandbox.
 * 2. Si no, se usa la plantilla aprobada de Twilio para ese `kind` (B5,
 *    `templateFor()` abajo) — CADA una de las cinco tiene su propio Content
 *    SID en `serverEnv` porque el texto y las variables de una plantilla
 *    aprobada son fijos, no se puede reutilizar una para contenido distinto.
 *    Si el SID de ese `kind` todavía no está configurado (plantilla sin
 *    aprobar), se marca `failed` con un código explícito en vez de inventar
 *    contenido de plantilla o mandar texto libre que WhatsApp rechazaría.
 */

type ClaimedInteraction = Database["public"]["Functions"]["claim_due_interactions"]["Returns"][number];

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SendResult {
  claimed: number;
  sent: number;
  failed: number;
}

function medicationSnapshot(payload: unknown): { doseText: string; medicationName: string | null } {
  const p = (payload ?? {}) as Record<string, unknown>;
  return {
    doseText: typeof p.doseText === "string" ? p.doseText : "tu medicamento indicado",
    medicationName: typeof p.medicationName === "string" ? p.medicationName : null,
  };
}

function measurementVariable(payload: unknown): "glucose" | "blood_pressure" {
  const p = (payload ?? {}) as Record<string, unknown>;
  return p.variable === "blood_pressure" ? "blood_pressure" : "glucose";
}

export async function sendDueInteractions(batchSize = 25): Promise<SendResult> {
  const admin = createAdminClient();
  const provider = await getWhatsAppProvider();

  const { data: claimed, error: claimError } = await admin.rpc("claim_due_interactions", { batch_size: batchSize });
  if (claimError) throw claimError;
  if (!claimed?.length) return { claimed: 0, sent: 0, failed: 0 };

  const patientIds = [...new Set(claimed.map((i) => i.patient_id))];
  const [{ data: patients, error: patientsError }, { data: messagingStates, error: messagingError }] = await Promise.all([
    admin.from("patients").select("id, whatsapp_e164").in("id", patientIds),
    admin.from("patient_messaging_state").select("patient_id, last_inbound_at").in("patient_id", patientIds),
  ]);
  if (patientsError) throw patientsError;
  if (messagingError) throw messagingError;

  const phoneByPatient = new Map((patients ?? []).map((p) => [p.id, p.whatsapp_e164]));
  const lastInboundByPatient = new Map((messagingStates ?? []).map((m) => [m.patient_id, m.last_inbound_at]));

  let sent = 0;
  let failed = 0;
  const now = Date.now();

  for (const interaction of claimed as ClaimedInteraction[]) {
    const outcome = await sendOne(interaction, {
      admin,
      provider,
      phoneE164: phoneByPatient.get(interaction.patient_id) ?? null,
      recentSession: hasRecentSession(lastInboundByPatient.get(interaction.patient_id) ?? null, now),
    });
    if (outcome === "sent") sent += 1;
    else failed += 1;
  }

  return { claimed: claimed.length, sent, failed };
}

function hasRecentSession(lastInboundAt: string | null, nowMs: number): boolean {
  if (!lastInboundAt) return false;
  return nowMs - new Date(lastInboundAt).getTime() < DAY_MS;
}

async function sendOne(
  interaction: ClaimedInteraction,
  ctx: {
    admin: ReturnType<typeof createAdminClient>;
    provider: Awaited<ReturnType<typeof getWhatsAppProvider>>;
    phoneE164: string | null;
    recentSession: boolean;
  },
): Promise<"sent" | "failed"> {
  const markFailed = async (code: string, detail: string) => {
    await ctx.admin
      .from("bot_interactions")
      .update({ delivery_status: "failed", failure_code: code, failure_detail: detail })
      .eq("id", interaction.id);
    return "failed" as const;
  };

  if (!ctx.phoneE164) {
    return markFailed("patient_not_found", "El paciente de esta interacción ya no existe o no tiene teléfono.");
  }

  if (!ctx.recentSession) {
    const template = templateFor(interaction);
    if (!template) {
      return markFailed(
        "template_not_configured",
        `Sin ventana de sesión reciente (paciente no escribió en las últimas 24h) y sin plantilla aprobada configurada para kind='${interaction.kind}'.`,
      );
    }
    return sendAndRecord(ctx, interaction, () =>
      ctx.provider.sendTemplateMessage({ toE164: ctx.phoneE164!, contentSid: template.contentSid, contentVariables: template.contentVariables }),
    );
  }

  const body = renderMessageBody(interaction);
  if (!body) {
    return markFailed("unsupported_kind", `No hay redacción de texto libre para kind='${interaction.kind}'.`);
  }

  return sendAndRecord(ctx, interaction, () => ctx.provider.sendFreeformMessage({ toE164: ctx.phoneE164!, body }));
}

async function sendAndRecord(
  ctx: { admin: ReturnType<typeof createAdminClient> },
  interaction: ClaimedInteraction,
  send: () => Promise<{ providerMessageId: string; acceptedAt: Date }>,
): Promise<"sent" | "failed"> {
  try {
    const result = await send();
    await ctx.admin
      .from("bot_interactions")
      .update({
        delivery_status: "accepted",
        accepted_at: result.acceptedAt.toISOString(),
        provider_message_id: result.providerMessageId,
      })
      .eq("id", interaction.id);
    return "sent";
  } catch (error) {
    const providerError =
      error instanceof WhatsAppProviderError
        ? error
        : new WhatsAppProviderError("unknown", "Error inesperado enviando el mensaje.", { retriable: false, cause: error });
    // Un error "reintentable" (rate limit, proveedor caído) es ambiguo: no
    // sabemos si Twilio de todos modos llegó a encolarlo. 'unknown' evita
    // declarar un 'failed' definitivo que un reintento ciego podría
    // duplicar — reconciliar eso es trabajo pendiente (ver documentacionB.md).
    await ctx.admin
      .from("bot_interactions")
      .update({
        delivery_status: providerError.retriable ? "unknown" : "failed",
        failure_code: providerError.code,
        failure_detail: providerError.providerDetail ?? providerError.message,
      })
      .eq("id", interaction.id);
    return "failed";
  }
}

function appointmentSnapshot(payload: unknown): { startsAtLocal: string; roomName: string | null } {
  const p = (payload ?? {}) as Record<string, unknown>;
  return {
    startsAtLocal: typeof p.startsAtLocal === "string" ? p.startsAtLocal : "próximamente",
    roomName: typeof p.roomName === "string" ? p.roomName : null,
  };
}

function renderMessageBody(interaction: ClaimedInteraction): string | null {
  if (interaction.kind === "medication") {
    const snapshot = medicationSnapshot(interaction.payload_snapshot);
    return renderReminderBody({ kind: "medication", replyCode: interaction.reply_code, ...snapshot });
  }
  if (interaction.kind === "measurement") {
    return renderReminderBody({
      kind: "measurement",
      replyCode: interaction.reply_code,
      variable: measurementVariable(interaction.payload_snapshot),
    });
  }
  if (interaction.kind === "appointment") {
    return renderReminderBody({ kind: "appointment", ...appointmentSnapshot(interaction.payload_snapshot) });
  }
  if (interaction.kind === "nonresponse_summary") {
    return renderReminderBody({ kind: "nonresponse_summary" });
  }
  return null;
}

/**
 * B5 — plantilla aprobada para mandar fuera de la ventana de sesión. `null`
 * si el Content SID de ese `kind` (o esa variable de medición) no está
 * configurado: el llamador ya sabe fallar explícito con
 * `template_not_configured` en ese caso, igual que antes de B5.
 *
 * Las claves de `contentVariables` ("1", "2", ...) son las que Twilio
 * Content API espera para mapear a `{{1}}`/`{{2}}` del cuerpo de la
 * plantilla aprobada — el texto exacto enviado a revisión está en
 * `docs/bitacora-canal-b.md` 2026-09-08 (B5); si Twilio pide cambiar el
 * texto o el orden de variables durante la revisión, este es el único lugar
 * que hay que ajustar.
 */
function templateFor(interaction: ClaimedInteraction): { contentSid: string; contentVariables: Record<string, string> } | null {
  if (interaction.kind === "medication") {
    if (!serverEnv.TWILIO_MEDICATION_CONTENT_SID) return null;
    const snapshot = medicationSnapshot(interaction.payload_snapshot);
    const medication = snapshot.medicationName ? `${snapshot.medicationName} — ${snapshot.doseText}` : snapshot.doseText;
    return {
      contentSid: serverEnv.TWILIO_MEDICATION_CONTENT_SID,
      contentVariables: { "1": medication, "2": interaction.reply_code },
    };
  }
  if (interaction.kind === "measurement") {
    const variable = measurementVariable(interaction.payload_snapshot);
    const contentSid = variable === "glucose" ? serverEnv.TWILIO_MEASUREMENT_GLUCOSE_CONTENT_SID : serverEnv.TWILIO_MEASUREMENT_BP_CONTENT_SID;
    if (!contentSid) return null;
    return { contentSid, contentVariables: { "1": interaction.reply_code } };
  }
  if (interaction.kind === "appointment") {
    if (!serverEnv.TWILIO_APPOINTMENT_CONTENT_SID) return null;
    const snapshot = appointmentSnapshot(interaction.payload_snapshot);
    return {
      contentSid: serverEnv.TWILIO_APPOINTMENT_CONTENT_SID,
      contentVariables: { "1": snapshot.roomName ?? "tu unidad de salud", "2": snapshot.startsAtLocal },
    };
  }
  if (interaction.kind === "nonresponse_summary") {
    if (!serverEnv.TWILIO_NONRESPONSE_CONTENT_SID) return null;
    return { contentSid: serverEnv.TWILIO_NONRESPONSE_CONTENT_SID, contentVariables: {} };
  }
  return null;
}
