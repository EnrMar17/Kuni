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

export const measurementInputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("glucose"),
    patientId: z.uuid(),
    observedAt: z.iso.datetime(),
    glucoseMgDl: z.number().positive(),
    context: z.enum(["fasting", "before_meal", "after_meal", "random", "unspecified"]),
  }),
  z.object({
    kind: z.literal("blood_pressure"),
    patientId: z.uuid(),
    observedAt: z.iso.datetime(),
    systolicMmhg: z.number().positive(),
    diastolicMmhg: z.number().positive(),
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

export type ActionError = {
  code: string;
  message: string;
  fields?: Record<string, string[]>;
};

export type ActionResult<T> =
  | { data: T; error: null }
  | { data: null; error: ActionError };
