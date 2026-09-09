import { z } from "zod";

// Espejo de la validación de private.schedule_appointment (0011): el
// servidor SIEMPRE revalida, este esquema solo evita un viaje redondo con
// datos que ya sabemos inválidos.
export const scheduleAppointmentSchema = z.object({
  patientId: z.uuid(),
  startsAt: z.iso.datetime({ offset: true }),
  urgency: z.enum(["routine", "urgent"]),
  reason: z.string().trim().min(3).max(1000),
}).strict();

export type ScheduleAppointmentInput = z.infer<typeof scheduleAppointmentSchema>;
