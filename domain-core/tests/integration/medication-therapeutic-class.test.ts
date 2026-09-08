// Persona B — B4. Valida `supabase/migrations/0005_medication_therapeutic_class.sql`
// sobre PostgreSQL real (PGlite) ANTES de aplicarla al proyecto Supabase remoto,
// igual que `clinical-rpcs.test.ts`/`patient-complications.test.ts` validan las
// suyas. Migraciones anteriores sin modificar.
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const actor = id(1), otherActor = id(2);
const unit = id(10), otherUnit = id(20), doctor = id(11);

let db: PGlite;

async function login(user: string | null = actor, role: 'authenticated' | 'anon' | 'service_role' = 'authenticated') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user ?? '']);
  await db.exec(`set role ${role}`);
}
async function owner() {
  await db.exec("reset role; select set_config('request.jwt.claim.sub','',false);");
}
async function query<T>(sql: string, args: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, args)).rows;
}
async function attempt<T>(run: () => Promise<T>): Promise<T> {
  await db.exec('savepoint rpc_test');
  try {
    const value = await run();
    await db.exec('release savepoint rpc_test');
    return value;
  } catch (error) {
    await db.exec('rollback to savepoint rpc_test; release savepoint rpc_test;');
    throw error;
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated,service_role;
    grant execute on function auth.uid() to anon,authenticated,service_role;
    set timezone = 'UTC';
  `);
  for (const file of [
    '0001_kuni.sql', '0002_clinical_derivations.sql', '0003_clinical_commands.sql',
    '0004_patient_complications.sql', '0005_medication_therapeutic_class.sql',
  ]) {
    await db.exec(await readFile(new URL(`../../../supabase/migrations/${file}`, import.meta.url), 'utf8'));
  }
}, 30_000);

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await owner();
  await db.exec('begin');
  await db.exec(`
    insert into auth.users(id) values('${actor}'),('${otherActor}');
    insert into public.health_units(id,name) values('${unit}','Unidad de prueba A'),('${otherUnit}','Unidad de prueba B');
    insert into public.unit_memberships(unit_id,user_id,role) values
      ('${unit}','${actor}','clinician'),('${otherUnit}','${otherActor}','shared_clinician');
    insert into public.doctors(id,unit_id,full_name) values('${doctor}','${unit}','Medico A');
  `);
});

afterEach(async () => {
  await owner();
  await db.exec('rollback');
});

describe('medications.therapeutic_class', () => {
  it('un medicamento existente (columna previa a la migración) queda sin clasificar, no en "other"', async () => {
    await login(actor);
    const [{ id: medId }] = await query<{ id: string }>(`insert into public.medications(unit_id,name,attributed_doctor_id)
      values ('${unit}','Metformina','${doctor}') returning id`);
    const [row] = await query<{ therapeutic_class: string | null }>(
      'select therapeutic_class from public.medications where id = $1', [medId]);
    expect(row.therapeutic_class).toBeNull();
  });

  it('acepta antidiabetic, antihypertensive y other', async () => {
    await login(actor);
    for (const cls of ['antidiabetic', 'antihypertensive', 'other']) {
      await db.exec(`insert into public.medications(unit_id,name,attributed_doctor_id,therapeutic_class)
        values ('${unit}','Med ${cls}','${doctor}','${cls}')`);
    }
    const rows = await query<{ therapeutic_class: string }>(
      'select therapeutic_class from public.medications where unit_id = $1 order by therapeutic_class', [unit]);
    expect(rows.map((r) => r.therapeutic_class)).toEqual(['antidiabetic', 'antihypertensive', 'other']);
  });

  it('rechaza un valor fuera del catálogo', async () => {
    await login(actor);
    await expect(attempt(() => db.exec(`insert into public.medications(unit_id,name,attributed_doctor_id,therapeutic_class)
      values ('${unit}','Med invalido','${doctor}','diuretic')`))).rejects.toThrow();
  });

  it('se puede clasificar un medicamento existente vía UPDATE (RLS de escritura ya cubría la tabla)', async () => {
    await login(actor);
    const [{ id: medId }] = await query<{ id: string }>(`insert into public.medications(unit_id,name,attributed_doctor_id)
      values ('${unit}','Losartán','${doctor}') returning id`);
    await db.exec(`update public.medications set therapeutic_class = 'antihypertensive' where id = '${medId}'`);
    const [row] = await query<{ therapeutic_class: string }>(
      'select therapeutic_class from public.medications where id = $1', [medId]);
    expect(row.therapeutic_class).toBe('antihypertensive');
  });

  it('una cuenta de otra unidad no puede clasificar el medicamento (RLS ya existente)', async () => {
    await login(actor);
    const [{ id: medId }] = await query<{ id: string }>(`insert into public.medications(unit_id,name,attributed_doctor_id)
      values ('${unit}','Losartán','${doctor}') returning id`);
    await login(otherActor);
    await db.exec(`update public.medications set therapeutic_class = 'antihypertensive' where id = '${medId}'`);
    await login(actor);
    const [row] = await query<{ therapeutic_class: string | null }>(
      'select therapeutic_class from public.medications where id = $1', [medId]);
    expect(row.therapeutic_class).toBeNull();
  });
});
