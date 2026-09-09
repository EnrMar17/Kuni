import { z } from "zod";

/** Texto fijo: el botón de prueba no acepta contenido arbitrario. */
export const MANUAL_SMS_TEST_BODY =
  "Kuni: este es un mensaje de prueba. Tu número está conectado correctamente para recibir recordatorios. No necesitas responder.";

export const MANUAL_WHATSAPP_TEST_BODY =
  "Kuni: este es un mensaje de prueba de WhatsApp. Tu número está conectado correctamente para recibir recordatorios. No necesitas responder.";

export const manualSmsTestInputSchema = z.object({
  patientId: z.uuid(),
  requestId: z.uuid(),
});

export const manualMessageTestInputSchema = manualSmsTestInputSchema.extend({
  channel: z.enum(["sms", "whatsapp"]),
});

export type ManualMessageTestInput = z.infer<typeof manualMessageTestInputSchema>;
export type ManualMessageTestResult = {
  status: "accepted" | "already_requested";
};
