import "server-only";
import { z } from "zod";
import { AppError } from "@/contracts/errors";
import { patientRegistrationSchema, patientRevisionSchema, type PatientEditData } from "@/contracts/patient-registration";
import { requireClinicalWriteContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";

export async function getPatientRegistration(patientId: string): Promise<PatientEditData | null> {
  const context = await requireClinicalWriteContext();
  if (!z.uuid().safeParse(patientId).success) return null;
  const client = await createClient();
  const { data: patient, error } = await client.from("patients")
    .select("id,full_name,birth_date,sex,record_number,curp,whatsapp_e164,blood_type,initial_risk,initial_risk_reason,updated_at")
    .eq("id", patientId).eq("unit_id", context.unitId)
    .eq("consulting_room_id", context.consultingRoom.id).eq("active", true).maybeSingle();
  if (error) throw new AppError("INTERNAL", "No se pudo cargar el expediente.");
  if (!patient) return null;
  const diagnoses = await client.from("patient_diagnoses").select("id,condition_code,updated_at", { count: "exact" })
    .eq("unit_id", context.unitId).eq("patient_id", patientId).eq("active", true).order("id");
  const consent = await client.from("consent_events").select("id,event")
    .eq("unit_id", context.unitId).eq("patient_id", patientId).order("sequence_no", { ascending: false }).limit(1).maybeSingle();
  if (diagnoses.error || !diagnoses.data || diagnoses.count !== diagnoses.data.length || consent.error)
    throw new AppError("INTERNAL", "No se pudo cargar el expediente completo.");
  // Legacy records may have no diagnosis or assessment yet; keep the form editable.
  const input = patientRegistrationSchema.omit({ fullName: true, diagnoses: true, initialRiskReason: true, clinicalRecord: true }).parse({
    birthDate: patient.birth_date, sex: patient.sex,
    curp: patient.curp, whatsappE164: patient.whatsapp_e164, bloodType: patient.blood_type,
    initialRisk: patient.initial_risk, consent: null,
  });
  return {
    patientId, input: { ...input, fullName: patient.full_name, clinicalRecord: patient.record_number ?? "",
      initialRiskReason: patient.initial_risk_reason ?? "",
      diagnoses: [...new Set(diagnoses.data.map(row => row.condition_code))] as PatientEditData["input"]["diagnoses"] },
    revision: patientRevisionSchema.parse({ updatedAt: patient.updated_at, consentId: consent.data?.id ?? null,
      diagnoses: diagnoses.data.map(row => ({ id: row.id, updatedAt: row.updated_at })) }),
    consentGranted: consent.data?.event === "granted",
  };
}
