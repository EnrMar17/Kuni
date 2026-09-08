/**
 * Redacción del texto del recordatorio saliente — primer borrador, no una
 * decisión de UX/clínica cerrada (avisar en `docs/decisiones.md` si A o C
 * quieren ajustar el copy). El FORMATO de respuesta esperado (SI/NO/GLUCOSA/
 * PRESION + código corto) sí es el contrato fijo de la sección 3 de
 * kuni-plan-tecnico.md — parseIncomingMessage() de C depende de que el bot
 * pida exactamente ese formato.
 *
 * Puro y sin I/O a propósito: `jobs/send.ts` decide POR QUÉ CANAL mandarlo
 * (plantilla aprobada vs. texto libre en ventana de sesión); esto solo arma
 * el texto que ambos casos comparten cuando aplica texto libre.
 */

export interface MedicationReminderInput {
  kind: "medication";
  replyCode: string;
  doseText: string;
  medicationName: string | null;
}

export interface MeasurementReminderInput {
  kind: "measurement";
  replyCode: string;
  variable: "glucose" | "blood_pressure";
}

export type ReminderInput = MedicationReminderInput | MeasurementReminderInput;

export function renderReminderBody(input: ReminderInput): string {
  if (input.kind === "medication") {
    const medication = input.medicationName ? `${input.medicationName} — ${input.doseText}` : input.doseText;
    return (
      `Kuni: es hora de tu medicamento (${medication}). ` +
      `Responde SI ${input.replyCode} si ya lo tomaste, o NO ${input.replyCode} si no.`
    );
  }

  if (input.variable === "glucose") {
    return (
      `Kuni: por favor comparte tu nivel de glucosa. ` +
      `Responde GLUCOSA ${input.replyCode} <valor>, por ejemplo: GLUCOSA ${input.replyCode} 120.`
    );
  }

  return (
    `Kuni: por favor comparte tu presión arterial. ` +
    `Responde PRESION ${input.replyCode} <sistólica>/<diastólica>, por ejemplo: PRESION ${input.replyCode} 120/80.`
  );
}
