import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { computeStatusPatch, type BotInteractionStatusState, type DeliveryStatus, type TwilioMessageStatus } from "@/lib/whatsapp/status";

type ApplyOutcome = "applied" | "noop" | "not_found" | "error";

/**
 * Lee, calcula el patch y escribe — con reintento optimista.
 *
 * Dos callbacks (ej. `sent` y `read`) pueden llegar casi simultáneos; sin
 * esto, ambos leen el mismo estado "antes", calculan patches válidos por
 * separado, y el que escribe último pisa al otro sin haber visto su
 * resultado — perdiendo silenciosamente el progreso más avanzado (se probó
 * en vivo: 'read' llegó primero, luego 'sent' lo sobrescribió a 'accepted'
 * a pesar de que `delivered_at`/`read_at` ya estaban puestos). El `WHERE
 * delivery_status = <lo que leí>` en el update hace que ese `update` no
 * afecte ninguna fila si alguien más ya la cambió mientras tanto; en ese
 * caso se vuelve a leer el estado YA actualizado y se recalcula, en vez de
 * escribir a ciegas sobre datos obsoletos.
 */
export async function applyStatusPatchWithRetry(
  admin: ReturnType<typeof createAdminClient>,
  messageSid: string,
  event: { twilioStatus: TwilioMessageStatus; errorCode: string | null; errorMessage: string | null; receivedAt: Date; provider: string },
  maxAttempts = 5,
): Promise<ApplyOutcome> {
  let botResponseTimeoutMinutes: number | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const { data: interaction, error: findError } = await admin
      .from("bot_interactions")
      .select("id, unit_id, patient_id, delivery_status, expects_response, delivered_at, response_deadline_at")
      .eq("provider_message_id", messageSid)
      .eq("provider", event.provider)
      .maybeSingle();

    if (findError) {
      console.error("[whatsapp/status] error buscando bot_interaction:", findError);
      return "error";
    }
    if (!interaction) return "not_found";

    if (botResponseTimeoutMinutes === null && interaction.expects_response && !interaction.delivered_at) {
      const { data: patient, error: patientError } = await admin
        .from("patients")
        .select("bot_response_timeout_minutes")
        .eq("unit_id", interaction.unit_id)
        .eq("id", interaction.patient_id)
        .maybeSingle();
      if (patientError) {
        console.error("[whatsapp/status] error leyendo timeout del paciente:", patientError);
        return "error";
      }
      // Paciente inactivo/borrado entre el envío y este callback: usa el
      // default documentado (60 min, el mismo de la columna) en vez de
      // fallar el callback por un dato que ya no es alcanzable.
      botResponseTimeoutMinutes = patient?.bot_response_timeout_minutes ?? 60;
    }

    const state: BotInteractionStatusState = {
      deliveryStatus: interaction.delivery_status as DeliveryStatus,
      expectsResponse: interaction.expects_response,
      deliveredAt: interaction.delivered_at,
      responseDeadlineAt: interaction.response_deadline_at,
      botResponseTimeoutMinutes: botResponseTimeoutMinutes ?? 60,
    };

    const patch = computeStatusPatch(state, event);
    if (!patch) return "noop";

    const { data: updated, error: updateError } = await admin
      .from("bot_interactions")
      .update(patch)
      .eq("id", interaction.id)
      .eq("unit_id", interaction.unit_id)
      .eq("delivery_status", interaction.delivery_status) // concurrencia optimista
      .select("id");

    if (updateError) {
      console.error("[whatsapp/status] error aplicando patch:", updateError);
      return "error";
    }
    if (updated && updated.length > 0) return "applied";
    // 0 filas afectadas: otro request cambió el estado entre el select y
    // el update. Reintentar contra el estado fresco.
  }

  console.error(`[whatsapp/status] no se pudo aplicar el patch tras ${maxAttempts} intentos (contención alta) para ${messageSid}`);
  return "error";
}
