-- Kuni / MVP de hackathon / PostgreSQL 15+ (Supabase).
-- Ejecutar UNA VEZ en un proyecto Supabase vacío, con el usuario postgres.
-- No contiene pacientes reales, credenciales ni umbrales clínicos universales.
-- UUID nativo de PostgreSQL; auth.users y auth.uid() los aporta Supabase.
-- Todas las fechas de eventos son timestamptz (UTC); los horarios de receta son
-- locales y se convierten usando health_units.timezone (IANA).
-- Las vistas clínicas usan security_invoker: necesitan PostgreSQL 15+.
-- auth.users, unidades y membresías se aprovisionan por Dashboard/script seguro.
-- No ejecutar este archivo sobre una base productiva existente sin migración.

begin;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create table public.health_units (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  institutional_code text unique,
  timezone text not null default 'America/Mexico_City',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.unit_memberships (
  unit_id uuid not null references public.health_units(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'shared_clinician'
    check (role in ('shared_clinician','clinician','viewer')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (unit_id, user_id),
  -- MVP: cada cuenta de Auth pertenece a exactamente una unidad.
  unique (user_id)
);

create table public.doctors (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.health_units(id),
  full_name text not null,
  professional_license text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (unit_id, id)
);

create table public.consulting_rooms (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.health_units(id),
  name text not null,
  doctor_id uuid not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (unit_id, id),
  unique (unit_id, name),
  foreign key (unit_id, doctor_id) references public.doctors(unit_id, id)
);
create unique index one_active_room_per_doctor
  on public.consulting_rooms(unit_id, doctor_id) where active;

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.health_units(id),
  consulting_room_id uuid not null,
  full_name text not null check (btrim(full_name) <> ''),
  birth_date date not null,
  sex text not null check (sex in ('female','male','intersex','unknown')),
  curp text check (curp is null or curp ~ '^[A-Z0-9]{18}$'),
  record_number text,
  affiliation_number text,
  whatsapp_e164 text not null check (whatsapp_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  blood_type text check (blood_type in ('A+','A-','B+','B-','AB+','AB-','O+','O-','unknown')),
  initial_risk text not null default 'unknown' check (initial_risk in ('low','medium','high','unknown')),
  initial_risk_reason text,
  followup_interval_days integer check (followup_interval_days > 0),
  bot_response_timeout_minutes integer not null default 60
    check (bot_response_timeout_minutes between 1 and 10080),
  -- Configuración operativa/versión; el motor TypeScript valida su forma con Zod.
  -- Vacío = no hay regla personalizada adicional; no inventar límites clínicos.
  risk_rule_config jsonb not null default '{}'::jsonb
    check (jsonb_typeof(risk_rule_config) = 'object'),
  active boolean not null default true,
  attributed_doctor_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unit_id, id),
  unique (unit_id, curp),
  unique (unit_id, record_number),
  -- Una sola cuenta/número emisor de WhatsApp en el MVP. No teléfonos compartidos.
  -- Antes de quitar este UNIQUE se necesita routing explícito de identidad/tenant.
  unique (whatsapp_e164),
  check (num_nonnulls(curp, record_number, affiliation_number) >= 1),
  foreign key (unit_id, consulting_room_id) references public.consulting_rooms(unit_id, id),
  foreign key (unit_id, attributed_doctor_id) references public.doctors(unit_id, id)
);
create index patients_room_idx on public.patients(unit_id, consulting_room_id) where active;

create table public.patient_diagnoses (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null,
  patient_id uuid not null,
  condition_code text not null check (condition_code in
    ('diabetes_type_1','diabetes_type_2','diabetes_gestational','diabetes_other','hypertension','other')),
  description text,
  diagnosed_on date,
  active boolean not null default true,
  attributed_doctor_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unit_id, id),
  foreign key (unit_id, patient_id) references public.patients(unit_id, id),
  foreign key (unit_id, attributed_doctor_id) references public.doctors(unit_id, id)
);
create index patient_diagnoses_patient_idx on public.patient_diagnoses(unit_id, patient_id);

create table public.consent_events (
  id uuid primary key default gen_random_uuid(),
  sequence_no bigint generated always as identity unique,
  unit_id uuid not null,
  patient_id uuid not null,
  scope text not null default 'whatsapp_automation' check (scope = 'whatsapp_automation'),
  event text not null check (event in ('granted','revoked')),
  notice_version text not null,
  method text not null check (method in ('in_person','whatsapp','written','other')),
  evidence_note text not null check (btrim(evidence_note) <> ''),
  attributed_doctor_id uuid,
  created_at timestamptz not null default now(),
  unique (unit_id, id),
  foreign key (unit_id, patient_id) references public.patients(unit_id, id),
  foreign key (unit_id, attributed_doctor_id) references public.doctors(unit_id, id)
);
create index consent_latest_idx on public.consent_events(unit_id, patient_id, sequence_no desc);

create table public.medications (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.health_units(id),
  name text not null,
  strength text,
  pharmaceutical_form text,
  active boolean not null default true,
  attributed_doctor_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unit_id, id),
  foreign key (unit_id, attributed_doctor_id) references public.doctors(unit_id, id)
);

create table public.prescriptions (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null,
  patient_id uuid not null,
  medication_id uuid not null,
  series_id uuid not null default gen_random_uuid(),
  version integer not null default 1 check (version > 0),
  supersedes_id uuid,
  dose_text text not null check (btrim(dose_text) <> ''),
  route text,
  instructions text,
  start_date date not null,
  end_date date,
  status text not null default 'draft' check (status in ('draft','active','superseded','stopped','completed')),
  change_reason text,
  attributed_doctor_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unit_id, id),
  unique (unit_id, patient_id, id),
  unique (unit_id, patient_id, series_id, version),
  unique (supersedes_id),
  check (end_date is null or end_date >= start_date),
  check ((version = 1 and supersedes_id is null) or (version > 1 and supersedes_id is not null)),
  foreign key (unit_id, patient_id) references public.patients(unit_id, id),
  foreign key (unit_id, medication_id) references public.medications(unit_id, id),
  foreign key (unit_id, patient_id, supersedes_id) references public.prescriptions(unit_id, patient_id, id),
  foreign key (unit_id, attributed_doctor_id) references public.doctors(unit_id, id)
);
create unique index prescription_one_active_version_idx
  on public.prescriptions(unit_id, patient_id, series_id) where status = 'active';
create index prescriptions_patient_idx on public.prescriptions(unit_id, patient_id, status);

create table public.prescription_schedules (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null,
  prescription_id uuid not null,
  local_time time not null,
  -- ISO 8601: lunes=1 ... domingo=7. MVP: patrones semanales, no recurrencia libre.
  weekdays smallint[] not null default array[1,2,3,4,5,6,7]::smallint[],
  created_at timestamptz not null default now(),
  unique (unit_id, id),
  unique (unit_id, prescription_id, local_time),
  check (cardinality(weekdays) between 1 and 7 and
    weekdays <@ array[1,2,3,4,5,6,7]::smallint[] and array_position(weekdays, null) is null),
  foreign key (unit_id, prescription_id) references public.prescriptions(unit_id, id)
);

create table public.monitoring_plans (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null,
  patient_id uuid not null,
  kind text not null check (kind in ('glucose','blood_pressure')),
  local_time time not null,
  weekdays smallint[] not null default array[1,2,3,4,5,6,7]::smallint[],
  start_date date not null,
  end_date date,
  measurement_context text check (measurement_context in ('fasting','before_meal','after_meal','random','resting','unspecified')),
  glucose_min_mg_dl numeric(7,2),
  glucose_max_mg_dl numeric(7,2),
  systolic_min_mm_hg integer,
  systolic_max_mm_hg integer,
  diastolic_min_mm_hg integer,
  diastolic_max_mm_hg integer,
  critical_glucose_min_mg_dl numeric(7,2),
  critical_glucose_max_mg_dl numeric(7,2),
  critical_systolic_min_mm_hg integer,
  critical_systolic_max_mm_hg integer,
  critical_diastolic_min_mm_hg integer,
  critical_diastolic_max_mm_hg integer,
  instructions text,
  active boolean not null default true,
  attributed_doctor_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unit_id, id),
  unique (unit_id, patient_id, id),
  check (cardinality(weekdays) between 1 and 7 and weekdays <@ array[1,2,3,4,5,6,7]::smallint[]
    and array_position(weekdays, null) is null),
  check (end_date is null or end_date >= start_date),
  check (glucose_min_mg_dl > 0 and glucose_max_mg_dl > 0),
  check (systolic_min_mm_hg > 0 and systolic_max_mm_hg > 0),
  check (diastolic_min_mm_hg > 0 and diastolic_max_mm_hg > 0),
  check (glucose_min_mg_dl <= glucose_max_mg_dl),
  check (systolic_min_mm_hg <= systolic_max_mm_hg),
  check (diastolic_min_mm_hg <= diastolic_max_mm_hg),
  check (critical_glucose_min_mg_dl > 0 and critical_glucose_max_mg_dl > 0),
  check (critical_systolic_min_mm_hg > 0 and critical_systolic_max_mm_hg > 0),
  check (critical_diastolic_min_mm_hg > 0 and critical_diastolic_max_mm_hg > 0),
  check (critical_glucose_min_mg_dl <= critical_glucose_max_mg_dl),
  check (critical_systolic_min_mm_hg <= critical_systolic_max_mm_hg),
  check (critical_diastolic_min_mm_hg <= critical_diastolic_max_mm_hg),
  check (critical_glucose_min_mg_dl <= glucose_min_mg_dl),
  check (critical_glucose_max_mg_dl >= glucose_max_mg_dl),
  check (critical_systolic_min_mm_hg <= systolic_min_mm_hg),
  check (critical_systolic_max_mm_hg >= systolic_max_mm_hg),
  check (critical_diastolic_min_mm_hg <= diastolic_min_mm_hg),
  check (critical_diastolic_max_mm_hg >= diastolic_max_mm_hg),
  check ((kind = 'glucose' and num_nonnulls(systolic_min_mm_hg,systolic_max_mm_hg,diastolic_min_mm_hg,diastolic_max_mm_hg,
      critical_systolic_min_mm_hg,critical_systolic_max_mm_hg,critical_diastolic_min_mm_hg,critical_diastolic_max_mm_hg) = 0)
    or (kind = 'blood_pressure' and num_nonnulls(glucose_min_mg_dl,glucose_max_mg_dl,critical_glucose_min_mg_dl,critical_glucose_max_mg_dl) = 0)),
  foreign key (unit_id, patient_id) references public.patients(unit_id, id),
  foreign key (unit_id, attributed_doctor_id) references public.doctors(unit_id, id)
);
create index monitoring_plans_patient_idx on public.monitoring_plans(unit_id, patient_id) where active;

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null,
  patient_id uuid not null,
  consulting_room_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled','completed','missed','cancelled')),
  urgency text not null default 'routine' check (urgency in ('routine','urgent')),
  reason text,
  notes text,
  attributed_doctor_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unit_id, id),
  unique (unit_id, patient_id, id),
  check (ends_at is null or ends_at > starts_at),
  foreign key (unit_id, patient_id) references public.patients(unit_id, id),
  foreign key (unit_id, consulting_room_id) references public.consulting_rooms(unit_id, id),
  foreign key (unit_id, attributed_doctor_id) references public.doctors(unit_id, id)
);
create index appointments_upcoming_idx on public.appointments(unit_id, starts_at) where status = 'scheduled';
create index appointments_patient_idx on public.appointments(unit_id, patient_id, starts_at desc);

-- Solo el backend altera ventana WhatsApp y estado de ingestión.
create table public.patient_messaging_state (
  patient_id uuid primary key,
  unit_id uuid not null,
  last_inbound_at timestamptz,
  updated_at timestamptz not null default now(),
  foreign key (unit_id, patient_id) references public.patients(unit_id, id)
);

create table public.bot_interactions (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null,
  patient_id uuid not null,
  kind text not null check (kind in ('medication','measurement','appointment','nonresponse_summary')),
  prescription_id uuid,
  monitoring_plan_id uuid,
  appointment_id uuid,
  -- Ocurrencia: tipo + ID plan/receta + instante UTC; UNIQUE evita duplicados del cron.
  deduplication_key text not null,
  reply_code text not null default upper(substr(replace(gen_random_uuid()::text, '-', ''),1,8)),
  scheduled_at timestamptz not null,
  expects_response boolean not null,
  provider text not null check (provider in ('twilio','meta','demo')),
  provider_message_id text unique,
  delivery_status text not null default 'queued' check (delivery_status in
    ('queued','sending','accepted','delivered','read','failed','cancelled','blocked_window','blocked_template','unknown')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  claimed_at timestamptz,
  accepted_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  response_deadline_at timestamptz,
  response_at timestamptz,
  -- Histórico: NO borrar al llegar respuesta tardía.
  timeout_at timestamptz,
  failure_code text,
  failure_detail text,
  -- Snapshot de dosis/horario/versión de aviso enviada, sin depender de cambios futuros.
  payload_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(payload_snapshot) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unit_id, id),
  unique (unit_id, patient_id, id),
  unique (unit_id, deduplication_key),
  unique (reply_code),
  check ((kind = 'medication' and prescription_id is not null and monitoring_plan_id is null and appointment_id is null and expects_response)
    or (kind = 'measurement' and monitoring_plan_id is not null and prescription_id is null and appointment_id is null and expects_response)
    or (kind = 'appointment' and appointment_id is not null and prescription_id is null and monitoring_plan_id is null and not expects_response)
    or (kind = 'nonresponse_summary' and num_nonnulls(prescription_id,monitoring_plan_id,appointment_id) = 0 and not expects_response)),
  check (expects_response or (response_deadline_at is null and response_at is null and timeout_at is null)),
  check (response_deadline_at is null or (delivered_at is not null and response_deadline_at >= delivered_at)),
  check (timeout_at is null or (expects_response and delivered_at is not null and response_deadline_at is not null and timeout_at >= response_deadline_at)),
  foreign key (unit_id, patient_id) references public.patients(unit_id, id),
  foreign key (unit_id, patient_id, prescription_id) references public.prescriptions(unit_id, patient_id, id),
  foreign key (unit_id, patient_id, monitoring_plan_id) references public.monitoring_plans(unit_id, patient_id, id),
  foreign key (unit_id, patient_id, appointment_id) references public.appointments(unit_id, patient_id, id)
);
create index interactions_queue_idx on public.bot_interactions(scheduled_at) where delivery_status = 'queued';
create index interactions_expiry_idx on public.bot_interactions(response_deadline_at)
  where expects_response and delivered_at is not null and response_at is null and timeout_at is null;
create index interactions_patient_idx on public.bot_interactions(unit_id, patient_id, scheduled_at desc);

create table public.measurements (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null,
  patient_id uuid not null,
  interaction_id uuid unique,
  monitoring_plan_id uuid,
  kind text not null check (kind in ('glucose','blood_pressure')),
  measured_at timestamptz not null,
  glucose_mg_dl numeric(7,2),
  systolic_mm_hg integer,
  diastolic_mm_hg integer,
  measurement_context text check (measurement_context in ('fasting','before_meal','after_meal','random','resting','unspecified')),
  source text not null check (source in ('whatsapp','manual','image_reviewed')),
  notes text,
  correction_reason text,
  voided_at timestamptz,
  attributed_doctor_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unit_id, id),
  unique (unit_id, patient_id, id),
  check ((kind = 'glucose' and glucose_mg_dl > 0 and glucose_mg_dl is not null
      and systolic_mm_hg is null and diastolic_mm_hg is null)
    or (kind = 'blood_pressure' and systolic_mm_hg > 0 and diastolic_mm_hg > 0
      and systolic_mm_hg is not null and diastolic_mm_hg is not null and glucose_mg_dl is null)),
  foreign key (unit_id, patient_id) references public.patients(unit_id, id),
  foreign key (unit_id, patient_id, interaction_id) references public.bot_interactions(unit_id, patient_id, id),
  foreign key (unit_id, patient_id, monitoring_plan_id) references public.monitoring_plans(unit_id, patient_id, id),
  foreign key (unit_id, attributed_doctor_id) references public.doctors(unit_id, id)
);
create index measurements_history_idx on public.measurements(unit_id, patient_id, measured_at desc) where voided_at is null;

create table public.medication_responses (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null,
  patient_id uuid not null,
  interaction_id uuid not null unique,
  taken boolean not null,
  reported_at timestamptz not null,
  source text not null check (source in ('whatsapp','manual')),
  notes text,
  correction_reason text,
  attributed_doctor_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unit_id, id),
  foreign key (unit_id, patient_id) references public.patients(unit_id, id),
  foreign key (unit_id, patient_id, interaction_id) references public.bot_interactions(unit_id, patient_id, id),
  foreign key (unit_id, attributed_doctor_id) references public.doctors(unit_id, id)
);
create index medication_responses_patient_idx on public.medication_responses(unit_id, patient_id, reported_at desc);

create table public.risk_assessments (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null,
  patient_id uuid not null,
  assessed_at timestamptz not null default now(),
  level text not null check (level in ('low','medium','high','unknown')),
  rule_version text not null,
  input_snapshot jsonb not null check (jsonb_typeof(input_snapshot) = 'object'),
  reasons jsonb not null check (jsonb_typeof(reasons) = 'array'),
  -- Priorización por reglas explicables; no probabilidad ni predicción validada.
  created_at timestamptz not null default now(),
  unique (unit_id, id),
  unique (unit_id, patient_id, id),
  foreign key (unit_id, patient_id) references public.patients(unit_id, id)
);
create index risk_latest_idx on public.risk_assessments(unit_id, patient_id, assessed_at desc);

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null,
  patient_id uuid not null,
  kind text not null check (kind in ('no_response','measurement_out_of_range','high_risk','urgent_followup','delivery_failure')),
  severity text not null check (severity in ('info','warning','critical')),
  status text not null default 'open' check (status in ('open','acknowledged','resolved','dismissed')),
  interaction_id uuid,
  measurement_id uuid,
  risk_assessment_id uuid,
  deduplication_key text not null,
  title text not null,
  detail jsonb not null default '{}'::jsonb,
  resolution_note text,
  resolved_at timestamptz,
  attributed_doctor_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unit_id, id),
  unique (unit_id, deduplication_key),
  check ((status in ('resolved','dismissed') and resolved_at is not null and nullif(btrim(resolution_note),'') is not null)
    or (status in ('open','acknowledged') and resolved_at is null)),
  foreign key (unit_id, patient_id) references public.patients(unit_id, id),
  foreign key (unit_id, patient_id, interaction_id) references public.bot_interactions(unit_id, patient_id, id),
  foreign key (unit_id, patient_id, measurement_id) references public.measurements(unit_id, patient_id, id),
  foreign key (unit_id, patient_id, risk_assessment_id) references public.risk_assessments(unit_id, patient_id, id),
  foreign key (unit_id, attributed_doctor_id) references public.doctors(unit_id, id)
);
create index alerts_active_idx on public.alerts(unit_id, severity, created_at desc) where status in ('open','acknowledged');
create index alerts_patient_idx on public.alerts(unit_id, patient_id, created_at desc);

-- Nunca exponer payloads de webhook al navegador. Verificar firma ANTES de insertar.
-- event_key: inbound:<MessageSid> o status:<MessageSid>:<MessageStatus> en Twilio;
-- adaptar al ID/tipo/estado de Meta. SID solo NO sirve para callbacks de estados.
create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid references public.health_units(id),
  provider text not null check (provider in ('twilio','meta','demo')),
  event_key text not null,
  event_type text not null check (event_type in ('inbound','status')),
  external_message_id text,
  -- Conservar solo lo necesario; definir retención propia para estos datos técnicos.
  normalized_payload jsonb not null default '{}'::jsonb,
  processing_status text not null default 'received' check (processing_status in ('received','processing','processed','failed','ignored')),
  processing_attempts integer not null default 0 check (processing_attempts >= 0),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text,
  unique (provider, event_key)
);
create index webhook_pending_idx on public.webhook_events(received_at) where processing_status in ('received','failed');

create table public.audit_log (
  id bigint generated always as identity primary key,
  unit_id uuid not null references public.health_units(id),
  entity_table text not null,
  entity_id uuid not null,
  action text not null check (action in ('INSERT','UPDATE','DELETE')),
  actor_user_id uuid references auth.users(id) on delete set null,
  attributed_doctor_id uuid,
  old_data jsonb,
  new_data jsonb,
  occurred_at timestamptz not null default now(),
  foreign key (unit_id, attributed_doctor_id) references public.doctors(unit_id, id)
);
create index audit_entity_idx on public.audit_log(unit_id, entity_table, entity_id, occurred_at desc);

-- Helpers SECURITY DEFINER: ignoran RLS solo para comprobar la propia membresía.
-- El cliente NO crea membresías ni manda unit_id como prueba de autorización.
create function private.can_read_unit(target_unit uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.unit_memberships m
    join public.health_units u on u.id = m.unit_id
    where m.unit_id = target_unit and m.user_id = (select auth.uid()) and m.active and u.active);
$$;
create function private.can_write_unit(target_unit uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.unit_memberships m
    join public.health_units u on u.id = m.unit_id
    where m.unit_id = target_unit and m.user_id = (select auth.uid()) and m.active and u.active
      and m.role in ('shared_clinician','clinician'));
$$;
revoke all on function private.can_read_unit(uuid), private.can_write_unit(uuid) from public;
grant execute on function private.can_read_unit(uuid), private.can_write_unit(uuid) to authenticated, service_role;

create function private.validate_timezone() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Zona horaria IANA desconocida';
  end if;
  return new;
end;
$$;
create trigger health_units_timezone before insert or update on public.health_units
  for each row execute function private.validate_timezone();

create function private.preserve_identity() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.unit_id is distinct from old.unit_id
     or new.created_at is distinct from old.created_at then
    raise exception 'id, unit_id y created_at son inmutables';
  end if;
  if to_jsonb(new) ? 'patient_id' and (to_jsonb(new)->>'patient_id') is distinct from (to_jsonb(old)->>'patient_id') then
    raise exception 'No se puede reasignar un registro clínico a otro paciente';
  end if;
  if to_jsonb(new) ? 'updated_at' then new.updated_at = now(); end if;
  return new;
end;
$$;

create function private.audit_clinical_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare rec jsonb; previous jsonb;
begin
  rec := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  previous := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  insert into public.audit_log(unit_id,entity_table,entity_id,action,actor_user_id,
      attributed_doctor_id,old_data,new_data)
  values ((rec->>'unit_id')::uuid,tg_table_name,(rec->>'id')::uuid,tg_op,auth.uid(),
    (rec->>'attributed_doctor_id')::uuid,previous,case when tg_op = 'DELETE' then null else rec end);
  return coalesce(new,old);
end;
$$;

-- Corrección con motivo obligatorio; el audit guarda valor original y nuevo.
create function private.validate_clinical_record() returns trigger
language plpgsql set search_path = '' as $$
declare interaction public.bot_interactions; plan public.monitoring_plans;
begin
  if tg_op = 'UPDATE' and (new.correction_reason is null or btrim(new.correction_reason) = '') then
    raise exception 'Toda corrección necesita correction_reason';
  end if;
  if auth.uid() is not null and new.attributed_doctor_id is null then
    raise exception 'Seleccionar médico para atribuir la captura/corrección manual';
  end if;
  if new.interaction_id is not null then
    select * into interaction from public.bot_interactions where id = new.interaction_id;
    if tg_table_name = 'medication_responses' and interaction.kind <> 'medication' then
      raise exception 'La confirmación debe corresponder a una interacción medication';
    end if;
    if tg_table_name = 'measurements' and interaction.kind <> 'measurement' then
      raise exception 'La medición debe corresponder a una interacción measurement';
    end if;
  end if;
  if tg_table_name = 'measurements' then
    if new.monitoring_plan_id is not null then
      select * into plan from public.monitoring_plans where id = new.monitoring_plan_id;
      if plan.kind <> new.kind then raise exception 'Tipo de medición incompatible con el plan'; end if;
    end if;
    if new.interaction_id is not null and new.monitoring_plan_id is distinct from interaction.monitoring_plan_id then
      raise exception 'El plan debe coincidir con el de la interacción';
    end if;
  end if;
  return new;
end;
$$;
create trigger measurements_validate before insert or update on public.measurements
  for each row execute function private.validate_clinical_record();
create trigger medication_responses_validate before insert or update on public.medication_responses
  for each row execute function private.validate_clinical_record();

-- Las versiones activadas no se reescriben. Ajustar dosis: reemplazar versión.
create function private.preserve_prescription_version() returns trigger
language plpgsql set search_path = '' as $$
declare previous public.prescriptions;
begin
  if tg_op = 'UPDATE' and old.status <> 'draft' and
    (to_jsonb(new) - array['status','change_reason','updated_at','attributed_doctor_id']) is distinct from
    (to_jsonb(old) - array['status','change_reason','updated_at','attributed_doctor_id']) then
    raise exception 'Crear una nueva versión para modificar dosis, duración o medicamento';
  end if;
  if tg_op = 'UPDATE' and old.status <> 'draft' and new.status = 'draft' then
    raise exception 'Una receta activada no vuelve a draft';
  end if;
  if new.supersedes_id is not null then
    select * into previous from public.prescriptions where id = new.supersedes_id;
    if previous.series_id is distinct from new.series_id or new.version <> previous.version + 1 then
      raise exception 'La versión debe continuar la serie anterior';
    end if;
  end if;
  if new.status = 'active' and (tg_op = 'INSERT' or old.status <> 'active') and
    not exists (select 1 from public.prescription_schedules where prescription_id = new.id) then
    raise exception 'Crear receta draft, agregar horarios y después activarla';
  end if;
  return new;
end;
$$;
create trigger prescriptions_version before insert or update on public.prescriptions
  for each row execute function private.preserve_prescription_version();

create function private.preserve_prescription_schedule() returns trigger
language plpgsql set search_path = '' as $$
declare target_id uuid; target_status text;
begin
  target_id := case when tg_op = 'DELETE' then old.prescription_id else new.prescription_id end;
  select status into target_status from public.prescriptions where id = target_id for update;
  if target_status <> 'draft' then raise exception 'Editar horarios solo en una versión draft'; end if;
  if tg_op = 'UPDATE' and new.prescription_id is distinct from old.prescription_id then
    raise exception 'No reasignar un horario a otra receta';
  end if;
  return coalesce(new,old);
end;
$$;
create trigger prescription_schedules_version before insert or update or delete on public.prescription_schedules
  for each row execute function private.preserve_prescription_schedule();

-- Revocación corta la cola; el worker vuelve a verificar consentimiento antes de enviar.
create function private.cancel_after_optout() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.event = 'revoked' then
    update public.bot_interactions set delivery_status = 'cancelled', updated_at = now(),
      failure_code = 'consent_revoked'
    where unit_id = new.unit_id and patient_id = new.patient_id
      and delivery_status in ('queued','blocked_window','blocked_template');
  end if;
  return new;
end;
$$;
create trigger consent_revoke after insert on public.consent_events
  for each row execute function private.cancel_after_optout();

do $$
declare table_name text;
begin
  foreach table_name in array array['patients','patient_diagnoses','medications','prescriptions',
    'prescription_schedules','monitoring_plans','appointments','measurements','medication_responses','bot_interactions','alerts'] loop
    execute format('create trigger immutable_identity before update on public.%I for each row execute function private.preserve_identity()',table_name);
  end loop;
  foreach table_name in array array['patients','patient_diagnoses','consent_events','medications',
    'prescriptions','prescription_schedules','monitoring_plans','appointments','measurements','medication_responses','alerts'] loop
    execute format('create trigger clinical_audit after insert or update or delete on public.%I for each row execute function private.audit_clinical_change()',table_name);
  end loop;
end;
$$;

-- Acceso unitario real en PostgreSQL; seleccionar consultorio solo filtra/atribuye.
-- La cuenta compartida puede leer todos los consultorios de su unidad (RF01/RNF03).
-- Sin permisos de borrado a authenticated; desactivar, cancelar o anular con motivo.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant usage on schema public to authenticated, service_role;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
-- El rol backend tampoco reescribe auditoría o consentimiento histórico.
-- audit_clinical_change inserta como su propietario SECURITY DEFINER.
revoke insert,update,delete,truncate on public.audit_log from service_role;
revoke update,delete,truncate on public.consent_events from service_role;

alter table public.health_units enable row level security;
create policy health_units_read on public.health_units for select to authenticated
  using (private.can_read_unit(id));
grant select on public.health_units to authenticated;

alter table public.unit_memberships enable row level security;
create policy memberships_read_self on public.unit_memberships for select to authenticated
  using (user_id = (select auth.uid()));
grant select on public.unit_memberships to authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array['doctors','consulting_rooms','patients','patient_diagnoses',
    'consent_events','medications','prescriptions','prescription_schedules','monitoring_plans',
    'appointments','patient_messaging_state','bot_interactions','measurements','medication_responses',
    'risk_assessments','alerts','audit_log'] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('create policy unit_read on public.%I for select to authenticated using (private.can_read_unit(unit_id))',table_name);
    execute format('grant select on public.%I to authenticated',table_name);
  end loop;
  foreach table_name in array array['patients','patient_diagnoses','medications','prescriptions',
    'prescription_schedules','monitoring_plans','appointments','measurements','medication_responses'] loop
    execute format('create policy unit_insert on public.%I for insert to authenticated with check (private.can_write_unit(unit_id))',table_name);
    execute format('create policy unit_update on public.%I for update to authenticated using (private.can_write_unit(unit_id)) with check (private.can_write_unit(unit_id))',table_name);
    execute format('grant insert, update on public.%I to authenticated',table_name);
  end loop;
end;
$$;
create policy consent_insert on public.consent_events for insert to authenticated
  with check (private.can_write_unit(unit_id));
grant insert on public.consent_events to authenticated;
grant usage, select on sequence public.consent_events_sequence_no_seq to authenticated;

-- Alertas generadas por backend; médicos solo modifican gestión/atención.
create policy alerts_manage on public.alerts for update to authenticated
  using (private.can_write_unit(unit_id)) with check (private.can_write_unit(unit_id));
grant update(status,resolution_note,resolved_at,attributed_doctor_id) on public.alerts to authenticated;

-- Webhooks totalmente privados. service_role BYPASSRLS de Supabase accede.
alter table public.webhook_events enable row level security;

create view public.patient_consent_status with (security_invoker = true) as
select p.unit_id, p.id as patient_id, coalesce(e.event = 'granted',false) as consent_granted,
  e.event as latest_event, e.created_at as recorded_at, e.notice_version
from public.patients p
left join lateral (select c.event,c.created_at,c.notice_version from public.consent_events c
  where c.unit_id = p.unit_id and c.patient_id = p.id order by c.sequence_no desc limit 1) e on true;

create view public.bot_interaction_status with (security_invoker = true) as
select i.*,
  case when not i.expects_response then 'not_expected'
    when i.response_at is not null and (i.timeout_at is not null or i.response_at > i.response_deadline_at) then 'late'
    when i.response_at is not null then 'received'
    when i.timeout_at is not null then 'no_response'
    else 'pending' end as response_status
from public.bot_interactions i;

create view public.patient_nonresponse_counts with (security_invoker = true) as
select p.unit_id,p.id as patient_id,
  count(i.id) filter (where i.timeout_at is not null) as ever_timed_out,
  count(i.id) filter (where i.timeout_at is not null and i.response_at is null) as currently_unanswered,
  max(i.timeout_at) as last_timeout_at
from public.patients p left join public.bot_interactions i
  on i.unit_id = p.unit_id and i.patient_id = p.id and i.expects_response
group by p.unit_id,p.id;

-- Ventana móvil de 30 días. Cohorte concluida por respuesta (también temprana/manual)
-- O por vencimiento tras entrega confirmada. Pendientes sin respuesta, fallidos sin
-- respuesta, citas y resúmenes quedan excluidos. La captura manual NO finge entrega.
-- SI/(SI+NO) = adherencia confirmada; (SI+NO)/exigibles = cobertura de respuestas.
-- Si no existe denominador, porcentaje NULL (mostrar "Sin datos", nunca 0 ficticio).
create view public.patient_adherence with (security_invoker = true) as
with eligible as (
  select i.unit_id,i.patient_id,i.id,r.id as response_id,r.taken
  from public.bot_interactions i
  left join public.medication_responses r on r.unit_id = i.unit_id and r.interaction_id = i.id
  where i.kind = 'medication' and i.scheduled_at >= now() - interval '30 days' and i.scheduled_at <= now()
    and (r.id is not null or (i.delivered_at is not null and i.response_deadline_at <= now()
      and i.delivery_status in ('delivered','read')))
), counts as (
  select p.unit_id,p.id as patient_id,
    count(i.id) as eligible_count,
    count(i.response_id) filter (where i.taken) as yes_count,
    count(i.response_id) filter (where not i.taken) as no_count,
    count(i.id) filter (where i.response_id is null) as unknown_count
  from public.patients p
  left join eligible i on i.unit_id = p.unit_id and i.patient_id = p.id
  group by p.unit_id,p.id
)
select *,round(100.0 * yes_count / nullif(yes_count + no_count,0),1) as confirmed_adherence_pct,
  round(100.0 * (yes_count + no_count) / nullif(eligible_count,0),1) as coverage_pct
from counts;

create view public.current_patient_risk with (security_invoker = true) as
select p.unit_id,p.id as patient_id,
  coalesce(r.level,p.initial_risk) as level,
  case when r.id is null then 'initial' else 'rules' end as assessment_source,
  r.assessed_at,r.rule_version,r.reasons,r.input_snapshot
from public.patients p
left join lateral (select * from public.risk_assessments a
  where a.unit_id = p.unit_id and a.patient_id = p.id order by a.assessed_at desc,a.id desc limit 1) r on true;

create view public.current_prescriptions with (security_invoker = true) as
select pr.* from public.prescriptions pr join public.health_units u on u.id = pr.unit_id
where pr.status = 'active' and pr.start_date <= (now() at time zone u.timezone)::date
  and (pr.end_date is null or pr.end_date >= (now() at time zone u.timezone)::date);

grant select on public.patient_consent_status,public.bot_interaction_status,public.patient_nonresponse_counts,
  public.patient_adherence,public.current_patient_risk,public.current_prescriptions to authenticated,service_role;

-- Operación atómica del cron. Solo backend con clave secreta puede ejecutarla.
-- Es idempotente por timeout_at + UNIQUE de alerta. Respuestas tardías preservan timeout_at.
create function public.expire_due_interactions() returns integer
language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
  with expired as (
    update public.bot_interactions set timeout_at = response_deadline_at, updated_at = now()
    where expects_response and delivered_at is not null and response_deadline_at <= now()
      and delivery_status in ('delivered','read')
      and response_at is null and timeout_at is null
    returning *
  ), inserted as (
    insert into public.alerts(unit_id,patient_id,kind,severity,interaction_id,deduplication_key,title,detail)
    select unit_id,patient_id,'no_response','warning',id,'no_response:' || id::text,
      'Interacción sin respuesta',jsonb_build_object('scheduled_at',scheduled_at,'deadline_at',response_deadline_at)
    from expired on conflict (unit_id,deduplication_key) do nothing returning id
  ) select count(*) into affected from expired;
  return affected;
end;
$$;
revoke all on function public.expire_due_interactions() from public,anon,authenticated;
grant execute on function public.expire_due_interactions() to service_role;

-- Bloqueo de cola para workers concurrentes; unknown/sending NO se reintentan a ciegas.
-- El envío externo NO es una transacción PostgreSQL: tras timeout HTTP marcar unknown
-- y reconciliar con proveedor. No prometer entrega exactamente una vez.
create function public.claim_due_interactions(batch_size integer default 25)
returns setof public.bot_interactions
language plpgsql security definer set search_path = '' as $$
begin
  if batch_size < 1 or batch_size > 200 then raise exception 'batch_size debe estar entre 1 y 200'; end if;
  return query
  with candidates as (
    select i.id from public.bot_interactions i
    join public.patients p on p.id = i.patient_id and p.unit_id = i.unit_id and p.active
    join public.health_units u on u.id = i.unit_id and u.active
    join public.patient_consent_status c on c.patient_id = i.patient_id and c.unit_id = i.unit_id and c.consent_granted
    where i.delivery_status = 'queued' and i.scheduled_at <= now()
      and (i.prescription_id is null or exists (select 1 from public.current_prescriptions pr where pr.id = i.prescription_id))
      and (i.monitoring_plan_id is null or exists (select 1 from public.monitoring_plans mp where mp.id = i.monitoring_plan_id and mp.active
        and mp.start_date <= (now() at time zone u.timezone)::date and (mp.end_date is null or mp.end_date >= (now() at time zone u.timezone)::date)))
      and (i.appointment_id is null or exists (select 1 from public.appointments a where a.id = i.appointment_id and a.status = 'scheduled' and a.starts_at > now()))
    order by i.scheduled_at,i.id limit batch_size for update of i skip locked
  )
  update public.bot_interactions i set delivery_status = 'sending',claimed_at = now(),attempt_count = attempt_count + 1,updated_at = now()
  from candidates c where i.id = c.id returning i.*;
end;
$$;
revoke all on function public.claim_due_interactions(integer) from public,anon,authenticated;
grant execute on function public.claim_due_interactions(integer) to service_role;

-- Revocar ejecución pública de funciones trigger aunque no sean RPC accesibles.
revoke all on all functions in schema private from public,anon;

comment on table public.unit_memberships is 'Identidad autenticada a nivel unidad. Médico seleccionado es atribución declarada, no autenticación individual.';
comment on table public.monitoring_plans is 'NULL en un límite significa no configurado. No clasificar como normal por ausencia de rango. Cambios deben disparar recálculo de riesgo.';
comment on table public.measurements is 'Consulta predeterminada últimos 90 días; no hay borrado automático. Cada corrección se registra en audit_log.';
comment on table public.bot_interactions is 'Outbox e historial por ocurrencia. Calcular fecha límite al confirmar entrega; actualizar estado de recepción y dato clínico en una transacción.';
comment on table public.alerts is 'Citar a Urgencias marca prioridad interna; no equivale a despachar servicios de emergencia ni a confirmar atención.';

commit;

-- INTEGRACIÓN OBLIGATORIA DEL BACKEND (no sustituida por el DDL):
-- 1. Provisionar Auth (registro público desactivado), unidad, membresía, médicos,
--    consultorios y catálogo. Todas las FK unit_id deben corresponder a la sesión.
-- 2. Generar ocurrencias a partir de horarios locales y planes activos; UNIQUE
--    deduplication_key protege contra dos ticks. Cita informativa y resumen no esperan respuesta.
-- 3. Al enviar: revalidar consentimiento, paciente/unidad activos, receta vigente,
--    ventana abierta SOLO por inbound real, plantilla disponible y snapshot actual.
-- 4. Callback validado: primera entrega fija delivered_at y response_deadline_at;
--    callbacks repetidos/desordenados nunca regresan read a accepted. Fallo de entrega
--    genera incidencia técnica, NO timeout de paciente. Firma no válida => HTTP 403.
-- 5. Inbound validado: deduplicar webhook, resolver teléfono+reply_code, validar Zod,
--    guardar respuesta/medición y response_at en UNA transacción/RPC del backend.
--    Si arrived_at > deadline, establecer timeout_at=deadline aunque cron aún no pasó.
--    Una respuesta manual por otra vía también cierra la interacción; mantiene timeout histórico.
-- 6. Corrección manual: motivo + médico; guardar audit, resolver/reabrir alertas derivadas
--    y recalcular riesgo en misma operación idempotente. No SQL dinámico del navegador.
-- 7. Ajustar dosis en transacción: bloquear receta anterior; crear draft nueva misma
--    series_id y version+1, copiar/agregar horarios, anterior->superseded, nueva->active;
--    cancelar interacciones futuras de anterior y regenerar. No editar dosis histórica.
-- 8. Programar cron externo/Supabase Cron -> endpoint Next.js protegido; invocar RPC
--    claim_due_interactions y expire_due_interactions desde el servidor. No exponer secrets.
-- 9. BAJA produce consent_events revoked; el resumen de no-respuestas tiene expects_response=false.
-- 10. Ajustar calendario cancelando/regenerando cola futura; nunca reescribir mensajes enviados.
-- 11. Supervisar unknown, failed, blocked_window, blocked_template y webhooks failed;
--     una demo simulada usa provider='demo' y se presenta explícitamente como simulación.
