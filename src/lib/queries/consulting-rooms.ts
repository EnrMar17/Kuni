import "server-only";

import { AppError } from "@/contracts/errors";
import { getAuthContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";

export type ConsultingRoomSummary = {
  id: string;
  unitId: string;
  name: string;
  doctor: { id: string; fullName: string; professionalLicense: string | null };
  patientCount: number;
  openAlertCount: number;
};

export async function getConsultingRooms() {
  const context = await getAuthContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("consulting_rooms")
    .select("id, unit_id, name, doctor_id, doctors!inner(full_name, professional_license, active)")
    .eq("unit_id", context.unitId)
    .eq("active", true)
    .eq("doctors.active", true)
    .order("name");
  if (error) throw new AppError("INTERNAL", "No pudimos cargar los consultorios. Intenta nuevamente.");

  const rooms: ConsultingRoomSummary[] = await Promise.all((data ?? []).map(async (room) => {
    const [patients, alerts] = await Promise.all([
      supabase.from("patients").select("id", { count: "exact", head: true })
        .eq("unit_id", context.unitId).eq("consulting_room_id", room.id).eq("active", true),
      supabase.from("alerts").select("id, patients!inner(consulting_room_id, active)", { count: "exact", head: true })
        .eq("unit_id", context.unitId).eq("patients.consulting_room_id", room.id)
        .eq("patients.active", true).in("status", ["open", "acknowledged"]),
    ]);
    if (patients.error || alerts.error) {
      throw new AppError("INTERNAL", "No pudimos cargar los indicadores de los consultorios. Intenta nuevamente.");
    }
    return {
      id: room.id,
      unitId: room.unit_id,
      name: room.name,
      doctor: {
        id: room.doctor_id,
        fullName: room.doctors.full_name,
        professionalLicense: room.doctors.professional_license,
      },
      patientCount: patients.count ?? 0,
      openAlertCount: alerts.count ?? 0,
    };
  }));
  return { context, rooms };
}
