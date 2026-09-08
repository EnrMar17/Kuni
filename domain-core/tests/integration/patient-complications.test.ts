// Persona B — RF28. Valida `supabase/migrations/0004_patient_complications.sql`
// sobre PostgreSQL real (PGlite) ANTES de aplicarla al proyecto Supabase remoto,
// igual que `clinical-rpcs.test.ts` valida 0001-0003. Migraciones sin modificar.
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const actor = id(1), otherActor = id(2), viewer = id(3);
const unit = id(10), otherUnit = id(20), doctor = id(11), otherDoctor = id(21);
const room = id(12), patient = id(13), otherPatient = id(23);

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
  for (const file of ['0001_kuni.sql', '0002_clinical_derivations.sql', '0003_clinical_commands.sql', '0004_patient_complications.sql']) {
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
    insert into auth.users(id) values('${actor}'),('${otherActor}'),('${viewer}');
    insert into public.health_units(id,name) values('${unit}','Unidad de prueba A'),('${otherUnit}','Unidad de prueba B');
    insert into public.unit_memberships(unit_id,user_id,role) values
      ('${unit}','${actor}','clinician'),('${otherUnit}','${otherActor}','shared_clinician'),('${unit}','${viewer}','viewer');
    insert into public.doctors(id,unit_id,full_name) values('${doctor}','${unit}','Medico A'),('${otherDoctor}','${otherUnit}','Medico B');
    insert into public.consulting_rooms(id,unit_id,name,doctor_id) values
      ('${room}','${unit}','Consultorio A','${doctor}'),('${id(22)}','${otherUnit}','Consultorio B','${otherDoctor}');
    insert into public.patients(id,unit_id,consulting_room_id,full_name,birth_date,sex,record_number,whatsapp_e164) values
      ('${patient}','${unit}','${room}','Paciente ficticio A','1970-01-01','unknown','A','+525500000001'),
      ('${otherPatient}','${otherUnit}','${id(22)}','Paciente ficticio B','1970-01-01','unknown','B','+525500000002');
  `);
});

afterEach(async () => {
  await owner();
  await db.exec('rollback');
});

describe('patient_complications — RLS', () => {
  it('un clínico de la unidad puede insertar y leer sus propias filas', async () => {
    await login(actor);
    await db.exec(`insert into public.patient_complications(unit_id,patient_id,code,diagnosed_on,attributed_doctor_id)
      values ('${unit}','${patient}','E111','2024-01-01','${doctor}')`);
    const rows = await query('select code from public.patient_complications where patient_id = $1', [patient]);
    expect(rows).toEqual([{ code: 'E111' }]);
  });

  it('un viewer puede leer pero no insertar', async () => {
    await login(actor);
    await db.exec(`insert into public.patient_complications(unit_id,patient_id,code,attributed_doctor_id)
      values ('${unit}','${patient}','E111','${doctor}')`);
    await login(viewer);
    const rows = await query('select code from public.patient_complications where patient_id = $1', [patient]);
    expect(rows).toHaveLength(1);
    await expect(attempt(() => db.exec(`insert into public.patient_complications(unit_id,patient_id,code,attributed_doctor_id)
      values ('${unit}','${patient}','E112','${doctor}')`))).rejects.toThrow();
  });

  it('una cuenta de otra unidad no ve las filas de esta unidad', async () => {
    await login(actor);
    await db.exec(`insert into public.patient_complications(unit_id,patient_id,code,attributed_doctor_id)
      values ('${unit}','${patient}','E111','${doctor}')`);
    await login(otherActor);
    const rows = await query('select code from public.patient_complications where unit_id = $1', [unit]);
    expect(rows).toEqual([]);
  });

  it('una cuenta sin membresía (anon) no lee nada', async () => {
    await login(actor);
    await db.exec(`insert into public.patient_complications(unit_id,patient_id,code,attributed_doctor_id)
      values ('${unit}','${patient}','E111','${doctor}')`);
    await login(null, 'anon');
    await expect(attempt(() => query('select code from public.patient_complications where unit_id = $1', [unit]))).rejects.toThrow();
  });
});

describe('patient_complications — constraints y reglas de negocio', () => {
  it('rechaza un código fuera del catálogo E110-E119', async () => {
    await login(actor);
    await expect(attempt(() => db.exec(`insert into public.patient_complications(unit_id,patient_id,code,attributed_doctor_id)
      values ('${unit}','${patient}','E999','${doctor}')`))).rejects.toThrow();
  });

  it('no permite dos filas vigentes con el mismo código para el mismo paciente', async () => {
    await login(actor);
    await db.exec(`insert into public.patient_complications(unit_id,patient_id,code,attributed_doctor_id)
      values ('${unit}','${patient}','E111','${doctor}')`);
    await expect(attempt(() => db.exec(`insert into public.patient_complications(unit_id,patient_id,code,attributed_doctor_id)
      values ('${unit}','${patient}','E111','${doctor}')`))).rejects.toThrow();
  });

  it('E119 (ninguna complicación) no convive con una complicación real vigente', async () => {
    await login(actor);
    await db.exec(`insert into public.patient_complications(unit_id,patient_id,code,attributed_doctor_id)
      values ('${unit}','${patient}','E111','${doctor}')`);
    await expect(attempt(() => db.exec(`insert into public.patient_complications(unit_id,patient_id,code,attributed_doctor_id)
      values ('${unit}','${patient}','E119','${doctor}')`))).rejects.toThrow();
  });

  it('una complicación real no puede registrarse mientras E119 sigue vigente', async () => {
    await login(actor);
    await db.exec(`insert into public.patient_complications(unit_id,patient_id,code,attributed_doctor_id)
      values ('${unit}','${patient}','E119','${doctor}')`);
    await expect(attempt(() => db.exec(`insert into public.patient_complications(unit_id,patient_id,code,attributed_doctor_id)
      values ('${unit}','${patient}','E112','${doctor}')`))).rejects.toThrow();
  });

  it('corregir una fila exige correction_reason', async () => {
    await login(actor);
    const [{ id: rowId }] = await query<{ id: string }>(`insert into public.patient_complications(unit_id,patient_id,code,attributed_doctor_id)
      values ('${unit}','${patient}','E111','${doctor}') returning id`);
    await expect(attempt(() => db.exec(`update public.patient_complications set active = false where id = '${rowId}'`))).rejects.toThrow();
    await db.exec(`update public.patient_complications set active = false, correction_reason = 'Resuelto en consulta' where id = '${rowId}'`);
    const [row] = await query<{ active: boolean }>('select active from public.patient_complications where id = $1', [rowId]);
    expect(row.active).toBe(false);
  });

  it('después de desactivar una fila, se puede reabrir el mismo código en una fila nueva', async () => {
    await login(actor);
    const [{ id: rowId }] = await query<{ id: string }>(`insert into public.patient_complications(unit_id,patient_id,code,attributed_doctor_id)
      values ('${unit}','${patient}','E111','${doctor}') returning id`);
    await db.exec(`update public.patient_complications set active = false, correction_reason = 'Registrado por error' where id = '${rowId}'`);
    await db.exec(`insert into public.patient_complications(unit_id,patient_id,code,attributed_doctor_id)
      values ('${unit}','${patient}','E111','${doctor}')`);
    const rows = await query('select active from public.patient_complications where patient_id = $1 and code = $2 order by created_at', [patient, 'E111']);
    expect(rows).toEqual([{ active: false }, { active: true }]);
  });

  it('id, unit_id, created_at y patient_id son inmutables', async () => {
    await login(actor);
    const [{ id: rowId }] = await query<{ id: string }>(`insert into public.patient_complications(unit_id,patient_id,code,attributed_doctor_id)
      values ('${unit}','${patient}','E111','${doctor}') returning id`);
    await expect(attempt(() => db.exec(`update public.patient_complications set patient_id = '${otherPatient}', correction_reason = 'x' where id = '${rowId}'`))).rejects.toThrow();
  });

  it('registra en audit_log la inserción y la corrección', async () => {
    await login(actor);
    const [{ id: rowId }] = await query<{ id: string }>(`insert into public.patient_complications(unit_id,patient_id,code,attributed_doctor_id)
      values ('${unit}','${patient}','E111','${doctor}') returning id`);
    await db.exec(`update public.patient_complications set active = false, correction_reason = 'Resuelto' where id = '${rowId}'`);
    const rows = await query<{ action: string }>(`select action from public.audit_log where entity_table = 'patient_complications' and entity_id = $1 order by occurred_at`, [rowId]);
    expect(rows.map((r) => r.action)).toEqual(['INSERT', 'UPDATE']);
  });
});
