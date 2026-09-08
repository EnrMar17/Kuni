/**
 * Crea (o reutiliza) pacientes demo con datos ficticios pero con forma
 * realista: nombre, CURP con formato válido, teléfono de Morelia, diagnóstico
 * y consentimiento de WhatsApp otorgado.
 *
 * IMPORTANTE: son personas inventadas para pruebas, no expedientes reales.
 * Uso: npx tsx scripts/seed-demo-patients.ts
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
const ROOM_NAME = "Consultorio 3 - Medicina Familiar";

type DemoPatient = {
  fullName: string;
  birthDate: string;
  sex: "male" | "female";
  curp: string;
  whatsapp: string;
  bloodType: string;
  initialRisk: "low" | "medium" | "high" | "unknown";
  initialRiskReason: string;
  diagnoses: Array<{
    code: "diabetes_type_2" | "hypertension";
    diagnosedOn: string;
  }>;
};

const PATIENTS: DemoPatient[] = [
  {
    fullName: "José Luis Hernández Ramírez",
    birthDate: "1958-03-14",
    sex: "male",
    curp: "HERJ580314HMNRMSA5",
    whatsapp: "+524431234567",
    bloodType: "O+",
    initialRisk: "medium",
    initialRiskReason:
      "Diabetes tipo 2 de larga evolución con control irregular reportado por el paciente.",
    diagnoses: [{ code: "diabetes_type_2", diagnosedOn: "2015-06-01" }],
  },
  {
    fullName: "Guadalupe Torres Mendoza",
    birthDate: "1965-11-02",
    sex: "female",
    curp: "TOMG651102MMNRNDB3",
    whatsapp: "+524439876543",
    bloodType: "A+",
    initialRisk: "low",
    initialRiskReason:
      "Hipertensión reciente, cifras controladas en la última consulta.",
    diagnoses: [{ code: "hypertension", diagnosedOn: "2023-02-10" }],
  },
  {
    fullName: "Rosa Elena Pérez Gómez",
    birthDate: "1950-07-22",
    sex: "female",
    curp: "PEGR500722MMNRMSC7",
    whatsapp: "+524435551234",
    bloodType: "unknown",
    initialRisk: "high",
    initialRiskReason:
      "Diabetes tipo 2 e hipertensión concurrentes, adherencia previa deficiente.",
    diagnoses: [
      { code: "diabetes_type_2", diagnosedOn: "2010-01-15" },
      { code: "hypertension", diagnosedOn: "2012-09-20" },
    ],
  },
];

async function main() {
  const { data: unit, error: unitError } = await admin
    .from("health_units")
    .select("id, name")
    .eq("institutional_code", UNIT_INSTITUTIONAL_CODE)
    .single();
  if (unitError) throw unitError;

  const { data: doctor, error: doctorError } = await admin
    .from("doctors")
    .select("id, full_name")
    .eq("unit_id", unit.id)
    .eq("full_name", DOCTOR_FULL_NAME)
    .single();
  if (doctorError) throw doctorError;

  const { data: room, error: roomError } = await admin
    .from("consulting_rooms")
    .select("id, name")
    .eq("unit_id", unit.id)
    .eq("name", ROOM_NAME)
    .single();
  if (roomError) throw roomError;

  for (const p of PATIENTS) {
    const { data: existingPatient, error: findError } = await admin
      .from("patients")
      .select("id, full_name")
      .eq("unit_id", unit.id)
      .eq("curp", p.curp)
      .maybeSingle();
    if (findError) throw findError;
    let patient = existingPatient;

    if (!patient) {
      const { data: created, error: insertError } = await admin
        .from("patients")
        .insert({
          unit_id: unit.id,
          consulting_room_id: room.id,
          attributed_doctor_id: doctor.id,
          full_name: p.fullName,
          birth_date: p.birthDate,
          sex: p.sex,
          curp: p.curp,
          whatsapp_e164: p.whatsapp,
          blood_type: p.bloodType,
          initial_risk: p.initialRisk,
          initial_risk_reason: p.initialRiskReason,
        })
        .select("id, full_name")
        .single();
      if (insertError) throw insertError;
      patient = created;
      console.log("Paciente creado:", patient);
    } else {
      console.log("Paciente ya existía:", patient);
    }

    for (const dx of p.diagnoses) {
      const { data: existingDx, error: findDxError } = await admin
        .from("patient_diagnoses")
        .select("id")
        .eq("unit_id", unit.id)
        .eq("patient_id", patient.id)
        .eq("condition_code", dx.code)
        .maybeSingle();
      if (findDxError) throw findDxError;

      if (!existingDx) {
        const { error: insertDxError } = await admin
          .from("patient_diagnoses")
          .insert({
            unit_id: unit.id,
            patient_id: patient.id,
            condition_code: dx.code,
            diagnosed_on: dx.diagnosedOn,
            attributed_doctor_id: doctor.id,
          });
        if (insertDxError) throw insertDxError;
        console.log(`  Diagnóstico ${dx.code} registrado.`);
      }
    }

    const { data: existingConsent, error: findConsentError } = await admin
      .from("consent_events")
      .select("id")
      .eq("unit_id", unit.id)
      .eq("patient_id", patient.id)
      .eq("event", "granted")
      .maybeSingle();
    if (findConsentError) throw findConsentError;

    if (!existingConsent) {
      const { error: insertConsentError } = await admin
        .from("consent_events")
        .insert({
          unit_id: unit.id,
          patient_id: patient.id,
          event: "granted",
          notice_version: "demo-v1",
          method: "in_person",
          evidence_note:
            "Consentimiento verbal registrado por el médico durante consulta de alta (dato de demo).",
          attributed_doctor_id: doctor.id,
        });
      if (insertConsentError) throw insertConsentError;
      console.log("  Consentimiento de WhatsApp otorgado.");
    }
  }

  console.log(`\nListo: ${PATIENTS.length} pacientes demo verificados/creados.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
