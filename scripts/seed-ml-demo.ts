/**
 * Crea o refresca un expediente ficticio completo para probar RF29/RF30.
 *
 * Cubre las 17 variables del vector ML, las tres señales de suficiencia,
 * adherencia confirmada por clase terapéutica y datos clínicos visibles en
 * la ficha. No es una migración y nunca debe usarse con datos reales.
 *
 * Uso:
 *   npx tsx scripts/seed-ml-demo.ts
 *
 * Requiere NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SECRET_KEY en .env.local.
 * Puede ejecutarse varias veces: reutiliza las entidades del fixture y mueve
 * sus observaciones a los últimos 30 días para que no caduquen.
 */
import { createHash } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { format, parseISO, subDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

try {
  process.loadEnvFile(".env.local");
} catch {
  console.warn("No se encontró .env.local; usando variables ya exportadas.");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!url || !secretKey) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY en .env.local.");
  process.exit(1);
}

const admin = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const UNIT_CODE = process.env.KUNI_DEMO_UNIT_CODE ?? "IMSSB-MICH-MORELIA-JMGU";
const FIXTURE_KEY = "rf30-complete-v1";
const PATIENT_RECORD = "AI-RF30-COMPLETE";
const PATIENT_NAME = "Elena Martínez Soto (Paciente ficticia RF30)";
const PATIENT_PHONE = "+524439990301";
const FASTING_VALUES = [135, 140, 145, 150, 155, 160, 165, 170, 175, 180, 185, 190, 195, 200];
const SYSTOLIC_VALUES = [128, 131, 134, 137, 140, 143, 146, 149, 152, 155, 158, 161, 164, 167];
const DIASTOLIC_VALUES = [82, 83, 85, 86, 88, 89, 91, 92, 94, 95, 97, 98, 100, 101];
const POSTPRANDIAL_VALUES = [188, 196, 204];
const TAKEN_DAYS_DM = new Set([2, 5, 9, 13, 16, 19, 20]);
const TAKEN_DAYS_HTA = new Set([1, 4, 7, 10, 13, 16, 19, 20]);

type RoomContext = {
  id: string;
  name: string;
  doctorId: string;
  doctorName: string;
};

type PlanKind = "fasting" | "after_meal" | "blood_pressure";

function fixtureUuid(label: string): string {
  const hex = createHash("sha256").update(`${FIXTURE_KEY}:${label}`).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = "8";
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function localDateDaysAgo(today: string, daysAgo: number): string {
  return format(subDays(parseISO(today), daysAgo), "yyyy-MM-dd");
}

function localInstant(today: string, daysAgo: number, localTime: string, timezone: string): string {
  const date = localDateDaysAgo(today, daysAgo);
  return fromZonedTime(`${date}T${localTime}:00`, timezone).toISOString();
}

function minutesAfter(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) + minutes * 60_000).toISOString();
}

async function loadContext(): Promise<{ unitId: string; unitName: string; timezone: string; room: RoomContext }> {
  const { data: unit, error: unitError } = await admin
    .from("health_units")
    .select("id, name, timezone")
    .eq("institutional_code", UNIT_CODE)
    .eq("active", true)
    .single();
  if (unitError) throw new Error(`No se encontró la unidad demo ${UNIT_CODE}: ${unitError.message}`);

  const { data: rooms, error: roomError } = await admin
    .from("consulting_rooms")
    .select("id, name, doctor_id")
    .eq("unit_id", unit.id)
    .eq("active", true)
    .order("created_at")
    .limit(10);
  if (roomError) throw roomError;

  for (const candidate of rooms ?? []) {
    const { data: doctor, error: doctorError } = await admin
      .from("doctors")
      .select("id, full_name")
      .eq("unit_id", unit.id)
      .eq("id", candidate.doctor_id)
      .eq("active", true)
      .maybeSingle();
    if (doctorError) throw doctorError;
    if (doctor) {
      return {
        unitId: unit.id,
        unitName: unit.name,
        timezone: unit.timezone,
        room: { id: candidate.id, name: candidate.name, doctorId: doctor.id, doctorName: doctor.full_name },
      };
    }
  }

  throw new Error("La unidad demo no tiene un consultorio activo con médico activo. Ejecuta primero seed-doctor-room.ts.");
}

async function ensurePatient(context: Awaited<ReturnType<typeof loadContext>>, today: string): Promise<string> {
  const birthDate = localDateDaysAgo(today, 58 * 365 + 74);
  const patientValues = {
    unit_id: context.unitId,
    consulting_room_id: context.room.id,
    attributed_doctor_id: context.room.doctorId,
    full_name: PATIENT_NAME,
    birth_date: birthDate,
    sex: "female",
    record_number: PATIENT_RECORD,
    whatsapp_e164: PATIENT_PHONE,
    blood_type: "O+",
    initial_risk: "medium",
    initial_risk_reason: "Diabetes tipo 2 e hipertensión con deterioro gradual y baja adherencia simulada (fixture RF30).",
    diabetes_treatment_phase: "estable_oral",
    hypertension_treatment_phase: "en_ajuste",
  };

  const { data: existing, error: findError } = await admin
    .from("patients")
    .select("id")
    .eq("unit_id", context.unitId)
    .eq("record_number", PATIENT_RECORD)
    .maybeSingle();
  if (findError) throw findError;

  if (existing) {
    const { error } = await admin.from("patients").update(patientValues).eq("id", existing.id).eq("unit_id", context.unitId);
    if (error) throw error;
    return existing.id;
  }

  const { data: patient, error } = await admin
    .from("patients")
    .insert({ id: fixtureUuid("patient"), ...patientValues })
    .select("id")
    .single();
  if (error) throw error;
  return patient.id;
}

async function ensureDiagnoses(unitId: string, patientId: string, doctorId: string, today: string) {
  const diagnoses = [
    { code: "diabetes_type_2", diagnosedOn: localDateDaysAgo(today, 5 * 365 + 43) },
    { code: "hypertension", diagnosedOn: localDateDaysAgo(today, 3 * 365 + 19) },
  ] as const;

  for (const diagnosis of diagnoses) {
    const { data, error } = await admin
      .from("patient_diagnoses")
      .select("id")
      .eq("unit_id", unitId)
      .eq("patient_id", patientId)
      .eq("condition_code", diagnosis.code)
      .eq("active", true)
      .limit(1);
    if (error) throw error;
    if (data?.length) continue;

    const { error: insertError } = await admin.from("patient_diagnoses").insert({
      id: fixtureUuid(`diagnosis:${diagnosis.code}`),
      unit_id: unitId,
      patient_id: patientId,
      condition_code: diagnosis.code,
      diagnosed_on: diagnosis.diagnosedOn,
      attributed_doctor_id: doctorId,
    });
    if (insertError) throw insertError;
  }
}

async function ensureConsentAndComplication(unitId: string, patientId: string, doctorId: string, today: string) {
  const { data: consent, error: consentFindError } = await admin
    .from("consent_events")
    .select("id")
    .eq("unit_id", unitId)
    .eq("patient_id", patientId)
    .eq("event", "granted")
    .limit(1);
  if (consentFindError) throw consentFindError;
  if (!consent?.length) {
    const { error } = await admin.from("consent_events").insert({
      id: fixtureUuid("consent"),
      unit_id: unitId,
      patient_id: patientId,
      event: "granted",
      notice_version: "fixture-rf30-v1",
      method: "in_person",
      evidence_note: "Consentimiento ficticio para pruebas internas; no corresponde a una persona real.",
      attributed_doctor_id: doctorId,
    });
    if (error) throw error;
  }

  const { data: complication, error: complicationFindError } = await admin
    .from("patient_complications")
    .select("id")
    .eq("unit_id", unitId)
    .eq("patient_id", patientId)
    .eq("code", "E119")
    .eq("active", true)
    .limit(1);
  if (complicationFindError) throw complicationFindError;
  if (!complication?.length) {
    const { error } = await admin.from("patient_complications").insert({
      id: fixtureUuid("complication:E119"),
      unit_id: unitId,
      patient_id: patientId,
      code: "E119",
      diagnosed_on: localDateDaysAgo(today, 30),
      notes: "Expediente revisado sin complicaciones diabéticas documentadas (fixture RF30).",
      attributed_doctor_id: doctorId,
    });
    if (error) throw error;
  }
}

async function ensureMedication(
  unitId: string,
  doctorId: string,
  key: "dm" | "hta",
  values: { name: string; strength: string; therapeuticClass: "antidiabetic" | "antihypertensive" },
): Promise<string> {
  const { data: existing, error: findError } = await admin
    .from("medications")
    .select("id")
    .eq("unit_id", unitId)
    .eq("name", values.name)
    .limit(1);
  if (findError) throw findError;

  if (existing?.length) {
    const { error } = await admin.from("medications").update({
      strength: values.strength,
      pharmaceutical_form: "tableta",
      therapeutic_class: values.therapeuticClass,
      active: true,
      attributed_doctor_id: doctorId,
    }).eq("unit_id", unitId).eq("id", existing[0].id);
    if (error) throw error;
    return existing[0].id;
  }

  const { data: medication, error } = await admin.from("medications").insert({
    id: fixtureUuid(`medication:${key}`),
    unit_id: unitId,
    name: values.name,
    strength: values.strength,
    pharmaceutical_form: "tableta",
    therapeutic_class: values.therapeuticClass,
    attributed_doctor_id: doctorId,
  }).select("id").single();
  if (error) throw error;
  return medication.id;
}

async function ensurePrescription(
  unitId: string,
  patientId: string,
  doctorId: string,
  medicationId: string,
  key: "dm" | "hta",
  today: string,
  doseText: string,
  instructions: string,
): Promise<{ id: string; scheduleId: string }> {
  const { data: active, error: findError } = await admin
    .from("prescriptions")
    .select("id, prescription_schedules(id)")
    .eq("unit_id", unitId)
    .eq("patient_id", patientId)
    .eq("medication_id", medicationId)
    .eq("status", "active")
    .limit(1);
  if (findError) throw findError;
  const schedule = active?.[0]?.prescription_schedules?.[0];
  if (active?.[0] && schedule) return { id: active[0].id, scheduleId: schedule.id };

  const prescriptionId = fixtureUuid(`prescription:${key}`);
  const scheduleId = fixtureUuid(`schedule:${key}`);
  const { error: prescriptionError } = await admin.from("prescriptions").insert({
    id: prescriptionId,
    unit_id: unitId,
    patient_id: patientId,
    medication_id: medicationId,
    dose_text: doseText,
    route: "oral",
    instructions,
    start_date: localDateDaysAgo(today, 90),
    status: "draft",
    attributed_doctor_id: doctorId,
  });
  if (prescriptionError) throw prescriptionError;

  const { error: scheduleError } = await admin.from("prescription_schedules").insert({
    id: scheduleId,
    unit_id: unitId,
    prescription_id: prescriptionId,
    local_time: "08:00",
    weekdays: [1, 2, 3, 4, 5, 6, 7],
  });
  if (scheduleError) throw scheduleError;

  const { error: activationError } = await admin.from("prescriptions").update({ status: "active" })
    .eq("unit_id", unitId).eq("id", prescriptionId);
  if (activationError) throw activationError;
  return { id: prescriptionId, scheduleId };
}

async function ensurePlan(
  unitId: string,
  patientId: string,
  doctorId: string,
  today: string,
  key: PlanKind,
): Promise<string> {
  const isPressure = key === "blood_pressure";
  const context = isPressure ? null : key;
  let query = admin.from("monitoring_plans").select("id")
    .eq("unit_id", unitId).eq("patient_id", patientId).eq("kind", isPressure ? "blood_pressure" : "glucose").eq("active", true);
  query = context == null ? query.is("measurement_context", null) : query.eq("measurement_context", context);
  const { data: existing, error: findError } = await query.limit(1);
  if (findError) throw findError;
  if (existing?.length) return existing[0].id;

  const common = {
    id: fixtureUuid(`plan:${key}`),
    unit_id: unitId,
    patient_id: patientId,
    kind: isPressure ? "blood_pressure" : "glucose",
    local_time: isPressure ? "07:35" : key === "fasting" ? "07:30" : "21:00",
    weekdays: [1, 2, 3, 4, 5, 6, 7],
    start_date: localDateDaysAgo(today, 90),
    measurement_context: context,
    attributed_doctor_id: doctorId,
  };
  const thresholds = isPressure ? {
    systolic_min_mm_hg: 90,
    systolic_max_mm_hg: 130,
    diastolic_min_mm_hg: 60,
    diastolic_max_mm_hg: 85,
    critical_systolic_min_mm_hg: 70,
    critical_systolic_max_mm_hg: 180,
    critical_diastolic_min_mm_hg: 40,
    critical_diastolic_max_mm_hg: 120,
  } : {
    glucose_min_mg_dl: 70,
    glucose_max_mg_dl: key === "fasting" ? 130 : 180,
    critical_glucose_min_mg_dl: 50,
    critical_glucose_max_mg_dl: key === "fasting" ? 250 : 300,
  };
  const { data: plan, error } = await admin.from("monitoring_plans").insert({ ...common, ...thresholds }).select("id").single();
  if (error) throw error;
  return plan.id;
}

async function refreshMeasurements(
  unitId: string,
  patientId: string,
  doctorId: string,
  timezone: string,
  today: string,
  plans: { fasting: string; postprandial: string; pressure: string },
) {
  const rows = FASTING_VALUES.flatMap((glucose, index) => {
    const daysAgo = 28 - index * 2;
    return [
      {
        id: fixtureUuid(`measurement:fasting:${index + 1}`),
        unit_id: unitId,
        patient_id: patientId,
        monitoring_plan_id: plans.fasting,
        kind: "glucose",
        measured_at: localInstant(today, daysAgo, "07:30", timezone),
        glucose_mg_dl: glucose,
        measurement_context: "fasting",
        source: "manual",
        notes: "Lectura ficticia determinista para RF30.",
        correction_reason: "Refresco de la ventana temporal del fixture RF30.",
        attributed_doctor_id: doctorId,
      },
      {
        id: fixtureUuid(`measurement:pressure:${index + 1}`),
        unit_id: unitId,
        patient_id: patientId,
        monitoring_plan_id: plans.pressure,
        kind: "blood_pressure",
        measured_at: localInstant(today, daysAgo, "07:35", timezone),
        systolic_mm_hg: SYSTOLIC_VALUES[index],
        diastolic_mm_hg: DIASTOLIC_VALUES[index],
        measurement_context: "resting",
        source: "manual",
        notes: "Lectura ficticia determinista para RF30.",
        correction_reason: "Refresco de la ventana temporal del fixture RF30.",
        attributed_doctor_id: doctorId,
      },
    ];
  });

  POSTPRANDIAL_VALUES.forEach((glucose, index) => rows.push({
    id: fixtureUuid(`measurement:postprandial:${index + 1}`),
    unit_id: unitId,
    patient_id: patientId,
    monitoring_plan_id: plans.postprandial,
    kind: "glucose",
    measured_at: localInstant(today, 6 - index * 2, "21:00", timezone),
    glucose_mg_dl: glucose,
    systolic_mm_hg: undefined,
    diastolic_mm_hg: undefined,
    measurement_context: "after_meal",
    source: "manual",
    notes: "Lectura postprandial ficticia para completar suficiencia RF30.",
    correction_reason: "Refresco de la ventana temporal del fixture RF30.",
    attributed_doctor_id: doctorId,
  }));

  const { error } = await admin.from("measurements").upsert(rows, { onConflict: "id" });
  if (error) throw error;
}

async function refreshAdherence(
  unitId: string,
  patientId: string,
  doctorId: string,
  timezone: string,
  today: string,
  medication: { key: "dm" | "hta"; name: string; doseText: string; prescriptionId: string; scheduleId: string; takenDays: Set<number> },
) {
  for (let day = 1; day <= 20; day += 1) {
    const scheduledAt = localInstant(today, day, "08:00", timezone);
    const responseAt = minutesAfter(scheduledAt, 30);
    const interactionId = fixtureUuid(`interaction:${medication.key}:${day}`);
    const { error: interactionError } = await admin.from("bot_interactions").upsert({
      id: interactionId,
      unit_id: unitId,
      patient_id: patientId,
      kind: "medication",
      prescription_id: medication.prescriptionId,
      deduplication_key: `${FIXTURE_KEY}:${medication.key}:${day}`,
      scheduled_at: scheduledAt,
      expects_response: true,
      provider: "demo",
      delivery_status: "delivered",
      delivered_at: scheduledAt,
      response_deadline_at: minutesAfter(scheduledAt, 120),
      response_at: responseAt,
      payload_snapshot: {
        medicationName: medication.name,
        doseText: medication.doseText,
        scheduleId: medication.scheduleId,
        fixture: FIXTURE_KEY,
      },
    }, { onConflict: "id" });
    if (interactionError) throw interactionError;

    const { error: responseError } = await admin.from("medication_responses").upsert({
      id: fixtureUuid(`response:${medication.key}:${day}`),
      unit_id: unitId,
      patient_id: patientId,
      interaction_id: interactionId,
      taken: medication.takenDays.has(day),
      reported_at: responseAt,
      source: "manual",
      notes: "Respuesta ficticia determinista para RF30.",
      correction_reason: "Refresco de la ventana temporal del fixture RF30.",
      attributed_doctor_id: doctorId,
    }, { onConflict: "id" });
    if (responseError) throw responseError;
  }
}

async function main() {
  const context = await loadContext();
  const today = formatInTimeZone(new Date(), context.timezone, "yyyy-MM-dd");
  const patientId = await ensurePatient(context, today);

  await ensureDiagnoses(context.unitId, patientId, context.room.doctorId, today);
  await ensureConsentAndComplication(context.unitId, patientId, context.room.doctorId, today);

  const dmName = "Metformina (fixture RF30)";
  const htaName = "Losartán (fixture RF30)";
  const dmDose = "1 tableta de 850 mg cada 24 horas";
  const htaDose = "1 tableta de 50 mg cada 24 horas";
  const dmMedicationId = await ensureMedication(context.unitId, context.room.doctorId, "dm", {
    name: dmName, strength: "850 mg", therapeuticClass: "antidiabetic",
  });
  const htaMedicationId = await ensureMedication(context.unitId, context.room.doctorId, "hta", {
    name: htaName, strength: "50 mg", therapeuticClass: "antihypertensive",
  });
  const dmPrescription = await ensurePrescription(context.unitId, patientId, context.room.doctorId, dmMedicationId, "dm", today, dmDose, "Tomar con el desayuno.");
  const htaPrescription = await ensurePrescription(context.unitId, patientId, context.room.doctorId, htaMedicationId, "hta", today, htaDose, "Tomar por la mañana a la misma hora.");

  const plans = {
    fasting: await ensurePlan(context.unitId, patientId, context.room.doctorId, today, "fasting"),
    postprandial: await ensurePlan(context.unitId, patientId, context.room.doctorId, today, "after_meal"),
    pressure: await ensurePlan(context.unitId, patientId, context.room.doctorId, today, "blood_pressure"),
  };
  await refreshMeasurements(context.unitId, patientId, context.room.doctorId, context.timezone, today, plans);
  await refreshAdherence(context.unitId, patientId, context.room.doctorId, context.timezone, today, {
    key: "dm", name: dmName, doseText: dmDose, prescriptionId: dmPrescription.id, scheduleId: dmPrescription.scheduleId, takenDays: TAKEN_DAYS_DM,
  });
  await refreshAdherence(context.unitId, patientId, context.room.doctorId, context.timezone, today, {
    key: "hta", name: htaName, doseText: htaDose, prescriptionId: htaPrescription.id, scheduleId: htaPrescription.scheduleId, takenDays: TAKEN_DAYS_HTA,
  });

  console.log("\nFixture RF29/RF30 listo:");
  console.table({
    unidad: context.unitName,
    consultorio: context.room.name,
    medico: context.room.doctorName,
    paciente: PATIENT_NAME,
    patientId,
  });
  console.log("Vector esperado: edad≈58, DM=1, HTA=1, comorbilidad=1, glucosa media=167.5, tendencia glucosa=2.5/día,");
  console.log("PAS media=147.5, tendencia PAS=1.5/día, adherencia DM=0.35, adherencia HTA=0.40, complicaciones=0.");
  console.log("Suficiencia esperada: ayuno=true, postprandial=true, presión=true; brechas del vector=0.");
  console.log("Selecciona el consultorio indicado y abre la ficha del paciente para ver RF30.");
}

main().catch((error) => {
  console.error("No se pudo preparar el fixture RF30:", error);
  process.exit(1);
});
