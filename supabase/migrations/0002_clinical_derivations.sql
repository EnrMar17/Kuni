-- Persona C. Internal functions; no new clinical tables/columns.
begin;

create function private.clinical_assert(p_ok boolean, p_code text, p_detail text) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if p_ok is not true then
    raise exception using errcode = p_code, detail = p_detail,
      message = case p_code when 'PT401' then 'UNAUTHENTICATED' when 'PT403' then 'FORBIDDEN'
        when 'PT409' then 'CONFLICT' else 'VALIDATION' end;
  end if;
end;
$$;

create function private.clinical_actor(p_patient uuid, p_doctor uuid, p_reason text) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare v_unit uuid;
begin
  perform private.clinical_assert(auth.uid() is not null,'PT401','Se requiere sesion Auth.');
  select p.unit_id into v_unit from public.patients p
    join public.unit_memberships m on m.unit_id = p.unit_id and m.user_id = auth.uid()
    join public.health_units u on u.id = m.unit_id
    where p.id = p_patient and m.active and u.active and m.role in ('clinician','shared_clinician')
    for share of m,u;
  perform private.clinical_assert(found,'PT403','Paciente o membresia clinica no disponibles.');
  perform 1 from public.doctors where id = p_doctor and unit_id = v_unit and active for share;
  perform private.clinical_assert(found,'PT403','Medico no disponible en la unidad.');
  perform private.clinical_assert(p_reason ~ '[^[:space:]]','PT422','El motivo es obligatorio.');
  -- Common lock order stabilizes existing inputs; FK inserts wait on the patient.
  perform 1 from public.patients where id = p_patient and unit_id = v_unit for update;
  perform private.clinical_assert(found,'PT409','El paciente cambio durante la operacion.');
  perform 1 from public.monitoring_plans where unit_id = v_unit and patient_id = p_patient order by id for share;
  perform 1 from public.bot_interactions where unit_id = v_unit and patient_id = p_patient order by id for update;
  perform 1 from public.measurements where unit_id = v_unit and patient_id = p_patient order by id for update;
  perform 1 from public.medication_responses where unit_id = v_unit and patient_id = p_patient order by id for update;
  perform 1 from public.alerts where unit_id = v_unit and patient_id = p_patient order by id for update;
  return v_unit;
end;
$$;

-- Runs after immutable_identity: now() alone is not a monotonic edit token.
create function private.clinical_version_clock() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := greatest(clock_timestamp(),old.updated_at + interval '1 microsecond');
  return new;
end;
$$;
create trigger rpc_version_clock before update on public.measurements for each row execute function private.clinical_version_clock();
create trigger rpc_version_clock before update on public.medication_responses for each row execute function private.clinical_version_clock();
create trigger rpc_version_clock before update on public.prescriptions for each row execute function private.clinical_version_clock();
create trigger rpc_version_clock before update on public.alerts for each row execute function private.clinical_version_clock();

create function private.clinical_number(p_value jsonb) returns numeric
language sql immutable security invoker set search_path = '' as $$
  select case when jsonb_typeof(p_value) = 'number' then p_value::text::numeric end;
$$;

-- Match Date.parse precision for derived data, never for concurrency tokens.
create function private.clinical_instant(p_value timestamptz) returns timestamptz
language sql immutable security invoker set search_path = '' as $$
  select case when isfinite(p_value) then date_trunc('milliseconds',p_value at time zone 'UTC') at time zone 'UTC' end;
$$;

-- date-fns-tz fixOffset policy with UTC seed. Integration requires Node TZ=UTC
-- for deterministic DST folds in all IANA zones (see documentacionC.md).
create function private.clinical_local_instant(p_local timestamp, p_zone text) returns timestamptz
language plpgsql stable security invoker set search_path = '' as $$
declare v_wall timestamptz := private.clinical_instant(p_local at time zone 'UTC'); v_guess timestamptz;
  v_offset interval; v_second interval; v_third interval;
begin
  v_offset := (v_wall at time zone p_zone) - (v_wall at time zone 'UTC');
  v_guess := v_wall - v_offset;
  v_second := (v_guess at time zone p_zone) - (v_guess at time zone 'UTC');
  if v_offset = v_second then return v_guess; end if;
  v_guess := v_guess - (v_second - v_offset);
  v_third := (v_guess at time zone p_zone) - (v_guess at time zone 'UTC');
  if v_second = v_third then return v_wall - v_second; end if;
  return v_wall - greatest(v_second,v_third);
end;
$$;

-- Mirrors measurementPlan()/thresholds(). No window here: older corrections
-- still need to review their own alerts without affecting today's risk window.
create function private.clinical_measurement_inputs(p_unit uuid, p_patient uuid, p_now timestamptz)
returns table(measurement_id uuid, measured_at timestamptz, kind text, context text, effective_plan_id uuid, components jsonb)
language sql stable security invoker set search_path = '' as $$
  with resolved as (
    select m.*,candidate.plan,coalesce((candidate.plan->>'id')::uuid,m.monitoring_plan_id) as effective_id
    from public.measurements m join public.health_units u on u.id = m.unit_id
    left join lateral (
      select case when count(*) = 1 then jsonb_agg(to_jsonb(mp))->0 end as plan
      from public.monitoring_plans mp where mp.unit_id = p_unit and mp.patient_id = p_patient and mp.active
        and mp.kind = m.kind and coalesce(mp.measurement_context,'unspecified') = coalesce(m.measurement_context,'unspecified')
        and (m.monitoring_plan_id is null or mp.id = m.monitoring_plan_id)
        and mp.start_date <= (p_now at time zone u.timezone)::date
        and (mp.end_date is null or mp.end_date >= (p_now at time zone u.timezone)::date)
        and mp.start_date <= (private.clinical_instant(m.measured_at) at time zone u.timezone)::date
        and (mp.end_date is null or mp.end_date >= (private.clinical_instant(m.measured_at) at time zone u.timezone)::date)
    ) candidate on true
    where m.unit_id = p_unit and m.patient_id = p_patient and m.voided_at is null
      and private.clinical_instant(m.measured_at) <= private.clinical_instant(p_now)
  )
  select m.id,private.clinical_instant(m.measured_at),m.kind,coalesce(m.measurement_context,'unspecified'),m.effective_id,
    (select jsonb_agg(jsonb_build_object('measurementId',m.id,'variable',v.variable,'value',v.value,
      'observedAt',private.clinical_instant(m.measured_at),'context',coalesce(m.measurement_context,'unspecified'),'monitoringPlanId',m.effective_id,
      'thresholds',case when m.plan is null then null else jsonb_build_object(
        'targetMin',m.plan->(v.prefix || '_min_' || v.suffix),'targetMax',m.plan->(v.prefix || '_max_' || v.suffix),
        'criticalMin',m.plan->('critical_' || v.prefix || '_min_' || v.suffix),
        'criticalMax',m.plan->('critical_' || v.prefix || '_max_' || v.suffix)) end) order by v.variable)
      from (values ('glucose',m.glucose_mg_dl,'glucose','mg_dl'),
        ('blood_pressure_systolic',m.systolic_mm_hg::numeric,'systolic','mm_hg'),
        ('blood_pressure_diastolic',m.diastolic_mm_hg::numeric,'diastolic','mm_hg')) v(variable,value,prefix,suffix)
      where v.value is not null and v.value::text not in ('NaN','Infinity','-Infinity'))
  from resolved m;
$$;

create function private.clinical_risk_snapshot(p_unit uuid, p_patient uuid, p_now timestamptz) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with latest as (
    select distinct on (effective_plan_id,kind,context) *
    from private.clinical_measurement_inputs(p_unit,p_patient,p_now)
    where measured_at >= private.clinical_instant(p_now) - interval '2160 hours'
    order by effective_plan_id,kind,context,measured_at desc,measurement_id
  ), requirements as (
    select mp.id,mp.kind,mp.measurement_context,max(d.instant) as expected
    from public.monitoring_plans mp join public.health_units u on u.id = mp.unit_id
    cross join lateral (
      select (p_now at time zone u.timezone)::date - n as local_date,
        private.clinical_local_instant(((p_now at time zone u.timezone)::date - n) + mp.local_time,u.timezone) as instant
      from generate_series(0,7) n
    ) d
    where mp.unit_id = p_unit and mp.patient_id = p_patient and mp.active
      and mp.start_date <= (p_now at time zone u.timezone)::date
      and (mp.end_date is null or mp.end_date >= (p_now at time zone u.timezone)::date)
      and d.local_date >= mp.start_date and (mp.end_date is null or d.local_date <= mp.end_date)
      and extract(isodow from d.local_date)::smallint = any(mp.weekdays) and d.instant <= private.clinical_instant(p_now)
    group by mp.id,mp.kind,mp.measurement_context
  )
  select jsonb_build_object('unitId',p_unit,'patientId',p_patient,'evaluatedAt',private.clinical_instant(p_now),
    'patient',jsonb_build_object('patientId',p.id,'urgentFlagActive',exists(select 1 from public.alerts a
      where a.unit_id = p_unit and a.patient_id = p_patient and a.kind = 'urgent_followup' and a.status in ('open','acknowledged')),
      'initialAssessment',jsonb_build_object('level',p.initial_risk,'reason',p.initial_risk_reason,'evaluatedAt',private.clinical_instant(p.updated_at),'active',true),
      'monitoringRequirements',coalesce((select jsonb_agg(jsonb_build_object('variable',v.variable,'monitoringPlanId',r.id,
        'context',coalesce(r.measurement_context,'unspecified'),'lastExpectedRequestAt',r.expected) order by r.id,v.variable)
        from requirements r cross join lateral unnest(case when r.kind = 'glucose' then array['glucose']
          else array['blood_pressure_systolic','blood_pressure_diastolic'] end) v(variable)),'[]'::jsonb)),
    'measurements',coalesce((select jsonb_agg(c.value order by l.measurement_id,c.value->>'variable')
      from latest l cross join lateral jsonb_array_elements(l.components) c),'[]'::jsonb),
    'timeouts',coalesce((select jsonb_agg(jsonb_build_object('interactionId',i.id,'occurredAt',private.clinical_instant(i.timeout_at)) order by i.id)
      from public.bot_interactions i where i.unit_id = p_unit and i.patient_id = p_patient
        and i.timeout_at is not null and i.response_at is null and i.delivery_status in ('delivered','read')),'[]'::jsonb))
  from public.patients p where p.unit_id = p_unit and p.id = p_patient;
$$;

-- Same precedence, explanations and version as domain-core risk.ts.
create function private.clinical_evaluate_risk(p_snapshot jsonb) returns jsonb
language plpgsql immutable security invoker set search_path = '' as $$
declare v_now timestamptz := private.clinical_instant((p_snapshot->>'evaluatedAt')::timestamptz); v_patient jsonb := p_snapshot->'patient';
  v_measurements jsonb; v_m jsonb; v_t jsonb; v_req jsonb; v_timeouts integer; v_level text; v_initial text;
  v_urgent boolean := coalesce((v_patient->>'urgentFlagActive')::boolean,false);
  v_critical boolean := false; v_outside boolean := false; v_covered boolean; v_reasons jsonb;
begin
  select coalesce(jsonb_agg(m),'[]'::jsonb) into v_measurements from jsonb_array_elements(p_snapshot->'measurements') m
    where jsonb_typeof(m->'value') = 'number' and private.clinical_instant((m->>'observedAt')::timestamptz) <= v_now;
  select count(*) into v_timeouts from jsonb_array_elements(p_snapshot->'timeouts') t
    where private.clinical_instant((t->>'occurredAt')::timestamptz) between v_now - interval '168 hours' and v_now;
  for v_m in select value from jsonb_array_elements(v_measurements) loop
    v_t := v_m->'thresholds';
    v_critical := v_critical or coalesce((v_m->>'value')::numeric < private.clinical_number(v_t->'criticalMin'),false)
      or coalesce((v_m->>'value')::numeric > private.clinical_number(v_t->'criticalMax'),false);
    v_outside := v_outside or coalesce((v_m->>'value')::numeric < private.clinical_number(v_t->'targetMin'),false)
      or coalesce((v_m->>'value')::numeric > private.clinical_number(v_t->'targetMax'),false);
  end loop;
  v_covered := coalesce(jsonb_array_length(v_patient->'monitoringRequirements'),0) > 0;
  for v_req in select value from jsonb_array_elements(v_patient->'monitoringRequirements') loop
    v_covered := v_covered and private.clinical_instant((v_req->>'lastExpectedRequestAt')::timestamptz) <= v_now and exists (
      select 1 from jsonb_array_elements(v_measurements) m where m->>'variable' = v_req->>'variable'
        and (v_req->>'monitoringPlanId' is null or m->>'monitoringPlanId' = v_req->>'monitoringPlanId')
        and (m->>'variable' <> 'glucose' or coalesce(m->>'context','unspecified') = coalesce(v_req->>'context','unspecified'))
        and private.clinical_instant((m->>'observedAt')::timestamptz) >= private.clinical_instant((v_req->>'lastExpectedRequestAt')::timestamptz)
        and (private.clinical_number(m#>'{thresholds,targetMin}') is not null or private.clinical_number(m#>'{thresholds,targetMax}') is not null)
        and coalesce(private.clinical_number(m#>'{thresholds,targetMin}') <= private.clinical_number(m#>'{thresholds,targetMax}'),true)
        and coalesce(private.clinical_number(m#>'{thresholds,criticalMin}') <= private.clinical_number(m#>'{thresholds,criticalMax}'),true)
        and not exists(select 1 from jsonb_each(coalesce(nullif(m->'thresholds','null'::jsonb),'{}'::jsonb)) t
          where jsonb_typeof(t.value) not in ('number','null')));
  end loop;
  if v_urgent then
    v_level := 'high'; v_reasons := jsonb_build_array('Marca de urgencia activa registrada por el médico.');
  elsif v_critical then
    v_level := 'high'; v_reasons := jsonb_build_array('Medición fuera del límite crítico personalizado del paciente.');
  elsif v_outside then
    v_level := 'medium'; v_reasons := jsonb_build_array('Medición fuera del rango objetivo personalizado del paciente.');
  elsif v_timeouts >= 3 then
    v_level := 'medium'; v_reasons := jsonb_build_array(v_timeouts || ' no-respuestas pendientes en los últimos 7 días (regla operativa, no criterio médico validado).');
  elsif v_covered then
    v_level := 'low'; v_reasons := jsonb_build_array('Sin señales activas y con mediciones recientes evaluables para cada variable y contexto del plan.');
  else
    v_level := 'unknown'; v_reasons := jsonb_build_array('Datos insuficientes: faltan planes, rangos objetivo o mediciones recientes para alguna variable o contexto esperado.');
  end if;
  if (v_patient#>>'{initialAssessment,active}')::boolean
      and private.clinical_instant((v_patient#>>'{initialAssessment,evaluatedAt}')::timestamptz) <= v_now then
    v_initial := v_patient#>>'{initialAssessment,level}';
    if array_position(array['unknown','low','medium','high'],v_initial) > array_position(array['unknown','low','medium','high'],v_level) then
      v_level := v_initial;
      v_reasons := v_reasons || jsonb_build_array('Valoración inicial médica vigente ("' || v_initial || '") tiene mayor prioridad que el cálculo automático.');
    end if;
  end if;
  return jsonb_build_object('level',v_level,'ruleVersion','risk-rules-v2-hackathon-2026-09','reasons',v_reasons,
    'evaluatedAt',v_now,'inputsUsed',jsonb_build_object('measurementsConsidered',jsonb_array_length(v_measurements),
      'pendingTimeoutsLast7Days',v_timeouts,'urgentFlagActive',v_urgent,'initialAssessmentLevel',v_initial));
end;
$$;

create function private.clinical_adherence(p_unit uuid, p_patient uuid, p_now timestamptz) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with cohort as (
    select case when i.delivery_status = 'failed' then 'technical'
      when r.id is not null then case when r.taken then 'yes' else 'no' end
      when i.delivery_status in ('blocked_window','blocked_template','unknown') then 'technical'
      when private.clinical_instant(i.delivered_at) <= private.clinical_instant(p_now)
        and private.clinical_instant(i.response_deadline_at) <= private.clinical_instant(p_now)
        and i.delivery_status in ('delivered','read') then 'unknown'
      else 'pending' end as outcome
    from public.bot_interactions i left join public.medication_responses r
      on r.unit_id = i.unit_id and r.patient_id = i.patient_id and r.interaction_id = i.id
        and private.clinical_instant(r.reported_at) <= private.clinical_instant(p_now)
    where i.unit_id = p_unit and i.patient_id = p_patient and i.kind = 'medication'
      and private.clinical_instant(i.scheduled_at) between private.clinical_instant(p_now) - interval '720 hours'
        and private.clinical_instant(p_now) and i.delivery_status <> 'cancelled'
  ), counts as (
    select count(*) filter(where outcome = 'yes') as y,count(*) filter(where outcome = 'no') as n,
      count(*) filter(where outcome = 'unknown') as u,count(*) filter(where outcome = 'technical') as t from cohort
  )
  select jsonb_build_object('y',y,'n',n,'u',u,'confirmedAdherencePct',round(100.0*y/nullif(y+n,0),1),
    'responseCoveragePct',round(100.0*(y+n)/nullif(y+n+u,0),1),'confirmedOverCohortPct',round(100.0*y/nullif(y+n+u,0),1),
    'technicalExclusionsCount',t,'hasData',y+n+u > 0) from counts;
$$;

create function private.clinical_recalculate(p_unit uuid, p_patient uuid, p_doctor uuid, p_now timestamptz,
  p_reason text, p_reopen boolean default true) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v_snapshot jsonb; v_previous jsonb; v_risk jsonb; v_adherence jsonb; v_id uuid; v_alert public.alerts;
  v_key text := 'high_risk:' || p_patient::text || ':risk-rules-v2-hackathon-2026-09';
begin
  v_snapshot := private.clinical_risk_snapshot(p_unit,p_patient,p_now);
  v_risk := private.clinical_evaluate_risk(v_snapshot);
  v_adherence := private.clinical_adherence(p_unit,p_patient,p_now);
  insert into public.risk_assessments(unit_id,patient_id,assessed_at,level,rule_version,reasons,input_snapshot)
    values(p_unit,p_patient,p_now,v_risk->>'level',v_risk->>'ruleVersion',v_risk->'reasons',v_snapshot ||
      jsonb_build_object('adherence',v_adherence,'actorUserId',auth.uid(),'attributedDoctorId',p_doctor,'reason',p_reason)) returning id into v_id;
  select * into v_alert from public.alerts a where unit_id = p_unit and patient_id = p_patient and kind = 'high_risk'
    and (deduplication_key = v_key or detail->>'ruleVersion' = v_risk->>'ruleVersion'
      or exists(select 1 from public.risk_assessments r where r.id = a.risk_assessment_id
        and r.unit_id = p_unit and r.patient_id = p_patient and r.rule_version = v_risk->>'ruleVersion'))
    order by (status in ('open','acknowledged')) desc,updated_at desc,id limit 1 for update;
  select input_snapshot into v_previous from public.risk_assessments where id = v_alert.risk_assessment_id
    and unit_id = p_unit and patient_id = p_patient;
  if v_risk->>'level' = 'high' then
    if v_alert.id is null then
      insert into public.alerts(unit_id,patient_id,kind,severity,risk_assessment_id,deduplication_key,title,detail,attributed_doctor_id)
        values(p_unit,p_patient,'high_risk','critical',v_id,v_key,'Prioridad alta por reglas',jsonb_build_object('ruleVersion',v_risk->>'ruleVersion'),p_doctor);
    elsif v_alert.status in ('open','acknowledged') or (p_reopen and
        (v_previous - array['evaluatedAt','adherence','actorUserId','attributedDoctorId','reason']) is distinct from (v_snapshot - 'evaluatedAt')) then
      update public.alerts set status = case when status in ('open','acknowledged') then status else 'open' end,
        resolved_at = null,resolution_note = null,risk_assessment_id = v_id,attributed_doctor_id = p_doctor,
        detail = detail || jsonb_build_object('ruleVersion',v_risk->>'ruleVersion','recalculationReason',p_reason)
        where id = v_alert.id;
    end if;
  else
    update public.alerts a set status = 'resolved',resolved_at = p_now,resolution_note = p_reason,
      attributed_doctor_id = p_doctor,detail = detail || jsonb_build_object('resolvedByUserId',auth.uid(),'automatic',true)
      where unit_id = p_unit and patient_id = p_patient and kind = 'high_risk' and status in ('open','acknowledged')
        and (deduplication_key = v_key or detail->>'ruleVersion' = v_risk->>'ruleVersion'
          or exists(select 1 from public.risk_assessments r where r.id = a.risk_assessment_id
            and r.unit_id = p_unit and r.patient_id = p_patient and r.rule_version = v_risk->>'ruleVersion'));
  end if;
  return jsonb_build_object('riskAssessmentId',v_id,'risk',v_risk,'adherence',v_adherence);
end;
$$;

revoke all on function private.clinical_assert(boolean,text,text),private.clinical_actor(uuid,uuid,text),
  private.clinical_version_clock(),private.clinical_number(jsonb),private.clinical_instant(timestamptz),private.clinical_local_instant(timestamp,text),
  private.clinical_measurement_inputs(uuid,uuid,timestamptz),private.clinical_risk_snapshot(uuid,uuid,timestamptz),
  private.clinical_evaluate_risk(jsonb),private.clinical_adherence(uuid,uuid,timestamptz),
  private.clinical_recalculate(uuid,uuid,uuid,timestamptz,text,boolean) from public,anon,authenticated,service_role;
commit;
