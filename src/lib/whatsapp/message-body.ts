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

/**
 * Recordatorio de cita — B7. Informativo (`expects_response=false`): no pide
 * ningún código de respuesta, solo avisa. Anticipación fija de 24h antes de
 * `starts_at`, decidida junto al equipo (ver bitácora 2026-09-08); el copy
 * en sí no es un contrato cerrado, igual que el resto de este archivo.
 */
export interface AppointmentReminderInput {
  kind: "appointment";
  startsAtLocal: string;
  roomName: string | null;
}

/**
 * Resumen de no-respuesta — B7. Se manda UNA VEZ por racha, cuando un
 * paciente acumula 3 no-respuestas seguidas desde su última respuesta (ver
 * `materializeNonresponseSummaries()` en jobs/materialize.ts para el criterio
 * exacto). Tono deliberadamente amable y sin presión — decisión explícita
 * del equipo: no es una llamada de atención ni repite lo que ya falló, es un
 * check-in humano antes de que escale a alerta médica.
 */
export interface NonresponseSummaryReminderInput {
  kind: "nonresponse_summary";
}

export type ReminderInput =
  | MedicationReminderInput
  | MeasurementReminderInput
  | AppointmentReminderInput
  | NonresponseSummaryReminderInput;

export function renderReminderBody(input: ReminderInput): string {
  if (input.kind === "medication") {
    const medication = input.medicationName ? `${input.medicationName} — ${input.doseText}` : input.doseText;
    return (
      `Kuni: es hora de tu medicamento (${medication}). ` +
      `Responde SI ${input.replyCode} si ya lo tomaste, o NO ${input.replyCode} si no.`
    );
  }

  if (input.kind === "appointment") {
    const room = input.roomName ? ` en ${input.roomName}` : "";
    return `Kuni: te recordamos tu cita mañana${room} (${input.startsAtLocal}). Si no puedes asistir, contacta a tu unidad de salud para reagendar.`;
  }

  if (input.kind === "nonresponse_summary") {
    return (
      "Kuni: no hemos sabido de ti en tus últimos mensajes. No pasa nada si no siempre puedes contestar — " +
      "solo queríamos saludarte. Si necesitas algo, tu unidad de salud está para ayudarte."
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
