"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { AppError, ok, toApiError, type ApiResult } from "@/contracts/errors";
import { savePatientSchema, type SavePatientInput } from "@/contracts/patient-registration";
import { requireClinicalWriteContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { mapClinicalRpcFailure } from "@/lib/clinical/rpc-errors";

export async function savePatient(input: SavePatientInput): Promise<ApiResult<{ id: string; updatedAt: string }>> {
  const parsed = savePatientSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: { code: "VALIDATION", message: "Revisa los datos del paciente.",
    fields: z.flattenError(parsed.error).fieldErrors } };
  try {
    const context = await requireClinicalWriteContext();
    const supabase = await createClient();
    const value = parsed.data;
    const args = { p_patient_id: value.patientId, p_room_id: context.consultingRoom.id,
      p_doctor_id: context.consultingRoom.doctorId, p_input: value.input };
    const response = value.revision
      ? await supabase.rpc("update_patient_registration", { ...args, p_revision: value.revision, p_reason: value.reason })
      : await supabase.rpc("register_patient", { ...args,
          p_prescription: value.initialCare?.prescription ?? null, p_plans: value.initialCare?.plans ?? null });
    if (response.error) {
      const failure = mapClinicalRpcFailure(response.error);
      const messages = {
        UNAUTHENTICATED: "Tu sesion expiro. Inicia sesion nuevamente.",
        FORBIDDEN: "No tienes permiso para guardar este expediente en el consultorio seleccionado.",
        VALIDATION: "Revisa los datos y la evidencia de consentimiento.",
        CONFLICT: "El expediente cambio o sus identificadores ya estan registrados.",
        INTERNAL: "No se pudo guardar el expediente. Verifica la conexion y las migraciones pendientes.",
      };
      throw new AppError(failure.code, failure.code in messages
        ? messages[failure.code as keyof typeof messages] : "No se pudo guardar el expediente.");
    }
    const result = z.object({ data: z.object({ patient: z.object({ id: z.uuid(), updatedAt: z.iso.datetime({ offset: true }) }) }),
      error: z.null() }).safeParse(response.data);
    if (!result.success || result.data.data.patient.id !== value.patientId) throw new AppError("INTERNAL", "No se pudo confirmar el guardado del paciente.");
    revalidatePath("/pacientes");
    revalidatePath(`/pacientes/${value.patientId}`);
    revalidatePath(`/pacientes/${value.patientId}/editar`);
    revalidatePath("/dashboard");
    revalidatePath("/alertas");
    return ok(result.data.data.patient);
  } catch (error) { return toApiError(error); }
}
