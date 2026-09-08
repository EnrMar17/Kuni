import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { evaluateRisk, type EvaluableMeasurement, type PatientRiskInput, type PendingTimeout } from '../../src/lib/domain/risk';
import { validateBloodPressureValue, validateGlucoseValue } from '../../src/lib/domain/validation';
import type { RiskResult } from '../../src/contracts/dto';
import type { AdherenceResult } from '../../src/lib/domain/adherence';
import { buildDashboardData, lastExpectedAt, type DashboardRows, type Row } from '../../../src/lib/domain/dashboard';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const actor = id(1), otherActor = id(2), viewer = id(3);
const unit = id(10), otherUnit = id(20), doctor = id(11), otherDoctor = id(21), room = id(12);
const patient = id(13), otherPatient = id(23), medication = id(14), prescription = id(15), schedule = id(16), plan = id(17);
const measurement = id(18), interaction = id(30), response = id(31), initialAlert = id(32);
const rpcNames = ['correct_measurement', 'correct_medication_response', 'adjust_prescription', 'mark_urgent', 'resolve_alert'] as const;
type RpcName = typeof rpcNames[number];
type Result = { error: null; data: {
  measurement?: Row<'measurements'>; medicationResponse?: Row<'medication_responses'>;
  prescription?: Row<'prescriptions'>; alert?: Row<'alerts'>; cancelledInteractionIds?: string[];
  riskAssessmentId: string; risk: RiskResult; adherence: AdherenceResult;
} };
type Snapshot = { evaluatedAt: string; patient: PatientRiskInput; measurements: EvaluableMeasurement[]; timeouts: PendingTimeout[] };
let db: PGlite;
let now: string;

async function query<T>(sql: string, args: unknown[] = []): Promise<T> {
  return (await db.query<{ value: T }>(sql, args)).rows[0].value;
}
async function owner() { await db.exec("reset role; select set_config('request.jwt.claim.sub','',false);"); }
async function login(user: string | null = actor, role: 'authenticated' | 'anon' | 'service_role' = 'authenticated') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user ?? '']);
  await db.exec(`set role ${role}`);
}
async function row<T extends 'measurements' | 'medication_responses' | 'prescriptions' | 'alerts' | 'bot_interactions'>(table: T, target: string): Promise<Row<T>> {
  return query<Row<T>>(`select to_jsonb(t) as value from public.${table} t where id=$1`, [target]);
}
async function attempt<T>(operation: () => Promise<T>): Promise<T> {
  await db.exec('savepoint command_test');
  try {
    const result = await operation(); await db.exec('release savepoint command_test'); return result;
  } catch (error) {
    await db.exec('rollback to savepoint command_test; release savepoint command_test;'); throw error;
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
      { patientId: patient, medicationId: medication, doseText: 'Nueva dosis', instructions: 'Indicacion de prueba',
        startsAt: await query<string>("select (now() at time zone 'America/Mexico_City')::date::text as value"), endsAt: null,
        schedules: [{ weekday: 1, localTime: '08:00' }, { weekday: 2, localTime: '08:00' }, { weekday: 1, localTime: '20:00' }],
        prescribedByDoctorId: doctor, previousPrescriptionId: prescription }, 'Ajuste cotejado', doctor];
    case 'mark_urgent': return [patient, id(80), 'Revision urgente local', doctor];
    case 'resolve_alert': return [patient, initialAlert, (await row('alerts', initialAlert)).updated_at, 'resolved', 'Atendido por equipo', doctor];
  }
}
async function assertParity(cutoff = now, timezone = 'America/Mexico_City') {
  await owner();
  const snapshot = await query<Snapshot>('select private.clinical_risk_snapshot($1,$2,$3) as value', [unit, patient, cutoff]);
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
  // Test-only substitute for Supabase Auth. Migrations below are applied intact.
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated,service_role;
    grant execute on function auth.uid() to anon,authenticated,service_role;
    set timezone='UTC';`);
  for (const file of ['0001_kuni.sql', '0002_clinical_derivations.sql', '0003_clinical_commands.sql']) {
    await db.exec(await readFile(new URL(`../../../supabase/migrations/${file}`, import.meta.url), 'utf8'));
  }
}, 30_000);
beforeEach(async () => {
  await owner(); await db.exec('begin');
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
    insert into public.prescriptions(id,unit_id,patient_id,medication_id,dose_text,start_date,attributed_doctor_id)
      values('${prescription}','${unit}','${patient}','${medication}','Dosis original','2020-01-01','${doctor}');
    insert into public.prescription_schedules(id,unit_id,prescription_id,local_time) values('${schedule}','${unit}','${prescription}','08:00');
    update public.prescriptions set status='active' where id='${prescription}';
    insert into public.monitoring_plans(id,unit_id,patient_id,kind,local_time,start_date,measurement_context,
      glucose_min_mg_dl,glucose_max_mg_dl,critical_glucose_max_mg_dl,attributed_doctor_id)
      values('${plan}','${unit}','${patient}','glucose','00:00','2020-01-01','fasting',70,140,250,'${doctor}');
    insert into public.measurements(id,unit_id,patient_id,monitoring_plan_id,kind,measured_at,glucose_mg_dl,measurement_context,source)
      values('${measurement}','${unit}','${patient}','${plan}','glucose',now(),320,'fasting','whatsapp');
    insert into public.bot_interactions(id,unit_id,patient_id,kind,prescription_id,deduplication_key,scheduled_at,expects_response,
      provider,delivery_status,delivered_at,response_deadline_at,timeout_at,response_at,payload_snapshot)
      values('${interaction}','${unit}','${patient}','medication','${prescription}','original-dose',
        ((now() at time zone 'America/Mexico_City')::date-1 + time '08:00') at time zone 'America/Mexico_City',true,'demo','delivered',
        now()-interval '3 hours',now()-interval '2 hours',now()-interval '2 hours',now()-interval '1 hour','{"doseText":"Dosis original"}');
    insert into public.medication_responses(id,unit_id,patient_id,interaction_id,taken,reported_at,source)
      values('${response}','${unit}','${patient}','${interaction}',false,now()-interval '1 hour','whatsapp');
    insert into public.alerts(id,unit_id,patient_id,kind,severity,interaction_id,deduplication_key,title)
      values('${initialAlert}','${unit}','${patient}','no_response','warning','${interaction}','no_response:${interaction}','Sin respuesta');
  `);
  now = await query<string>("select to_jsonb(now()) #>> '{}' as value");
  await login();
});
afterEach(async () => { await db.exec('rollback; reset role;'); });
afterAll(async () => { await db?.close(); });

describe('clinical RPC authorization', () => {
  it.each(rpcNames)('%s rejects unauthenticated, foreign-unit, viewer and inactive-member calls', async name => {
    const args = await argsFor(name);
    await login(null); await expect(rpc(name, args)).rejects.toMatchObject({ code: 'PT401', message: 'UNAUTHENTICATED' });
    for (const user of [otherActor, viewer, id(900)]) {
      await login(user); await expect(rpc(name, args)).rejects.toMatchObject({ code: 'PT403', message: 'FORBIDDEN' });
    }
    await login();
    const wrongDoctor = [...args]; wrongDoctor[wrongDoctor.length - 1] = otherDoctor;
    await expect(rpc(name, wrongDoctor)).rejects.toMatchObject({ code: 'PT403' });
    const noReason = [...args]; noReason[noReason.length - 2] = ' \n\t ';
    await expect(rpc(name, noReason)).rejects.toMatchObject({ code: 'PT422' });
    await owner(); await db.exec(`update public.unit_memberships set active=false where user_id='${actor}'`);
    await login(); await expect(rpc(name, args)).rejects.toMatchObject({ code: 'PT403' });
  });
  it('enforces definer/fixed-path grants and keeps helpers private, even from service_role', async () => {
    await owner();
    const definitions = (await db.query<{ definer: boolean; config: string[]; anon: boolean; backend: boolean; clinician: boolean }>(`
      select prosecdef as definer,proconfig as config,has_function_privilege('anon',oid,'execute') as anon,
        has_function_privilege('service_role',oid,'execute') as backend,has_function_privilege('authenticated',oid,'execute') as clinician
      from pg_proc where pronamespace='public'::regnamespace and proname=any($1::text[])`, [rpcNames])).rows;
    expect(definitions).toHaveLength(5);
    for (const definition of definitions) expect(definition).toEqual({ definer: true, config: ['search_path=""'], anon: false, backend: false, clinician: true });
    expect(await query<number>(`select count(*)::int as value from pg_proc where pronamespace='private'::regnamespace
      and proname like 'clinical_%' and has_function_privilege('authenticated',oid,'execute')`)).toBe(0);
    const args = await argsFor('mark_urgent');
    for (const role of ['anon', 'service_role'] as const) {
      await login(actor, role); await expect(rpc('mark_urgent', args)).rejects.toMatchObject({ code: '42501' });
    }
  });
  it('rejects objects of another patient in the same unit', async () => {
    await owner();
    await db.exec(`insert into public.patients(id,unit_id,consulting_room_id,full_name,birth_date,sex,record_number,whatsapp_e164)
      values('${id(24)}','${unit}','${room}','Otro paciente ficticio','1980-01-01','unknown','C','+525500000003')`);
    await login();
    for (const name of rpcNames.filter(n => n !== 'mark_urgent')) {
      const args = await argsFor(name); args[0] = id(24);
      await expect(rpc(name, args)).rejects.toMatchObject({ code: 'PT403' });
    }
  });
  it.each(['health_units', 'doctors'] as const)('requires active %s', async table => {
    const args = await argsFor('mark_urgent');
    await owner(); await db.query(`update public.${table} set active=false where id=$1`, [table === 'doctors' ? doctor : unit]);
    await login(); await expect(rpc('mark_urgent', args)).rejects.toMatchObject({ code: 'PT403' });
  });
});

describe('measurement corrections', () => {
  it('audits real identity and monotonic conflicts while preserving original reception/source', async () => {
    const before = await row('measurements', measurement); const args = await argsFor('correct_measurement');
    const result = await rpc('correct_measurement', args);
    expect(result.data.measurement).toMatchObject({ glucose_mg_dl: 100, source: before.source, created_at: before.created_at,
      monitoring_plan_id: plan, correction_reason: 'Valor cotejado', attributed_doctor_id: doctor });
    expect(result.data.risk.level).toBe('low');
    expect(await query(`select to_jsonb(a) as value from public.audit_log a where entity_id=$1 and action='UPDATE' order by id desc limit 1`, [measurement]))
      .toMatchObject({ actor_user_id: actor, attributed_doctor_id: doctor, old_data: { glucose_mg_dl: 320 }, new_data: { glucose_mg_dl: 100 } });
    await expect(rpc('correct_measurement', args)).rejects.toMatchObject({ code: 'PT409', message: 'CONFLICT' });
    const second = (await rpc('correct_measurement', await argsFor('correct_measurement'))).data.measurement!;
    expect(await query<boolean>('select $1::timestamptz<$2::timestamptz and $2::timestamptz<$3::timestamptz as value',
      [before.updated_at, result.data.measurement!.updated_at, second.updated_at])).toBe(true);
    const snapshot = await query<Snapshot>('select input_snapshot as value from public.risk_assessments where id=$1', [result.data.riskAssessmentId]);
    expect({ ...result.data.risk, evaluatedAt: new Date(result.data.risk.evaluatedAt).toISOString() })
      .toEqual(evaluateRisk(snapshot.patient, snapshot.measurements, [], snapshot.timeouts, new Date(snapshot.evaluatedAt)));
  });
  it('deduplicates, closes and reopens equivalent measurement alerts after changes', async () => {
    const edit = async (value: number) => { const args = await argsFor('correct_measurement'); (args[3] as { glucoseMgDl: number }).glucoseMgDl = value; return rpc('correct_measurement', args); };
    await edit(330); await edit(340);
    const alert = await query<Row<'alerts'>>("select to_jsonb(a) as value from public.alerts a where measurement_id=$1 and kind='measurement_out_of_range'", [measurement]);
    expect(alert.severity).toBe('critical');
    expect(await query<number>("select count(*)::int as value from public.alerts where measurement_id=$1 and kind='measurement_out_of_range'", [measurement])).toBe(1);
    await edit(100); expect((await row('alerts', alert.id)).status).toBe('resolved');
    await edit(180); expect(await row('alerts', alert.id)).toMatchObject({ status: 'open', severity: 'warning', resolved_at: null });
  });
  it('keeps an active alert for review when corrected context has no evaluable plan', async () => {
    const args = await argsFor('correct_measurement'); (args[3] as { glucoseMgDl: number }).glucoseMgDl = 330;
    await rpc('correct_measurement', args);
    const next = await argsFor('correct_measurement'); (next[3] as { context: string }).context = 'after_meal';
    expect((await rpc('correct_measurement', next)).data.risk.level).toBe('unknown');
    expect(await query("select to_jsonb(a) as value from public.alerts a where measurement_id=$1 and kind='measurement_out_of_range'", [measurement]))
      .toMatchObject({ status: 'open', detail: { reviewRequired: true } });
  });
  it.each([{ patientId: otherPatient }, { kind: 'blood_pressure' }, { glucoseMgDl: -1 }, { glucoseMgDl: 'NaN' }, { glucoseMgDl: null },
    { context: 'resting' }, { observedAt: '2026-02-30T12:00:00Z' }, { observedAt: '2099-01-01T12:00:00Z' },
    { observedAt: '2026-09-08T24:00:00Z' }, { observedAt: '2026-09-08T12:00:00' }, { source: 'manual' }, { interactionId: id(99) }])(
    'rejects invalid or retargeted data %j', async change => {
      const args = await argsFor('correct_measurement'); args[3] = { ...(args[3] as object), ...change };
      await expect(rpc('correct_measurement', args)).rejects.toMatchObject({ code: 'PT422' });
    });
  it('matches existing capture plausibility and stores pressure integers only', async () => {
    for (const value of [19, 20, 700, 701]) {
      const args = await argsFor('correct_measurement'); (args[3] as { glucoseMgDl: number }).glucoseMgDl = value;
      if (validateGlucoseValue(value).valid) await expect(rpc('correct_measurement', args)).resolves.toHaveProperty('error', null);
      else await expect(rpc('correct_measurement', args)).rejects.toMatchObject({ code: 'PT422' });
    }
    await owner(); await db.exec(`insert into public.measurements(id,unit_id,patient_id,kind,measured_at,systolic_mm_hg,diastolic_mm_hg,source)
      values('${id(52)}','${unit}','${patient}','blood_pressure',now(),120,80,'manual')`); await login();
    for (const [systolic, diastolic] of [[59, 30], [60, 30], [260, 180], [261, 80], [120, 181], [120, 120], [120.5, 80]]) {
      const args = [patient, id(52), (await row('measurements', id(52))).updated_at,
        { kind: 'blood_pressure', patientId: patient, observedAt: now, systolicMmhg: systolic, diastolicMmhg: diastolic }, 'Presion cotejada', doctor];
      if (validateBloodPressureValue(systolic, diastolic).valid && Number.isInteger(systolic)) await expect(rpc('correct_measurement', args)).resolves.toHaveProperty('error', null);
      else await expect(rpc('correct_measurement', args)).rejects.toMatchObject({ code: 'PT422' });
    }
  });
  it('preserves linked interaction evidence and rejects voided measurements', async () => {
    await owner(); await db.exec(`insert into public.bot_interactions(id,unit_id,patient_id,kind,monitoring_plan_id,deduplication_key,scheduled_at,expects_response,provider)
      values('${id(53)}','${unit}','${patient}','measurement','${plan}','measurement-link',now(),true,'demo');
      update public.measurements set interaction_id='${id(53)}',correction_reason='Fixture' where id='${measurement}';`);
    await login(); const original = await row('bot_interactions', id(53));
    await rpc('correct_measurement', await argsFor('correct_measurement'));
    expect(await row('bot_interactions', id(53))).toEqual(original);
    await owner(); await db.exec(`update public.measurements set voided_at=now(),correction_reason='Fixture void' where id='${measurement}'`);
    await login(); await expect(rpc('correct_measurement', await argsFor('correct_measurement'))).rejects.toMatchObject({ code: 'PT409' });
  });
});

describe('medication and prescription commands', () => {
  it('corrects the exact original dose and preserves historical delivery/timeout evidence', async () => {
    const original = await row('bot_interactions', interaction); const before = await row('medication_responses', response);
    const args = await argsFor('correct_medication_response'); const result = await rpc('correct_medication_response', args);
    expect(result.data.medicationResponse).toMatchObject({ taken: true, interaction_id: interaction, reported_at: before.reported_at, source: before.source });
    expect(result.data.adherence).toMatchObject({ y: 1, n: 0, u: 0, confirmedAdherencePct: 100, responseCoveragePct: 100 });
    expect(await row('bot_interactions', interaction)).toEqual(original);
    expect(await row('alerts', initialAlert)).toMatchObject({ status: 'resolved', detail: { resolvedByUserId: actor } });
    await expect(rpc('correct_medication_response', args)).rejects.toMatchObject({ code: 'PT409' });
  });
  it('rejects wrong occurrence/schedule and allows corrections on superseded prescriptions', async () => {
    const args = await argsFor('correct_medication_response'); const wrongDate = [...args]; wrongDate[4] = now;
    await expect(rpc('correct_medication_response', wrongDate)).rejects.toMatchObject({ code: 'PT409' });
    const wrongSchedule = [...args]; wrongSchedule[3] = id(99);
    await expect(rpc('correct_medication_response', wrongSchedule)).rejects.toMatchObject({ code: 'PT403' });
    await rpc('adjust_prescription', await argsFor('adjust_prescription'));
    expect((await rpc('correct_medication_response', args)).data.medicationResponse?.taken).toBe(true);
  });
  it('rejects an occurrence incompatible with the original local schedule', async () => {
    await owner(); await db.exec(`update public.bot_interactions set scheduled_at=scheduled_at+interval '1 hour' where id='${interaction}'`);
    await login(); await expect(rpc('correct_medication_response', await argsFor('correct_medication_response'))).rejects.toMatchObject({ code: 'PT409' });
  });
  it('versions and audits only untouched future cancellations, preserving all payloads and sent rows', async () => {
    await owner();
    const states = ['queued', 'blocked_window', 'blocked_template', 'sending', 'accepted', 'delivered', 'read', 'unknown', 'failed', 'cancelled'];
    for (const [i, status] of states.entries()) await db.query(`insert into public.bot_interactions(id,unit_id,patient_id,kind,prescription_id,
      deduplication_key,scheduled_at,expects_response,provider,delivery_status,payload_snapshot)
      values($1,$2,$3,'medication',$4,$5,now()+interval '1 day',true,'demo',$6,'{"doseText":"Dosis original"}')`,
    [id(100 + i), unit, patient, prescription, `future:${status}`, status]);
    await db.exec(`insert into public.bot_interactions(id,unit_id,patient_id,kind,prescription_id,deduplication_key,scheduled_at,expects_response,provider,attempt_count)
      values('${id(120)}','${unit}','${patient}','medication','${prescription}','attempted',now()+interval '1 day',true,'demo',1),
      ('${id(121)}','${unit}','${patient}','medication','${prescription}','past-queue',now()-interval '1 day',true,'demo',0);`);
    await login();
    const originals = await query<Row<'bot_interactions'>[]>('select jsonb_agg(to_jsonb(i) order by id) as value from public.bot_interactions i');
    const args = await argsFor('adjust_prescription'); const result = await rpc('adjust_prescription', args);
    expect(result.data.prescription).toMatchObject({ status: 'active', version: 2, supersedes_id: prescription, dose_text: 'Nueva dosis' });
    expect(await row('prescriptions', prescription)).toMatchObject({ status: 'superseded', dose_text: 'Dosis original' });
    expect(result.data.cancelledInteractionIds).toEqual([id(100), id(101), id(102)]);
    for (const original of originals) {
      const after = await row('bot_interactions', original.id);
      expect(after.payload_snapshot).toEqual(original.payload_snapshot);
      if (!result.data.cancelledInteractionIds!.includes(original.id)) expect(after).toEqual(original);
    }
    const audits = (await db.query<{ actor_user_id: string; attributed_doctor_id: string; next: string }>(`
      select actor_user_id,attributed_doctor_id,new_data->>'delivery_status' as next from public.audit_log where entity_table='bot_interactions'`)).rows;
    expect(audits).toHaveLength(3);
    for (const audit of audits) expect(audit).toEqual({ actor_user_id: actor, attributed_doctor_id: doctor, next: 'cancelled' });
    expect(await query<number>('select count(*)::int as value from public.prescription_schedules where prescription_id=$1', [result.data.prescription!.id])).toBe(2);
    await expect(rpc('adjust_prescription', args)).rejects.toMatchObject({ code: 'PT409' });
  });
  it.each([{ startsAt: '2099-01-01' }, { endsAt: '2020-01-01' }, { schedules: [] }, { schedules: [{ weekday: 0, localTime: '08:00' }] },
    { schedules: [{ weekday: 1, localTime: '24:00' }] }, { schedules: [{ weekday: 1, localTime: '08:00' }, { weekday: 1, localTime: '08:00' }] }])(
    'rejects deferred/invalid prescription %j', async change => {
      const args = await argsFor('adjust_prescription'); args[4] = { ...(args[4] as object), ...change };
      await expect(rpc('adjust_prescription', args)).rejects.toMatchObject({ code: 'PT422' });
      expect((await row('prescriptions', prescription)).status).toBe('active');
    });
});

describe('urgency, resolution and rollback', () => {
  it('deduplicates urgency with a real responsible actor and never creates hospital appointments', async () => {
    const first = await rpc('mark_urgent', await argsFor('mark_urgent'));
    const second = await rpc('mark_urgent', [patient, id(81), 'Segunda solicitud', doctor]);
    expect(second.data.alert?.id).toBe(first.data.alert?.id);
    expect(first.data.alert).toMatchObject({ kind: 'urgent_followup', status: 'open', severity: 'critical',
      detail: { markedByUserId: actor, responsibleDoctorId: doctor, localActionOnly: true } });
    expect(first.data.risk.level).toBe('high');
    expect(await query<number>("select count(*)::int as value from public.alerts where kind='urgent_followup'")).toBe(1);
    expect(await query<number>('select count(*)::int as value from public.appointments')).toBe(0);
  });
  it('acknowledges and resolves urgency; replay of original or coalesced event never resurrects it', async () => {
    await rpc('correct_measurement', await argsFor('correct_measurement'));
    const urgent = (await rpc('mark_urgent', await argsFor('mark_urgent'))).data.alert!;
    const coalesced = (await rpc('mark_urgent', [patient, id(81), 'Segunda solicitud', doctor])).data.alert!;
    const acknowledged = await rpc('resolve_alert', [patient, urgent.id, coalesced.updated_at, 'acknowledged', 'En revision', doctor]);
    expect(acknowledged.data.alert).toMatchObject({ status: 'acknowledged', resolved_at: null });
    expect(acknowledged.data.risk.level).toBe('high');
    const resolved = await rpc('resolve_alert', [patient, urgent.id, acknowledged.data.alert!.updated_at, 'resolved', 'Atencion local realizada', doctor]);
    expect(resolved.data.alert).toMatchObject({ status: 'resolved', resolution_note: 'Atencion local realizada', detail: { resolvedByUserId: actor } });
    expect(resolved.data.alert?.resolved_at).toBeTruthy(); expect(resolved.data.risk.level).toBe('low');
    for (const event of [id(80), id(81)]) expect((await rpc('mark_urgent', [patient, event, 'Reintento', doctor])).data.alert?.status).toBe('resolved');
  });
  it('returns the final token and preserves dismissed risk alerts without erasing critical evidence', async () => {
    const args = await argsFor('correct_measurement'); (args[3] as { glucoseMgDl: number }).glucoseMgDl = 330;
    await rpc('correct_measurement', args);
    const alert = await query<Row<'alerts'>>("select to_jsonb(a) as value from public.alerts a where kind='high_risk'");
    const acknowledged = (await rpc('resolve_alert', [patient, alert.id, alert.updated_at, 'acknowledged', 'En revision', doctor])).data.alert!;
    expect(acknowledged).toEqual(await row('alerts', alert.id));
    const dismissed = await rpc('resolve_alert', [patient, alert.id, acknowledged.updated_at, 'dismissed', 'Revisado por medico', doctor]);
    expect(dismissed.data.risk.level).toBe('high'); expect(dismissed.data.alert?.status).toBe('dismissed');
    await rpc('correct_medication_response', await argsFor('correct_medication_response'));
    expect((await row('alerts', alert.id)).status).toBe('dismissed');
    await expect(rpc('resolve_alert', [patient, alert.id, acknowledged.updated_at, 'resolved', 'Reintento', doctor])).rejects.toMatchObject({ code: 'PT409' });
  });
  it('reuses an active risk alert whose rule is recorded only in its linked assessment', async () => {
    await owner(); await db.exec(`insert into public.risk_assessments(id,unit_id,patient_id,level,rule_version,input_snapshot,reasons)
      values('${id(90)}','${unit}','${patient}','high','risk-rules-v2-hackathon-2026-09','{}','[]');
      insert into public.alerts(id,unit_id,patient_id,kind,severity,risk_assessment_id,deduplication_key,title)
      values('${id(91)}','${unit}','${patient}','high_risk','critical','${id(90)}','legacy-risk','Prioridad alta');`);
    await login(); await rpc('correct_medication_response', await argsFor('correct_medication_response'));
    expect(await query<number>("select count(*)::int as value from public.alerts where kind='high_risk'")).toBe(1);
    const legacy = await row('alerts', id(91));
    expect(legacy.status).toBe('open');
    await rpc('resolve_alert', [patient, legacy.id, legacy.updated_at, 'resolved', 'Evaluacion revisada', doctor]);
    await rpc('correct_medication_response', await argsFor('correct_medication_response'));
    expect(await query<number>("select count(*)::int as value from public.alerts where kind='high_risk'")).toBe(1);
    expect((await row('alerts', id(91))).status).toBe('resolved');
    await rpc('correct_measurement', await argsFor('correct_measurement'));
    expect((await row('alerts', id(91))).status).toBe('resolved');
  });
  it.each(['open', 'closed', 'resuelta', null])('rejects invalid attendance status %s', async status => {
    const args = await argsFor('resolve_alert'); args[3] = status;
    await expect(rpc('resolve_alert', args)).rejects.toMatchObject({ code: 'PT422' });
  });
  it.each(['risk_assessments', 'prescription_schedules'] as const)('rolls back all writes and audit when %s insertion fails', async table => {
    const beforeMeasurement = await row('measurements', measurement); const beforePrescription = await row('prescriptions', prescription);
    const countBefore = await query<number>('select count(*)::int as value from public.audit_log');
    const alertsBefore = await query<number>('select count(*)::int as value from public.alerts');
    await owner(); await db.exec(`create function private.fail_test() returns trigger language plpgsql as
      $$ begin raise exception 'test transaction failure'; end $$;
      create trigger fail_test before insert on public.${table} for each row execute function private.fail_test();`);
    await login(); const name = table === 'risk_assessments' ? 'correct_measurement' : 'adjust_prescription';
    await expect(rpc(name, await argsFor(name))).rejects.toThrow('test transaction failure');
    expect(await row('measurements', measurement)).toEqual(beforeMeasurement);
    expect(await row('prescriptions', prescription)).toEqual(beforePrescription);
    expect(await query<number>('select count(*)::int as value from public.prescriptions')).toBe(1);
    expect(await query<number>('select count(*)::int as value from public.audit_log')).toBe(countBefore);
    expect(await query<number>('select count(*)::int as value from public.alerts')).toBe(alertsBefore);
  });
});

describe('SQL parity with the existing TypeScript domain', () => {
  it('matches full risk results over 60 combinations of boundaries, medical assessments and timeouts', async () => {
    await owner(); const cutoff = new Date('2026-09-08T18:00:00Z');
    for (const value of [69, 70, 100, 140, 141, 250, 251]) for (const urgent of [false, true]) for (const initial of ['unknown', 'low', 'medium', 'high'] as const) {
      const input: PatientRiskInput = { patientId: patient, urgentFlagActive: urgent,
        initialAssessment: { level: initial, active: true, evaluatedAt: cutoff.toISOString() },
        monitoringRequirements: [{ variable: 'glucose', context: 'fasting', monitoringPlanId: plan, lastExpectedRequestAt: cutoff.toISOString() }] };
      const readings: EvaluableMeasurement[] = [{ variable: 'glucose', context: 'fasting', monitoringPlanId: plan,
        value, observedAt: cutoff.toISOString(), thresholds: { targetMin: 70, targetMax: 140, criticalMax: 250 } }];
      const timeouts = [{ occurredAt: '2026-09-01T18:00:00Z' }, { occurredAt: '2026-09-01T17:59:59Z' }, { occurredAt: '2026-09-08T18:00:01Z' }];
      const sql = await query<RiskResult>('select private.clinical_evaluate_risk($1) as value', [{ evaluatedAt: cutoff.toISOString(), patient: input, measurements: readings, timeouts }]);
      expect({ ...sql, evaluatedAt: new Date(sql.evaluatedAt).toISOString() }).toEqual(evaluateRisk(input, readings, [], timeouts, cutoff));
    }
    for (const thresholds of [null, {}, { criticalMax: 300 }, { targetMax: 140 }]) {
      const input: PatientRiskInput = { patientId: patient, urgentFlagActive: false, initialAssessment: null,
        monitoringRequirements: [{ variable: 'blood_pressure_diastolic', monitoringPlanId: id(500), lastExpectedRequestAt: cutoff.toISOString() }] };
      const readings: EvaluableMeasurement[] = [{ variable: 'glucose', monitoringPlanId: plan, value: 100, observedAt: cutoff.toISOString(), thresholds }];
      const timeouts = Array.from({ length: 3 }, () => ({ occurredAt: cutoff.toISOString() }));
      const sql = await query<RiskResult>('select private.clinical_evaluate_risk($1) as value', [{ evaluatedAt: cutoff.toISOString(), patient: input, measurements: readings, timeouts }]);
      expect({ ...sql, evaluatedAt: new Date(sql.evaluatedAt).toISOString() }).toEqual(evaluateRisk(input, readings, [], timeouts, cutoff));
    }
  });
  it.each(['expired', 'future', 'voided', 'missing_plan', 'ambiguous_manual', 'other_plan', 'empty_targets', 'nan_target', 'same_instant'])(
    'matches the dashboard with %s evidence', async scenario => {
      await owner();
      if (scenario === 'expired') await db.exec(`update public.measurements set measured_at=now()-interval '90 days 1 second',correction_reason='fixture' where id='${measurement}'`);
      if (scenario === 'future') await db.exec(`update public.measurements set measured_at=now()+interval '1 day',correction_reason='fixture' where id='${measurement}'`);
      if (scenario === 'voided') await db.exec(`update public.measurements set voided_at=now(),correction_reason='fixture' where id='${measurement}'`);
      if (scenario === 'missing_plan') await db.exec(`update public.monitoring_plans set active=false where id='${plan}'`);
      if (scenario === 'empty_targets') await db.exec(`update public.monitoring_plans set glucose_min_mg_dl=null,glucose_max_mg_dl=null,critical_glucose_max_mg_dl=null where id='${plan}'`);
      if (scenario === 'nan_target') await db.exec(`update public.monitoring_plans set glucose_min_mg_dl=null,glucose_max_mg_dl='NaN',critical_glucose_max_mg_dl=null where id='${plan}'`);
      if (scenario === 'same_instant') await db.exec(`insert into public.measurements(id,unit_id,patient_id,monitoring_plan_id,kind,measured_at,glucose_mg_dl,measurement_context,source)
        select '${id(9)}',unit_id,patient_id,monitoring_plan_id,kind,measured_at,100,measurement_context,'manual' from public.measurements where id='${measurement}'`);
      if (scenario === 'ambiguous_manual' || scenario === 'other_plan') await db.exec(`insert into public.monitoring_plans(id,unit_id,patient_id,kind,local_time,start_date,measurement_context,glucose_max_mg_dl,attributed_doctor_id)
        values('${id(55)}','${unit}','${patient}','glucose','00:00','2020-01-01','fasting',140,'${doctor}');
        insert into public.measurements(id,unit_id,patient_id,kind,measured_at,glucose_mg_dl,measurement_context,source,monitoring_plan_id)
        values('${id(56)}','${unit}','${patient}','glucose',now()+interval '1 microsecond',100,'fasting','manual',${scenario === 'other_plan' ? `'${id(55)}'` : 'null'});`);
      await assertParity(new Date(Date.parse(now) + 1000).toISOString());
    });
  it('uses JavaScript millisecond precision when selecting tied clinical observations', async () => {
    await owner(); await db.exec(`update public.measurements set measured_at=date_trunc('milliseconds',now())+interval '800 microseconds',
      correction_reason='Precision fixture' where id='${measurement}';
      insert into public.measurements(id,unit_id,patient_id,monitoring_plan_id,kind,measured_at,glucose_mg_dl,measurement_context,source)
      select '${id(9)}',unit_id,patient_id,monitoring_plan_id,kind,date_trunc('milliseconds',now())+interval '100 microseconds',
        100,measurement_context,'manual' from public.measurements where id='${measurement}';`);
    expect((await assertParity(new Date(Date.parse(now) + 1000).toISOString())).risk.level).toBe('low');
  });
  it('excludes non-finite delivery and response timestamps as the dashboard does', async () => {
    await owner(); await db.exec(`update public.medication_responses set reported_at='-infinity',correction_reason='Invalid time fixture'
      where id='${response}';
      update public.bot_interactions set delivered_at='-infinity',response_deadline_at='-infinity' where id='${interaction}';`);
    expect((await assertParity()).adherence.hasData).toBe(false);
  });
  it('requires both pressure components with targets for low risk', async () => {
    await owner(); await db.exec(`insert into public.monitoring_plans(id,unit_id,patient_id,kind,local_time,start_date,measurement_context,
      systolic_max_mm_hg,diastolic_max_mm_hg,attributed_doctor_id) values('${id(50)}','${unit}','${patient}','blood_pressure','00:00','2020-01-01','resting',140,90,'${doctor}');
      insert into public.measurements(id,unit_id,patient_id,monitoring_plan_id,kind,measured_at,systolic_mm_hg,diastolic_mm_hg,measurement_context,source)
      values('${id(51)}','${unit}','${patient}','${id(50)}','blood_pressure',now(),120,80,'resting','manual');`);
    await login(); expect((await rpc('correct_measurement', await argsFor('correct_measurement'))).data.risk)
      .toMatchObject({ level: 'low', inputsUsed: { measurementsConsidered: 3 } });
    await owner(); await db.exec(`update public.monitoring_plans set diastolic_max_mm_hg=null where id='${id(50)}'`);
    await login(); expect((await rpc('correct_measurement', await argsFor('correct_measurement'))).data.risk.level).toBe('unknown');
  });
  it('matches adherence for all delivery states and exact 30-day boundaries', async () => {
    await owner();
    for (const [i, status] of ['queued', 'sending', 'accepted', 'delivered', 'read', 'failed', 'cancelled', 'blocked_window', 'blocked_template', 'unknown'].entries()) {
      for (const [j, reply] of ['yes', 'no', 'absent', 'future'].entries()) {
        const key = id(1000 + i * 10 + j);
        await db.query(`insert into public.bot_interactions(id,unit_id,patient_id,kind,prescription_id,deduplication_key,scheduled_at,
          expects_response,provider,delivery_status,delivered_at,response_deadline_at)
          values($1::uuid,$2,$3,'medication',$4,($1::uuid)::text,now()-interval '1 day',true,'demo',$5,now()-interval '1 day',now()-interval '23 hours')`,
        [key, unit, patient, prescription, status]);
        if (reply !== 'absent') await db.query(`insert into public.medication_responses(unit_id,patient_id,interaction_id,taken,reported_at,source)
          values($1,$2,$3,$4,now()+$5::interval,'manual')`, [unit, patient, key, reply === 'yes', reply === 'future' ? '1 day' : '-22 hours']);
      }
    }
    for (const [i, age] of ['-30 days', '-30 days -1 second', '1 second'].entries()) await db.query(`insert into public.bot_interactions(
      unit_id,patient_id,kind,prescription_id,deduplication_key,scheduled_at,expects_response,provider,delivery_status,delivered_at,response_deadline_at)
      values($1,$2,'medication',$3,$4,now()+$5::interval,true,'demo','delivered',now()-interval '1 hour',now())`,
    [unit, patient, prescription, `boundary:${i}`, age]);
    const result = await assertParity();
    expect(result.adherence.y).toBeGreaterThan(0); expect(result.adherence.n).toBeGreaterThan(0);
    expect(result.adherence.u).toBeGreaterThan(0); expect(result.adherence.technicalExclusionsCount).toBeGreaterThan(0);
  });
  it.each([
    ['America/Mexico_City', '2026-09-08T18:00:00Z', '08:00'], ['Asia/Kathmandu', '2026-09-08T18:00:00Z', '08:00'],
    ['America/New_York', '2026-11-01T08:00:00Z', '01:30'], ['America/New_York', '2026-03-08T08:00:00Z', '02:30'],
    ['Europe/Berlin', '2026-10-25T08:00:00Z', '02:30'],
  ])('matches weekly schedules in %s at %s with a UTC Node runtime', async (timezone, cutoff, localTime) => {
    const previousTimezone = process.env.TZ;
    try {
      process.env.TZ = 'UTC'; await owner();
      await db.query('update public.health_units set timezone=$1 where id=$2', [timezone, unit]);
      await db.query('update public.monitoring_plans set local_time=$1 where id=$2', [localTime, plan]);
      const planRow = await query<Row<'monitoring_plans'>>('select to_jsonb(p) as value from public.monitoring_plans p where id=$1', [plan]);
      const snapshot = await query<Snapshot>('select private.clinical_risk_snapshot($1,$2,$3) as value', [unit, patient, cutoff]);
      expect(new Date(snapshot.patient.monitoringRequirements![0].lastExpectedRequestAt).toISOString()).toBe(lastExpectedAt(planRow, new Date(cutoff), timezone));
    } finally {
      if (previousTimezone === undefined) delete process.env.TZ; else process.env.TZ = previousTimezone;
    }
  });
});
