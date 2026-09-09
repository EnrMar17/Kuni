import { z } from "zod";
import { createPatientInputSchema, initialCareSchema } from "./clinical";

export const diagnosisCodeSchema = z.enum([
  "diabetes_type_1", "diabetes_type_2", "diabetes_gestational", "diabetes_other", "hypertension", "other",
]);
const diabetesDiagnosisCodes = ["diabetes_type_1", "diabetes_type_2", "diabetes_gestational", "diabetes_other"];
export const patientRegistrationSchema = createPatientInputSchema.omit({ roomId: true, consentGranted: true }).extend({
  fullName: z.string().trim().min(3).max(300),
  clinicalRecord: z.string().trim().min(1).max(100),
  curp: z.string().regex(/^[A-Z0-9]{18}$/).nullable(),
  bloodType: z.enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "unknown"]).nullable(),
  initialRiskReason: z.string().trim().min(1).max(2000),
  diagnoses: z.array(diagnosisCodeSchema).min(1).max(6).refine(codes => new Set(codes).size === codes.length),
  // Fecha de diagnóstico por código marcado (spec sección 2). Solo se
  // capturan las de los códigos presentes en `diagnoses`; el formulario y la
  // RPC ignoran cualquier otra llave. `z.record` con enum exige mapa
  // exhaustivo en Zod 4, así que se valida la llave a mano con `.refine`.
  diagnosedOn: z.record(z.string(), z.iso.date()).default({}).refine(
    (map) => Object.keys(map).every((code) => diagnosisCodeSchema.options.includes(code as never)),
    "Código de diagnóstico inválido.",
  ),
  consent: z.object({
    event: z.enum(["granted", "revoked"]),
    noticeVersion: z.string().trim().min(1).max(100),
    method: z.enum(["in_person", "written", "whatsapp", "other"]),
    evidenceNote: z.string().trim().min(1).max(2000),
  }).strict().nullable(),
}).strict();

// Defensa en profundidad: la RPC (`private.save_patient`) es la última
// palabra sobre esta regla, ver 0015_treatment_phase_and_diagnosis_date.sql.
// Vive separada de `patientRegistrationSchema` (en vez de un `.superRefine`
// encadenado) porque ese esquema necesita seguir siendo un ZodObject plano
// para que `getPatientRegistration` pueda usar `.omit(...)` sobre él.
function checkTreatmentPhases(value: PatientRegistration, ctx: z.RefinementCtx) {
  if (value.diabetesTreatmentPhase && !value.diagnoses.some((code) => diabetesDiagnosisCodes.includes(code))) {
    ctx.addIssue({
      code: "custom",
      path: ["input", "diabetesTreatmentPhase"],
      message: "La fase de tratamiento de diabetes requiere un diagnóstico de diabetes.",
    });
  }
  if (value.hypertensionTreatmentPhase && !value.diagnoses.includes("hypertension")) {
    ctx.addIssue({
      code: "custom",
      path: ["input", "hypertensionTreatmentPhase"],
      message: "La fase de tratamiento de hipertensión requiere el diagnóstico de hipertensión.",
    });
  }
}

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
}).superRefine((value, ctx) => checkTreatmentPhases(value.input, ctx));

export type PatientRegistration = z.infer<typeof patientRegistrationSchema>;
export type PatientRevision = z.infer<typeof patientRevisionSchema>;
export type SavePatientInput = z.infer<typeof savePatientSchema>;
export type PatientEditData = {
  patientId: string;
  input: PatientRegistration;
  revision: PatientRevision;
  consentGranted: boolean;
};
