"use server";

import { z } from "zod";
import { formatInTimeZone } from "date-fns-tz";

import { AppError, ok, toApiError, type ApiResult } from "@/contracts/errors";
import {
  alertResolutionInputSchema,
  measurementCorrectionInputSchema,
  medicationResponseCorrectionInputSchema,
  prescriptionAdjustmentInputSchema,
  urgentMarkInputSchema,
  type MeasurementCorrectionInput,
  type MedicationResponseCorrectionInput,
  type PrescriptionAdjustmentInput,
  type UrgentMarkInput,
} from "@/contracts/clinical";
import { requireClinicalWriteContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";

// `updated_at` es intencionalmente un string: convertirlo por Date puede
// perder microsegundos y volver inválido un token de concurrencia optimista
// que sí era correcto.
export const resolveAlertRpcInputSchema = alertResolutionInputSchema.extend({
  patientId: z.uuid(),
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
});

export type ResolveAlertRpcInput = z.infer<typeof resolveAlertRpcInputSchema>;
export type ResolvedAlert = {
  id: string;
  status: "acknowledged" | "resolved" | "dismissed";
};

type RpcFailure = { code?: string | null; message?: string | null };

const rpcErrorCodes: Record<string, AppError["code"]> = {
  PT401: "UNAUTHENTICATED",
  PT403: "FORBIDDEN",
  PT409: "CONFLICT",
  PT422: "VALIDATION",
};

export function mapClinicalRpcFailure(
  error: RpcFailure,
  fallbackMessage = "No se pudo completar la operación clínica.",
): AppError {
  const code = error.code ? rpcErrorCodes[error.code] : undefined;
  if (code) return new AppError(code, error.message || fallbackMessage);
  return new AppError("INTERNAL", fallbackMessage);
}

// ─────────────────────────────────────────────────────────────────────────
// resolve_alert (C6, RF23) — primer patrón de mapeo PT4xx → {data, error};
// las otras 4 acciones lo copian.
// ─────────────────────────────────────────────────────────────────────────

function readResolvedAlert(payload: unknown): ResolvedAlert {
  const parsed = z
    .object({
      data: z.object({
        alert: z.object({
          id: z.uuid(),
          status: z.enum(["acknowledged", "resolved", "dismissed"]),
        }),
      }),
      error: z.unknown().nullable(),
    })
    .safeParse(payload);

  if (!parsed.success || parsed.data.error !== null) {
    throw new AppError(
      "INTERNAL",
      "La operación de alerta devolvió una respuesta inválida.",
    );
  }
  return parsed.data.data.alert;
}

/** Adaptador de la RPC `resolve_alert` de C. */
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
    const context = await requireClinicalWriteContext();
    const supabase = await createClient();
    const response = await supabase.rpc("resolve_alert", {
      p_patient_id: parsed.data.patientId,
      p_alert_id: parsed.data.alertId,
      p_expected_updated_at: parsed.data.expectedUpdatedAt,
      p_next_status: parsed.data.status,
      p_reason: parsed.data.note,
      p_doctor_id: context.consultingRoom.doctorId,
    });
    if (response.error) throw mapClinicalRpcFailure(response.error, "No se pudo actualizar la alerta.");
    return ok(readResolvedAlert(response.data));
  } catch (error) {
    return toApiError(error);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// correct_measurement (C6, RF19)
// ─────────────────────────────────────────────────────────────────────────

export type CorrectedMeasurement = { id: string; updatedAt: string };

function readCorrectedMeasurement(payload: unknown): CorrectedMeasurement {
  // `to_jsonb(fila)` en la RPC conserva los nombres de columna tal cual
  // (snake_case) — no es el DTO camelCase del dashboard.
  const parsed = z
    .object({
      data: z.object({
        measurement: z.object({ id: z.uuid(), updated_at: z.string() }),
      }),
      error: z.unknown().nullable(),
    })
    .safeParse(payload);

  if (!parsed.success || parsed.data.error !== null) {
    throw new AppError("INTERNAL", "La corrección de la medición devolvió una respuesta inválida.");
  }
  return { id: parsed.data.data.measurement.id, updatedAt: parsed.data.data.measurement.updated_at };
}

/** Adaptador de la RPC `correct_measurement` de C. */
export async function correctMeasurement(
  input: MeasurementCorrectionInput,
): Promise<ApiResult<CorrectedMeasurement>> {
  const parsed = measurementCorrectionInputSchema.safeParse(input);
  if (!parsed.success) {
    return { data: null, error: { code: "VALIDATION", message: "Revisa los datos de la corrección de la medición." } };
  }

  try {
    const context = await requireClinicalWriteContext();
    const supabase = await createClient();
    const response = await supabase.rpc("correct_measurement", {
      p_patient_id: parsed.data.input.patientId,
      p_measurement_id: parsed.data.measurementId,
      p_expected_updated_at: parsed.data.expectedUpdatedAt,
      p_input: parsed.data.input,
      p_reason: parsed.data.reason,
      p_doctor_id: context.consultingRoom.doctorId,
    });
    if (response.error) throw mapClinicalRpcFailure(response.error, "No se pudo corregir la medición.");
    return ok(readCorrectedMeasurement(response.data));
  } catch (error) {
    return toApiError(error);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// correct_medication_response (C6, RF20)
// ─────────────────────────────────────────────────────────────────────────

export type CorrectedMedicationResponse = { id: string; updatedAt: string; taken: boolean };

function readCorrectedMedicationResponse(payload: unknown): CorrectedMedicationResponse {
  const parsed = z
    .object({
      data: z.object({
        medicationResponse: z.object({ id: z.uuid(), updated_at: z.string(), taken: z.boolean() }),
      }),
      error: z.unknown().nullable(),
    })
    .safeParse(payload);

  if (!parsed.success || parsed.data.error !== null) {
    throw new AppError("INTERNAL", "La corrección de la toma devolvió una respuesta inválida.");
  }
  const row = parsed.data.data.medicationResponse;
  return { id: row.id, updatedAt: row.updated_at, taken: row.taken };
}

/** Adaptador de la RPC `correct_medication_response` de C. */
export async function correctMedicationResponse(
  input: MedicationResponseCorrectionInput,
): Promise<ApiResult<CorrectedMedicationResponse>> {
  const parsed = medicationResponseCorrectionInputSchema.safeParse(input);
  if (!parsed.success) {
    return { data: null, error: { code: "VALIDATION", message: "Revisa los datos de la corrección de la toma." } };
  }

  try {
    const context = await requireClinicalWriteContext();
    const supabase = await createClient();
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
    if (response.error) throw mapClinicalRpcFailure(response.error, "No se pudo corregir la toma registrada.");
    return ok(readCorrectedMedicationResponse(response.data));
  } catch (error) {
    return toApiError(error);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// adjust_prescription (C6, RF21)
// ─────────────────────────────────────────────────────────────────────────

export type AdjustedPrescription = { id: string; version: number; updatedAt: string; status: string };

function readAdjustedPrescription(payload: unknown): AdjustedPrescription {
  const parsed = z
    .object({
      data: z.object({
        prescription: z.object({
          id: z.uuid(),
          version: z.number().int(),
          updated_at: z.string(),
          status: z.string(),
        }),
      }),
      error: z.unknown().nullable(),
    })
    .safeParse(payload);

  if (!parsed.success || parsed.data.error !== null) {
    throw new AppError("INTERNAL", "El ajuste de la receta devolvió una respuesta inválida.");
  }
  const row = parsed.data.data.prescription;
  return { id: row.id, version: row.version, updatedAt: row.updated_at, status: row.status };
}

/**
 * Adaptador de la RPC `adjust_prescription` de C. La RPC exige que
 * `startsAt` sea EXACTAMENTE "hoy" en la zona horaria de la unidad — se
 * calcula aquí en vez de confiar en el reloj del navegador. Un desfase real
 * de reloj hace que la RPC rechace con CONFLICT, nunca que aplique un
 * ajuste con la fecha equivocada.
 */
export async function adjustPrescription(
  input: PrescriptionAdjustmentInput,
): Promise<ApiResult<AdjustedPrescription>> {
  const parsed = prescriptionAdjustmentInputSchema.safeParse(input);
  if (!parsed.success) {
    return { data: null, error: { code: "VALIDATION", message: "Revisa los datos del ajuste de la receta." } };
  }

  try {
    const context = await requireClinicalWriteContext();
    const supabase = await createClient();
    const startsAt = formatInTimeZone(new Date(), context.timezone, "yyyy-MM-dd");
    const response = await supabase.rpc("adjust_prescription", {
      p_patient_id: parsed.data.patientId,
      p_prescription_id: parsed.data.prescriptionId,
      p_expected_version: parsed.data.expectedVersion,
      p_expected_updated_at: parsed.data.expectedUpdatedAt,
      // Lista blanca EXACTA que valida la RPC: una llave de más o de menos
      // aquí es PT422, no un error de negocio.
      p_input: {
        patientId: parsed.data.patientId,
        medicationId: parsed.data.medicationId,
        doseText: parsed.data.doseText,
        instructions: parsed.data.instructions,
        startsAt,
        endsAt: parsed.data.endsAt,
        schedules: parsed.data.schedules,
        prescribedByDoctorId: context.consultingRoom.doctorId,
        previousPrescriptionId: parsed.data.prescriptionId,
      },
      p_reason: parsed.data.reason,
      p_doctor_id: context.consultingRoom.doctorId,
    });
    if (response.error) throw mapClinicalRpcFailure(response.error, "No se pudo ajustar la receta.");
    return ok(readAdjustedPrescription(response.data));
  } catch (error) {
    return toApiError(error);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// mark_urgent (C6, RF22)
// ─────────────────────────────────────────────────────────────────────────

export type MarkedUrgentAlert = { id: string; status: string };

function readMarkedUrgentAlert(payload: unknown): MarkedUrgentAlert {
  const parsed = z
    .object({
      data: z.object({ alert: z.object({ id: z.uuid(), status: z.string() }) }),
      error: z.unknown().nullable(),
    })
    .safeParse(payload);

  if (!parsed.success || parsed.data.error !== null) {
    throw new AppError("INTERNAL", "La solicitud de urgencia devolvió una respuesta inválida.");
  }
  return parsed.data.data.alert;
}

/** Adaptador de la RPC `mark_urgent` de C. */
export async function markUrgent(
  input: UrgentMarkInput,
): Promise<ApiResult<MarkedUrgentAlert>> {
  const parsed = urgentMarkInputSchema.safeParse(input);
  if (!parsed.success) {
    return { data: null, error: { code: "VALIDATION", message: "Revisa los datos de la solicitud de urgencia." } };
  }

  try {
    const context = await requireClinicalWriteContext();
    const supabase = await createClient();
    const response = await supabase.rpc("mark_urgent", {
      p_patient_id: parsed.data.patientId,
      p_event_id: parsed.data.eventId,
      p_reason: parsed.data.reason,
      p_doctor_id: context.consultingRoom.doctorId,
    });
    if (response.error) throw mapClinicalRpcFailure(response.error, "No se pudo marcar la urgencia.");
    return ok(readMarkedUrgentAlert(response.data));
  } catch (error) {
    return toApiError(error);
  }
}
