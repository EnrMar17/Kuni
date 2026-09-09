import "server-only";

import { z } from "zod";

import { AppError } from "@/contracts/errors";
import { MANUAL_SMS_TEST_BODY, type ManualSmsTestResult } from "@/contracts/messaging";
import { mapClinicalRpcFailure } from "@/lib/clinical/rpc-errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getWhatsAppProvider, WhatsAppProviderError } from "@/lib/whatsapp/provider";
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

type ManualSmsContext = {
  patientId: string;
  requestId: string;
  unitId: string;
  roomId: string;
};

/**
 * Crea y envía una interacción de prueba aislada. La RPC vuelve a comprobar
 * membresía, consultorio, paciente activo y consentimiento, además de imponer
 * idempotencia y un límite de un intento por paciente cada 30 segundos.
 */
export async function sendManualSmsTest(input: ManualSmsContext): Promise<ManualSmsTestResult> {
  const provider = await getWhatsAppProvider();
  if (provider.channel !== "sms" || !["sms8", "smsgate"].includes(provider.dbProviderValue)) {
    throw new AppError(
      "VALIDATION",
      "El botón de prueba requiere que Kuni esté configurado con un proveedor SMS.",
    );
  }

  const supabase = await createClient();
  const response = await supabase.rpc("request_manual_sms_test", {
    p_patient_id: input.patientId,
    p_unit_id: input.unitId,
    p_room_id: input.roomId,
    p_request_id: input.requestId,
    p_provider: provider.dbProviderValue,
  });
  if (response.error) {
    if (response.error.message.includes("PATIENT_NOT_ELIGIBLE_FOR_SMS")) {
      throw new AppError(
        "CONFLICT",
        "El paciente debe estar activo, pertenecer al consultorio y tener consentimiento vigente para SMS.",
      );
    }
    if (response.error.message.includes("MANUAL_SMS_RATE_LIMIT")) {
      throw new AppError("CONFLICT", "Espera 30 segundos antes de enviar otra prueba a este paciente.");
    }
    throw mapClinicalRpcFailure(response.error);
  }

  const parsed = requestedInteractionSchema.safeParse(response.data);
  if (!parsed.success) {
    throw new AppError("INTERNAL", "No se pudo confirmar la solicitud de prueba SMS.");
  }
  const interaction = parsed.data.data.interaction;
  if (!interaction.created) return { status: "already_requested" };
  if (!interaction.claimedAt || !interaction.phoneE164) {
    throw new AppError("INTERNAL", "La solicitud SMS quedó incompleta y no se envió.");
  }

  const admin = createAdminClient();
  let sent: { providerMessageId: string; acceptedAt: Date };
  try {
    sent = await provider.sendFreeformMessage({
      toE164: interaction.phoneE164,
      body: MANUAL_SMS_TEST_BODY,
    });
  } catch (error) {
    const providerError = error instanceof WhatsAppProviderError
      ? error
      : new WhatsAppProviderError("unknown", "Error inesperado enviando la prueba SMS.", {
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
        ? "SMS8 no confirmó la prueba. Revisa el estado antes de volver a intentarlo."
        : "SMS8 rechazó la prueba. Revisa el número y la configuración del dispositivo.",
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
