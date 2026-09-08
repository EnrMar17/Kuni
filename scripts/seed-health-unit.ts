/**
 * Crea (o reutiliza) la unidad de salud de demo y, si se pasa un user id de
 * Supabase Auth, lo vincula como miembro de esa unidad en `unit_memberships`.
 *
 * Uso:
 *   npx tsx scripts/seed-health-unit.ts
 *   npx tsx scripts/seed-health-unit.ts <auth_user_id>
 *
 * Requiere NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SECRET_KEY en .env.local
 * (usa la clave secreta porque el insert en unit_memberships está reservado
 * al servidor; nunca correr este script en el navegador).
 */
import { createClient } from "@supabase/supabase-js";

// Node 24 trae process.loadEnvFile de forma nativa; evita depender de dotenv.
try {
  process.loadEnvFile(".env.local");
} catch {
  console.warn("No se encontró .env.local; usando variables ya exportadas.");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!url || !secretKey) {
  console.error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY en .env.local"
  );
  process.exit(1);
}

const admin = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEMO_UNIT_NAME =
  'Centro de Salud "Dr. Juan Manuel González Urueña" (IMSS Bienestar, Morelia)';
const DEMO_UNIT_CODE = "IMSSB-MICH-MORELIA-JMGU";

async function main() {
  const authUserId = process.argv[2];

  let { data: unit, error: findError } = await admin
    .from("health_units")
    .select("id, name, institutional_code")
    .eq("institutional_code", DEMO_UNIT_CODE)
    .maybeSingle();

  if (findError) throw findError;

  if (!unit) {
    const { data: created, error: insertError } = await admin
      .from("health_units")
      .insert({
        name: DEMO_UNIT_NAME,
        institutional_code: DEMO_UNIT_CODE,
        timezone: "America/Mexico_City",
      })
      .select("id, name, institutional_code")
      .single();
    if (insertError) throw insertError;
    unit = created;
    console.log("Unidad de salud creada:", unit);
  } else {
    console.log("Unidad de salud ya existía:", unit);
  }

  if (!authUserId) {
    console.log(
      "\nNo pasaste un auth_user_id, así que no se creó la membresía todavía."
    );
    console.log(
      `Vuelve a correr: npx tsx scripts/seed-health-unit.ts <auth_user_id>  (unit_id=${unit.id})`
    );
    return;
  }

  const { data: membership, error: membershipError } = await admin
    .from("unit_memberships")
    .upsert(
      { unit_id: unit.id, user_id: authUserId, role: "shared_clinician" },
      { onConflict: "user_id" }
    )
    .select()
    .single();

  if (membershipError) throw membershipError;

  console.log("Membresía creada/actualizada:", membership);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
