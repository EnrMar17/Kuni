/**
 * B6 — verificación real de aislamiento RLS entre dos unidades y una cuenta
 * sin membresía. Entregable verificable declarado en el README que nunca se
 * había ejecutado contra el proyecto real (ver docs/auditoria-integracion.md
 * §1 "B — Persistencia y transporte", fila "RLS real de dos unidades").
 *
 * Qué hace:
 *   1. Con la clave secreta (admin, se salta RLS a propósito), crea/reutiliza
 *      dos unidades de prueba aisladas ("RLS-TEST-UNIT-A"/"B"), un médico,
 *      un consultorio y un paciente en cada una, y tres usuarios Auth:
 *      uno con membresía en A, uno con membresía en B, y uno SIN membresía
 *      en ninguna unidad. Idempotente: reutiliza lo que ya existe, nunca
 *      duplica, y regenera la contraseña de los tres usuarios de prueba en
 *      cada corrida (son cuentas de prueba desechables, no reales).
 *   2. Con la clave publicable (anon) — la misma que usa el navegador — abre
 *      una sesión real por cada usuario (signInWithPassword) y hace lecturas
 *      y una escritura de prueba respetando RLS de verdad, nunca con la
 *      clave secreta.
 *   3. Imprime un reporte PASS/FAIL de cada aserción. Sale con código 1 si
 *      algo falla, para poder usarlo en CI más adelante si se quiere.
 *
 * Uso:
 *   npx tsx scripts/verify-rls-isolation.ts
 *
 * Requiere NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY y
 * SUPABASE_SECRET_KEY en .env.local. No borra nada fuera de las unidades de
 * prueba con prefijo "RLS-TEST-", no toca los pacientes/usuarios demo
 * existentes, no envía WhatsApp ni corre otros jobs.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

try {
  process.loadEnvFile(".env.local");
} catch {
  console.warn("No se encontró .env.local; usando variables ya exportadas.");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!url || !anonKey || !secretKey) {
  console.error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY o SUPABASE_SECRET_KEY en .env.local"
  );
  process.exit(1);
}

const admin = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type Fixture = {
  unitCode: string;
  unitName: string;
  doctorName: string;
  roomName: string;
  patientRecord: string;
  patientName: string;
  email: string;
};

const FIXTURE_A: Fixture = {
  unitCode: "RLS-TEST-UNIT-A",
  unitName: "Unidad de prueba RLS A",
  doctorName: "Dr. Prueba RLS A",
  roomName: "Consultorio de prueba RLS A",
  patientRecord: "RLS-TEST-A-001",
  patientName: "Paciente de prueba RLS A",
  email: "rls-test-a@kuni-demo.mx",
};
const FIXTURE_B: Fixture = {
  unitCode: "RLS-TEST-UNIT-B",
  unitName: "Unidad de prueba RLS B",
  doctorName: "Dr. Prueba RLS B",
  roomName: "Consultorio de prueba RLS B",
  patientRecord: "RLS-TEST-B-001",
  patientName: "Paciente de prueba RLS B",
  email: "rls-test-b@kuni-demo.mx",
};
const NO_MEMBERSHIP_EMAIL = "rls-test-sin-membresia@kuni-demo.mx";

let passed = 0;
let failed = 0;
function assertEqual(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"} — ${label} (esperado=${JSON.stringify(expected)}, real=${JSON.stringify(actual)})`);
  if (ok) passed++;
  else failed++;
}

async function ensureUnitFixture(fixture: Fixture) {
  const { data: existingUnit, error: findError } = await admin
    .from("health_units")
    .select("id")
    .eq("institutional_code", fixture.unitCode)
    .maybeSingle();
  if (findError) throw findError;

  const unit =
    existingUnit ??
    (
      await admin
        .from("health_units")
        .insert({ name: fixture.unitName, institutional_code: fixture.unitCode, timezone: "America/Mexico_City" })
        .select("id")
        .single()
        .throwOnError()
    ).data!;

  const { data: existingDoctor } = await admin
    .from("doctors")
    .select("id")
    .eq("unit_id", unit.id)
    .eq("full_name", fixture.doctorName)
    .maybeSingle();
  const doctor =
    existingDoctor ??
    (await admin.from("doctors").insert({ unit_id: unit.id, full_name: fixture.doctorName }).select("id").single().throwOnError()).data!;

  const { data: existingRoom } = await admin
    .from("consulting_rooms")
    .select("id")
    .eq("unit_id", unit.id)
    .eq("name", fixture.roomName)
    .maybeSingle();
  const room =
    existingRoom ??
    (
      await admin
        .from("consulting_rooms")
        .insert({ unit_id: unit.id, name: fixture.roomName, doctor_id: doctor.id })
        .select("id")
        .single()
        .throwOnError()
    ).data!;

  const { data: existingPatient } = await admin
    .from("patients")
    .select("id")
    .eq("unit_id", unit.id)
    .eq("record_number", fixture.patientRecord)
    .maybeSingle();
  const patient =
    existingPatient ??
    (
      await admin
        .from("patients")
        .insert({
          unit_id: unit.id,
          consulting_room_id: room.id,
          full_name: fixture.patientName,
          birth_date: "1990-01-01",
          sex: "unknown",
          record_number: fixture.patientRecord,
          whatsapp_e164: `+52155${fixture.unitCode === FIXTURE_A.unitCode ? "0000001" : "0000002"}`,
        })
        .select("id")
        .single()
        .throwOnError()
    ).data!;

  return { unitId: unit.id, doctorId: doctor.id, roomId: room.id, patientId: patient.id };
}

async function ensureTestUser(email: string, unitId: string | null): Promise<{ userId: string; password: string }> {
  const password = `Rls-Test-${randomUUID()}!`;
  let userId: string | undefined;
  // No hay getUserByEmail directo en supabase-js; se pagina listUsers().
  for (let page = 1; !userId; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    userId = data.users.find((u) => u.email === email)?.id;
    if (data.users.length < 200) break;
  }
  if (userId) {
    const { error } = await admin.auth.admin.updateUserById(userId, { password });
    if (error) throw error;
  } else {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;
  }
  if (unitId) {
    const { error } = await admin
      .from("unit_memberships")
      .upsert({ unit_id: unitId, user_id: userId, role: "shared_clinician" }, { onConflict: "user_id" });
    if (error) throw error;
  } else {
    // Cuenta deliberadamente sin membresía: si una corrida anterior le dejó una, se retira.
    const { error } = await admin.from("unit_memberships").delete().eq("user_id", userId);
    if (error) throw error;
  }
  return { userId, password };
}

async function sessionFor(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(url!, anonKey!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

async function main() {
  console.log("=== B6 — Preparando datos de prueba (clave secreta, se salta RLS a propósito) ===\n");
  const a = await ensureUnitFixture(FIXTURE_A);
  const b = await ensureUnitFixture(FIXTURE_B);
  const userA = await ensureTestUser(FIXTURE_A.email, a.unitId);
  const userB = await ensureTestUser(FIXTURE_B.email, b.unitId);
  const userNone = await ensureTestUser(NO_MEMBERSHIP_EMAIL, null);
  console.log("Unidad A:", a.unitId, " Unidad B:", b.unitId);
  console.log("Usuario A:", userA.userId, " Usuario B:", userB.userId, " Usuario sin membresía:", userNone.userId);

  console.log("\n=== Abriendo sesiones reales (clave publicable/anon, RLS activo de verdad) ===\n");
  const clientA = await sessionFor(FIXTURE_A.email, userA.password);
  const clientB = await sessionFor(FIXTURE_B.email, userB.password);
  const clientNone = await sessionFor(NO_MEMBERSHIP_EMAIL, userNone.password);

  console.log("\n=== Aserciones ===\n");

  // 1. Cada quien ve su propia unidad y solo la suya.
  const { data: unitsA } = await clientA.from("health_units").select("id").in("id", [a.unitId, b.unitId]);
  assertEqual("A ve solo la unidad A (no B) al pedir ambas por id", (unitsA ?? []).map((r) => r.id).sort(), [a.unitId].sort());

  const { data: unitsB } = await clientB.from("health_units").select("id").in("id", [a.unitId, b.unitId]);
  assertEqual("B ve solo la unidad B (no A) al pedir ambas por id", (unitsB ?? []).map((r) => r.id).sort(), [b.unitId].sort());

  const { data: unitsNone } = await clientNone.from("health_units").select("id").in("id", [a.unitId, b.unitId]);
  assertEqual("Cuenta sin membresía no ve ninguna de las dos unidades", unitsNone ?? [], []);

  // 2. Cada quien ve solo los pacientes de su unidad, incluso pidiendo ambos ids explícitamente.
  const { data: patientsA } = await clientA.from("patients").select("id").in("id", [a.patientId, b.patientId]);
  assertEqual("A ve solo su paciente, no el de B", (patientsA ?? []).map((r) => r.id), [a.patientId]);

  const { data: patientsB } = await clientB.from("patients").select("id").in("id", [a.patientId, b.patientId]);
  assertEqual("B ve solo su paciente, no el de A", (patientsB ?? []).map((r) => r.id), [b.patientId]);

  const { data: patientsNone } = await clientNone.from("patients").select("id").in("id", [a.patientId, b.patientId]);
  assertEqual("Cuenta sin membresía no ve ningún paciente", patientsNone ?? [], []);

  // 3. Escritura cruzada: A intenta modificar un paciente de B. RLS debe bloquearlo (0 filas afectadas, no excepción).
  const { data: crossWrite } = await clientA
    .from("patients")
    .update({ notes: "intento de escritura cruzada — no debería aplicar" })
    .eq("id", b.patientId)
    .select("id");
  assertEqual("A no puede escribir sobre un paciente de B (0 filas afectadas)", crossWrite ?? [], []);
  const { data: patientBUnchanged } = await admin.from("patients").select("notes").eq("id", b.patientId).single();
  assertEqual("El paciente de B queda intacto tras el intento de escritura cruzada de A", patientBUnchanged?.notes ?? null, null);

  // 4. unit_memberships: cada quien ve solo su propia fila (policy memberships_read_self).
  const { data: membershipsA } = await clientA.from("unit_memberships").select("user_id");
  assertEqual("A solo ve su propia membresía", (membershipsA ?? []).map((r) => r.user_id), [userA.userId]);

  const { data: membershipsNone } = await clientNone.from("unit_memberships").select("user_id");
  assertEqual("Cuenta sin membresía no ve ninguna fila de unit_memberships", membershipsNone ?? [], []);

  console.log(`\n=== Resultado: ${passed} pasaron, ${failed} fallaron ===`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
