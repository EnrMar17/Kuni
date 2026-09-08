import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { evaluateRisk, type EvaluableMeasurement, type PatientRiskInput, type PendingTimeout } from '../../src/lib/domain/risk';
import type { RiskResult } from '../../src/contracts/dto';
import type { AdherenceResult } from '../../src/lib/domain/adherence';
import { validateBloodPressureValue, validateGlucoseValue } from '../../src/lib/domain/validation';
import { buildDashboardData, lastExpectedAt, type DashboardRows, type Row } from '../../../src/lib/domain/dashboard';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const actor = id(1), otherActor = id(2), viewer = id(3);
const unit = id(10), otherUnit = id(20), doctor = id(11), otherDoctor = id(21);
const room = id(12), patient = id(13), otherPatient = id(23);
const medication = id(14), prescription = id(15), schedule = id(16), plan = id(17);
const measurement = id(18), interaction = id(30), response = id(31), initialAlert = id(32);
const rpcNames = ['correct_measurement', 'correct_medication_response', 'adjust_prescription', 'mark_urgent', 'resolve_alert'] as const;
type RpcName = typeof rpcNames[number];
type Result = {
  data: {
    measurement?: Row<'measurements'>;
    medicationResponse?: Row<'medication_responses'>;
    prescription?: Row<'prescriptions'>;
    alert?: Row<'alerts'>;
    cancelledInteractionIds?: string[];
    riskAssessmentId: string;
    risk: RiskResult;
    adherence: AdherenceResult;
  };
  error: null;
};
type RiskSnapshot = { evaluatedAt: string; patient: PatientRiskInput; measurements: EvaluableMeasurement[]; timeouts: PendingTimeout[] };
let db: PGlite;
let now: string;

async function owner() {
  await db.exec("reset role; select set_config('request.jwt.claim.sub','',false);");
}
async function login(user: string | null = actor, role: 'authenticated' | 'anon' | 'service_role' = 'authenticated') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user ?? '']);
  await db.exec(`set role ${role}`);
}
async function query<T>(sql: string, args: unknown[] = []): Promise<T> {
  return (await db.query<{ value: T }>(sql, args)).rows[0].value;
}
async function row<T extends 'measurements' | 'medication_responses' | 'prescriptions' | 'alerts' | 'bot_interactions'>(table: T, target: string): Promise<Row<T>> {
  return query<Row<T>>(`select to_jsonb(t) as value from public.${table} t where id = $1`, [target]);
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
async function rpc(name: RpcName, args: unknown[]): Promise<Result> {
  return attempt(() => query<Result>(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) as value`, args));
}
async function argsFor(name: RpcName): Promise<unknown[]> {
  switch (name) {
    case 'correct_measurement': return [patient, measurement, (await row('measurements', measurement)).updated_at,
      { kind: 'glucose', patientId: patient, observedAt: now, glucoseMgDl: 100, context: 'fasting' }, 'Valor cotejado', doctor];
    case 'correct_medication_response': return [patient, response, (await row('medication_responses', response)).updated_at,
      schedule, (await row('bot_interactions', interaction)).scheduled_at, true, 'Toma cotejada', doctor];
    case 'adjust_prescription': return [patient, prescription, 1, (await row('prescriptions', prescription)).updated_at,
      { patientId: patient, medicationId: medication, doseText: 'Nueva dosis de prueba', instructions: 'Indicacion de prueba',
        startsAt: await query<string>("select (now() at time zone 'America/Mexico_City')::date::text as value"), endsAt: null,
        schedules: [{ weekday: 1, localTime: '08:00' }, { weekday: 2, localTime: '08:00' }, { weekday: 1, localTime: '20:00' }],
        prescribedByDoctorId: doctor, previousPrescriptionId: prescription }, 'Ajuste cotejado', doctor];
    case 'mark_urgent': return [patient, id(80), 'Revision urgente local', doctor];
    case 'resolve_alert': return [patient, initialAlert, (await row('alerts', initialAlert)).updated_at, 'resolved', 'Atendido por equipo', doctor];
  }
}

async function assertDatabaseParity(cutoff = now, timezone = 'America/Mexico_City') {
  await owner();
  const snapshot = await query<RiskSnapshot>('select private.clinical_risk_snapshot($1,$2,$3) as value', [unit, patient, cutoff]);
  const sqlRisk = await query<RiskResult>('select private.clinical_evaluate_risk($1) as value', [snapshot]);
  const tables = ['patients', 'patient_diagnoses', 'monitoring_plans', 'measurements', 'bot_interactions', 'medication_responses', 'alerts'] as const;
  const [patients, diagnoses, plans, measurements, interactions, responses, alerts] = await Promise.all(tables.map(table =>
    query(`select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb) as value from public.${table} t`)));
  const rows = { patients, diagnoses, plans, measurements, interactions, responses, alerts,
    appointments: [], prescriptions: [], nonresponse: [], consent: [] } as DashboardRows;
  const expected = buildDashboardData(rows, { unitId: unit, roomId: room, timezone }, new Date(cutoff)).patients[0];
  expect({ ...sqlRisk, evaluatedAt: new Date(sqlRisk.evaluatedAt).toISOString() }).toEqual(expected.risk);
  expect(await query('select private.clinical_adherence($1,$2,$3) as value', [unit, patient, cutoff])).toEqual(expected.adherence);
  return expected;
}

beforeAll(async () => {
  db = new PGlite();
  // Test-only Auth bootstrap. Real migrations are applied below, unmodified.
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
  for (const file of ['0001_kuni.sql', '0002_clinical_derivations.sql', '0003_clinical_commands.sql']) {
    await db.exec(await readFile(new URL(`../../../supabase/migrations/${file}`, import.meta.url), 'utf8'));
  }
}, 30_000);

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
    insert into public.medications(id,unit_id,name) values('${medication}','${unit}','Medicamento de prueba');
    insert into public.prescriptions(id,unit_id,patient_id,medication_id,dose_text,start_date,attributed_doctor_id) values
      ('${prescription}','${unit}','${patient}','${medication}','Dosis original','2020-01-01','${doctor}');
    insert into public.prescription_schedules(id,unit_id,prescription_id,local_time) values('${schedule}','${unit}','${prescription}','08:00');
    update public.prescriptions set status = 'active' where id = '${prescription}';
    insert into public.monitoring_plans(id,unit_id,patient_id,kind,local_time,start_date,measurement_context,
      glucose_min_mg_dl,glucose_max_mg_dl,critical_glucose_max_mg_dl,attributed_doctor_id) values
      ('${plan}','${unit}','${patient}','glucose','00:00','2020-01-01','fasting',70,140,250,'${doctor}');
    insert into public.measurements(id,unit_id,patient_id,monitoring_plan_id,kind,measured_at,glucose_mg_dl,measurement_context,source) values
      ('${measurement}','${unit}','${patient}','${plan}','glucose',now()-interval '1 minute',320,'fasting','whatsapp');
    insert into public.bot_interactions(id,unit_id,patient_id,kind,prescription_id,deduplication_key,scheduled_at,expects_response,
      provider,delivery_status,delivered_at,response_deadline_at,timeout_at,response_at,payload_snapshot) values
      ('${interaction}','${unit}','${patient}','medication','${prescription}','original-dose',
        ((now() at time zone 'America/Mexico_City')::date-1 + time '08:00') at time zone 'America/Mexico_City',true,'demo','delivered',
        now()-interval '20 hours',now()-interval '19 hours',now()-interval '19 hours',now()-interval '18 hours','{"doseText":"Dosis original"}');
    insert into public.medication_responses(id,unit_id,patient_id,interaction_id,taken,reported_at,source) values
      ('${response}','${unit}','${patient}','${interaction}',false,now()-interval '18 hours','whatsapp');
    insert into public.alerts(id,unit_id,patient_id,kind,severity,interaction_id,deduplication_key,title) values
      ('${initialAlert}','${unit}','${patient}','no_response','warning','${interaction}','no_response:${interaction}','Sin respuesta (fixture)');
  `);
  now = await query<string>("select to_jsonb(now()) #>> '{}' as value");
  await login();
});
afterEach(async () => { await db.exec('rollback; reset role;'); });
afterAll(async () => { await db?.close(); });

describe('clinical RPC authorization and atomicity', () => {
  it.each(rpcNames)('%s rejects missing identity, another unit, viewer and another doctor', async (name) => {
    const args = await argsFor(name);
    await login(null);
    await expect(rpc(name, args)).rejects.toMatchObject({ code: 'PT401', message: 'UNAUTHENTICATED' });
    for (const user of [otherActor, viewer]) {
      await login(user);
      await expect(rpc(name, args)).rejects.toMatchObject({ code: 'PT403', message: 'FORBIDDEN' });
    }
    await login();
    const foreignDoctor = [...args]; foreignDoctor[foreignDoctor.length - 1] = otherDoctor;
    await expect(rpc(name, foreignDoctor)).rejects.toMatchObject({ code: 'PT403' });
    const blankReason = [...args]; blankReason[blankReason.length - 2] = ' \n\t ';
    await expect(rpc(name, blankReason)).rejects.toMatchObject({ code: 'PT422' });
    await owner();
    await db.exec(`update public.unit_memberships set active = false where user_id = '${actor}'`);
    await login();
    await expect(rpc(name, args)).rejects.toMatchObject({ code: 'PT403' });
  });

  it('exposes only the five fixed-path definer commands to authenticated', async () => {
    await owner();
    const functions = (await db.query<{ name: string; definer: boolean; config: string[]; anon: boolean; backend: boolean; clinician: boolean }>(`
      select proname as name,prosecdef as definer,proconfig as config,
        has_function_privilege('anon',oid,'execute') as anon,
        has_function_privilege('service_role',oid,'execute') as backend,
        has_function_privilege('authenticated',oid,'execute') as clinician
      from pg_proc where pronamespace = 'public'::regnamespace and proname = any($1::text[])
    `, [rpcNames])).rows;
    expect(functions).toHaveLength(5);
    for (const fn of functions) expect(fn).toMatchObject({ definer: true, config: ['search_path=""'], anon: false, backend: false, clinician: true });
    expect(await query<number>(`select count(*)::int as value from pg_proc
      where pronamespace = 'private'::regnamespace and proname like 'clinical_%'
        and has_function_privilege('authenticated',oid,'execute')`)).toBe(0);
    const args = await argsFor('mark_urgent');
    for (const role of ['anon', 'service_role'] as const) {
      await login(actor, role);
      await expect(rpc('mark_urgent', args)).rejects.toMatchObject({ code: '42501' });
    }
  });

  it('rejects an object from a different patient even within the same unit', async () => {
    await owner();
    await db.exec(`insert into public.patients(id,unit_id,consulting_room_id,full_name,birth_date,sex,record_number,whatsapp_e164)
      values('${id(24)}','${unit}','${room}','Otro paciente ficticio','1980-01-01','unknown','C','+525500000003')`);
    await login();
    for (const name of rpcNames.filter(n => n !== 'mark_urgent')) {
      const args = await argsFor(name); args[0] = id(24);
      await expect(rpc(name, args)).rejects.toMatchObject({ code: 'PT403' });
    }
  });

  it('rolls back clinical data, alerts and audit if recalculation fails', async () => {
    const before = await row('measurements', measurement);
    const alertsBefore = await query<number>('select count(*)::int as value from public.alerts');
    const auditsBefore = await query<number>('select count(*)::int as value from public.audit_log');
    await owner();
    await db.exec(`create function private.fail_test() returns trigger language plpgsql as
      $$ begin raise exception 'test recalculation failure'; end $$;
      create trigger fail_test before insert on public.risk_assessments for each row execute function private.fail_test();`);
    await login();
    await expect(rpc('correct_measurement', await argsFor('correct_measurement'))).rejects.toThrow('test recalculation failure');
    expect(await row('measurements', measurement)).toEqual(before);
    expect(await query<number>('select count(*)::int as value from public.alerts')).toBe(alertsBefore);
    expect(await query<number>('select count(*)::int as value from public.audit_log')).toBe(auditsBefore);
  });

  it('rejects inactive units/doctors and missing Auth users, even with a claimed UUID', async () => {
    const args = await argsFor('mark_urgent');
    await login(id(900));
    await expect(rpc('mark_urgent', args)).rejects.toMatchObject({ code: 'PT403' });
    await owner();
    await db.exec(`update public.health_units set active=false where id='${unit}'`);
    await login();
    await expect(rpc('mark_urgent', args)).rejects.toMatchObject({ code: 'PT403' });
    await owner();
    await db.exec(`update public.health_units set active=true where id='${unit}'; update public.doctors set active=false where id='${doctor}';`);
    await login();
    await expect(rpc('mark_urgent', args)).rejects.toMatchObject({ code: 'PT403' });
  });

  it('keeps optimistic tokens increasing during repeated updates in the same transaction', async () => {
    const original = (await row('measurements', measurement)).updated_at;
    const first = (await rpc('correct_measurement', await argsFor('correct_measurement'))).data.measurement!.updated_at;
    const second = (await rpc('correct_measurement', await argsFor('correct_measurement'))).data.measurement!.updated_at;
    expect(await query<boolean>('select $1::timestamptz < $2::timestamptz and $2::timestamptz < $3::timestamptz as value', [original, first, second])).toBe(true);
  });
});

describe('measurement corrections', () => {
  it('corrects, audits the real actor, preserves evidence, and rejects stale tokens', async () => {
    const before = await row('measurements', measurement);
    const args = await argsFor('correct_measurement');
    const result = await rpc('correct_measurement', args);
    expect(result.error).toBeNull();
    expect(result.data.measurement).toMatchObject({ glucose_mg_dl: 100, source: before.source, created_at: before.created_at,
      monitoring_plan_id: plan, correction_reason: 'Valor cotejado', attributed_doctor_id: doctor });
    expect(result.data.measurement?.updated_at).not.toBe(before.updated_at);
    expect(result.data.risk.level).toBe('low');
    const audit = await query<{ actor_user_id: string; attributed_doctor_id: string; old_data: { glucose_mg_dl: number }; new_data: { glucose_mg_dl: number } }>(`
      select to_jsonb(a) as value from public.audit_log a where entity_id = $1 and action = 'UPDATE' order by id desc limit 1`, [measurement]);
    expect(audit).toMatchObject({ actor_user_id: actor, attributed_doctor_id: doctor,
      old_data: { glucose_mg_dl: 320 }, new_data: { glucose_mg_dl: 100 } });
    await expect(rpc('correct_measurement', args)).rejects.toMatchObject({ code: 'PT409', message: 'CONFLICT' });
  });

  it('deduplicates, resolves, then reopens measurement alerts when corrected evidence changes', async () => {
    const edit = async (value: number) => {
      const args = await argsFor('correct_measurement'); (args[3] as { glucoseMgDl: number }).glucoseMgDl = value;
      return rpc('correct_measurement', args);
    };
    await edit(330); await edit(340);
    const alert = await query<Row<'alerts'>>("select to_jsonb(a) as value from public.alerts a where measurement_id=$1 and kind='measurement_out_of_range'", [measurement]);
    expect(alert.severity).toBe('critical');
    expect(await query<number>("select count(*)::int as value from public.alerts where measurement_id=$1 and kind='measurement_out_of_range'", [measurement])).toBe(1);
    await edit(100);
    expect(await row('alerts', alert.id)).toMatchObject({ status: 'resolved' });
    await edit(180);
    expect(await row('alerts', alert.id)).toMatchObject({ status: 'open', severity: 'warning', resolved_at: null, resolution_note: null });
  });

  it('preserves active alerts for human review when corrected context has no usable plan', async () => {
    const args = await argsFor('correct_measurement'); (args[3] as { glucoseMgDl: number }).glucoseMgDl = 330;
    await rpc('correct_measurement', args);
    const edited = await argsFor('correct_measurement'); (edited[3] as { context: string }).context = 'after_meal';
    const result = await rpc('correct_measurement', edited);
    expect(result.data.risk.level).toBe('unknown');
    expect(await query<Row<'alerts'>>("select to_jsonb(a) as value from public.alerts a where measurement_id=$1 and kind='measurement_out_of_range'", [measurement]))
      .toMatchObject({ status: 'open', detail: { reviewRequired: true } });
  });

  it.each([
    { patientId: otherPatient }, { kind: 'blood_pressure' }, { glucoseMgDl: -1 }, { glucoseMgDl: 'NaN' },
    { context: 'resting' }, { observedAt: '2026-02-30T12:00:00Z' }, { observedAt: '2099-01-01T12:00:00Z' },
    { observedAt: '2026-09-08T12:00:00' }, { source: 'manual' }, { interactionId: id(99) },
  ])('rejects invalid or retargeted input %j', async (change) => {
    const args = await argsFor('correct_measurement'); args[3] = { ...(args[3] as object), ...change };
    await expect(rpc('correct_measurement', args)).rejects.toMatchObject({ code: 'PT422' });
  });

  it('matches existing capture validation, including integer pressure and systolic > diastolic', async () => {
    for (const glucose of [19, 20, 70, 700, 701]) {
      const args = await argsFor('correct_measurement'); (args[3] as { glucoseMgDl: number }).glucoseMgDl = glucose;
      if (validateGlucoseValue(glucose).valid) await expect(rpc('correct_measurement', args)).resolves.toHaveProperty('error', null);
      else await expect(rpc('correct_measurement', args)).rejects.toMatchObject({ code: 'PT422' });
    }
    await owner();
    await db.exec(`insert into public.measurements(id,unit_id,patient_id,kind,measured_at,systolic_mm_hg,diastolic_mm_hg,source)
      values('${id(52)}','${unit}','${patient}','blood_pressure',now(),120,80,'manual')`);
    await login();
    for (const [systolic, diastolic] of [[59, 30], [60, 30], [260, 180], [261, 80], [120, 181], [120, 120], [120.5, 80]]) {
      const args = [patient, id(52), (await row('measurements', id(52))).updated_at,
        { kind: 'blood_pressure', patientId: patient, observedAt: now, systolicMmhg: systolic, diastolicMmhg: diastolic }, 'Presion cotejada', doctor];
      if (validateBloodPressureValue(systolic, diastolic).valid && Number.isInteger(systolic)) {
        await expect(rpc('correct_measurement', args)).resolves.toHaveProperty('error', null);
      } else await expect(rpc('correct_measurement', args)).rejects.toMatchObject({ code: 'PT422' });
    }
  });

  it('preserves linked measurement interaction evidence and rejects voided records', async () => {
    await owner();
    await db.exec(`insert into public.bot_interactions(id,unit_id,patient_id,kind,monitoring_plan_id,deduplication_key,
      scheduled_at,expects_response,provider) values('${id(53)}','${unit}','${patient}','measurement','${plan}','measurement-link',now(),true,'demo');
      update public.measurements set interaction_id='${id(53)}',correction_reason='Test fixture' where id='${measurement}';`);
    await login();
    const original = await row('bot_interactions', id(53));
    await rpc('correct_measurement', await argsFor('correct_measurement'));
    expect(await row('bot_interactions', id(53))).toEqual(original);
    await owner();
    await db.exec(`update public.measurements set voided_at=now(),correction_reason='Test void' where id='${measurement}'`);
    await login();
    await expect(rpc('correct_measurement', await argsFor('correct_measurement'))).rejects.toMatchObject({ code: 'PT409' });
  });
});

describe('medication response corrections', () => {
  it('corrects the exact original dose, updates adherence and preserves delivery/timeout history', async () => {
    const original = await row('bot_interactions', interaction);
    const before = await row('medication_responses', response);
    const args = await argsFor('correct_medication_response');
    const result = await rpc('correct_medication_response', args);
    expect(result.data.medicationResponse).toMatchObject({ taken: true, interaction_id: interaction,
      reported_at: before.reported_at, source: before.source });
    expect(result.data.adherence).toMatchObject({ y: 1, n: 0, u: 0, confirmedAdherencePct: 100, responseCoveragePct: 100 });
    expect(await row('bot_interactions', interaction)).toEqual(original);
    expect(await row('alerts', initialAlert)).toMatchObject({ status: 'resolved', detail: { resolvedByUserId: actor } });
    await expect(rpc('correct_medication_response', args)).rejects.toMatchObject({ code: 'PT409' });
  });

  it('rejects a different occurrence or schedule and can correct a superseded prescription', async () => {
    const args = await argsFor('correct_medication_response');
    const wrongDate = [...args]; wrongDate[4] = now;
    await expect(rpc('correct_medication_response', wrongDate)).rejects.toMatchObject({ code: 'PT409' });
    const wrongSchedule = [...args]; wrongSchedule[3] = id(99);
    await expect(rpc('correct_medication_response', wrongSchedule)).rejects.toMatchObject({ code: 'PT403' });
    await rpc('adjust_prescription', await argsFor('adjust_prescription'));
    expect((await rpc('correct_medication_response', args)).data.medicationResponse?.taken).toBe(true);
  });

  it('refuses a schedule whose local time does not identify the original interaction', async () => {
    await owner();
    await db.exec(`update public.bot_interactions set scheduled_at=scheduled_at+interval '1 hour' where id='${interaction}'`);
    await login();
    await expect(rpc('correct_medication_response', await argsFor('correct_medication_response'))).rejects.toMatchObject({ code: 'PT409' });
  });
});

describe('prescription adjustments', () => {
  it('versions atomically, cancels only untouched future queue entries, preserves all original snapshots', async () => {
    await owner();
    const states = ['queued', 'blocked_window', 'blocked_template', 'sending', 'accepted', 'delivered', 'read', 'unknown', 'failed', 'cancelled'];
    for (const [i, status] of states.entries()) {
      await db.query(`insert into public.bot_interactions(id,unit_id,patient_id,kind,prescription_id,deduplication_key,
        scheduled_at,expects_response,provider,delivery_status,payload_snapshot)
        values($1,$2,$3,'medication',$4,$5,now()+interval '1 day',true,'demo',$6,'{"doseText":"Dosis original"}')`,
      [id(100 + i), unit, patient, prescription, `future:${status}`, status]);
    }
    await db.exec(`
      insert into public.bot_interactions(id,unit_id,patient_id,kind,prescription_id,deduplication_key,scheduled_at,
        expects_response,provider,delivery_status,attempt_count,payload_snapshot) values
        ('${id(120)}','${unit}','${patient}','medication','${prescription}','attempted',now()+interval '1 day',true,'demo','queued',1,'{}'),
        ('${id(121)}','${unit}','${patient}','medication','${prescription}','past-queue',now()-interval '1 day',true,'demo','queued',0,'{}');
    `);
    await login();
    const originals = await query<Record<string, unknown>[]>("select jsonb_agg(to_jsonb(i) order by id) as value from public.bot_interactions i");
    const args = await argsFor('adjust_prescription');
    const result = await rpc('adjust_prescription', args);
    expect(result.data.prescription).toMatchObject({ status: 'active', version: 2, supersedes_id: prescription, dose_text: 'Nueva dosis de prueba' });
    expect(await row('prescriptions', prescription)).toMatchObject({ status: 'superseded', dose_text: 'Dosis original' });
    expect(result.data.cancelledInteractionIds).toEqual([id(100), id(101), id(102)]);
    const cancellations = (await db.query<{ actor_user_id: string; attributed_doctor_id: string; previous: string; next: string }>(`
      select actor_user_id,attributed_doctor_id,old_data->>'delivery_status' as previous,new_data->>'delivery_status' as next
      from public.audit_log where entity_table='bot_interactions'`)).rows;
    expect(cancellations).toHaveLength(3);
    for (const audit of cancellations) expect(audit).toMatchObject({ actor_user_id: actor, attributed_doctor_id: doctor, next: 'cancelled' });
    for (const item of originals) {
      const after = await row('bot_interactions', item.id as string);
      expect(after.payload_snapshot).toEqual(item.payload_snapshot);
      if (!result.data.cancelledInteractionIds!.includes(item.id as string)) expect(after).toEqual(item);
    }
    expect(await query<number>('select count(*)::int as value from public.prescription_schedules where prescription_id=$1', [result.data.prescription!.id])).toBe(2);
    await expect(rpc('adjust_prescription', args)).rejects.toMatchObject({ code: 'PT409' });
  });

  it.each([
    { startsAt: '2099-01-01' }, { endsAt: '2020-01-01' }, { schedules: [] },
    { schedules: [{ weekday: 0, localTime: '08:00' }] }, { schedules: [{ weekday: 1, localTime: '24:00' }] },
    { schedules: [{ weekday: 1, localTime: '08:00' }, { weekday: 1, localTime: '08:00' }] },
  ])('rejects invalid schedules or deferred changes %j', async (change) => {
    const args = await argsFor('adjust_prescription'); args[4] = { ...(args[4] as object), ...change };
    await expect(rpc('adjust_prescription', args)).rejects.toMatchObject({ code: 'PT422' });
    expect((await row('prescriptions', prescription)).status).toBe('active');
  });

  it('rolls back closing the previous prescription when inserting schedules fails', async () => {
    const before = await row('prescriptions', prescription);
    await owner();
    await db.exec(`create function private.fail_schedule_test() returns trigger language plpgsql as
      $$ begin raise exception 'test schedule failure'; end $$;
      create trigger fail_schedule_test before insert on public.prescription_schedules
        for each row execute function private.fail_schedule_test();`);
    await login();
    await expect(rpc('adjust_prescription', await argsFor('adjust_prescription'))).rejects.toThrow('test schedule failure');
    expect(await row('prescriptions', prescription)).toEqual(before);
    expect(await query<number>('select count(*)::int as value from public.prescriptions')).toBe(1);
  });
});

describe('urgent flags and alert attendance', () => {
  it('deduplicates active urgency, stores responsibility and creates no hospital appointment', async () => {
    const first = await rpc('mark_urgent', await argsFor('mark_urgent'));
    const second = await rpc('mark_urgent', [patient, id(81), 'Segunda solicitud', doctor]);
    expect(second.data.alert?.id).toBe(first.data.alert?.id);
    expect(first.data.alert).toMatchObject({ kind: 'urgent_followup', status: 'open', severity: 'critical',
      attributed_doctor_id: doctor, detail: { markedByUserId: actor, responsibleDoctorId: doctor, localActionOnly: true } });
    expect(first.data.risk.level).toBe('high');
    expect(await query<number>("select count(*)::int as value from public.alerts where kind='urgent_followup'")).toBe(1);
    expect(await query<number>('select count(*)::int as value from public.appointments')).toBe(0);
  });

  it('acknowledges then resolves urgency with actor/date/reason; replay cannot resurrect that event', async () => {
    await rpc('correct_measurement', await argsFor('correct_measurement'));
    const urgent = (await rpc('mark_urgent', await argsFor('mark_urgent'))).data.alert!;
    const acknowledged = await rpc('resolve_alert', [patient, urgent.id, urgent.updated_at, 'acknowledged', 'En revision', doctor]);
    expect(acknowledged.data.alert).toMatchObject({ status: 'acknowledged', resolved_at: null });
    expect(acknowledged.data.risk.level).toBe('high');
    const closed = await rpc('resolve_alert', [patient, urgent.id, acknowledged.data.alert!.updated_at, 'resolved', 'Atencion local realizada', doctor]);
    expect(closed.data.alert).toMatchObject({ status: 'resolved', resolution_note: 'Atencion local realizada', detail: { resolvedByUserId: actor } });
    expect(closed.data.alert?.resolved_at).toBeTruthy();
    expect(closed.data.risk.level).toBe('low');
    const replay = await rpc('mark_urgent', await argsFor('mark_urgent'));
    expect(replay.data.alert?.status).toBe('resolved');
    expect(replay.data.risk.level).toBe('low');
  });

  it('records coalesced event IDs so retries after resolution cannot reactivate urgency', async () => {
    const first = (await rpc('mark_urgent', await argsFor('mark_urgent'))).data.alert!;
    const coalesced = (await rpc('mark_urgent', [patient, id(81), 'Otra solicitud del equipo', doctor])).data.alert!;
    expect(coalesced.id).toBe(first.id);
    await rpc('resolve_alert', [patient, first.id, coalesced.updated_at, 'resolved', 'Atendido', doctor]);
    const retried = await rpc('mark_urgent', [patient, id(81), 'Otra solicitud del equipo', doctor]);
    expect(retried.data.alert).toMatchObject({ id: first.id, status: 'resolved' });
  });

  it('dismissing a risk alert does not hide critical evidence or immediately reopen it', async () => {
    const args = await argsFor('correct_measurement'); (args[3] as { glucoseMgDl: number }).glucoseMgDl = 330;
    await rpc('correct_measurement', args);
    const alert = await query<Row<'alerts'>>("select to_jsonb(a) as value from public.alerts a where kind='high_risk'");
    const result = await rpc('resolve_alert', [patient, alert.id, alert.updated_at, 'dismissed', 'Revisado por medico', doctor]);
    expect(result.data.risk.level).toBe('high');
    expect((await row('alerts', alert.id)).status).toBe('dismissed');
    await rpc('correct_medication_response', await argsFor('correct_medication_response'));
    expect((await row('alerts', alert.id)).status).toBe('dismissed');
    await expect(rpc('resolve_alert', [patient, alert.id, alert.updated_at, 'resolved', 'Reintento', doctor])).rejects.toMatchObject({ code: 'PT409' });
  });

  it('returns the final concurrency token after acknowledging a recalculated high-risk alert', async () => {
    const args = await argsFor('correct_measurement'); (args[3] as { glucoseMgDl: number }).glucoseMgDl = 330;
    await rpc('correct_measurement', args);
    const alert = await query<Row<'alerts'>>("select to_jsonb(a) as value from public.alerts a where kind='high_risk'");
    const acknowledged = (await rpc('resolve_alert', [patient, alert.id, alert.updated_at, 'acknowledged', 'En revision', doctor])).data.alert!;
    expect(acknowledged).toEqual(await row('alerts', alert.id));
    const resolved = await rpc('resolve_alert', [patient, alert.id, acknowledged.updated_at, 'resolved', 'Revision completa', doctor]);
    expect(resolved.data.alert?.status).toBe('resolved');
  });

  it.each(['open', 'closed', 'resuelta', null])('rejects unsupported attendance state %s', async (status) => {
    const args = await argsFor('resolve_alert'); args[3] = status;
    await expect(rpc('resolve_alert', args)).rejects.toMatchObject({ code: 'PT422' });
  });
});

describe('SQL / TypeScript parity', () => {
  it('matches all risk fields across thresholds, coverage, urgency, initial levels and timeout boundaries', async () => {
    await owner();
    const cutoff = new Date('2026-09-08T18:00:00Z');
    for (const value of [69, 70, 100, 140, 141, 250, 251]) {
      for (const urgent of [false, true]) {
        for (const initial of ['unknown', 'low', 'medium', 'high'] as const) {
          const input: PatientRiskInput = { patientId: patient, urgentFlagActive: urgent,
            initialAssessment: { level: initial, active: true, evaluatedAt: cutoff.toISOString() },
            monitoringRequirements: [{ variable: 'glucose', context: 'fasting', monitoringPlanId: plan, lastExpectedRequestAt: cutoff.toISOString() }] };
          const measurements: EvaluableMeasurement[] = [{ variable: 'glucose', context: 'fasting', monitoringPlanId: plan,
            value, observedAt: cutoff.toISOString(), thresholds: { targetMin: 70, targetMax: 140, criticalMax: 250 } }];
          const timeouts = [{ occurredAt: '2026-09-01T18:00:00Z' }, { occurredAt: '2026-09-01T17:59:59Z' }, { occurredAt: '2026-09-08T18:00:01Z' }];
          const snapshot = { evaluatedAt: cutoff.toISOString(), patient: input, measurements, timeouts };
          const sql = await query<RiskResult>('select private.clinical_evaluate_risk($1) as value', [snapshot]);
          expect({ ...sql, evaluatedAt: new Date(sql.evaluatedAt).toISOString() }).toEqual(evaluateRisk(input, measurements, [], timeouts, cutoff));
        }
      }
    }
    for (const thresholds of [null, {}, { criticalMax: 300 }, { targetMax: 140 }]) {
      const input: PatientRiskInput = { patientId: patient, urgentFlagActive: false, initialAssessment: null,
        monitoringRequirements: [{ variable: 'glucose', monitoringPlanId: plan, lastExpectedRequestAt: cutoff.toISOString() },
          { variable: 'blood_pressure_diastolic', monitoringPlanId: id(500), lastExpectedRequestAt: cutoff.toISOString() }] };
      const measurements: EvaluableMeasurement[] = [{ variable: 'glucose', monitoringPlanId: plan,
        value: 100, observedAt: cutoff.toISOString(), thresholds }];
      const timeouts = Array.from({ length: 3 }, () => ({ occurredAt: cutoff.toISOString() }));
      const sql = await query<RiskResult>('select private.clinical_evaluate_risk($1) as value', [{ evaluatedAt: cutoff.toISOString(), patient: input, measurements, timeouts }]);
      expect({ ...sql, evaluatedAt: new Date(sql.evaluatedAt).toISOString() }).toEqual(evaluateRisk(input, measurements, [], timeouts, cutoff));
    }
  });

  it('persists reproducible scoped risk inputs and agrees with the existing dashboard adapter', async () => {
    const result = await rpc('correct_measurement', await argsFor('correct_measurement'));
    const snapshot = await query<RiskSnapshot & { actorUserId: string; unitId: string; patientId: string }>('select input_snapshot as value from public.risk_assessments where id=$1', [result.data.riskAssessmentId]);
    expect(snapshot).toMatchObject({ unitId: unit, patientId: patient, actorUserId: actor });
    const expected = evaluateRisk(snapshot.patient, snapshot.measurements, [], snapshot.timeouts, new Date(snapshot.evaluatedAt));
    expect({ ...result.data.risk, evaluatedAt: new Date(result.data.risk.evaluatedAt).toISOString() }).toEqual(expected);
    const tables = ['patients', 'patient_diagnoses', 'monitoring_plans', 'measurements', 'bot_interactions', 'medication_responses', 'alerts'] as const;
    const [patients, diagnoses, plans, measurements, interactions, responses, alerts] = await Promise.all(tables.map(table =>
      query(`select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) as value from public.${table} t`)));
    const rows = { patients, diagnoses, plans, measurements, interactions, responses, alerts,
      appointments: [], prescriptions: [], nonresponse: [], consent: [] } as DashboardRows;
    const dashboard = buildDashboardData(rows, { unitId: unit, roomId: room, timezone: 'America/Mexico_City' }, new Date(snapshot.evaluatedAt));
    expect(dashboard.patients[0].risk).toEqual(expected);
    expect(result.data.adherence).toEqual(dashboard.patients[0].adherence);
  });

  it('uses both pressure components, requires the correct plan, and handles missing targets', async () => {
    await owner();
    await db.exec(`
      insert into public.monitoring_plans(id,unit_id,patient_id,kind,local_time,start_date,measurement_context,
        systolic_max_mm_hg,diastolic_max_mm_hg,attributed_doctor_id)
      values('${id(50)}','${unit}','${patient}','blood_pressure','00:00','2020-01-01','resting',140,90,'${doctor}');
      insert into public.measurements(id,unit_id,patient_id,monitoring_plan_id,kind,measured_at,systolic_mm_hg,diastolic_mm_hg,measurement_context,source)
      values('${id(51)}','${unit}','${patient}','${id(50)}','blood_pressure',now(),120,80,'resting','manual');
    `);
    await login();
    const corrected = await rpc('correct_measurement', await argsFor('correct_measurement'));
    expect(corrected.data.risk).toMatchObject({ level: 'low', inputsUsed: { measurementsConsidered: 3 } });
    await owner();
    await db.exec(`update public.monitoring_plans set diastolic_max_mm_hg=null where id='${id(50)}'`);
    await login();
    expect((await rpc('correct_measurement', await argsFor('correct_measurement'))).data.risk.level).toBe('unknown');
  });

  it.each(['expired', 'future', 'voided', 'missing_plan', 'ambiguous_manual', 'other_plan', 'empty_targets', 'nan_target'])(
    'matches dashboard risk with %s evidence', async (scenario) => {
      await owner();
      if (scenario === 'expired') await db.exec(`update public.measurements set measured_at=now()-interval '90 days 1 second',correction_reason='fixture' where id='${measurement}'`);
      if (scenario === 'future') await db.exec(`update public.measurements set measured_at=now()+interval '1 second',correction_reason='fixture' where id='${measurement}'`);
      if (scenario === 'voided') await db.exec(`update public.measurements set voided_at=now(),correction_reason='fixture' where id='${measurement}'`);
      if (scenario === 'missing_plan') await db.exec(`update public.monitoring_plans set active=false where id='${plan}'`);
      if (scenario === 'empty_targets') await db.exec(`update public.monitoring_plans set glucose_min_mg_dl=null,glucose_max_mg_dl=null,critical_glucose_max_mg_dl=null where id='${plan}'`);
      if (scenario === 'nan_target') await db.exec(`update public.monitoring_plans set glucose_min_mg_dl=null,glucose_max_mg_dl='NaN',critical_glucose_max_mg_dl=null where id='${plan}'`);
      if (scenario === 'ambiguous_manual' || scenario === 'other_plan') {
        await db.exec(`insert into public.monitoring_plans(id,unit_id,patient_id,kind,local_time,start_date,measurement_context,
          glucose_max_mg_dl,attributed_doctor_id) values('${id(55)}','${unit}','${patient}','glucose','00:00','2020-01-01','fasting',140,'${doctor}');
          insert into public.measurements(id,unit_id,patient_id,kind,measured_at,glucose_mg_dl,measurement_context,source,monitoring_plan_id)
          values('${id(56)}','${unit}','${patient}','glucose',now(),100,'fasting','manual',${scenario === 'other_plan' ? `'${id(55)}'` : 'null'});`);
      }
      await assertDatabaseParity();
    },
  );

  it('matches adherence for all delivery states, absent/future replies and exact 30-day boundaries', async () => {
    await owner();
    const states = ['queued', 'sending', 'accepted', 'delivered', 'read', 'failed', 'cancelled', 'blocked_window', 'blocked_template', 'unknown'];
    for (const [i, status] of states.entries()) {
      for (const [j, reply] of ['yes', 'no', 'absent', 'future'].entries()) {
        const key = id(1000 + i * 10 + j);
        await db.query(`insert into public.bot_interactions(id,unit_id,patient_id,kind,prescription_id,deduplication_key,
          scheduled_at,expects_response,provider,delivery_status,delivered_at,response_deadline_at)
          values($1::uuid,$2,$3,'medication',$4,($1::uuid)::text,now()-interval '1 day',true,'demo',$5,now()-interval '1 day',now()-interval '23 hours')`,
        [key, unit, patient, prescription, status]);
        if (reply !== 'absent') await db.query(`insert into public.medication_responses(unit_id,patient_id,interaction_id,taken,reported_at,source)
          values($1,$2,$3,$4,now()+$5::interval,'manual')`, [unit, patient, key, reply === 'yes', reply === 'future' ? '1 day' : '-22 hours']);
      }
    }
    for (const [i, age] of ['-30 days', '-30 days -1 second', '1 second'].entries()) {
      await db.query(`insert into public.bot_interactions(unit_id,patient_id,kind,prescription_id,deduplication_key,scheduled_at,
        expects_response,provider,delivery_status,delivered_at,response_deadline_at)
        values($1,$2,'medication',$3,$4,now()+$5::interval,true,'demo','delivered',now()-interval '1 hour',now())`,
      [unit, patient, prescription, `boundary:${i}`, age]);
    }
    const result = await assertDatabaseParity();
    expect(result.adherence.y).toBeGreaterThan(0);
    expect(result.adherence.n).toBeGreaterThan(0);
    expect(result.adherence.u).toBeGreaterThan(0);
    expect(result.adherence.technicalExclusionsCount).toBeGreaterThan(0);
  });

  it('breaks equal measurement instants by ascending ID, matching the existing query and stable adapter sort', async () => {
    await owner();
    await db.exec(`insert into public.measurements(id,unit_id,patient_id,monitoring_plan_id,kind,measured_at,glucose_mg_dl,measurement_context,source)
      select '${id(9)}',unit_id,patient_id,monitoring_plan_id,kind,measured_at,100,measurement_context,'manual'
      from public.measurements where id='${measurement}'`);
    const result = await assertDatabaseParity();
    expect(result.risk.level).not.toBe('high');
  });

  it.each([
    ['America/Mexico_City', '2026-09-08T18:00:00Z', '08:00'],
    ['Asia/Kathmandu', '2026-09-08T18:00:00Z', '08:00'],
    ['America/New_York', '2026-11-01T08:00:00Z', '01:30'],
    ['America/New_York', '2026-03-08T08:00:00Z', '02:30'],
  ])('matches expected weekly schedules in %s at %s (%s)', async (timezone, cutoff, localTime) => {
    await owner();
    await db.query('update public.health_units set timezone=$1 where id=$2', [timezone, unit]);
    await db.query('update public.monitoring_plans set local_time=$1 where id=$2', [localTime, plan]);
    const planRow = await query<Row<'monitoring_plans'>>('select to_jsonb(p) as value from public.monitoring_plans p where id=$1', [plan]);
    const snapshot = await query<RiskSnapshot>('select private.clinical_risk_snapshot($1,$2,$3) as value', [unit, patient, cutoff]);
    const sqlExpected = snapshot.patient.monitoringRequirements![0].lastExpectedRequestAt;
    expect(new Date(sqlExpected).toISOString()).toBe(lastExpectedAt(planRow, new Date(cutoff), timezone));
  });

  it('matches European DST folds under the documented UTC Node runtime', async () => {
    const originalTimezone = process.env.TZ;
    try {
      process.env.TZ = 'UTC';
      await owner();
      await db.query('update public.health_units set timezone=$1 where id=$2', ['Europe/Berlin', unit]);
      await db.query('update public.monitoring_plans set local_time=$1 where id=$2', ['02:30', plan]);
      const planRow = await query<Row<'monitoring_plans'>>('select to_jsonb(p) as value from public.monitoring_plans p where id=$1', [plan]);
      const cutoff = '2026-10-25T08:00:00Z';
      const snapshot = await query<RiskSnapshot>('select private.clinical_risk_snapshot($1,$2,$3) as value', [unit, patient, cutoff]);
      expect(new Date(snapshot.patient.monitoringRequirements![0].lastExpectedRequestAt).toISOString())
        .toBe(lastExpectedAt(planRow, new Date(cutoff), 'Europe/Berlin'));
    } finally {
      if (originalTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimezone;
    }
  });
});
