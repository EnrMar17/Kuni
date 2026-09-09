import { z } from "zod";

/** Texto fijo: el botón de prueba no acepta contenido arbitrario. */
export const MANUAL_SMS_TEST_BODY =
  "Kuni: este es un mensaje de prueba. Tu número está conectado correctamente para recibir recordatorios. No necesitas responder.";

export const manualSmsTestInputSchema = z.object({
  patientId: z.uuid(),
  requestId: z.uuid(),
});

export type ManualSmsTestInput = z.infer<typeof manualSmsTestInputSchema>;
export type ManualSmsTestResult = {
  status: "accepted" | "already_requested";
};
