import "server-only";
import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWhatsAppProvider } from "@/lib/whatsapp/provider";
import {
  computeStatusPatch,
  type BotInteractionStatusState,
  type DeliveryStatus,
  type TwilioMessageStatus,
} from "@/lib/whatsapp/status";

// El SDK de Twilio (validación de firma) necesita Node; Edge no sirve aquí.
export const runtime = "nodejs";

const WEBHOOK_PATH = "/api/webhooks/whatsapp/status";
const KNOWN_TWILIO_STATUSES: ReadonlySet<string> = new Set([
  "queued",
  "sending",
  "sent",
  "delivered",
  "undelivered",
  "failed",
  "read",
]);

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

/**
 * `StatusCallback` de Twilio — callback de entrega de `bot_interactions`.
 * Sección "Entrega" de kuni-plan-tecnico.md y `docs/documentacionB.md`
 * ("Pendiente para B"): valida firma, deduplica por (proveedor, sid+status)
 * en `webhook_events`, y aplica la progresión de `computeStatusPatch()`
 * (status.ts) sin dejar que un callback desordenado pise un resultado ya
 * confirmado.
 *
 * Siempre responde 200 salvo firma inválida (403) o payload sin forma
 * reconocible (400) — un 5xx le dice a Twilio "reintenta", así que solo se
 * usa para fallas realmente transitorias (ver los catch de abajo).
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const params = Object.fromEntries(new URLSearchParams(rawBody));

  const provider = await getWhatsAppProvider();
  if (!serverEnv.APP_PUBLIC_URL) {
    console.error("[whatsapp/status] APP_PUBLIC_URL no configurado; no se puede validar la firma.");
    return new NextResponse(null, { status: 500 });
  }
  const url = `${serverEnv.APP_PUBLIC_URL}${WEBHOOK_PATH}`;
  const signatureHeader = request.headers.get("x-twilio-signature");
  if (!provider.verifyWebhookSignature({ signatureHeader, url, params })) {
    return new NextResponse("Firma inválida", { status: 403 });
  }

  const messageSid = params.MessageSid;
  const rawStatus = params.MessageStatus;
  if (!messageSid || !rawStatus || !KNOWN_TWILIO_STATUSES.has(rawStatus)) {
    return new NextResponse("Payload de callback incompleto o irreconocible", { status: 400 });
  }
  const twilioStatus = rawStatus as TwilioMessageStatus;
  const errorCode = params.ErrorCode ?? null;
  const errorMessage = params.ErrorMessage ?? null;

  const admin = createAdminClient();
  // Dedup: el mismo (MessageSid, MessageStatus) no debe aplicarse dos veces
  // si Twilio reintenta la entrega del webhook (falta de ACK a tiempo, etc.).
  const eventKey = `${messageSid}:${twilioStatus}`;
  const { error: insertEventError } = await admin.from("webhook_events").insert({
    provider: provider.dbProviderValue,
    event_key: eventKey,
    event_type: "status",
    external_message_id: messageSid,
    normalized_payload: params,
  });

  if (insertEventError) {
    if (isUniqueViolation(insertEventError)) {
      return new NextResponse(null, { status: 200 });
    }
    console.error("[whatsapp/status] error persistiendo webhook_events:", insertEventError);
    return new NextResponse(null, { status: 500 });
  }

  const markEvent = (fields: { processing_status: string; last_error?: string | null }) =>
    admin
      .from("webhook_events")
      .update({ ...fields, processed_at: new Date().toISOString() })
      .eq("provider", provider.dbProviderValue)
      .eq("event_key", eventKey);

  const { data: interaction, error: findError } = await admin
    .from("bot_interactions")
    .select("id, unit_id, patient_id, delivery_status, expects_response, delivered_at, response_deadline_at")
    .eq("provider_message_id", messageSid)
    .maybeSingle();

  if (findError) {
    console.error("[whatsapp/status] error buscando bot_interaction:", findError);
    return new NextResponse(null, { status: 500 });
  }

  if (!interaction) {
    // No es un error de Twilio ni algo que reintentar: es un mensaje que
    // esta app nunca mandó con ese SID (u otro ambiente/proyecto). Se deja
    // constancia y se ACK de todos modos.
    await markEvent({ processing_status: "ignored", last_error: "Sin bot_interaction con ese provider_message_id." });
    return new NextResponse(null, { status: 200 });
  }

  let botResponseTimeoutMinutes = 60;
  if (interaction.expects_response && !interaction.delivered_at) {
    const { data: patient, error: patientError } = await admin
      .from("patients")
      .select("bot_response_timeout_minutes")
      .eq("unit_id", interaction.unit_id)
      .eq("id", interaction.patient_id)
      .maybeSingle();
    if (patientError) {
      console.error("[whatsapp/status] error leyendo timeout del paciente:", patientError);
      return new NextResponse(null, { status: 500 });
    }
    // Paciente inactivo/borrado entre el envío y este callback: usa el
    // default documentado (60 min, el mismo de la columna) en vez de fallar
    // el callback por un dato que ya no es alcanzable.
    botResponseTimeoutMinutes = patient?.bot_response_timeout_minutes ?? 60;
  }

  const state: BotInteractionStatusState = {
    deliveryStatus: interaction.delivery_status as DeliveryStatus,
    expectsResponse: interaction.expects_response,
    deliveredAt: interaction.delivered_at,
    responseDeadlineAt: interaction.response_deadline_at,
    botResponseTimeoutMinutes,
  };

  const patch = computeStatusPatch(state, { twilioStatus, errorCode, errorMessage, receivedAt: new Date() });

  if (patch) {
    const { error: updateError } = await admin.from("bot_interactions").update(patch).eq("id", interaction.id);
    if (updateError) {
      console.error("[whatsapp/status] error aplicando patch:", updateError);
      return new NextResponse(null, { status: 500 });
    }
  }

  await markEvent({ processing_status: "processed" });
  return new NextResponse(null, { status: 200 });
}
