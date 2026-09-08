/**
 * Demo/prueba manual del circuito de WhatsApp: crea (o reutiliza) un
 * medicamento, una receta activa y un horario que ya "toca" ahora mismo
 * para un paciente demo — y le pone el número de WhatsApp real de quien
 * está probando (debe haberse unido antes al Sandbox de Twilio con
 * `join <código>`).
 *
 * Uso:
 *   npx tsx scripts/seed-demo-prescription.ts <whatsapp_e164>
 *
 * Idempotente: si ya existe la receta de hoy para este paciente, la
 * reutiliza en vez de duplicarla. Pensado solo para probar el pipeline
 * materialize → send → webhook de estado; el texto/dosis es ficticio.
 */
import { createClient } from "@supabase/supabase-js";
import { formatInTimeZone } from "date-fns-tz";

try {
  process.loadEnvFile(".env.local");
} catch {
  console.warn("No se encontró .env.local; usando variables ya exportadas.");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const testerPhone = process.argv[2];

if (!url || !secretKey || !testerPhone) {
  console.error("Uso: npx tsx scripts/seed-demo-prescription.ts <whatsapp_e164, ej. +5215512345678>");
  process.exit(1);
}
if (!/^\+[1-9][0-9]{7,14}$/.test(testerPhone)) {
  console.error("El número debe estar en formato E.164, ej. +5215512345678");
  process.exit(1);
}

const admin = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });

const DEMO_UNIT_CODE = "IMSSB-MICH-MORELIA-JMGU";

async function main() {
  const { data: unit, error: unitError } = await admin
    .from("health_units")
    .select("id, timezone")
    .eq("institutional_code", DEMO_UNIT_CODE)
    .single();
  if (unitError) throw unitError;

  const { data: doctor, error: doctorError } = await admin
    .from("doctors")
    .select("id")
    .eq("unit_id", unit.id)
    .eq("active", true)
    .limit(1)
    .single();
  if (doctorError) throw doctorError;

  const { data: patient, error: patientError } = await admin
    .from("patients")
    .select("id, full_name, whatsapp_e164")
    .eq("unit_id", unit.id)
    .eq("active", true)
    .order("created_at")
    .limit(1)
    .single();
  if (patientError) throw patientError;

  if (patient.whatsapp_e164 !== testerPhone) {
    const { error: updatePatientError } = await admin
      .from("patients")
      .update({ whatsapp_e164: testerPhone })
      .eq("unit_id", unit.id)
      .eq("id", patient.id);
    if (updatePatientError) throw updatePatientError;
    console.log(`Número de ${patient.full_name} actualizado a ${testerPhone} (era ${patient.whatsapp_e164}, dato ficticio).`);
  }

  let { data: medication } = await admin
    .from("medications")
    .select("id")
    .eq("unit_id", unit.id)
    .eq("name", "Metformina 850mg (demo)")
    .maybeSingle();
  if (!medication) {
    const { data: created, error: medError } = await admin
      .from("medications")
      .insert({ unit_id: unit.id, name: "Metformina 850mg (demo)", pharmaceutical_form: "tableta", attributed_doctor_id: doctor.id })
      .select("id")
      .single();
    if (medError) throw medError;
    medication = created;
    console.log("Medicamento demo creado:", medication.id);
  }

  const today = new Date().toISOString().slice(0, 10);

  // Hora local (zona de la unidad) de "ahora mismo" menos 2 minutos, para
  // que ya esté vencida al momento de correr el tick. `date-fns-tz` en vez
  // de `toLocaleString`+`new Date(...)`: ese truco parsea de vuelta un
  // string localizado y es fácil que quede mal (probado: dio una hora que
  // no correspondía a la real).
  const twoMinutesAgo = new Date(Date.now() - 2 * 60_000);
  const localTime = formatInTimeZone(twoMinutesAgo, unit.timezone, "HH:mm");
  const isoWeekday = Number(formatInTimeZone(twoMinutesAgo, unit.timezone, "i")); // date-fns: 1=lunes..7=domingo (ISO)

  const { data: existing } = await admin
    .from("prescriptions")
    .select("id, status, series_id, version")
    .eq("unit_id", unit.id)
    .eq("patient_id", patient.id)
    .eq("medication_id", medication.id)
    .in("status", ["draft", "active"])
    .maybeSingle();

  // El horario de una receta activa es inmutable (trigger
  // `preserve_prescription_schedule`: solo se edita en 'draft'). Esta es la
  // ÚNICA forma real de "corregir" el horario una vez activada: crear la
  // siguiente versión de la serie con el horario correcto y superseder la
  // anterior — el mismo flujo que usará la UI de ajuste de receta (aún sin
  // construir), no un atajo inventado para el script.
  let draft: { id: string };
  if (!existing) {
    const { data: created, error: prescError } = await admin
      .from("prescriptions")
      .insert({
        unit_id: unit.id,
        patient_id: patient.id,
        medication_id: medication.id,
        dose_text: "1 tableta cada 12 horas (demo)",
        start_date: today,
        status: "draft",
        attributed_doctor_id: doctor.id,
      })
      .select("id")
      .single();
    if (prescError) throw prescError;
    draft = created;
    console.log("Receta demo creada (draft):", draft.id);
  } else {
    const { data: created, error: versionError } = await admin
      .from("prescriptions")
      .insert({
        unit_id: unit.id,
        patient_id: patient.id,
        medication_id: medication.id,
        dose_text: "1 tableta cada 12 horas (demo)",
        start_date: today,
        status: "draft",
        attributed_doctor_id: doctor.id,
        series_id: existing.series_id,
        version: existing.version + 1,
        supersedes_id: existing.id,
        change_reason: "Ajuste de horario para prueba manual del circuito.",
      })
      .select("id")
      .single();
    if (versionError) throw versionError;
    draft = created;
    console.log(`Nueva versión de la receta demo (supersede a ${existing.id}):`, draft.id);
  }

  const { error: scheduleError } = await admin
    .from("prescription_schedules")
    .insert({ unit_id: unit.id, prescription_id: draft.id, local_time: localTime, weekdays: [isoWeekday] });
  if (scheduleError) throw scheduleError;

  if (existing?.status === "active") {
    const { error: supersedeError } = await admin
      .from("prescriptions")
      .update({ status: "superseded" })
      .eq("unit_id", unit.id)
      .eq("id", existing.id);
    if (supersedeError) throw supersedeError;
  }

  const { error: activateError } = await admin
    .from("prescriptions")
    .update({ status: "active" })
    .eq("unit_id", unit.id)
    .eq("id", draft.id);
  if (activateError) throw activateError;
  console.log("Receta activada.");

  console.log(`Horario demo: ${localTime} (${unit.timezone}), día ISO ${isoWeekday} — ya debería estar "vencido" ahora.`);
  console.log(`\nListo. Paciente: ${patient.full_name} → ${testerPhone}. Corre el tick para materializar y enviar.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
