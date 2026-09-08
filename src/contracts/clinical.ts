import { z } from "zod";

export const riskLevelSchema = z.enum(["low", "medium", "high", "unknown"]);
export const appointmentStatusSchema = z.enum(["scheduled", "completed", "missed", "cancelled"]);
export const alertStatusSchema = z.enum(["open", "acknowledged", "resolved", "dismissed"]);
export const prescriptionStatusSchema = z.enum(["draft", "active", "superseded", "stopped", "completed"]);

export const patientSummarySchema = z.object({
  id: z.uuid(),
  clinicalRecord: z.string().min(1),
  fullName: z.string().min(1),
  age: z.number().int().nonnegative(),
  diagnoses: z.array(z.string().min(1)),
  risk: riskLevelSchema,
  riskReasons: z.array(z.string()),
  confirmedAdherencePct: z.number().min(0).max(100).nullable(),
  responseCoveragePct: z.number().min(0).max(100).nullable(),
  nextAppointmentAt: z.iso.datetime().nullable(),
});

export const patientDetailSchema = patientSummarySchema.extend({
  birthDate: z.iso.date(),
  sex: z.enum(["female", "male", "intersex", "unknown"]),
  curp: z.string().nullable(),
  whatsappE164: z.e164(),
  bloodType: z.string().nullable(),
  consentGranted: z.boolean(),
});

export const createPatientInputSchema = z.object({
  roomId: z.uuid(),
  fullName: z.string().trim().min(3),
  birthDate: z.iso.date(),
  sex: z.enum(["female", "male", "intersex", "unknown"]),
  clinicalRecord: z.string().trim().min(1),
  curp: z.string().trim().nullable(),
  whatsappE164: z.e164(),
  bloodType: z.string().trim().nullable(),
  initialRisk: riskLevelSchema,
  initialRiskReason: z.string().trim().min(1),
  consentGranted: z.boolean(),
});

export const prescriptionVersionInputSchema = z.object({
  patientId: z.uuid(),
  medicationId: z.uuid(),
  dose: z.string().trim().min(1),
  instructions: z.string().trim().min(1),
  startDate: z.iso.date(),
  endDate: z.iso.date().nullable(),
  scheduleTimes: z.array(z.iso.time()).min(1),
  daysOfWeek: z.array(z.number().int().min(1).max(7)).min(1),
});

// Los rangos replican `domain-core/src/lib/domain/validation.ts`, que es la
// misma fuente que aplica `correct_measurement` en 0003. Son criterios de
// captura (rechazar números imposibles), NO límites clínicos de riesgo: esos
// vienen de los planes personalizados de cada paciente. Si el formulario
// valida más laxo que la RPC, el servidor devuelve PT422 y el error parece
// clínico cuando es de formato.
export const measurementInputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("glucose"),
    patientId: z.uuid(),
    observedAt: z.iso.datetime(),
    glucoseMgDl: z.number().min(20).max(700),
    context: z.enum(["fasting", "before_meal", "after_meal", "random", "unspecified"]),
  }),
  z
    .object({
      kind: z.literal("blood_pressure"),
      patientId: z.uuid(),
      observedAt: z.iso.datetime(),
      // Enteras: las columnas SQL son `integer` y la RPC rechaza decimales.
      systolicMmHg: z.number().int().min(60).max(260),
      diastolicMmHg: z.number().int().min(30).max(180),
    })
    .refine((value) => value.systolicMmHg > value.diastolicMmHg, {
      message: "La sistólica debe ser mayor que la diastólica.",
      path: ["systolicMmHg"],
    }),
]);

export const appointmentInputSchema = z.object({
  patientId: z.uuid(),
  roomId: z.uuid(),
  startsAt: z.iso.datetime(),
  reason: z.string().trim().min(1),
  status: appointmentStatusSchema,
});

export const alertResolutionInputSchema = z.object({
  alertId: z.uuid(),
  status: z.enum(["acknowledged", "resolved", "dismissed"]),
  note: z.string().trim().min(1),
});

// Contratos de las otras 4 RPC clínicas de C (0003_clinical_commands.sql).
// Cada `input` reproduce EXACTAMENTE la lista blanca de llaves que valida su
// RPC (`p_input - array[...] <> '{}'`) — una llave de más o de menos no es un
// error de UI, es PT422 del lado del servidor.

export const measurementCorrectionInputSchema = z.object({
  measurementId: z.uuid(),
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
  reason: z.string().trim().min(1),
  // Mismo esquema que ya valida la captura original: la RPC exige el mismo
  // `kind` que ya tiene la medición, así que reusar measurementInputSchema
  // (no una versión más laxa) evita que el formulario acepte algo que el
  // servidor va a rechazar con PT422.
  input: measurementInputSchema,
});

export const medicationResponseCorrectionInputSchema = z.object({
  patientId: z.uuid(),
  responseId: z.uuid(),
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
  // La RPC solo acepta la toma si `scheduleId` + `scheduledAt` identifican SIN
  // AMBIGÜEDAD la ocurrencia original (0 o >1 coincidencias en
  // prescription_schedules → CONFLICT), así que ambos son obligatorios.
  scheduleId: z.uuid(),
  scheduledAt: z.iso.datetime({ offset: true }),
  taken: z.boolean(),
  reason: z.string().trim().min(1),
});

export const prescriptionScheduleEntrySchema = z.object({
  weekday: z.number().int().min(1).max(7),
  localTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Formato HH:MM."),
});

export const prescriptionAdjustmentInputSchema = z.object({
  patientId: z.uuid(),
  prescriptionId: z.uuid(),
  expectedVersion: z.number().int().positive(),
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
  reason: z.string().trim().min(1),
  medicationId: z.uuid(),
  doseText: z.string().trim().min(1),
  instructions: z.string().trim(),
  endsAt: z.iso.date().nullable(),
  schedules: z.array(prescriptionScheduleEntrySchema).min(1).max(168),
});

export const urgentMarkInputSchema = z.object({
  patientId: z.uuid(),
  // ID estable del evento que motiva la urgencia (p. ej. el id de la alerta o
  // interacción que la disparó) — la RPC lo usa para deduplicar reintentos y
  // acumular alias sin reabrir una urgencia ya atendida.
  eventId: z.uuid(),
  reason: z.string().trim().min(1),
});

export const riskResultSchema = z.object({
  level: riskLevelSchema,
  ruleVersion: z.string().min(1),
  reasons: z.array(z.string()),
  inputSnapshot: z.record(z.string(), z.unknown()),
});

export type PatientSummary = z.infer<typeof patientSummarySchema>;
export type PatientDetail = z.infer<typeof patientDetailSchema>;
export type CreatePatientInput = z.infer<typeof createPatientInputSchema>;
export type PrescriptionVersionInput = z.infer<typeof prescriptionVersionInputSchema>;
export type MeasurementInput = z.infer<typeof measurementInputSchema>;
export type AppointmentInput = z.infer<typeof appointmentInputSchema>;
export type AlertResolutionInput = z.infer<typeof alertResolutionInputSchema>;
export type RiskResult = z.infer<typeof riskResultSchema>;
export type MeasurementCorrectionInput = z.infer<typeof measurementCorrectionInputSchema>;
export type MedicationResponseCorrectionInput = z.infer<typeof medicationResponseCorrectionInputSchema>;
export type PrescriptionScheduleEntry = z.infer<typeof prescriptionScheduleEntrySchema>;
export type PrescriptionAdjustmentInput = z.infer<typeof prescriptionAdjustmentInputSchema>;
export type UrgentMarkInput = z.infer<typeof urgentMarkInputSchema>;

export type ActionError = {
  code: string;
  message: string;
  fields?: Record<string, string[]>;
};

export type ActionResult<T> =
  | { data: T; error: null }
  | { data: null; error: ActionError };
