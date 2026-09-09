import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { evaluateRisk, type EvaluableMeasurement, type PatientRiskInput, type PendingTimeout } from '../../src/lib/domain/risk';
import type { RiskResult } from '../../src/contracts/dto';
import type { AdherenceResult } from '../../src/lib/domain/adherence';
import { evaluateExpirations, type DueInteractionCandidate } from '../../src/lib/jobs/expire';
import { validateBloodPressureValue, validateGlucoseValue } from '../../src/lib/domain/validation';
import { parseIncomingMessage } from '../../src/lib/whatsapp/parser';
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
    appointments: [], prescriptions: [], nonresponse: [], consent: [], complications: [] } as DashboardRows;
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
  for (const file of ['0001_kuni.sql', '0002_clinical_derivations.sql', '0003_clinical_commands.sql', '0004_patient_complications.sql', '0005_medication_therapeutic_class.sql', '0006_inbound_commands.sql', '0007_external_derivatives.sql', '0008_patient_registration.sql', '0009_patient_initial_care.sql', '0010_smsgate_provider.sql', '0011_schedule_appointment.sql']) {
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

describe('U08 patient registration phase 1', () => {
  const target = id(800);
  const input = () => ({ fullName: 'Paciente ficticio nuevo', birthDate: '1980-01-02', sex: 'unknown',
    clinicalRecord: 'NUEVO', curp: null, whatsappE164: '+525500000800', bloodType: null,
    initialRisk: 'medium', initialRiskReason: 'Valoracion de prueba', diagnoses: ['diabetes_type_2', 'hypertension'], consent: null });
  const consent = { event: 'granted', noticeVersion: 'v1', method: 'in_person', evidenceNote: 'Evidencia de prueba' };
  const create = (value: unknown = input(), targetRoom = room, targetDoctor = doctor, targetId = target) =>
    attempt(() => query<{ data: { patient: { id: string; updatedAt: string } }; error: null }>(
      'select public.register_patient($1,$2,$3,$4) as value', [targetId, targetRoom, targetDoctor, value]));
  const revision = () => query('select jsonb_build_object(\'updatedAt\',p.updated_at,\'consentId\',\
    (select id from consent_events where patient_id=p.id order by sequence_no desc limit 1),\'diagnoses\',\
    (select coalesce(jsonb_agg(jsonb_build_object(\'id\',d.id,\'updatedAt\',d.updated_at) order by d.id),\'[]\'::jsonb)\
    from patient_diagnoses d where d.patient_id=p.id and d.active)) as value from patients p where id=$1', [target]);
  const edit = (token: unknown, value: unknown = input()) => attempt(() => query(
    'select public.update_patient_registration($1,$2,$3,$4,$5,$6) as value', [target, room, doctor, value, token, 'Correccion cotejada']));

  it('atomically saves demographics, diagnoses, consent and derived provenance without inventing plans', async () => {
    expect((await create({ ...input(), consent })).data.patient.id).toBe(target);
    expect(await query('select count(*)::integer as value from patient_diagnoses where patient_id=$1 and active', [target])).toBe(2);
    expect(await query('select count(*)::integer as value from consent_events where patient_id=$1', [target])).toBe(1);
    expect(await query('select count(*)::integer as value from monitoring_plans where patient_id=$1', [target])).toBe(0);
    expect(await query('select count(*)::integer as value from prescriptions where patient_id=$1', [target])).toBe(0);
    expect(await query('select input_snapshot as value from risk_assessments where patient_id=$1', [target]))
      .toMatchObject({ actorUserId: actor, attributedDoctorId: doctor });
    await owner();
    expect(await query('select count(*)::integer as value from audit_log where actor_user_id=$1 and attributed_doctor_id=$2', [actor, doctor])).toBeGreaterThan(0);
  });
  it.each([viewer, otherActor, null])('denies an unauthorized actor %s', async user => {
    await login(user);
    await expect(create()).rejects.toMatchObject({ code: user === null ? 'PT401' : 'PT403' });
  });
  it('denies a foreign room or mismatched doctor', async () => {
    await expect(create(input(), id(22), otherDoctor)).rejects.toMatchObject({ code: 'PT403' });
    await expect(create(input(), room, otherDoctor)).rejects.toMatchObject({ code: 'PT403' });
  });
  it.each([
    { birthDate: '2999-01-01' }, { birthDate: '2026-02-30' }, { diagnoses: [] },
    { diagnoses: ['hypertension', 'hypertension'] }, { diagnoses: ['unknown'] },
    { consent: { ...consent, evidenceNote: '' } }, { consent: { ...consent, event: 'revoked' } },
    { unitId: otherUnit }, { whatsappE164: '555' }, { initialRiskReason: '' },
  ])('rejects invalid input %j without partial rows', async override => {
    await expect(create({ ...input(), ...override })).rejects.toMatchObject({ code: 'PT422' });
    expect(await query('select count(*)::integer as value from patients where id=$1', [target])).toBe(0);
  });
  it('rejects repeated IDs and canonical phone duplicates', async () => {
    await create();
    await expect(create()).rejects.toMatchObject({ code: 'PT409' });
    await expect(create({ ...input(), clinicalRecord: 'OTRO', whatsappE164: '+5215500000800' }, room, doctor, id(801)))
      .rejects.toMatchObject({ code: 'PT409' });
  });
  it('edits once, preserves diagnoses history and does not invent consent events', async () => {
    await create();
    const token = await revision();
    await edit(token, { ...input(), fullName: 'Nombre corregido', diagnoses: ['hypertension'] });
    expect(await query('select full_name as value from patients where id=$1', [target])).toBe('Nombre corregido');
    expect(await query('select count(*)::integer as value from patient_diagnoses where patient_id=$1', [target])).toBe(2);
    expect(await query('select count(*)::integer as value from patient_diagnoses where patient_id=$1 and active', [target])).toBe(1);
    expect(await query('select count(*)::integer as value from consent_events where patient_id=$1', [target])).toBe(0);
    await expect(edit(token)).rejects.toMatchObject({ code: 'PT409' });
  });
  it('rejects a stale consent token and forbids recipient changes', async () => {
    await create({ ...input(), consent });
    const token = await revision();
    await db.query('insert into consent_events(unit_id,patient_id,event,notice_version,method,evidence_note,attributed_doctor_id) values($1,$2,\'revoked\',\'v1\',\'in_person\',\'Baja de prueba\',$3)', [unit, target, doctor]);
    await expect(edit(token)).rejects.toMatchObject({ code: 'PT409' });
    await expect(edit(await revision(), { ...input(), whatsappE164: '+525500000899' })).rejects.toMatchObject({ code: 'PT422' });
  });
  it('rejects a stale diagnosis token', async () => {
    await create();
    const token = await revision();
    await db.query('update patient_diagnoses set description=\'Actualizado\' where patient_id=$1', [target]);
    await expect(edit(token)).rejects.toMatchObject({ code: 'PT409' });
  });
  it('records an explicit revocation and cancels only unsent work', async () => {
    await create({ ...input(), consent });
    await owner();
    await db.query(`insert into bot_interactions(unit_id,patient_id,kind,deduplication_key,scheduled_at,expects_response,provider,delivery_status,delivered_at)
      values($1,$2,'nonresponse_summary','u08-queued',now(),false,'demo','queued',null),
      ($1,$2,'nonresponse_summary','u08-delivered',now(),false,'demo','delivered',now())`, [unit, target]);
    await login();
    await edit(await revision(), { ...input(), consent: { ...consent, event: 'revoked', evidenceNote: 'Revocacion cotejada' } });
    expect(await query("select event as value from consent_events where patient_id=$1 order by sequence_no desc limit 1", [target])).toBe('revoked');
    expect(await query("select jsonb_object_agg(deduplication_key,delivery_status) as value from bot_interactions where patient_id=$1", [target]))
      .toEqual({ 'u08-queued': 'cancelled', 'u08-delivered': 'delivered' });
  });
  it('compares timestamp formats semantically and preserves unchanged diagnosis identity', async () => {
    await create();
    const token = await revision() as { updatedAt: string; consentId: string | null; diagnoses: { id: string; updatedAt: string }[] };
    const changedFormat = { ...token, updatedAt: token.updatedAt.replace('+00:00', 'Z'),
      diagnoses: token.diagnoses.map(d => ({ ...d, updatedAt: d.updatedAt.replace('+00:00', 'Z') })).reverse() };
    await edit(changedFormat);
    expect((await revision() as typeof token).diagnoses).toEqual(token.diagnoses);
  });
  it('denies inactive rooms and cross-room edits', async () => {
    await create();
    const token = await revision();
    await owner();
    await db.query('insert into doctors(id,unit_id,full_name) values($1,$2,\'Otro medico\')', [id(803), unit]);
    await db.query('insert into consulting_rooms(id,unit_id,name,doctor_id) values($1,$2,\'Otro consultorio\',$3)', [id(802), unit, id(803)]);
    await login();
    await expect(attempt(() => query('select public.update_patient_registration($1,$2,$3,$4,$5,$6) as value',
      [target, id(802), id(803), input(), token, 'Prueba']))).rejects.toMatchObject({ code: 'PT403' });
    await owner();
    await db.query('update consulting_rooms set active=false where id=$1', [room]);
    await login();
    await expect(create()).rejects.toMatchObject({ code: 'PT403' });
  });
  it('rolls back the whole registration when derivation fails', async () => {
    await owner();
    await db.exec(`create function public.reject_registration_risk() returns trigger language plpgsql as $$ begin raise exception 'forced risk failure'; end; $$;
      create trigger reject_registration_risk before insert on risk_assessments for each row execute function public.reject_registration_risk();`);
    await login();
    await expect(create({ ...input(), consent })).rejects.toThrow('forced risk failure');
    for (const table of ['patients', 'patient_diagnoses', 'consent_events']) {
      expect(await query(`select count(*)::integer as value from ${table} where ${table === 'patients' ? 'id' : 'patient_id'}=$1`, [target])).toBe(0);
    }
  });
});

describe('schedule_appointment — agenda con persistencia atomica', () => {
  const futureStart = async (offsetHours = 48) =>
    query<string>(`select (now() + interval '${offsetHours} hours') as value`);
  const schedule = (starts: string, urgency = 'routine', reason = 'Revision de tratamiento',
    targetPatient = patient, targetRoom = room, targetDoctor = doctor) =>
    attempt(() => query<{ data: { appointment: { id: string; startsAt: string; updatedAt: string } }; error: null }>(
      'select public.schedule_appointment($1,$2,$3,$4,$5,$6) as value',
      [targetPatient, targetRoom, targetDoctor, starts, urgency, reason]));

  it('persists a scheduled appointment for the patient, room and doctor of the session', async () => {
    const starts = await futureStart();
    const result = await schedule(starts);
    expect(result.data.appointment.id).toBeTruthy();
    const stored = await query<{ status: string; urgency: string; reason: string; patient_id: string; consulting_room_id: string; attributed_doctor_id: string }>(
      'select to_jsonb(t) as value from public.appointments t where id=$1', [result.data.appointment.id]);
    expect(stored).toMatchObject({ status: 'scheduled', urgency: 'routine', reason: 'Revision de tratamiento',
      patient_id: patient, consulting_room_id: room, attributed_doctor_id: doctor });
  });
  it.each([viewer, otherActor, null])('denies an unauthorized actor %s', async user => {
    const starts = await futureStart();
    await login(user);
    await expect(schedule(starts)).rejects.toMatchObject({ code: user === null ? 'PT401' : 'PT403' });
  });
  it('denies a foreign room, mismatched doctor or a patient outside the room', async () => {
    const starts = await futureStart();
    await expect(schedule(starts, 'routine', 'Motivo', patient, id(22), otherDoctor)).rejects.toMatchObject({ code: 'PT403' });
    await expect(schedule(starts, 'routine', 'Motivo', patient, room, otherDoctor)).rejects.toMatchObject({ code: 'PT403' });
    await expect(schedule(starts, 'routine', 'Motivo', otherPatient, room, doctor)).rejects.toMatchObject({ code: 'PT403' });
  });
  it('rejects a past or missing horario, invalid urgencia and empty motivo, without inserting a row', async () => {
    const past = await query<string>("select (now() - interval '1 hour') as value");
    await expect(schedule(past)).rejects.toMatchObject({ code: 'PT422' });
    await expect(schedule(await futureStart(), 'asap')).rejects.toMatchObject({ code: 'PT422' });
    await expect(schedule(await futureStart(), 'routine', '   ')).rejects.toMatchObject({ code: 'PT422' });
    expect(await query('select count(*)::integer as value from appointments where patient_id=$1', [patient])).toBe(0);
  });
  it('rejects double-booking the same room and instant with a conflict', async () => {
    const starts = await futureStart();
    await schedule(starts);
    await expect(schedule(starts)).rejects.toMatchObject({ code: 'PT409' });
  });
  it('allows a second appointment at the same instant for a different room', async () => {
    const starts = await futureStart();
    await schedule(starts);
    await owner();
    await db.query(`insert into public.doctors(id,unit_id,full_name) values($1,$2,'Medico C')`, [id(23), unit]);
    await db.query(`insert into public.consulting_rooms(id,unit_id,name,doctor_id) values($1,$2,'Consultorio C',$3)`, [id(24), unit, id(23)]);
    await db.query(`insert into public.patients(id,unit_id,consulting_room_id,full_name,birth_date,sex,record_number,whatsapp_e164) values
      ($1,$2,$3,'Paciente ficticio C','1970-01-01','unknown','C','+525500000824')`, [id(25), unit, id(24)]);
    await login();
    await expect(schedule(starts, 'routine', 'Motivo', id(25), id(24), id(23))).resolves.toBeTruthy();
  });
});

describe('U08 patient registration phase 2 — receta y planes iniciales', () => {
  const target = id(810);
  const input = () => ({ fullName: 'Paciente con receta inicial', birthDate: '1975-05-05', sex: 'unknown',
    clinicalRecord: 'CON-CUIDADO', curp: null, whatsappE164: '+525500000810', bloodType: null,
    initialRisk: 'medium', initialRiskReason: 'Valoracion de prueba', diagnoses: ['diabetes_type_2'], consent: null });
  const prescription = () => ({ medicationId: medication, doseText: '1 tableta', instructions: 'Con alimentos',
    endsAt: null, schedules: [{ weekday: 1, localTime: '08:00' }, { weekday: 3, localTime: '08:00' }] });
  const glucosePlan = () => ({ kind: 'glucose', localTime: '07:00', weekdays: [1, 2, 3, 4, 5], measurementContext: 'fasting',
    glucoseMinMgDl: 70, glucoseMaxMgDl: 140, criticalGlucoseMinMgDl: 50, criticalGlucoseMaxMgDl: 250,
    systolicMinMmHg: null, systolicMaxMmHg: null, diastolicMinMmHg: null, diastolicMaxMmHg: null,
    criticalSystolicMinMmHg: null, criticalSystolicMaxMmHg: null, criticalDiastolicMinMmHg: null, criticalDiastolicMaxMmHg: null });
  const bpPlan = () => ({ kind: 'blood_pressure', localTime: '09:00', weekdays: [1, 2, 3, 4, 5, 6, 7], measurementContext: null,
    glucoseMinMgDl: null, glucoseMaxMgDl: null, criticalGlucoseMinMgDl: null, criticalGlucoseMaxMgDl: null,
    systolicMinMmHg: 100, systolicMaxMmHg: 140, diastolicMinMmHg: 60, diastolicMaxMmHg: 90,
    criticalSystolicMinMmHg: 80, criticalSystolicMaxMmHg: 180, criticalDiastolicMinMmHg: 40, criticalDiastolicMaxMmHg: 120 });
  const create = (p: unknown = null, plans: unknown = null, targetId = target) =>
    attempt(() => query<{ data: { patient: { id: string } }; error: null }>(
      'select public.register_patient($1,$2,$3,$4,$5,$6) as value', [targetId, room, doctor, input(), p, plans]));

  it('crea receta activa version 1 y sus horarios junto con el alta, en la misma transaccion', async () => {
    expect((await create(prescription())).data.patient.id).toBe(target);
    const row = await query<{ status: string; version: number; supersedes_id: string | null }>(
      "select to_jsonb(pr) as value from prescriptions pr where patient_id=$1", [target]);
    expect(row).toMatchObject({ status: 'active', version: 1, supersedes_id: null });
    expect(await query('select count(*)::integer as value from prescription_schedules where prescription_id=(select id from prescriptions where patient_id=$1)', [target])).toBe(1);
  });
  it('crea un plan de glucosa y uno de presion, sin mezclar sus umbrales', async () => {
    expect((await create(null, [glucosePlan(), bpPlan()])).data.patient.id).toBe(target);
    const rows = await query<{ kind: string; glucose_min_mg_dl: string | null; systolic_min_mm_hg: number | null }[]>(
      "select coalesce(jsonb_agg(to_jsonb(mp) order by kind),'[]'::jsonb) as value from monitoring_plans mp where patient_id=$1", [target]);
    expect(rows).toHaveLength(2);
    const glucose = rows.find(r => r.kind === 'glucose')!;
    const bp = rows.find(r => r.kind === 'blood_pressure')!;
    expect(glucose.systolic_min_mm_hg).toBeNull();
    expect(bp.glucose_min_mg_dl).toBeNull();
  });
  it('permite un plan sin ningun umbral capturado (NULL a proposito, no un default)', async () => {
    const bare = { ...glucosePlan(), glucoseMinMgDl: null, glucoseMaxMgDl: null, criticalGlucoseMinMgDl: null, criticalGlucoseMaxMgDl: null };
    expect((await create(null, [bare])).data.patient.id).toBe(target);
    expect(await query('select glucose_min_mg_dl as value from monitoring_plans where patient_id=$1', [target])).toBeNull();
  });
  it('rechaza un plan de glucosa con umbrales de presion mezclados', async () => {
    await expect(create(null, [{ ...glucosePlan(), systolicMinMmHg: 100 }])).rejects.toMatchObject({ code: 'PT422' });
    expect(await query('select count(*)::integer as value from patients where id=$1', [target])).toBe(0);
  });
  it('rechaza dos planes de la misma variable o mas de dos planes', async () => {
    await expect(create(null, [glucosePlan(), glucosePlan()])).rejects.toMatchObject({ code: 'PT422' });
    await expect(create(null, [glucosePlan(), bpPlan(), glucosePlan()])).rejects.toMatchObject({ code: 'PT422' });
  });
  it('rechaza umbrales min>max via el CHECK de la tabla, mapeado a PT422', async () => {
    await expect(create(null, [{ ...glucosePlan(), glucoseMinMgDl: 200, glucoseMaxMgDl: 100 }])).rejects.toMatchObject({ code: 'PT422' });
    expect(await query('select count(*)::integer as value from patients where id=$1', [target])).toBe(0);
  });
  it('rechaza un medicamento de otra unidad o inactivo', async () => {
    await owner();
    const foreignMed = id(811), inactiveMed = id(812);
    await db.query('insert into medications(id,unit_id,name) values($1,$2,\'Medicamento ajeno\')', [foreignMed, otherUnit]);
    await db.query('insert into medications(id,unit_id,name,active) values($1,$2,\'Medicamento inactivo\',false)', [inactiveMed, unit]);
    await login();
    await expect(create({ ...prescription(), medicationId: foreignMed })).rejects.toMatchObject({ code: 'PT403' });
    await expect(create({ ...prescription(), medicationId: inactiveMed })).rejects.toMatchObject({ code: 'PT403' });
  });
  it('rechaza una fecha final anterior al inicio y horarios duplicados', async () => {
    await expect(create({ ...prescription(), endsAt: '2000-01-01' })).rejects.toMatchObject({ code: 'PT422' });
    await expect(create({ ...prescription(), schedules: [{ weekday: 1, localTime: '08:00' }, { weekday: 1, localTime: '08:00' }] }))
      .rejects.toMatchObject({ code: 'PT422' });
  });
  it('la edicion nunca acepta receta ni planes iniciales: la firma publica no los expone', async () => {
    await create();
    const token = await query('select jsonb_build_object(\'updatedAt\',p.updated_at,\'consentId\',\
      (select id from consent_events where patient_id=p.id order by sequence_no desc limit 1),\'diagnoses\',\
      (select coalesce(jsonb_agg(jsonb_build_object(\'id\',d.id,\'updatedAt\',d.updated_at) order by d.id),\'[]\'::jsonb)\
      from patient_diagnoses d where d.patient_id=p.id and d.active)) as value from patients p where id=$1', [target]);
    await expect(attempt(() => query('select public.update_patient_registration($1,$2,$3,$4,$5,$6,$7,$8) as value',
      [target, room, doctor, input(), token, 'Intento invalido', prescription(), [glucosePlan()]])))
      .rejects.toThrow();
  });
});

describe('U07 external derivatives', () => {
  async function refresh(cutoff = now) {
    await owner();
    return attempt(() => query<boolean>('select private.refresh_patient_derivatives($1,$2,$3) as value', [unit, patient, cutoff]));
  }
  async function latest() {
    return query<{ level: string; input_snapshot: RiskSnapshot & { adherence: AdherenceResult; actorUserId: string | null; attributedDoctorId: string | null } }>(
      'select to_jsonb(r) as value from risk_assessments r where patient_id=$1 order by assessed_at desc,id desc limit 1', [patient]);
  }
  it('saves system provenance once and leaves unchanged alert tokens untouched on replay', async () => {
    expect(await refresh()).toBe(true);
    const before = await query('select jsonb_agg(to_jsonb(a) order by id) as value from alerts a');
    expect((await latest()).input_snapshot).toMatchObject({ actorUserId: null, attributedDoctorId: null });
    expect(await refresh()).toBe(false);
    expect(await query('select count(*)::integer as value from risk_assessments')).toBe(1);
    expect(await query('select jsonb_agg(to_jsonb(a) order by id) as value from alerts a')).toEqual(before);
  });
  it('detects changed plan thresholds and reviews existing measurement alerts', async () => {
    await refresh();
    expect((await latest()).level).toBe('high');
    await db.exec(`update monitoring_plans set glucose_max_mg_dl=350,critical_glucose_max_mg_dl=400 where id='${plan}'`);
    expect(await refresh(new Date(Date.parse(now) + 1000).toISOString())).toBe(true);
    expect((await latest()).level).toBe('low');
    expect(await query("select count(*)::integer as value from alerts where kind in ('high_risk','measurement_out_of_range') and status in ('open','acknowledged')")).toBe(0);
    await assertDatabaseParity();
  });
  it('detects a new critical plan limit without any inbound event', async () => {
    await rpc('correct_measurement', await argsFor('correct_measurement'));
    await owner();
    await db.exec(`update monitoring_plans set glucose_min_mg_dl=70,glucose_max_mg_dl=80,critical_glucose_max_mg_dl=90 where id='${plan}'`);
    expect(await refresh(new Date(Date.parse(now) + 1000).toISOString())).toBe(true);
    expect((await latest()).level).toBe('high');
  });
  it('refreshes when evidence expires through time alone', async () => {
    await refresh();
    expect(await refresh(new Date(Date.parse(now) + 91 * 86400000).toISOString())).toBe(true);
    expect((await latest()).level).toBe('unknown');
    expect((await latest()).input_snapshot.adherence.hasData).toBe(false);
  });
  it('updates adherence independently when only a response changes', async () => {
    await refresh();
    await db.exec(`update medication_responses set taken=true,correction_reason='Other writer' where id='${response}'`);
    expect(await refresh(new Date(Date.parse(now) + 1000).toISOString())).toBe(true);
    expect((await latest()).input_snapshot.adherence).toMatchObject({ y: 1, n: 0, confirmedAdherencePct: 100 });
  });
  it('does not reopen a dismissed high-risk alert on the next unchanged sweep', async () => {
    await refresh(); await login();
    const alert = await query<Row<'alerts'>>("select to_jsonb(a) as value from alerts a where kind='high_risk'");
    await rpc('resolve_alert', [patient, alert.id, alert.updated_at, 'dismissed', 'Reviewed', doctor]);
    expect(await refresh(new Date(Date.parse(now) + 1000).toISOString())).toBe(false);
    expect((await row('alerts', alert.id)).status).toBe('dismissed');
  });
  it('records expiration-derived risk and matches the canonical domain', async () => {
    await rpc('correct_measurement', await argsFor('correct_measurement')); await owner();
    for (let n = 0; n < 3; n++) await db.query(`insert into bot_interactions(unit_id,patient_id,kind,prescription_id,deduplication_key,
      scheduled_at,expects_response,provider,delivery_status,delivered_at,response_deadline_at)
      values($1,$2,'medication',$3,$4,now()-interval '2 hours',true,'demo','delivered',now()-interval '2 hours',now()-interval '1 hour')`,
    [unit,patient,prescription,`expiration-${n}`]);
    await db.exec('select public.expire_due_interactions()');
    expect(await refresh(new Date(Date.parse(now) + 1000).toISOString())).toBe(true);
    expect((await latest()).level).toBe('medium');
    await assertDatabaseParity();
  });
  it('denies clinical/anonymous roles and cross-unit patient IDs', async () => {
    for (const role of ['anon', 'authenticated'] as const) {
      await login(actor,role);
      await expect(attempt(() => db.query('select public.refresh_patient_derivatives($1,$2)',[unit,patient])))
        .rejects.toMatchObject({ code: '42501' });
    }
    await login(null,'service_role');
    await expect(attempt(() => db.query('select public.refresh_patient_derivatives($1,$2)',[otherUnit,patient])))
      .rejects.toMatchObject({ code: 'PT403' });
    expect(await query('select public.refresh_patient_derivatives($1,$2) as value',[unit,patient])).toBe(true);
    await owner();
    expect(await query('select count(*)::integer as value from risk_assessments where patient_id=$1',[otherPatient])).toBe(0);
  });
  it('skips patients that have become inactive', async () => {
    await owner(); await db.exec(`update patients set active=false where id='${patient}'`);
    expect(await refresh()).toBe(false);
  });
  it('rolls back review and assessment together if persistence fails', async () => {
    await owner();
    const before = await query('select jsonb_agg(to_jsonb(a) order by id) as value from alerts a');
    const auditCount = await query('select count(*)::integer as value from audit_log');
    await db.exec(`create function private.fail_refresh() returns trigger language plpgsql as $$ begin raise exception 'refresh test failure'; end $$;
      create trigger fail_refresh before insert on risk_assessments for each row execute function private.fail_refresh();`);
    await expect(refresh()).rejects.toThrow('refresh test failure');
    expect(await query('select jsonb_agg(to_jsonb(a) order by id) as value from alerts a')).toEqual(before);
    expect(await query('select count(*)::integer as value from audit_log')).toBe(auditCount);
  });
  it.each(['failed','cancelled','blocked_window','unknown','delivered'])('aligns the RLS adherence view for %s with a response', async status => {
    await owner(); await db.query('update bot_interactions set delivery_status=$1 where id=$2',[status,interaction]);
    const expected = (await assertDatabaseParity()).adherence;
    await login();
    const value = await query<Record<string, number | null>>('select to_jsonb(a) as value from patient_adherence a where patient_id=$1',[patient]);
    expect(value).toMatchObject({ eligible_count: expected.y + expected.n + expected.u, yes_count: expected.y,
      no_count: expected.n, unknown_count: expected.u, confirmed_adherence_pct: expected.confirmedAdherencePct,
      coverage_pct: expected.responseCoveragePct });
    expect(await query('select count(*)::integer as value from patient_adherence where patient_id=$1',[otherPatient])).toBe(0);
  });
});

describe('U06 durable inbound SQL', () => {
  const eventId = id(600), target = id(601);
  async function prepare(text: string, kind = 'medication', status = 'accepted') {
    await owner();
    await db.query(`insert into public.bot_interactions(id,unit_id,patient_id,kind,prescription_id,monitoring_plan_id,
      deduplication_key,reply_code,scheduled_at,expects_response,provider,delivery_status)
      values($1,$2,$3,$4,$5,$6,'inbound-test','ABCD1234',now()-interval '1 hour',true,'demo',$7)`,
      [target, unit, patient, kind, kind === 'medication' ? prescription : null, kind === 'measurement' ? plan : null, status]);
    await db.query(`insert into public.webhook_events(id,provider,event_key,event_type,normalized_payload,received_at)
      values($1,'demo','test-inbound','inbound',$2,now())`, [eventId, { raw: { From: 'whatsapp:+525500000001', Body: text } }]);
    await login(null, 'service_role');
  }
  async function process(text: string, phones = ['+525500000001']) {
    return attempt(() => query<{ outcome: string; duplicate: boolean }>(
      'select public.process_inbound_event($1,$2,$3) as value', [eventId, phones, parseIncomingMessage(text)]));
  }
  it.each(['SI ABCD1234', 'NO ABCD1234', 'SI'])('records %s once with receipt, delivery evidence, audit and derived metrics', async (text) => {
    await prepare(text);
    expect((await process(text)).outcome).toBe('recorded');
    expect((await process(text)).duplicate).toBe(true);
    expect(await query('select count(*)::integer as value from medication_responses where interaction_id=$1',[target])).toBe(1);
    const result = await row('bot_interactions',target);
    expect(result.response_at).not.toBeNull();
    expect(result.delivery_status).toBe('delivered');
    expect(await query('select taken as value from medication_responses where interaction_id=$1',[target])).toBe(!text.startsWith('NO'));
    expect(await query('select count(*)::integer as value from risk_assessments where patient_id=$1',[patient])).toBe(1);
    expect(await query("select count(*)::integer as value from audit_log where entity_table='medication_responses' and actor_user_id is null")).toBe(2);
    await assertDatabaseParity();
  });
  it('preserves a late timeout and resolves only its no-response alert', async () => {
    await prepare('SI ABCD1234');
    await owner();
    await db.query(`update bot_interactions set delivery_status='read',delivered_at=now()-interval '1 hour',
      response_deadline_at=now()-interval '30 minutes',timeout_at=now()-interval '30 minutes' where id=$1`,[target]);
    await db.query(`insert into alerts(unit_id,patient_id,kind,severity,interaction_id,deduplication_key,title)
      values($1,$2,'no_response','warning',$3,'late-test','Test')`,[unit,patient,target]);
    const before = await row('bot_interactions',target);
    await login(null,'service_role');
    await process('SI ABCD1234');
    const after = await row('bot_interactions',target);
    expect(after.timeout_at).toBe(before.timeout_at);
    expect(after.delivery_status).toBe('read');
    expect(await query("select status as value from alerts where deduplication_key='late-test'")).toBe('resolved');
    expect((await row('alerts',initialAlert)).status).toBe('open');
  });
  it('records the historical timeout even when expiration has not run yet', async () => {
    await prepare('SI ABCD1234');
    await owner();
    await db.query(`update bot_interactions set delivered_at=now()-interval '1 hour',
      response_deadline_at=now()-interval '30 minutes' where id=$1`,[target]);
    await login(null,'service_role');
    await process('SI ABCD1234');
    const result = await row('bot_interactions',target);
    expect(result.timeout_at).toBe(result.response_deadline_at);
    expect(await query("select status as value from alerts where interaction_id=$1",[target])).toBe('resolved');
  });
  it.each(['queued','cancelled','failed','blocked_template','blocked_window'])('does not attribute a reply to %s work', async (status) => {
    await prepare('SI ABCD1234','medication',status);
    expect((await process('SI ABCD1234')).outcome).toBe('help');
    expect((await row('bot_interactions',target)).response_at).toBeNull();
  });
  it('rejects an ambiguous code-less reply and a reference belonging to another patient', async () => {
    await prepare('SI');
    await owner();
    await db.query(`insert into bot_interactions(unit_id,patient_id,kind,prescription_id,deduplication_key,scheduled_at,expects_response,provider,delivery_status)
      values($1,$2,'medication',$3,'second',now()-interval '1 hour',true,'demo','accepted')`,[unit,patient,prescription]);
    await login(null,'service_role');
    expect((await process('SI')).outcome).toBe('help');
    await owner();
    await db.exec("update webhook_events set processing_status='received',normalized_payload=normalized_payload-'parsed'");
    await login(null,'service_role');
    await expect(process('SI ABCD1234',['+525500000002'])).rejects.toThrow('INBOUND_IDENTITY_CHANGED');
    expect((await row('bot_interactions',target)).response_at).toBeNull();
  });
  it('rejects an ambiguous sender without updating session or clinical records', async () => {
    await prepare('SI ABCD1234');
    expect((await process('SI ABCD1234',['+525500000001','+525500000002'])).outcome).toBe('ignored');
    expect(await query('select count(*)::integer as value from patient_messaging_state')).toBe(0);
  });
  it('does not attribute another patients reference to a recognized sender', async () => {
    await prepare('SI ABCD1234');
    expect((await process('SI ABCD1234',['+525500000002'])).outcome).toBe('help');
    expect((await row('bot_interactions',target)).response_at).toBeNull();
  });
  it('records glucose using the requested plan context and creates its risk alert', async () => {
    await prepare('GLUCOSA ABCD1234 300','measurement');
    expect((await process('GLUCOSA ABCD1234 300')).outcome).toBe('recorded');
    expect(await query('select measurement_context as value from measurements where interaction_id=$1',[target])).toBe('fasting');
    expect(await query(`select count(*)::integer as value from alerts a join measurements m on m.id=a.measurement_id
      where m.interaction_id=$1 and a.kind='measurement_out_of_range'`,[target])).toBe(1);
    await assertDatabaseParity();
  });
  it.each(['GLUCOSA ABCD1234 19','GLUCOSA ABCD1234 701','GLUCOSA ABCD1234 120 POSPRANDIAL','PRESION ABCD1234 120/80'])('does not store incompatible measurement %s', async (text) => {
    await prepare(text,'measurement');
    expect((await process(text)).outcome).toBe('help');
    expect(await query('select count(*)::integer as value from measurements where interaction_id=$1',[target])).toBe(0);
  });
  it.each(['PRESION ABCD1234 120/80','PRESION 120/80'])('records both pressure components: %s', async (text) => {
    await prepare(text,'measurement');
    await owner();
    await db.query(`update monitoring_plans set kind='blood_pressure',measurement_context='resting',
      glucose_min_mg_dl=null,glucose_max_mg_dl=null,critical_glucose_max_mg_dl=null where id=$1`,[plan]);
    await login(null,'service_role');
    expect((await process(text)).outcome).toBe('recorded');
    expect(await query('select systolic_mm_hg=120 and diastolic_mm_hg=80 as value from measurements where interaction_id=$1',[target])).toBe(true);
  });
  it('BAJA revokes consent once, cancels queued work and does not create a clinical report', async () => {
    await prepare('BAJA','medication','queued');
    await owner();
    await db.query(`insert into consent_events(unit_id,patient_id,event,notice_version,method,evidence_note)
      values($1,$2,'granted','existing-notice-v1','in_person','Fixture')`,[unit,patient]);
    await login(null,'service_role');
    expect((await process('BAJA')).outcome).toBe('opt_out');
    await process('BAJA');
    expect((await row('bot_interactions',target)).delivery_status).toBe('cancelled');
    expect(await query("select count(*)::integer as value from consent_events where event='revoked'")).toBe(1);
    expect(await query("select notice_version as value from consent_events where event='revoked'")).toBe('existing-notice-v1');
    expect(await query('select count(*)::integer as value from risk_assessments')).toBe(0);
    expect((await row('bot_interactions',target)).response_at).toBeNull();
  });
  it('BAJA without a prior notice remains reviewable without inventing a version', async () => {
    await prepare('BAJA');
    expect((await process('BAJA')).outcome).toBe('review');
    expect(await query('select count(*)::integer as value from consent_events')).toBe(0);
  });
  it('rolls back BAJA and queue cancellation if closing the durable receipt fails', async () => {
    await prepare('BAJA','medication','queued');
    await owner();
    await db.query(`insert into consent_events(unit_id,patient_id,event,notice_version,method,evidence_note)
      values($1,$2,'granted','existing-v1','in_person','Fixture')`,[unit,patient]);
    await db.exec(`create function public.test_receipt_failure() returns trigger language plpgsql as $$ begin raise exception 'receipt failed'; end $$;
      create trigger test_receipt_failure before update on webhook_events for each row execute function public.test_receipt_failure();`);
    await login(null,'service_role');
    await expect(process('BAJA')).rejects.toThrow('receipt failed');
    expect((await row('bot_interactions',target)).delivery_status).toBe('queued');
    expect(await query("select count(*)::integer as value from consent_events where event='revoked'")).toBe(0);
    expect(await query('select count(*)::integer as value from patient_messaging_state')).toBe(0);
  });
  it.each(['PRESION ABCD1234 80/120','PRESION ABCD1234 59/40','PRESION ABCD1234 120/29'])('validates pressure before recording %s', async (text) => {
    await prepare(text,'measurement');
    await owner();
    await db.query(`update monitoring_plans set kind='blood_pressure',measurement_context='resting',
      glucose_min_mg_dl=null,glucose_max_mg_dl=null,critical_glucose_max_mg_dl=null where id=$1`,[plan]);
    await login(null,'service_role');
    expect((await process(text)).outcome).toBe('help');
    expect((await row('bot_interactions',target)).response_at).toBeNull();
  });
  it('does not correlate a reprocessed receipt with a later send', async () => {
    await prepare('SI');
    await owner();
    await db.query("update bot_interactions set accepted_at=now()+interval '1 second' where id=$1",[target]);
    await login(null,'service_role');
    expect((await process('SI')).outcome).toBe('help');
  });
  it('upgrades legacy unrecognized BAJA and preserves other previously parsed data', async () => {
    await prepare('BAJA');
    await owner();
    await db.query(`insert into consent_events(unit_id,patient_id,event,notice_version,method,evidence_note)
      values($1,$2,'granted','existing-v1','in_person','Fixture')`,[unit,patient]);
    await db.exec(`update webhook_events set normalized_payload=normalized_payload || '{"parsed":{"kind":"unrecognized","rawText":"BAJA"}}'::jsonb`);
    await login(null,'service_role');
    expect((await process('BAJA')).outcome).toBe('opt_out');
  });
  it('an older reprocessed receipt never moves the session window backwards', async () => {
    await prepare('hola');
    await owner();
    await db.query(`insert into patient_messaging_state(patient_id,unit_id,last_inbound_at) values($1,$2,now()+interval '1 minute')`,[patient,unit]);
    const before = await query('select last_inbound_at as value from patient_messaging_state');
    await login(null,'service_role');
    await process('hola');
    expect(await query('select last_inbound_at as value from patient_messaging_state')).toEqual(before);
  });
  it('rolls back effect, session, audit and receipt state if derivation fails, then retries once', async () => {
    await prepare('SI ABCD1234');
    await owner();
    await db.exec(`create function public.test_inbound_failure() returns trigger language plpgsql as $$ begin raise exception 'injected'; end $$;
      create trigger test_inbound_failure before insert on risk_assessments for each row execute function public.test_inbound_failure();`);
    await login(null,'service_role');
    await expect(process('SI ABCD1234')).rejects.toThrow('injected');
    expect((await row('bot_interactions',target)).response_at).toBeNull();
    expect(await query('select count(*)::integer as value from patient_messaging_state')).toBe(0);
    expect(await query('select processing_status as value from webhook_events where id=$1',[eventId])).toBe('received');
    expect(await query('select count(*)::integer as value from medication_responses where interaction_id=$1',[target])).toBe(0);
    await owner();
    await db.exec('drop trigger test_inbound_failure on risk_assessments');
    await login(null,'service_role');
    expect((await process('SI ABCD1234')).outcome).toBe('recorded');
  });
  it.each(['anon','authenticated'] as const)('denies RPC execution to %s', async (role) => {
    await prepare('SI ABCD1234');
    await login(actor,role);
    await expect(process('SI ABCD1234')).rejects.toMatchObject({code:'42501'});
  });
});

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
        { kind: 'blood_pressure', patientId: patient, observedAt: now, systolicMmHg: systolic, diastolicMmHg: diastolic }, 'Presion cotejada', doctor];
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
      appointments: [], prescriptions: [], nonresponse: [], consent: [], complications: [] } as DashboardRows;
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

describe('expiration RPC parity and idempotency', () => {
  const cases: { name: string; status: DueInteractionCandidate['deliveryStatus']; future?: boolean; replied?: boolean; informational?: boolean; noEvidence?: boolean }[] = [
    ...(['queued', 'sending', 'accepted', 'delivered', 'read', 'failed', 'cancelled', 'blocked_window', 'blocked_template', 'unknown'] as const)
      .map(status => ({ name: status, status })),
    { name: 'deadline future', status: 'delivered', future: true },
    { name: 'valid reply', status: 'delivered', replied: true },
    { name: 'informational', status: 'delivered', informational: true },
    { name: 'missing evidence', status: 'delivered', noEvidence: true },
  ];
  it.each(cases)('agrees with the pure decision for $name and preserves historical timeout', async (testCase) => {
    await owner();
    const received = new Date(Date.parse(now) - 3_600_000).toISOString();
    const due = testCase.informational || testCase.noEvidence ? null : new Date(Date.parse(now) + (testCase.future ? 60_000 : 0)).toISOString();
    const target = id(190);
    await db.query(`insert into public.bot_interactions(id,unit_id,patient_id,kind,prescription_id,deduplication_key,
      scheduled_at,expects_response,provider,delivery_status,delivered_at,response_deadline_at,response_at)
      values($1,$2,$3,$4,$5,$6,$7,$8,'demo',$9,$10,$11,$12)`, [
      target, unit, patient, testCase.informational ? 'nonresponse_summary' : 'medication', testCase.informational ? null : prescription,
      'expiry-parity', received, !testCase.informational, testCase.status, testCase.noEvidence ? null : received, due, testCase.replied ? received : null,
    ]);
    // Consent revoked after delivery does not erase the delivered request.
    await db.query(`insert into public.consent_events(unit_id,patient_id,event,notice_version,method,evidence_note)
      values($1,$2,'revoked','synthetic-test','whatsapp','Synthetic revocation')`, [unit, patient]);
    const before = await row('bot_interactions', target);
    const [decision] = evaluateExpirations([{
      interactionId: target, kind: before.kind as DueInteractionCandidate['kind'], expectsResponse: before.expects_response,
      deliveryStatus: before.delivery_status as DueInteractionCandidate['deliveryStatus'], deliveredAt: before.delivered_at,
      dueAt: before.response_deadline_at, respondedAt: before.response_at, timeoutAt: before.timeout_at,
    }], new Date(now));
    await login(null, 'service_role');
    expect(await query<number>('select public.expire_due_interactions() as value')).toBe(decision.countsAsNonResponse ? 1 : 0);
    expect(await query<number>('select public.expire_due_interactions() as value')).toBe(0);
    await owner();
    const after = await row('bot_interactions', target);
    expect(after.timeout_at).toBe(decision.countsAsNonResponse ? before.response_deadline_at : null);
    expect(await query<number>("select count(*)::int as value from public.alerts where interaction_id=$1 and kind='no_response'", [target]))
      .toBe(decision.countsAsNonResponse ? 1 : 0);
    if (after.timeout_at) {
      await db.query('update public.bot_interactions set response_at=now() where id=$1', [target]);
      expect((await row('bot_interactions', target)).timeout_at).toBe(after.timeout_at);
    }
  });
});
