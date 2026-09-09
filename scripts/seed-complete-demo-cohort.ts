/**
 * Prepara una cohorte clínica sintética, completa y repetible para la demo.
 *
 * - Agrega 10 pacientes con nombres plausibles, pero totalmente ficticios.
 * - Completa los huecos clínicos de los pacientes que ya existen en la unidad.
 * - Conserva cualquier dato existente: sólo agrega series cuando faltan y
 *   completa campos demográficos nulos/desconocidos.
 * - Genera hasta 90 días de glucosa, presión y adherencia por tratamiento.
 * - Los pacientes nuevos usan números NANP 555-010x reservados para ficción y
 *   consentimiento revocado, para que ningún job pueda enviarles mensajes.
 *
 * Uso seguro (sólo inventario):
 *   npx tsx scripts/seed-complete-demo-cohort.ts
 *
 * Aplicar cambios:
 *   npx tsx scripts/seed-complete-demo-cohort.ts --apply
 */
import { createHash } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { format, parseISO, subDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

import type { Database } from "../src/types/database.types";

try {
  process.loadEnvFile(".env.local");
} catch {
  console.warn("No se encontró .env.local; se usarán las variables exportadas.");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const APPLY = process.argv.includes("--apply");
const UNIT_CODE = process.env.KUNI_DEMO_UNIT_CODE ?? "IMSSB-MICH-MORELIA-JMGU";
const FIXTURE_VERSION = "complete-demo-cohort-v1";
const DAY_MS = 86_400_000;

if (!url || !secretKey) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY.");
  process.exit(1);
}

const admin = createClient<Database>(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type Risk = "low" | "medium" | "high";
type PhaseDm = "estable_oral" | "ajuste_insulina" | "insulina_estable_hba1c";
type PhaseHta = "controlada" | "en_ajuste";
type DiagnosisCode = "diabetes_type_2" | "hypertension";
type MeasurementInsert = Database["public"]["Tables"]["measurements"]["Insert"];
type InteractionInsert = Database["public"]["Tables"]["bot_interactions"]["Insert"];
type MedicationResponseInsert = Database["public"]["Tables"]["medication_responses"]["Insert"];
type ComplicationCode =
  | "E110"
  | "E111"
  | "E112"
  | "E113"
  | "E114"
  | "E115"
  | "E116"
  | "E117"
  | "E118"
  | "E119";

type ClinicalScenario = {
  key: string;
  risk: Risk;
  riskReason: string;
  followupDays: number;
  diabetesPhase: PhaseDm;
  hypertensionPhase: PhaseHta;
  complication: ComplicationCode;
  glucoseLatest: number;
  glucoseDailySlope: number;
  systolicLatest: number;
  systolicDailySlope: number;
  diastolicLatest: number;
  diastolicDailySlope: number;
  adherenceDm: number;
  adherenceHta: number;
  dmMedication: { name: string; strength: string; dose: string; instructions: string };
  htaMedication: { name: string; strength: string; dose: string; instructions: string };
};

type NewPatient = {
  fullName: string;
  recordNumber: string;
  phone: string;
  birthDate: string;
  sex: "female" | "male";
  bloodType: "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-";
  scenario: ClinicalScenario;
};

const SCENARIOS: ClinicalScenario[] = [
  {
    key: "control-estable",
    risk: "low",
    riskReason: "Diabetes e hipertensión estables, con mediciones dentro de objetivo y adherencia alta.",
    followupDays: 60,
    diabetesPhase: "estable_oral",
    hypertensionPhase: "controlada",
    complication: "E119",
    glucoseLatest: 112,
    glucoseDailySlope: -0.18,
    systolicLatest: 121,
    systolicDailySlope: -0.08,
    diastolicLatest: 76,
    diastolicDailySlope: -0.03,
    adherenceDm: 0.94,
    adherenceHta: 0.92,
    dmMedication: { name: "Metformina", strength: "850 mg", dose: "1 tableta cada 12 horas", instructions: "Tomar con alimentos." },
    htaMedication: { name: "Losartán", strength: "50 mg", dose: "1 tableta cada 24 horas", instructions: "Tomar por la mañana." },
  },
  {
    key: "oftalmica-media",
    risk: "medium",
    riskReason: "Control glucémico irregular y complicación oftálmica en seguimiento.",
    followupDays: 30,
    diabetesPhase: "estable_oral",
    hypertensionPhase: "controlada",
    complication: "E113",
    glucoseLatest: 158,
    glucoseDailySlope: 0.45,
    systolicLatest: 132,
    systolicDailySlope: 0.12,
    diastolicLatest: 82,
    diastolicDailySlope: 0.05,
    adherenceDm: 0.81,
    adherenceHta: 0.88,
    dmMedication: { name: "Metformina", strength: "850 mg", dose: "1 tableta cada 12 horas", instructions: "Tomar después del desayuno y la cena." },
    htaMedication: { name: "Telmisartán", strength: "40 mg", dose: "1 tableta cada 24 horas", instructions: "Tomar a la misma hora." },
  },
  {
    key: "renal-alta",
    risk: "high",
    riskReason: "Nefropatía diabética, presión arterial ascendente y adherencia insuficiente.",
    followupDays: 14,
    diabetesPhase: "ajuste_insulina",
    hypertensionPhase: "en_ajuste",
    complication: "E112",
    glucoseLatest: 218,
    glucoseDailySlope: 2.35,
    systolicLatest: 164,
    systolicDailySlope: 1.22,
    diastolicLatest: 96,
    diastolicDailySlope: 0.48,
    adherenceDm: 0.58,
    adherenceHta: 0.64,
    dmMedication: { name: "Insulina NPH", strength: "100 UI/mL", dose: "14 UI por la noche", instructions: "Aplicar por vía subcutánea y rotar el sitio." },
    htaMedication: { name: "Losartán", strength: "100 mg", dose: "1 tableta cada 24 horas", instructions: "Tomar por la mañana." },
  },
  {
    key: "neurologica-media",
    risk: "medium",
    riskReason: "Neuropatía diabética con glucosa por encima de objetivo y adherencia parcial.",
    followupDays: 30,
    diabetesPhase: "estable_oral",
    hypertensionPhase: "controlada",
    complication: "E114",
    glucoseLatest: 174,
    glucoseDailySlope: 0.82,
    systolicLatest: 128,
    systolicDailySlope: 0.08,
    diastolicLatest: 79,
    diastolicDailySlope: 0.03,
    adherenceDm: 0.76,
    adherenceHta: 0.9,
    dmMedication: { name: "Metformina", strength: "1,000 mg", dose: "1 tableta cada 12 horas", instructions: "Tomar con alimentos." },
    htaMedication: { name: "Amlodipino", strength: "5 mg", dose: "1 tableta cada 24 horas", instructions: "Tomar por la noche." },
  },
  {
    key: "circulatoria-alta",
    risk: "high",
    riskReason: "Complicación circulatoria periférica y control cardiometabólico deficiente.",
    followupDays: 14,
    diabetesPhase: "insulina_estable_hba1c",
    hypertensionPhase: "en_ajuste",
    complication: "E115",
    glucoseLatest: 196,
    glucoseDailySlope: 1.55,
    systolicLatest: 156,
    systolicDailySlope: 0.95,
    diastolicLatest: 91,
    diastolicDailySlope: 0.34,
    adherenceDm: 0.69,
    adherenceHta: 0.61,
    dmMedication: { name: "Insulina glargina", strength: "100 UI/mL", dose: "18 UI por la noche", instructions: "Aplicar por vía subcutánea." },
    htaMedication: { name: "Enalapril", strength: "10 mg", dose: "1 tableta cada 12 horas", instructions: "Tomar mañana y noche." },
  },
  {
    key: "mejoria",
    risk: "low",
    riskReason: "Tendencias de glucosa y presión en mejoría sostenida con adherencia alta.",
    followupDays: 45,
    diabetesPhase: "estable_oral",
    hypertensionPhase: "controlada",
    complication: "E119",
    glucoseLatest: 124,
    glucoseDailySlope: -0.72,
    systolicLatest: 119,
    systolicDailySlope: -0.42,
    diastolicLatest: 74,
    diastolicDailySlope: -0.16,
    adherenceDm: 0.96,
    adherenceHta: 0.95,
    dmMedication: { name: "Metformina", strength: "500 mg", dose: "1 tableta cada 12 horas", instructions: "Tomar con desayuno y cena." },
    htaMedication: { name: "Losartán", strength: "50 mg", dose: "1 tableta cada 24 horas", instructions: "Tomar por la mañana." },
  },
  {
    key: "no-especificada",
    risk: "medium",
    riskReason: "Complicación diabética aún no especificada y variabilidad glucémica relevante.",
    followupDays: 21,
    diabetesPhase: "ajuste_insulina",
    hypertensionPhase: "controlada",
    complication: "E118",
    glucoseLatest: 183,
    glucoseDailySlope: 1.08,
    systolicLatest: 136,
    systolicDailySlope: 0.24,
    diastolicLatest: 84,
    diastolicDailySlope: 0.1,
    adherenceDm: 0.73,
    adherenceHta: 0.86,
    dmMedication: { name: "Insulina NPH", strength: "100 UI/mL", dose: "10 UI por la noche", instructions: "Aplicar por vía subcutánea." },
    htaMedication: { name: "Amlodipino", strength: "5 mg", dose: "1 tableta cada 24 horas", instructions: "Tomar por la noche." },
  },
  {
    key: "multiple-alta",
    risk: "high",
    riskReason: "Complicaciones diabéticas múltiples, hiperglucemia persistente y baja adherencia.",
    followupDays: 7,
    diabetesPhase: "ajuste_insulina",
    hypertensionPhase: "en_ajuste",
    complication: "E117",
    glucoseLatest: 246,
    glucoseDailySlope: 2.8,
    systolicLatest: 171,
    systolicDailySlope: 1.4,
    diastolicLatest: 101,
    diastolicDailySlope: 0.62,
    adherenceDm: 0.46,
    adherenceHta: 0.52,
    dmMedication: { name: "Insulina glargina", strength: "100 UI/mL", dose: "22 UI por la noche", instructions: "Aplicar por vía subcutánea." },
    htaMedication: { name: "Telmisartán", strength: "80 mg", dose: "1 tableta cada 24 horas", instructions: "Tomar por la mañana." },
  },
  {
    key: "cetoacidosis-alta",
    risk: "high",
    riskReason: "Antecedente de cetoacidosis y deterioro glucémico reciente que requiere vigilancia estrecha.",
    followupDays: 7,
    diabetesPhase: "ajuste_insulina",
    hypertensionPhase: "controlada",
    complication: "E111",
    glucoseLatest: 232,
    glucoseDailySlope: 2.15,
    systolicLatest: 127,
    systolicDailySlope: 0.1,
    diastolicLatest: 78,
    diastolicDailySlope: 0.04,
    adherenceDm: 0.62,
    adherenceHta: 0.91,
    dmMedication: { name: "Insulina NPH", strength: "100 UI/mL", dose: "16 UI por la noche", instructions: "Aplicar por vía subcutánea." },
    htaMedication: { name: "Losartán", strength: "50 mg", dose: "1 tableta cada 24 horas", instructions: "Tomar por la mañana." },
  },
  {
    key: "otra-especificada",
    risk: "medium",
    riskReason: "Otra complicación diabética especificada con presión en ajuste y adherencia moderada.",
    followupDays: 21,
    diabetesPhase: "insulina_estable_hba1c",
    hypertensionPhase: "en_ajuste",
    complication: "E116",
    glucoseLatest: 166,
    glucoseDailySlope: 0.62,
    systolicLatest: 148,
    systolicDailySlope: 0.72,
    diastolicLatest: 88,
    diastolicDailySlope: 0.25,
    adherenceDm: 0.79,
    adherenceHta: 0.71,
    dmMedication: { name: "Metformina", strength: "850 mg", dose: "1 tableta cada 12 horas", instructions: "Tomar con alimentos." },
    htaMedication: { name: "Enalapril", strength: "10 mg", dose: "1 tableta cada 12 horas", instructions: "Tomar mañana y noche." },
  },
];

const NEW_PATIENTS: NewPatient[] = [
  { fullName: "Ana Sofía Castillo Vargas", recordNumber: "KUNI-SYN-001", phone: "+12025550101", birthDate: "1963-04-18", sex: "female", bloodType: "O+", scenario: SCENARIOS[0] },
  { fullName: "Roberto Méndez Salazar", recordNumber: "KUNI-SYN-002", phone: "+12025550102", birthDate: "1967-10-09", sex: "male", bloodType: "A+", scenario: SCENARIOS[1] },
  { fullName: "Carmen Beatriz Rojas Núñez", recordNumber: "KUNI-SYN-003", phone: "+12025550103", birthDate: "1954-01-27", sex: "female", bloodType: "B+", scenario: SCENARIOS[2] },
  { fullName: "Jorge Alberto Medina Ortiz", recordNumber: "KUNI-SYN-004", phone: "+12025550104", birthDate: "1976-06-12", sex: "male", bloodType: "O-", scenario: SCENARIOS[3] },
  { fullName: "Teresa Jiménez Cabrera", recordNumber: "KUNI-SYN-005", phone: "+12025550105", birthDate: "1959-08-23", sex: "female", bloodType: "A-", scenario: SCENARIOS[4] },
  { fullName: "Miguel Ángel Navarro Ruiz", recordNumber: "KUNI-SYN-006", phone: "+12025550106", birthDate: "1951-12-05", sex: "male", bloodType: "AB+", scenario: SCENARIOS[5] },
  { fullName: "Patricia Elena Zamora Silva", recordNumber: "KUNI-SYN-007", phone: "+12025550107", birthDate: "1970-03-16", sex: "female", bloodType: "O+", scenario: SCENARIOS[6] },
  { fullName: "Ricardo Flores Bautista", recordNumber: "KUNI-SYN-008", phone: "+12025550108", birthDate: "1964-09-30", sex: "male", bloodType: "B-", scenario: SCENARIOS[7] },
  { fullName: "Verónica Alejandra Luna Reyes", recordNumber: "KUNI-SYN-009", phone: "+12025550109", birthDate: "1979-02-11", sex: "female", bloodType: "A+", scenario: SCENARIOS[8] },
  { fullName: "Manuel de Jesús García Pineda", recordNumber: "KUNI-SYN-010", phone: "+12025550110", birthDate: "1956-07-07", sex: "male", bloodType: "O+", scenario: SCENARIOS[9] },
];

if (NEW_PATIENTS.length < 10) throw new Error("La cohorte debe contener al menos 10 pacientes nuevos.");
if (new Set(NEW_PATIENTS.map(({ recordNumber }) => recordNumber)).size !== NEW_PATIENTS.length) throw new Error("Hay expedientes sintéticos duplicados.");
if (new Set(NEW_PATIENTS.map(({ phone }) => phone)).size !== NEW_PATIENTS.length) throw new Error("Hay teléfonos sintéticos duplicados.");

function uuid(scope: string, label: string) {
  const chars = createHash("sha256").update(`${FIXTURE_VERSION}:${scope}:${label}`).digest("hex").slice(0, 32).split("");
  chars[12] = "4";
  chars[16] = "8";
  const value = chars.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function daysAgo(today: string, amount: number) {
  return format(subDays(parseISO(today), amount), "yyyy-MM-dd");
}

function localInstant(today: string, amount: number, time: string, timezone: string) {
  return fromZonedTime(`${daysAgo(today, amount)}T${time}:00`, timezone).toISOString();
}

function plusDaysLocal(today: string, amount: number, time: string, timezone: string) {
  const date = new Date(parseISO(today).getTime() + amount * DAY_MS);
  return fromZonedTime(`${format(date, "yyyy-MM-dd")}T${time}:00`, timezone).toISOString();
}

function jitter(index: number, amplitude: number) {
  return [0, 0.7, -0.5, 1, -0.8, 0.35, -0.2][index % 7] * amplitude;
}

function deterministicTaken(day: number, ratio: number, salt: string) {
  const seed = Number.parseInt(createHash("sha256").update(salt).digest("hex").slice(0, 4), 16) % 100;
  return ((day * 37 + seed) % 100) < Math.round(ratio * 100);
}

async function upsertMeasurementChunks(rows: MeasurementInsert[]) {
  for (let index = 0; index < rows.length; index += 200) {
    const { error } = await admin.from("measurements").upsert(rows.slice(index, index + 200), { onConflict: "id" });
    if (error) throw new Error(`measurements: ${error.message}`);
  }
}

async function upsertInteractionChunks(rows: InteractionInsert[]) {
  for (let index = 0; index < rows.length; index += 200) {
    const { error } = await admin.from("bot_interactions").upsert(rows.slice(index, index + 200), { onConflict: "id" });
    if (error) throw new Error(`bot_interactions: ${error.message}`);
  }
}

async function upsertMedicationResponseChunks(rows: MedicationResponseInsert[]) {
  for (let index = 0; index < rows.length; index += 200) {
    const { error } = await admin.from("medication_responses").upsert(rows.slice(index, index + 200), { onConflict: "id" });
    if (error) throw new Error(`medication_responses: ${error.message}`);
  }
}

async function loadContext() {
  const { data: unit, error: unitError } = await admin
    .from("health_units")
    .select("id,name,timezone")
    .eq("institutional_code", UNIT_CODE)
    .eq("active", true)
    .single();
  if (unitError) throw unitError;

  const { data: rooms, error: roomError } = await admin
    .from("consulting_rooms")
    .select("id,name,doctor_id,doctors!inner(id,full_name,active)")
    .eq("unit_id", unit.id)
    .eq("active", true)
    .eq("doctors.active", true)
    .order("created_at");
  if (roomError) throw roomError;
  if (!rooms?.length) throw new Error("La unidad no tiene un consultorio y médico activos.");

  return { unit, rooms, primaryRoom: rooms[0] };
}

async function ensureNewPatients(context: Awaited<ReturnType<typeof loadContext>>) {
  const rows = [];
  for (const profile of NEW_PATIENTS) {
    const { data: existing, error: findError } = await admin
      .from("patients")
      .select("id")
      .eq("unit_id", context.unit.id)
      .eq("record_number", profile.recordNumber)
      .maybeSingle();
    if (findError) throw findError;
    const values = {
      unit_id: context.unit.id,
      consulting_room_id: context.primaryRoom.id,
      attributed_doctor_id: context.primaryRoom.doctor_id,
      full_name: profile.fullName,
      birth_date: profile.birthDate,
      sex: profile.sex,
      record_number: profile.recordNumber,
      whatsapp_e164: profile.phone,
      blood_type: profile.bloodType,
      initial_risk: profile.scenario.risk,
      initial_risk_reason: `${profile.scenario.riskReason} Datos sintéticos para demostración.`,
      followup_interval_days: profile.scenario.followupDays,
      diabetes_treatment_phase: profile.scenario.diabetesPhase,
      hypertension_treatment_phase: profile.scenario.hypertensionPhase,
      active: true,
    };
    if (existing) {
      const { error } = await admin.from("patients").update(values).eq("unit_id", context.unit.id).eq("id", existing.id);
      if (error) throw error;
      rows.push({ id: existing.id, ...profile, isNewFixture: true });
    } else {
      const id = uuid(profile.recordNumber, "patient");
      const { error } = await admin.from("patients").insert({ id, ...values });
      if (error) throw error;
      rows.push({ id, ...profile, isNewFixture: true });
    }
  }
  return rows;
}

async function loadAllPatients(unitId: string) {
  const { data, error } = await admin
    .from("patients")
    .select("id,full_name,record_number,birth_date,sex,blood_type,initial_risk,initial_risk_reason,followup_interval_days,diabetes_treatment_phase,hypertension_treatment_phase,consulting_room_id,attributed_doctor_id,active")
    .eq("unit_id", unitId)
    .eq("active", true)
    .order("created_at");
  if (error) throw error;
  return data ?? [];
}

async function diagnosesFor(unitId: string, patientId: string) {
  const { data, error } = await admin
    .from("patient_diagnoses")
    .select("condition_code")
    .eq("unit_id", unitId)
    .eq("patient_id", patientId)
    .eq("active", true);
  if (error) throw error;
  return new Set((data ?? []).map(({ condition_code }) => condition_code));
}

async function ensureDiagnoses(unitId: string, patientId: string, doctorId: string, today: string, codes: DiagnosisCode[]) {
  const active = await diagnosesFor(unitId, patientId);
  for (const code of codes) {
    if (active.has(code)) continue;
    const { error } = await admin.from("patient_diagnoses").insert({
      id: uuid(patientId, `diagnosis:${code}`),
      unit_id: unitId,
      patient_id: patientId,
      condition_code: code,
      diagnosed_on: daysAgo(today, code === "diabetes_type_2" ? 1_860 : 1_240),
      description: code === "diabetes_type_2" ? "Diabetes mellitus tipo 2" : "Hipertensión arterial sistémica",
      attributed_doctor_id: doctorId,
    });
    if (error) throw error;
  }
}

async function ensureRevokedSyntheticConsent(unitId: string, patientId: string, doctorId: string) {
  const { data, error } = await admin
    .from("consent_events")
    .select("event")
    .eq("unit_id", unitId)
    .eq("patient_id", patientId)
    .order("sequence_no", { ascending: false })
    .limit(1);
  if (error) throw error;
  if (data?.[0]?.event === "revoked") return;
  const { error: insertError } = await admin.from("consent_events").insert({
    id: uuid(patientId, "consent:revoked"),
    unit_id: unitId,
    patient_id: patientId,
    event: "revoked",
    notice_version: "synthetic-demo-v1",
    method: "other",
    evidence_note: "Identidad sintética: mensajería externa deshabilitada para prevenir envíos reales.",
    attributed_doctor_id: doctorId,
  });
  if (insertError) throw insertError;
}

async function ensureComplication(unitId: string, patientId: string, doctorId: string, today: string, code: ComplicationCode) {
  const { data, error } = await admin
    .from("patient_complications")
    .select("id")
    .eq("unit_id", unitId)
    .eq("patient_id", patientId)
    .eq("active", true)
    .limit(1);
  if (error) throw error;
  if (data?.length) return;
  const { error: insertError } = await admin.from("patient_complications").insert({
    id: uuid(patientId, `complication:${code}`),
    unit_id: unitId,
    patient_id: patientId,
    code,
    diagnosed_on: daysAgo(today, code === "E119" ? 30 : 420),
    notes: "Captura clínica sintética para demostración.",
    attributed_doctor_id: doctorId,
  });
  if (insertError) throw insertError;
}

async function ensureMedication(unitId: string, doctorId: string, values: { name: string; strength: string }, therapeuticClass: "antidiabetic" | "antihypertensive") {
  const { data, error } = await admin
    .from("medications")
    .select("id")
    .eq("unit_id", unitId)
    .eq("name", values.name)
    .eq("strength", values.strength)
    .limit(1);
  if (error) throw error;
  if (data?.length) {
    const { error: updateError } = await admin.from("medications").update({ therapeutic_class: therapeuticClass, active: true, attributed_doctor_id: doctorId }).eq("unit_id", unitId).eq("id", data[0].id);
    if (updateError) throw updateError;
    return data[0].id;
  }
  const id = uuid(`${values.name}:${values.strength}`, "medication");
  const { error: insertError } = await admin.from("medications").insert({
    id,
    unit_id: unitId,
    name: values.name,
    strength: values.strength,
    pharmaceutical_form: values.name.startsWith("Insulina") ? "solución inyectable" : "tableta",
    therapeutic_class: therapeuticClass,
    attributed_doctor_id: doctorId,
  });
  if (insertError) throw insertError;
  return id;
}

async function ensurePrescription(params: {
  unitId: string;
  patientId: string;
  doctorId: string;
  medicationId: string;
  therapeuticClass: "antidiabetic" | "antihypertensive";
  dose: string;
  instructions: string;
  route: "oral" | "subcutaneous";
  today: string;
}) {
  const { data, error } = await admin
    .from("prescriptions")
    .select("id,medications!inner(therapeutic_class),prescription_schedules(id)")
    .eq("unit_id", params.unitId)
    .eq("patient_id", params.patientId)
    .eq("status", "active")
    .eq("medications.therapeutic_class", params.therapeuticClass)
    .limit(1);
  if (error) throw error;
  let prescriptionId = data?.[0]?.id;
  let scheduleId: string | null = data?.[0]?.prescription_schedules?.[0]?.id ?? null;
  if (!prescriptionId) {
    prescriptionId = uuid(params.patientId, `prescription:${params.therapeuticClass}`);
    const { error: insertError } = await admin.from("prescriptions").insert({
      id: prescriptionId,
      unit_id: params.unitId,
      patient_id: params.patientId,
      medication_id: params.medicationId,
      dose_text: params.dose,
      route: params.route,
      instructions: params.instructions,
      start_date: daysAgo(params.today, 180),
      status: "draft",
      change_reason: "Tratamiento sintético para completar la demostración.",
      attributed_doctor_id: params.doctorId,
    });
    if (insertError) throw insertError;

    scheduleId = uuid(params.patientId, `schedule:${params.therapeuticClass}`);
    const { error: scheduleError } = await admin.from("prescription_schedules").insert({
      id: scheduleId,
      unit_id: params.unitId,
      prescription_id: prescriptionId,
      local_time: params.therapeuticClass === "antidiabetic" ? "08:00" : "20:00",
      weekdays: [1, 2, 3, 4, 5, 6, 7],
    });
    if (scheduleError) throw scheduleError;

    const { error: activationError } = await admin.from("prescriptions").update({
      status: "active",
      change_reason: "Activación del tratamiento sintético para demostración.",
      attributed_doctor_id: params.doctorId,
    }).eq("unit_id", params.unitId).eq("id", prescriptionId).eq("status", "draft");
    if (activationError) throw activationError;
  }
  return { prescriptionId, scheduleId };
}

async function ensurePlan(params: {
  unitId: string;
  patientId: string;
  doctorId: string;
  today: string;
  kind: "fasting" | "after_meal" | "pressure";
  active: boolean;
}) {
  const id = uuid(params.patientId, `plan:${params.kind}`);
  const { data: existing, error: findError } = await admin
    .from("monitoring_plans")
    .select("id")
    .eq("unit_id", params.unitId)
    .eq("id", id)
    .maybeSingle();
  if (findError) throw findError;
  if (existing) return existing.id;
  const pressure = params.kind === "pressure";
  const common = {
    id,
    unit_id: params.unitId,
    patient_id: params.patientId,
    kind: pressure ? "blood_pressure" : "glucose",
    local_time: pressure ? "07:35" : params.kind === "fasting" ? "07:30" : "20:30",
    weekdays: [1, 2, 3, 4, 5, 6, 7],
    start_date: daysAgo(params.today, 180),
    measurement_context: pressure ? "resting" : params.kind,
    active: params.active,
    attributed_doctor_id: params.doctorId,
  };
  const { error } = pressure
    ? await admin.from("monitoring_plans").insert({
        ...common,
        systolic_min_mm_hg: 90,
        systolic_max_mm_hg: 130,
        diastolic_min_mm_hg: 60,
        diastolic_max_mm_hg: 85,
        critical_systolic_min_mm_hg: 70,
        critical_systolic_max_mm_hg: 180,
        critical_diastolic_min_mm_hg: 40,
        critical_diastolic_max_mm_hg: 120,
      })
    : await admin.from("monitoring_plans").insert({
        ...common,
        glucose_min_mg_dl: 70,
        glucose_max_mg_dl: params.kind === "fasting" ? 130 : 180,
        critical_glucose_min_mg_dl: 50,
        critical_glucose_max_mg_dl: params.kind === "fasting" ? 250 : 300,
      });
  if (error) throw error;
  return id;
}

async function seriesCount(unitId: string, patientId: string, kind: "glucose" | "blood_pressure", context: string | null, since: string) {
  let query = admin.from("measurements").select("id", { count: "exact", head: true }).eq("unit_id", unitId).eq("patient_id", patientId).eq("kind", kind).gte("measured_at", since).is("voided_at", null);
  query = context == null ? query : query.eq("measurement_context", context);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

async function ensureMeasurements(params: {
  unitId: string;
  patientId: string;
  doctorId: string;
  timezone: string;
  today: string;
  scenario: ClinicalScenario;
  plans: { fasting: string; postprandial: string; pressure: string };
}) {
  const since = localInstant(params.today, 90, "00:00", params.timezone);
  const [fastingCount, postCount, pressureCount] = await Promise.all([
    seriesCount(params.unitId, params.patientId, "glucose", "fasting", since),
    seriesCount(params.unitId, params.patientId, "glucose", "after_meal", since),
    seriesCount(params.unitId, params.patientId, "blood_pressure", null, since),
  ]);
  const rows: MeasurementInsert[] = [];
  if (fastingCount < 30) {
    for (let day = 90; day >= 1; day -= 1) rows.push({
      id: uuid(params.patientId, `measurement:fasting:${day}`), unit_id: params.unitId, patient_id: params.patientId,
      monitoring_plan_id: params.plans.fasting, kind: "glucose", measured_at: localInstant(params.today, day, "07:30", params.timezone),
      glucose_mg_dl: Math.max(65, Math.round(params.scenario.glucoseLatest - params.scenario.glucoseDailySlope * day + jitter(day, 5))),
      measurement_context: "fasting", source: "manual", notes: "Lectura sintética de la cohorte demo.",
      correction_reason: "Actualización reproducible de la ventana demo de 90 días.", attributed_doctor_id: params.doctorId,
    });
  }
  if (pressureCount < 30) {
    for (let day = 90; day >= 1; day -= 1) rows.push({
      id: uuid(params.patientId, `measurement:pressure:${day}`), unit_id: params.unitId, patient_id: params.patientId,
      monitoring_plan_id: params.plans.pressure, kind: "blood_pressure", measured_at: localInstant(params.today, day, "07:35", params.timezone),
      systolic_mm_hg: Math.max(85, Math.round(params.scenario.systolicLatest - params.scenario.systolicDailySlope * day + jitter(day, 4))),
      diastolic_mm_hg: Math.max(50, Math.round(params.scenario.diastolicLatest - params.scenario.diastolicDailySlope * day + jitter(day + 2, 2))),
      measurement_context: "resting", source: "manual", notes: "Lectura sintética de la cohorte demo.",
      correction_reason: "Actualización reproducible de la ventana demo de 90 días.", attributed_doctor_id: params.doctorId,
    });
  }
  if (postCount < 6) {
    for (let index = 0; index < 13; index += 1) {
      const day = 85 - index * 7;
      rows.push({
        id: uuid(params.patientId, `measurement:postprandial:${day}`), unit_id: params.unitId, patient_id: params.patientId,
        monitoring_plan_id: params.plans.postprandial, kind: "glucose", measured_at: localInstant(params.today, day, "20:30", params.timezone),
        glucose_mg_dl: Math.max(90, Math.round(params.scenario.glucoseLatest + 38 - params.scenario.glucoseDailySlope * day + jitter(index, 7))),
        measurement_context: "after_meal", source: "manual", notes: "Lectura posprandial sintética de la cohorte demo.",
        correction_reason: "Actualización reproducible de la ventana demo de 90 días.", attributed_doctor_id: params.doctorId,
      });
    }
  }
  await upsertMeasurementChunks(rows);
  return rows.length;
}

async function ensureAdherence(params: {
  unitId: string;
  patientId: string;
  doctorId: string;
  timezone: string;
  today: string;
  therapeuticClass: "antidiabetic" | "antihypertensive";
  medicationName: string;
  dose: string;
  ratio: number;
  prescriptionId: string;
  scheduleId: string | null;
}) {
  const since = localInstant(params.today, 90, "00:00", params.timezone);
  const { count, error } = await admin.from("bot_interactions").select("id", { count: "exact", head: true })
    .eq("unit_id", params.unitId).eq("patient_id", params.patientId).eq("kind", "medication")
    .eq("prescription_id", params.prescriptionId).gte("scheduled_at", since);
  if (error) throw error;
  if ((count ?? 0) >= 30) return 0;

  const interactions: InteractionInsert[] = [];
  const responses: MedicationResponseInsert[] = [];
  for (let day = 90; day >= 1; day -= 1) {
    const scheduledAt = localInstant(params.today, day, params.therapeuticClass === "antidiabetic" ? "08:00" : "20:00", params.timezone);
    const reportedAt = new Date(Date.parse(scheduledAt) + 25 * 60_000).toISOString();
    const interactionId = uuid(params.patientId, `interaction:${params.therapeuticClass}:${day}`);
    interactions.push({
      id: interactionId, unit_id: params.unitId, patient_id: params.patientId, kind: "medication",
      prescription_id: params.prescriptionId, deduplication_key: `${FIXTURE_VERSION}:${params.patientId}:${params.therapeuticClass}:${day}`,
      scheduled_at: scheduledAt, expects_response: true, provider: "demo", delivery_status: "delivered", delivered_at: scheduledAt,
      response_deadline_at: new Date(Date.parse(scheduledAt) + 120 * 60_000).toISOString(), response_at: reportedAt,
      payload_snapshot: { medicationName: params.medicationName, doseText: params.dose, scheduleId: params.scheduleId, fixture: FIXTURE_VERSION },
    });
    responses.push({
      id: uuid(params.patientId, `response:${params.therapeuticClass}:${day}`), unit_id: params.unitId, patient_id: params.patientId,
      interaction_id: interactionId, taken: deterministicTaken(day, params.ratio, `${params.patientId}:${params.therapeuticClass}`),
      reported_at: reportedAt, source: "manual", notes: "Respuesta sintética para la cohorte demo.",
      correction_reason: "Actualización reproducible de la ventana demo de 90 días.", attributed_doctor_id: params.doctorId,
    });
  }
  await upsertInteractionChunks(interactions);
  await upsertMedicationResponseChunks(responses);
  return interactions.length;
}

async function ensureAppointment(params: { unitId: string; patientId: string; roomId: string; doctorId: string; timezone: string; today: string; index: number; risk: Risk }) {
  const id = uuid(params.patientId, "appointment:next");
  const { data: existing, error: findError } = await admin.from("appointments").select("id").eq("unit_id", params.unitId).eq("id", id).maybeSingle();
  if (findError) throw findError;
  if (existing) return;
  const startsAt = plusDaysLocal(params.today, 4 + params.index * 2, params.index % 2 ? "11:00" : "09:30", params.timezone);
  const { error } = await admin.from("appointments").insert({
    id, unit_id: params.unitId, patient_id: params.patientId, consulting_room_id: params.roomId,
    starts_at: startsAt, ends_at: new Date(Date.parse(startsAt) + 30 * 60_000).toISOString(), status: "scheduled",
    urgency: params.risk === "high" ? "urgent" : "routine", reason: params.risk === "high" ? "Seguimiento prioritario de control cardiometabólico" : "Consulta de seguimiento",
    notes: "Cita sintética para demostración.", attributed_doctor_id: params.doctorId,
  });
  if (error) throw error;
}

async function ensureRiskAndAlert(params: { unitId: string; patientId: string; doctorId: string; risk: Risk; scenario: ClinicalScenario }) {
  const riskId = uuid(params.patientId, "risk:current");
  const { error: riskError } = await admin.from("risk_assessments").upsert({
    id: riskId, unit_id: params.unitId, patient_id: params.patientId, level: params.risk,
    rule_version: "synthetic-demo-v1", input_snapshot: { fixture: FIXTURE_VERSION, scenario: params.scenario.key },
    reasons: [params.scenario.riskReason],
  }, { onConflict: "id" });
  if (riskError) throw riskError;
  if (params.risk === "low") return;

  const alertId = uuid(params.patientId, "alert:current");
  const { data: existingAlert, error: alertFindError } = await admin.from("alerts").select("id").eq("unit_id", params.unitId).eq("id", alertId).maybeSingle();
  if (alertFindError) throw alertFindError;
  if (existingAlert) return;
  const { error: alertError } = await admin.from("alerts").insert({
    id: alertId, unit_id: params.unitId, patient_id: params.patientId, kind: "high_risk",
    severity: params.risk === "high" ? "critical" : "warning", status: "open", risk_assessment_id: riskId,
    deduplication_key: `${FIXTURE_VERSION}:risk:${params.patientId}`,
    title: params.risk === "high" ? "Control prioritario requerido" : "Seguimiento clínico recomendado",
    detail: { fixture: FIXTURE_VERSION, reason: params.scenario.riskReason }, attributed_doctor_id: params.doctorId,
  });
  if (alertError) throw alertError;
}

async function completePatient(params: {
  patient: Awaited<ReturnType<typeof loadAllPatients>>[number];
  scenario: ClinicalScenario;
  unitId: string;
  timezone: string;
  today: string;
  doctorId: string;
  syntheticIdentity: boolean;
  index: number;
}) {
  const diagnoses = await diagnosesFor(params.unitId, params.patient.id);
  const isFixture = params.syntheticIdentity;
  if (isFixture) {
    await ensureDiagnoses(params.unitId, params.patient.id, params.doctorId, params.today, ["diabetes_type_2", "hypertension"]);
    await ensureRevokedSyntheticConsent(params.unitId, params.patient.id, params.doctorId);
    diagnoses.add("diabetes_type_2");
    diagnoses.add("hypertension");
  }
  if (!diagnoses.has("diabetes_type_2") && !diagnoses.has("hypertension")) {
    await ensureDiagnoses(params.unitId, params.patient.id, params.doctorId, params.today, ["hypertension"]);
    diagnoses.add("hypertension");
  }
  const hasDm = diagnoses.has("diabetes_type_2");
  const hasHta = diagnoses.has("hypertension");

  const patch: Database["public"]["Tables"]["patients"]["Update"] = {};
  if (params.patient.record_number?.startsWith("DEMO-SMS8-")) patch.full_name = "Mario Alberto Sánchez Cortés";
  if (params.patient.record_number === "AI-RF30-COMPLETE") patch.full_name = "Elena Martínez Soto";
  if (!params.patient.record_number) patch.record_number = `KUNI-LEGACY-${params.patient.id.slice(0, 8).toUpperCase()}`;
  if (!params.patient.followup_interval_days) patch.followup_interval_days = params.scenario.followupDays;
  if (!params.patient.initial_risk_reason) patch.initial_risk_reason = `${params.scenario.riskReason} Datos sintéticos para demostración.`;
  if (params.patient.initial_risk === "unknown") patch.initial_risk = params.scenario.risk;
  if (!params.patient.blood_type || params.patient.blood_type === "unknown") patch.blood_type = ["O+", "A+", "B+", "O-"][params.index % 4];
  if (hasDm && !params.patient.diabetes_treatment_phase) patch.diabetes_treatment_phase = params.scenario.diabetesPhase;
  if (hasHta && !params.patient.hypertension_treatment_phase) patch.hypertension_treatment_phase = params.scenario.hypertensionPhase;
  if (Object.keys(patch).length) {
    const { error } = await admin.from("patients").update(patch).eq("unit_id", params.unitId).eq("id", params.patient.id);
    if (error) throw error;
  }

  if (hasDm) await ensureComplication(params.unitId, params.patient.id, params.doctorId, params.today, params.scenario.complication);
  const plans = {
    fasting: await ensurePlan({ ...params, patientId: params.patient.id, kind: "fasting", active: isFixture }),
    postprandial: await ensurePlan({ ...params, patientId: params.patient.id, kind: "after_meal", active: isFixture }),
    pressure: await ensurePlan({ ...params, patientId: params.patient.id, kind: "pressure", active: isFixture }),
  };
  const measurementsAdded = await ensureMeasurements({ ...params, patientId: params.patient.id, plans });

  let adherenceRowsAdded = 0;
  if (hasDm) {
    const med = await ensureMedication(params.unitId, params.doctorId, params.scenario.dmMedication, "antidiabetic");
    const prescription = await ensurePrescription({ unitId: params.unitId, patientId: params.patient.id, doctorId: params.doctorId, medicationId: med, therapeuticClass: "antidiabetic", dose: params.scenario.dmMedication.dose, instructions: params.scenario.dmMedication.instructions, route: params.scenario.dmMedication.name.startsWith("Insulina") ? "subcutaneous" : "oral", today: params.today });
    adherenceRowsAdded += await ensureAdherence({ ...params, patientId: params.patient.id, therapeuticClass: "antidiabetic", medicationName: params.scenario.dmMedication.name, dose: params.scenario.dmMedication.dose, ratio: params.scenario.adherenceDm, ...prescription });
  }
  if (hasHta) {
    const med = await ensureMedication(params.unitId, params.doctorId, params.scenario.htaMedication, "antihypertensive");
    const prescription = await ensurePrescription({ unitId: params.unitId, patientId: params.patient.id, doctorId: params.doctorId, medicationId: med, therapeuticClass: "antihypertensive", dose: params.scenario.htaMedication.dose, instructions: params.scenario.htaMedication.instructions, route: "oral", today: params.today });
    adherenceRowsAdded += await ensureAdherence({ ...params, patientId: params.patient.id, therapeuticClass: "antihypertensive", medicationName: params.scenario.htaMedication.name, dose: params.scenario.htaMedication.dose, ratio: params.scenario.adherenceHta, ...prescription });
  }
  if (isFixture) await ensureAppointment({ ...params, patientId: params.patient.id, roomId: params.patient.consulting_room_id, index: params.index, risk: params.scenario.risk });
  await ensureRiskAndAlert({ ...params, patientId: params.patient.id, risk: params.scenario.risk });
  return { measurementsAdded, adherenceRowsAdded, hasDm, hasHta };
}

async function auditCohort(unitId: string, timezone: string) {
  const patients = await loadAllPatients(unitId);
  const since = localInstant(formatInTimeZone(new Date(), timezone, "yyyy-MM-dd"), 91, "00:00", timezone);
  const rows = [];
  const failures: string[] = [];
  for (const patient of patients) {
    const [diagnoses, measurements, plans, prescriptions, responses, complications, appointments, consent] = await Promise.all([
      admin.from("patient_diagnoses").select("condition_code").eq("unit_id", unitId).eq("patient_id", patient.id).eq("active", true),
      admin.from("measurements").select("id", { count: "exact", head: true }).eq("unit_id", unitId).eq("patient_id", patient.id).gte("measured_at", since).is("voided_at", null),
      admin.from("monitoring_plans").select("id", { count: "exact", head: true }).eq("unit_id", unitId).eq("patient_id", patient.id),
      admin.from("prescriptions").select("id", { count: "exact", head: true }).eq("unit_id", unitId).eq("patient_id", patient.id).eq("status", "active"),
      admin.from("medication_responses").select("id", { count: "exact", head: true }).eq("unit_id", unitId).eq("patient_id", patient.id).gte("reported_at", since),
      admin.from("patient_complications").select("id", { count: "exact", head: true }).eq("unit_id", unitId).eq("patient_id", patient.id).eq("active", true),
      admin.from("appointments").select("id", { count: "exact", head: true }).eq("unit_id", unitId).eq("patient_id", patient.id).eq("status", "scheduled"),
      admin.from("patient_consent_status").select("consent_granted").eq("unit_id", unitId).eq("patient_id", patient.id).maybeSingle(),
    ]);
    for (const result of [diagnoses, measurements, plans, prescriptions, responses, complications, appointments, consent]) {
      if (result.error) throw result.error;
    }
    const codes = new Set((diagnoses.data ?? []).map(({ condition_code }) => condition_code));
    const hasDm = codes.has("diabetes_type_2");
    const hasHta = codes.has("hypertension");
    const expectedResponses = (hasDm ? 90 : 0) + (hasHta ? 90 : 0);
    const synthetic = patient.record_number?.startsWith("KUNI-SYN-") ?? false;
    const complete =
      (hasDm || hasHta) &&
      (measurements.count ?? 0) >= 90 &&
      (plans.count ?? 0) >= 3 &&
      (prescriptions.count ?? 0) >= Number(hasDm) + Number(hasHta) &&
      (responses.count ?? 0) >= expectedResponses &&
      (!hasDm || (complications.count ?? 0) >= 1) &&
      (!synthetic || ((appointments.count ?? 0) >= 1 && consent.data?.consent_granted === false));
    if (!complete) failures.push(patient.full_name);
    rows.push({
      paciente: patient.full_name,
      dx: [hasDm ? "DM2" : null, hasHta ? "HTA" : null].filter(Boolean).join("+") || "—",
      mediciones_90d: measurements.count ?? 0,
      tratamientos: prescriptions.count ?? 0,
      adherencia_90d: responses.count ?? 0,
      complicaciones: complications.count ?? 0,
      estado: complete ? "completo" : "revisar",
    });
  }
  console.log("\nAuditoría de integridad de la cohorte:");
  console.table(rows);
  if (failures.length) throw new Error(`Expedientes incompletos: ${failures.join(", ")}`);
  return patients.length;
}

async function main() {
  const context = await loadContext();
  const before = await loadAllPatients(context.unit.id);
  console.log(`Unidad: ${context.unit.name}`);
  console.log(`Pacientes activos actuales: ${before.length}`);
  console.log(`Pacientes sintéticos nuevos definidos: ${NEW_PATIENTS.length}`);
  if (!APPLY) {
    console.table(NEW_PATIENTS.map(({ fullName, recordNumber, scenario }) => ({ paciente: fullName, expediente: recordNumber, riesgo: scenario.risk, escenario: scenario.key })));
    console.log("Inventario únicamente. Ejecuta con --apply para escribir la cohorte.");
    await auditCohort(context.unit.id, context.unit.timezone);
    return;
  }

  const fixtures = await ensureNewPatients(context);
  const fixtureIds = new Set(fixtures.map(({ id }) => id));
  const patients = await loadAllPatients(context.unit.id);
  const roomDoctor = new Map(context.rooms.map((room) => [room.id, room.doctor_id]));
  const summary = [];
  for (let index = 0; index < patients.length; index += 1) {
    const patient = patients[index];
    const fixture = fixtures.find(({ id }) => id === patient.id);
    const scenario = fixture?.scenario ?? SCENARIOS[index % SCENARIOS.length];
    const doctorId = roomDoctor.get(patient.consulting_room_id) ?? patient.attributed_doctor_id ?? context.primaryRoom.doctor_id;
    const result = await completePatient({ patient, scenario, unitId: context.unit.id, timezone: context.unit.timezone, today: formatInTimeZone(new Date(), context.unit.timezone, "yyyy-MM-dd"), doctorId, syntheticIdentity: fixtureIds.has(patient.id), index });
    summary.push({ paciente: patient.full_name, nuevo: fixtureIds.has(patient.id) ? "sí" : "no", condiciones: [result.hasDm ? "DM2" : null, result.hasHta ? "HTA" : null].filter(Boolean).join(" + ") || "sin diagnóstico objetivo", mediciones_agregadas: result.measurementsAdded, recordatorios_agregados: result.adherenceRowsAdded, escenario: scenario.key });
    console.log(`✓ ${patient.full_name}`);
  }
  console.table(summary);
  console.log(`Cohorte lista: ${patients.length} pacientes activos (${fixtures.length} identidades sintéticas administradas por este seed).`);
  console.log("Los datos previos se conservaron; las identidades nuevas tienen mensajería externa revocada.");
  await auditCohort(context.unit.id, context.unit.timezone);
}

main().catch((error) => {
  console.error("No se pudo preparar la cohorte demo completa:", error);
  process.exit(1);
});
