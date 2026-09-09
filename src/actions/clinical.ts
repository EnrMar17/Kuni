"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { formatInTimeZone } from "date-fns-tz";

import { AppError, ok, toApiError, type ApiResult } from "@/contracts/errors";
import {
  measurementInputSchema,
  medicationResponseCorrectionInputSchema,
  prescriptionAdjustmentInputSchema,
  type MedicationResponseCorrectionInput,
} from "@/contracts/clinical";
import { resolveAlertRpcInputSchema, medicationTherapeuticClassInputSchema } from "@/contracts/clinical-actions";
import { requireClinicalWriteContext } from "@/lib/auth/context";
import { DIABETES_COMPLICATION_CODES } from "@/lib/clinical/diabetes-complications";
import { mapClinicalRpcFailure } from "@/lib/clinical/rpc-errors";
import { createClient } from "@/lib/supabase/server";

// `updated_at` es intencionalmente un string: convertirlo por Date puede
// perder microsegundos y volver inválido un token de concurrencia optimista
// que sí era correcto.
export type ResolveAlertRpcInput = z.infer<typeof resolveAlertRpcInputSchema>;
export type ResolvedAlert = {
  id: string;
  status: "open" | "acknowledged" | "resolved" | "dismissed";
};

const patientIdSchema = z.object({ patientId: z.uuid() });
const urgentInputSchema = patientIdSchema.extend({
  eventId: z.uuid(),
  reason: z.string().trim().min(1).max(2_000),
});
const complicationCodeSchema = z.enum(DIABETES_COMPLICATION_CODES);
const complicationInputSchema = patientIdSchema.extend({
  code: complicationCodeSchema,
  diagnosedOn: z.iso.date().nullable(),
});
const deactivateComplicationInputSchema = patientIdSchema.extend({
  complicationId: z.uuid(),
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
  reason: z.string().trim().min(1).max(2_000),
});
const correctMeasurementInputSchema = z.intersection(measurementInputSchema, z.object({ measurementId: z.uuid(), expectedUpdatedAt: z.iso.datetime({ offset: true }), reason: z.string().trim().min(1).max(2_000) }));
const adjustPrescriptionInputSchema = z.object({
  patientId: z.uuid(), prescriptionId: z.uuid(), expectedVersion: z.number().int().positive(), expectedUpdatedAt: z.iso.datetime({ offset: true }), medicationId: z.uuid(),
  doseText: z.string().trim().min(1).max(500), instructions: z.string().trim().min(1).max(2_000), endsAt: z.iso.date().nullable(),
  schedules: prescriptionAdjustmentInputSchema.shape.schedules,
  reason: z.string().trim().min(1).max(2_000),
});
export type UrgentInput = z.infer<typeof urgentInputSchema>;
export type ComplicationInput = z.infer<typeof complicationInputSchema>;
export type DeactivateComplicationInput = z.infer<typeof deactivateComplicationInputSchema>;
export type CorrectMeasurementInput = z.infer<typeof correctMeasurementInputSchema>;
export type AdjustPrescriptionInput = z.infer<typeof adjustPrescriptionInputSchema>;
export type MedicationTherapeuticClassInput = z.infer<typeof medicationTherapeuticClassInputSchema>;

function readResolvedAlert(payload: unknown, allowOpen = false): ResolvedAlert {
  const parsed = z
    .object({
      data: z.object({
        alert: z.object({
          id: z.uuid(),
          status: z.enum(["open", "acknowledged", "resolved", "dismissed"]),
        }),
      }),
      error: z.unknown().nullable(),
    })
    .safeParse(payload);

  if (!parsed.success || parsed.data.error !== null || (!allowOpen && parsed.data.data.alert.status === "open")) {
    throw new AppError(
      "INTERNAL",
      "La operación de alerta devolvió una respuesta inválida.",
    );
  }
  return parsed.data.data.alert;
}

/** Verifica que el paciente exista, siga activo y pertenezca al consultorio
 * seleccionado por el médico antes de permitir cualquier mutación clínica —
 * defensa en profundidad además de lo que ya exige la RPC del lado del
 * servidor. */
async function assertPatientInSelectedRoom(patientId: string) {
  const context = await requireClinicalWriteContext();
  const supabase = await createClient();
  const { data, error } = await supabase.from("patients")
    .select("id")
    .eq("id", patientId)
    .eq("unit_id", context.unitId)
    .eq("consulting_room_id", context.consultingRoom.id)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new AppError("INTERNAL", "No se pudo verificar el paciente.");
  if (!data) throw new AppError("FORBIDDEN", "El paciente no pertenece al consultorio seleccionado.");
  return { context, supabase };
}

function refreshClinicalViews() {
  revalidatePath("/dashboard");
  revalidatePath("/pacientes");
  revalidatePath("/alertas");
}

function readCommandId(payload: unknown, key: string) {
  const parsed = z.object({ data: z.record(z.string(), z.unknown()), error: z.unknown().nullable() }).safeParse(payload);
  const value = parsed.success && parsed.data.error === null ? parsed.data.data[key] : null;
  if (!value || typeof value !== "object" || !("id" in value) || typeof value.id !== "string") throw new AppError("INTERNAL", "La operación clínica devolvió una respuesta inválida.");
  return value.id;
}

/** Adaptador de la RPC `resolve_alert` de C (RF23). */
export async function resolveAlert(
  input: ResolveAlertRpcInput,
): Promise<ApiResult<ResolvedAlert>> {
  const parsed = resolveAlertRpcInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      data: null,
      error: {
        code: "VALIDATION",
        message: "Revisa los datos de resolución de la alerta.",
      },
    };
  }

  try {
    const { context, supabase } = await assertPatientInSelectedRoom(parsed.data.patientId);
    const response = await supabase.rpc("resolve_alert", {
      p_patient_id: parsed.data.patientId,
      p_alert_id: parsed.data.alertId,
      p_expected_updated_at: parsed.data.expectedUpdatedAt,
      p_next_status: parsed.data.status,
      p_reason: parsed.data.note,
      p_doctor_id: context.consultingRoom.doctorId,
    });
    if (response.error) throw mapClinicalRpcFailure(response.error);
    const alert = readResolvedAlert(response.data);
    refreshClinicalViews();
    return ok(alert);
  } catch (error) {
    return toApiError(error);
  }
}

/** Adaptador de la RPC `mark_urgent` de C (RF22). */
export async function markUrgent(input: UrgentInput): Promise<ApiResult<ResolvedAlert>> {
  const parsed = urgentInputSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: { code: "VALIDATION", message: "Escribe el motivo de la urgencia." } };
  try {
    const { context, supabase } = await assertPatientInSelectedRoom(parsed.data.patientId);
    const response = await supabase.rpc("mark_urgent", {
      p_patient_id: parsed.data.patientId,
      p_event_id: parsed.data.eventId,
      p_reason: parsed.data.reason,
      p_doctor_id: context.consultingRoom.doctorId,
    });
    if (response.error) throw mapClinicalRpcFailure(response.error);
    const alert = readResolvedAlert(response.data, true);
    refreshClinicalViews();
    return ok(alert);
  } catch (error) {
    return toApiError(error);
  }
}

/** Alta de complicación (RF28) — inserta una fila nueva en patient_complications. */
export async function addPatientComplication(input: ComplicationInput): Promise<ApiResult<{ id: string }>> {
  const parsed = complicationInputSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: { code: "VALIDATION", message: "Revisa el código y la fecha de la complicación." } };
  try {
    const { context, supabase } = await assertPatientInSelectedRoom(parsed.data.patientId);
    const todayInUnit = formatInTimeZone(new Date(), context.timezone, "yyyy-MM-dd");
    if (parsed.data.diagnosedOn && parsed.data.diagnosedOn > todayInUnit) {
      throw new AppError(
        "VALIDATION",
        "La fecha de diagnóstico o revisión no puede estar en el futuro.",
      );
    }
    const { data, error } = await supabase.from("patient_complications").insert({
      unit_id: context.unitId,
      patient_id: parsed.data.patientId,
      attributed_doctor_id: context.consultingRoom.doctorId,
      code: parsed.data.code,
      diagnosed_on: parsed.data.diagnosedOn,
    }).select("id").single();
    if (error?.code === "23505") {
      throw new AppError("CONFLICT", "Ese código ya está vigente en la ficha.");
    }
    if (error?.code === "P0001") {
      throw new AppError(
        "CONFLICT",
        "Actualiza primero el estado vigente: sin complicaciones y las complicaciones clínicas no pueden coexistir.",
      );
    }
    if (error) throw mapClinicalRpcFailure(error);
    refreshClinicalViews();
    return ok({ id: data.id });
  } catch (error) {
    return toApiError(error);
  }
}

/** Baja lógica de complicación (RF28) — nunca borra la fila, solo la desactiva
 * con motivo, para conservar el historial. */
export async function deactivatePatientComplication(input: DeactivateComplicationInput): Promise<ApiResult<{ id: string }>> {
  const parsed = deactivateComplicationInputSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: { code: "VALIDATION", message: "Explica por qué se retira la complicación." } };
  try {
    const { context, supabase } = await assertPatientInSelectedRoom(parsed.data.patientId);
    const { data, error } = await supabase.from("patient_complications")
      .update({ active: false, correction_reason: parsed.data.reason, attributed_doctor_id: context.consultingRoom.doctorId })
      .eq("id", parsed.data.complicationId)
      .eq("unit_id", context.unitId)
      .eq("patient_id", parsed.data.patientId)
      .eq("active", true)
      .eq("updated_at", parsed.data.expectedUpdatedAt)
      .select("id")
      .maybeSingle();
    if (error) throw mapClinicalRpcFailure(error);
    if (!data) throw new AppError("CONFLICT", "La complicación cambió o ya fue retirada. Actualiza la ficha.");
    refreshClinicalViews();
    return ok({ id: data.id });
  } catch (error) {
    return toApiError(error);
  }
}

/** Adaptador de la RPC `correct_measurement` de C (RF19). */
export async function correctMeasurement(input: CorrectMeasurementInput): Promise<ApiResult<{ id: string }>> {
  const parsed = correctMeasurementInputSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: { code: "VALIDATION", message: "Revisa los valores y el motivo de corrección." } };
  try {
    const { context, supabase } = await assertPatientInSelectedRoom(parsed.data.patientId);
    const { measurementId, expectedUpdatedAt, reason, ...measurement } = parsed.data;
    const response = await supabase.rpc("correct_measurement", { p_patient_id: measurement.patientId, p_measurement_id: measurementId, p_expected_updated_at: expectedUpdatedAt, p_input: measurement, p_reason: reason, p_doctor_id: context.consultingRoom.doctorId });
    if (response.error) throw mapClinicalRpcFailure(response.error);
    const id = readCommandId(response.data, "measurement");
    refreshClinicalViews();
    return ok({ id });
  } catch (error) { return toApiError(error); }
}

/** Adaptador de la RPC `correct_medication_response` de C (RF20). La RPC solo
 * acepta la toma si `scheduleId` + `scheduledAt` identifican sin ambigüedad
 * la ocurrencia original (si no, CONFLICT), así que ambos son obligatorios. */
export async function correctMedicationResponse(
  input: MedicationResponseCorrectionInput,
): Promise<ApiResult<{ id: string }>> {
  const parsed = medicationResponseCorrectionInputSchema.safeParse(input);
  if (!parsed.success) {
    return { data: null, error: { code: "VALIDATION", message: "Revisa los datos de la corrección de la toma." } };
  }
  try {
    const { context, supabase } = await assertPatientInSelectedRoom(parsed.data.patientId);
    const response = await supabase.rpc("correct_medication_response", {
      p_patient_id: parsed.data.patientId,
      p_response_id: parsed.data.responseId,
      p_expected_updated_at: parsed.data.expectedUpdatedAt,
      p_schedule_id: parsed.data.scheduleId,
      p_scheduled_at: parsed.data.scheduledAt,
      p_taken: parsed.data.taken,
      p_reason: parsed.data.reason,
      p_doctor_id: context.consultingRoom.doctorId,
    });
    if (response.error) throw mapClinicalRpcFailure(response.error);
    const id = readCommandId(response.data, "medicationResponse");
    refreshClinicalViews();
    return ok({ id });
  } catch (error) {
    return toApiError(error);
  }
}

/** Adaptador de la RPC `adjust_prescription` de C (RF21). La RPC exige que
 * `startsAt` sea EXACTAMENTE "hoy" en la zona horaria de la unidad — se
 * calcula aquí en vez de confiar en el reloj del navegador. */
export async function adjustPrescription(input: AdjustPrescriptionInput): Promise<ApiResult<{ id: string }>> {
  const parsed = adjustPrescriptionInputSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: { code: "VALIDATION", message: "Revisa el ajuste, sus horarios y el motivo." } };
  try {
    const { context, supabase } = await assertPatientInSelectedRoom(parsed.data.patientId);
    const localToday = formatInTimeZone(new Date(), context.timezone, "yyyy-MM-dd");
    const response = await supabase.rpc("adjust_prescription", { p_patient_id: parsed.data.patientId, p_prescription_id: parsed.data.prescriptionId, p_expected_version: parsed.data.expectedVersion, p_expected_updated_at: parsed.data.expectedUpdatedAt, p_reason: parsed.data.reason, p_doctor_id: context.consultingRoom.doctorId, p_input: { patientId: parsed.data.patientId, medicationId: parsed.data.medicationId, doseText: parsed.data.doseText, instructions: parsed.data.instructions, startsAt: localToday, endsAt: parsed.data.endsAt, schedules: parsed.data.schedules, prescribedByDoctorId: context.consultingRoom.doctorId, previousPrescriptionId: parsed.data.prescriptionId } });
    if (response.error) throw mapClinicalRpcFailure(response.error);
    const id = readCommandId(response.data, "prescription");
    refreshClinicalViews();
    return ok({ id });
  } catch (error) { return toApiError(error); }
}

/**
 * Classifies the medication used by an active prescription. The prescription
 * lookup prevents a clinician from changing a medication outside the selected
 * patient's room; the database trigger records the change in the audit trail.
 */
export async function setMedicationTherapeuticClass(
  input: MedicationTherapeuticClassInput,
): Promise<ApiResult<{ id: string }>> {
  const parsed = medicationTherapeuticClassInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      data: null,
      error: {
        code: "VALIDATION",
        message: "Selecciona una clase terapéutica válida.",
      },
    };
  }

  try {
    const { context, supabase } = await assertPatientInSelectedRoom(parsed.data.patientId);
    const { data: prescription, error: prescriptionError } = await supabase
      .from("prescriptions")
      .select("id")
      .eq("id", parsed.data.prescriptionId)
      .eq("unit_id", context.unitId)
      .eq("patient_id", parsed.data.patientId)
      .eq("medication_id", parsed.data.medicationId)
      .eq("status", "active")
      .maybeSingle();
    if (prescriptionError) throw mapClinicalRpcFailure(prescriptionError);
    if (!prescription) {
      throw new AppError(
        "FORBIDDEN",
        "El medicamento no corresponde a una receta activa de este paciente.",
      );
    }

    const { data: medication, error: medicationError } = await supabase
      .from("medications")
      .update({ therapeutic_class: parsed.data.therapeuticClass })
      .eq("id", parsed.data.medicationId)
      .eq("unit_id", context.unitId)
      .select("id")
      .maybeSingle();
    if (medicationError) throw mapClinicalRpcFailure(medicationError);
    if (!medication) {
      throw new AppError("CONFLICT", "El medicamento cambió o ya no está disponible. Actualiza la ficha.");
    }

    revalidatePath(`/pacientes/${parsed.data.patientId}`);
    refreshClinicalViews();
    return ok({ id: medication.id });
  } catch (error) {
    return toApiError(error);
  }
}
