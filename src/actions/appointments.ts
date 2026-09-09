"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { AppError, ok, toApiError, type ApiResult } from "@/contracts/errors";
import { scheduleAppointmentSchema, type ScheduleAppointmentInput } from "@/contracts/appointments";
import { requireClinicalWriteContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { mapClinicalRpcFailure } from "@/lib/clinical/rpc-errors";

export async function scheduleAppointment(input: ScheduleAppointmentInput): Promise<ApiResult<{ id: string; startsAt: string; updatedAt: string }>> {
  const parsed = scheduleAppointmentSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: { code: "VALIDATION", message: "Revisa los datos de la cita.",
    fields: z.flattenError(parsed.error).fieldErrors } };
  try {
    const context = await requireClinicalWriteContext();
    const supabase = await createClient();
    const value = parsed.data;
    const response = await supabase.rpc("schedule_appointment", {
      p_patient_id: value.patientId,
      p_room_id: context.consultingRoom.id,
      p_doctor_id: context.consultingRoom.doctorId,
      p_starts_at: value.startsAt,
      p_urgency: value.urgency,
      p_reason: value.reason,
    });
    if (response.error) {
      const failure = mapClinicalRpcFailure(response.error);
      const messages = {
        UNAUTHENTICATED: "Tu sesion expiro. Inicia sesion nuevamente.",
        FORBIDDEN: "No tienes permiso para agendar una cita en este consultorio.",
        VALIDATION: "Revisa el paciente, el horario y el motivo de la cita.",
        CONFLICT: "Ese consultorio ya tiene una cita agendada en ese horario.",
        INTERNAL: "No se pudo agendar la cita. Verifica la conexion.",
      };
      throw new AppError(failure.code, failure.code in messages
        ? messages[failure.code as keyof typeof messages] : "No se pudo agendar la cita.");
    }
    const result = z.object({ data: z.object({ appointment: z.object({
      id: z.uuid(), startsAt: z.iso.datetime({ offset: true }), updatedAt: z.iso.datetime({ offset: true }) }) }),
      error: z.null() }).safeParse(response.data);
    if (!result.success) throw new AppError("INTERNAL", "No se pudo confirmar el guardado de la cita.");
    revalidatePath("/citas");
    revalidatePath("/dashboard");
    return ok(result.data.data.appointment);
  } catch (error) { return toApiError(error); }
}
