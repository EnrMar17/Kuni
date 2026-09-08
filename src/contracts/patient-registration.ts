import { z } from "zod";
import { createPatientInputSchema, initialCareSchema } from "./clinical";

export const diagnosisCodeSchema = z.enum([
  "diabetes_type_1", "diabetes_type_2", "diabetes_gestational", "diabetes_other", "hypertension", "other",
]);
export const patientRegistrationSchema = createPatientInputSchema.omit({ roomId: true, consentGranted: true }).extend({
  fullName: z.string().trim().min(3).max(300),
  clinicalRecord: z.string().trim().min(1).max(100),
  curp: z.string().regex(/^[A-Z0-9]{18}$/).nullable(),
  bloodType: z.enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "unknown"]).nullable(),
  initialRiskReason: z.string().trim().min(1).max(2000),
  diagnoses: z.array(diagnosisCodeSchema).min(1).max(6).refine(codes => new Set(codes).size === codes.length),
  consent: z.object({
    event: z.enum(["granted", "revoked"]),
    noticeVersion: z.string().trim().min(1).max(100),
    method: z.enum(["in_person", "written", "whatsapp", "other"]),
    evidenceNote: z.string().trim().min(1).max(2000),
  }).strict().nullable(),
}).strict();

export const patientRevisionSchema = z.object({
  updatedAt: z.iso.datetime({ offset: true }),
  consentId: z.uuid().nullable(),
  diagnoses: z.array(z.object({ id: z.uuid(), updatedAt: z.iso.datetime({ offset: true }) }).strict()),
}).strict();
export const savePatientSchema = z.object({
  patientId: z.uuid(),
  input: patientRegistrationSchema,
  revision: patientRevisionSchema.nullable(),
  reason: z.string().trim().min(1).max(2000),
  // U08 fase 2: solo tiene sentido en el alta (revision === null). El
  // servidor la rechaza igual si llega en una edición — esto es defensa en
  // profundidad en el cliente, no la única barrera.
  initialCare: initialCareSchema.nullable(),
}).strict().refine(value => value.revision === null || value.initialCare === null, {
  message: "La receta y los planes iniciales solo aplican al alta.",
  path: ["initialCare"],
});

export type PatientRegistration = z.infer<typeof patientRegistrationSchema>;
export type PatientRevision = z.infer<typeof patientRevisionSchema>;
export type SavePatientInput = z.infer<typeof savePatientSchema>;
export type PatientEditData = {
  patientId: string;
  input: PatientRegistration;
  revision: PatientRevision;
  consentGranted: boolean;
};
