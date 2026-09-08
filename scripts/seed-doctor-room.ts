/**
 * Crea (o reutiliza) un médico y su consultorio para la unidad de salud demo.
 * Uso: npx tsx scripts/seed-doctor-room.ts
 */
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const UNIT_INSTITUTIONAL_CODE = "IMSSB-MICH-MORELIA-JMGU";

const DOCTOR_FULL_NAME = "Dra. María Fernanda López Torres";
const DOCTOR_LICENSE = "8452193"; // cédula profesional, formato de ejemplo
const ROOM_NAME = "Consultorio 3 - Medicina Familiar";

async function main() {
  const { data: unit, error: unitError } = await admin
    .from("health_units")
    .select("id, name")
    .eq("institutional_code", UNIT_INSTITUTIONAL_CODE)
    .single();
  if (unitError) throw unitError;

  let { data: doctor, error: findDoctorError } = await admin
    .from("doctors")
    .select("id, full_name")
    .eq("unit_id", unit.id)
    .eq("full_name", DOCTOR_FULL_NAME)
    .maybeSingle();
  if (findDoctorError) throw findDoctorError;

  if (!doctor) {
    const { data: created, error: insertDoctorError } = await admin
      .from("doctors")
      .insert({
        unit_id: unit.id,
        full_name: DOCTOR_FULL_NAME,
        professional_license: DOCTOR_LICENSE,
      })
      .select("id, full_name")
      .single();
    if (insertDoctorError) throw insertDoctorError;
    doctor = created;
    console.log("Médico creado:", doctor);
  } else {
    console.log("Médico ya existía:", doctor);
  }

  let { data: room, error: findRoomError } = await admin
    .from("consulting_rooms")
    .select("id, name, doctor_id")
    .eq("unit_id", unit.id)
    .eq("name", ROOM_NAME)
    .maybeSingle();
  if (findRoomError) throw findRoomError;

  if (!room) {
    const { data: createdRoom, error: insertRoomError } = await admin
      .from("consulting_rooms")
      .insert({ unit_id: unit.id, name: ROOM_NAME, doctor_id: doctor.id })
      .select("id, name, doctor_id")
      .single();
    if (insertRoomError) throw insertRoomError;
    room = createdRoom;
    console.log("Consultorio creado:", room);
  } else {
    console.log("Consultorio ya existía:", room);
  }

  console.log("\nListo:", {
    unidad: unit.name,
    medico: doctor.full_name,
    consultorio: room.name,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
