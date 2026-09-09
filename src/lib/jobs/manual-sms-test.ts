import "server-only";

import { z } from "zod";

import { AppError } from "@/contracts/errors";
import {
  MANUAL_SMS_TEST_BODY,
  MANUAL_WHATSAPP_TEST_BODY,
  type ManualMessageTestResult,
} from "@/contracts/messaging";
import { mapClinicalRpcFailure } from "@/lib/clinical/rpc-errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getTwilioWhatsAppProvider, getWhatsAppProvider, WhatsAppProviderError } from "@/lib/whatsapp/provider";
import type { Database } from "@/types/database.types";

const requestedInteractionSchema = z.object({
  data: z.object({
    interaction: z.object({
      id: z.uuid(),
      created: z.boolean(),
      deliveryStatus: z.string(),
      claimedAt: z.iso.datetime({ offset: true }).optional(),
      phoneE164: z.string().min(1).optional(),
    }),
  }),
  error: z.null(),
});

type ManualMessageContext = {
  patientId: string;
  requestId: string;
  unitId: string;
  roomId: string;
  channel: "sms" | "whatsapp";
};

/**
 * Crea y envía una interacción de prueba aislada. La RPC vuelve a comprobar
 * membresía, consultorio, paciente activo y consentimiento, además de imponer
 * idempotencia y un límite de un intento por paciente cada 30 segundos.
 */
export async function sendManualMessageTest(input: ManualMessageContext): Promise<ManualMessageTestResult> {
  const provider = input.channel === "whatsapp"
    ? await getTwilioWhatsAppProvider()
    : await getWhatsAppProvider();
  const supportedProvider =
    (input.channel === "sms" && ["sms8", "smsgate"].includes(provider.dbProviderValue))
    || (input.channel === "whatsapp" && provider.dbProviderValue === "twilio");
  if (provider.channel !== input.channel || !supportedProvider) {
    throw new AppError(
      "VALIDATION",
      `Kuni no está configurado para enviar pruebas por ${input.channel === "sms" ? "SMS" : "WhatsApp"}.`,
    );
  }

  const supabase = await createClient();
  const response = await supabase.rpc("request_manual_message_test", {
    p_patient_id: input.patientId,
    p_unit_id: input.unitId,
    p_room_id: input.roomId,
    p_request_id: input.requestId,
    p_provider: provider.dbProviderValue,
    p_channel: input.channel,
  });
  if (response.error) {
    if (response.error.message.includes("PATIENT_NOT_ELIGIBLE_FOR_MESSAGE")) {
      throw new AppError(
        "CONFLICT",
        "El paciente debe estar activo, pertenecer al consultorio y tener consentimiento vigente para mensajería.",
      );
    }
    if (response.error.message.includes("WHATSAPP_WINDOW_CLOSED")) {
      throw new AppError(
        "CONFLICT",
        "La ventana de WhatsApp está cerrada. Desde ese número envía primero un mensaje al Sandbox y vuelve a intentar.",
      );
    }
    if (response.error.message.includes("MANUAL_MESSAGE_RATE_LIMIT")) {
      throw new AppError("CONFLICT", "Espera 30 segundos antes de enviar otra prueba a este paciente.");
    }
    throw mapClinicalRpcFailure(response.error);
  }

  const parsed = requestedInteractionSchema.safeParse(response.data);
  if (!parsed.success) {
    throw new AppError("INTERNAL", "No se pudo confirmar la solicitud de mensajería de prueba.");
  }
  const interaction = parsed.data.data.interaction;
  if (!interaction.created) return { status: "already_requested" };
  if (!interaction.claimedAt || !interaction.phoneE164) {
    throw new AppError("INTERNAL", "La solicitud de prueba quedó incompleta y no se envió.");
  }

  const admin = createAdminClient();
  let sent: { providerMessageId: string; acceptedAt: Date };
  try {
    sent = await provider.sendFreeformMessage({
      toE164: interaction.phoneE164,
      body: input.channel === "sms" ? MANUAL_SMS_TEST_BODY : MANUAL_WHATSAPP_TEST_BODY,
    });
  } catch (error) {
    const providerError = error instanceof WhatsAppProviderError
      ? error
      : new WhatsAppProviderError("unknown", "Error inesperado enviando la prueba de mensajería.", {
          retriable: true,
          cause: error,
        });
    await updateClaim(admin, interaction.id, interaction.claimedAt, {
      delivery_status: providerError.retriable ? "unknown" : "failed",
      failure_code: providerError.code,
      failure_detail: providerError.providerDetail ?? providerError.message,
    });
    throw new AppError(
      "PROVIDER_UNAVAILABLE",
      providerError.retriable
        ? "El proveedor no confirmó la prueba. Revisa el estado antes de volver a intentarlo."
        : "El proveedor rechazó la prueba. Revisa el número, la ventana y la configuración del canal.",
    );
  }

  // Si el proveedor ya aceptó y falla esta escritura, no se vuelve a llamar a
  // SMS8: el request_id seguirá identificando la operación para reconciliarla.
  await updateClaim(admin, interaction.id, interaction.claimedAt, {
    delivery_status: "accepted",
    accepted_at: sent.acceptedAt.toISOString(),
    provider_message_id: sent.providerMessageId,
  });
  return { status: "accepted" };
}

async function updateClaim(
  admin: ReturnType<typeof createAdminClient>,
  id: string,
  claimedAt: string,
  patch: Database["public"]["Tables"]["bot_interactions"]["Update"],
) {
  const { data, error } = await admin.from("bot_interactions").update(patch)
    .eq("id", id)
    .eq("delivery_status", "sending")
    .eq("claimed_at", claimedAt)
    .is("provider_message_id", null)
    .is("accepted_at", null)
    .select("id");
  if (error) throw error;
  if (!data?.length) {
    throw new Error(`La interacción manual ${id} cambió durante el envío; requiere reconciliación.`);
  }
}
