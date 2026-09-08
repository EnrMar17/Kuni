-- Persona C. Proposed SQL transport signatures are documented in docs/documentacionC.md.
-- Always invoke with the clinician's Auth session, never a substituted system actor.
begin;

create function private.clinical_review_measurement(p_unit uuid, p_patient uuid, p_measurement uuid,
  p_doctor uuid, p_now timestamptz, p_reason text) returns void
language plpgsql security invoker set search_path = '' as $$
declare v_components jsonb; v_result jsonb; v_known boolean; v_alert public.alerts;
  v_key text := 'measurement_out_of_range:' || p_patient::text || ':' || p_measurement::text || ':risk-rules-v2-hackathon-2026-09';
begin
  select components into v_components from private.clinical_measurement_inputs(p_unit,p_patient,p_now)
    where measurement_id = p_measurement;
  v_components := coalesce(v_components,'[]'::jsonb);
  v_result := private.clinical_evaluate_risk(jsonb_build_object('evaluatedAt',p_now,
    'patient',jsonb_build_object('urgentFlagActive',false,'monitoringRequirements','[]'::jsonb),
    'measurements',v_components,'timeouts','[]'::jsonb));
  select count(*) > 0 and bool_and(
      (private.clinical_bound(m#>'{thresholds,targetMin}') is not null
        or private.clinical_bound(m#>'{thresholds,targetMax}') is not null)
      and not exists(select 1 from jsonb_each(coalesce(nullif(m->'thresholds','null'::jsonb),'{}'::jsonb)) t
        where jsonb_typeof(t.value) not in ('number','null')))
    into v_known from jsonb_array_elements(v_components) m;
  -- Review all active alerts linked to this evidence. Unknown rules require a human.
  update public.alerts set detail = detail || jsonb_build_object('correctionReviewedAt',p_now,
    'correctionReason',p_reason,'reviewRequired',not v_known or kind not in ('measurement_out_of_range','high_risk')),
    attributed_doctor_id = p_doctor
    where unit_id = p_unit and patient_id = p_patient and measurement_id = p_measurement
      and status in ('open','acknowledged');
  if v_known then
    update public.alerts set status = 'resolved',resolved_at = p_now,resolution_note = p_reason,
      attributed_doctor_id = p_doctor,detail = detail || jsonb_build_object('resolvedByUserId',auth.uid(),
        'automatic',true,'resolutionCause','corrected_measurement_no_longer_triggers_rule')
      where unit_id = p_unit and patient_id = p_patient and measurement_id = p_measurement
        and status in ('open','acknowledged')
        and ((kind = 'measurement_out_of_range' and v_result->>'level' = 'unknown')
          or (kind = 'high_risk' and v_result->>'level' <> 'high'));
  end if;
  if v_result->>'level' in ('medium','high') then
    select * into v_alert from public.alerts where unit_id = p_unit and patient_id = p_patient
      and kind = 'measurement_out_of_range' and measurement_id = p_measurement
      and (status in ('open','acknowledged') or deduplication_key = v_key)
      order by (status in ('open','acknowledged')) desc,created_at,id limit 1 for update;
    if v_alert.id is null then
      insert into public.alerts(unit_id,patient_id,kind,severity,measurement_id,deduplication_key,title,detail,attributed_doctor_id)
        values(p_unit,p_patient,'measurement_out_of_range',case when v_result->>'level' = 'high' then 'critical' else 'warning' end,
          p_measurement,v_key,'Medicion fuera de limites personalizados',
          jsonb_build_object('ruleVersion',v_result->>'ruleVersion','correctionReason',p_reason),p_doctor);
    else
      update public.alerts set status = case when status in ('open','acknowledged') then status else 'open' end,
        severity = case when v_result->>'level' = 'high' then 'critical' else 'warning' end,
        resolved_at = null,resolution_note = null,attributed_doctor_id = p_doctor,
        detail = detail || jsonb_build_object('ruleVersion',v_result->>'ruleVersion','correctionReason',p_reason)
        where id = v_alert.id and unit_id = p_unit and patient_id = p_patient;
    end if;
  end if;
end;
$$;

create function public.correct_measurement(p_patient_id uuid, p_measurement_id uuid,
  p_expected_updated_at timestamptz, p_input jsonb, p_reason text, p_doctor_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_unit uuid; v_row public.measurements; v_now timestamptz; v_observed timestamptz; v_derived jsonb;
begin
  v_unit := private.clinical_actor(p_patient_id,p_doctor_id);
  perform private.clinical_reason(p_reason);
  select * into v_row from public.measurements where id = p_measurement_id
    and unit_id = v_unit and patient_id = p_patient_id for update;
  if not found then raise exception using errcode = 'PT403', message = 'FORBIDDEN'; end if;
  if p_expected_updated_at is null or p_expected_updated_at is distinct from v_row.updated_at then
    raise exception using errcode = 'PT409', message = 'CONFLICT', detail = 'La medicion cambio; recargar antes de corregir.';
  end if;
  if v_row.voided_at is not null then
    raise exception using errcode = 'PT409', message = 'CONFLICT', detail = 'La medicion esta anulada.';
  end if;
  -- Linked identifiers stay immutable; verify their tenant and clinical meaning.
  if v_row.interaction_id is not null then
    perform 1 from public.bot_interactions where id = v_row.interaction_id and unit_id = v_unit
      and patient_id = p_patient_id and kind = 'measurement' and monitoring_plan_id = v_row.monitoring_plan_id for update;
    if not found then raise exception using errcode = 'PT403', message = 'FORBIDDEN'; end if;
  end if;
  if v_row.monitoring_plan_id is not null then
    perform 1 from public.monitoring_plans where id = v_row.monitoring_plan_id and unit_id = v_unit
      and patient_id = p_patient_id and kind = v_row.kind for share;
    if not found then raise exception using errcode = 'PT403', message = 'FORBIDDEN'; end if;
  end if;
  v_now := clock_timestamp();
  if jsonb_typeof(p_input) is distinct from 'object'
      or p_input->>'patientId' is distinct from p_patient_id::text
      or p_input->>'kind' is distinct from v_row.kind
      or jsonb_typeof(p_input->'observedAt') is distinct from 'string'
      or p_input->>'observedAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$' then
    raise exception using errcode = 'PT422', message = 'VALIDATION', detail = 'Medicion incompatible o fecha sin zona explicita.';
  end if;
  begin
    v_observed := (p_input->>'observedAt')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception using errcode = 'PT422', message = 'VALIDATION', detail = 'Fecha de medicion invalida.';
  end;
  if not isfinite(v_observed) or v_observed > v_now then
    raise exception using errcode = 'PT422', message = 'VALIDATION', detail = 'La medicion no puede ser futura.';
  end if;
  if v_row.kind = 'glucose' then
    if p_input - array['kind','patientId','observedAt','glucoseMgDl','context'] <> '{}'::jsonb
        or jsonb_typeof(p_input->'glucoseMgDl') is distinct from 'number'
        or (p_input->>'glucoseMgDl')::numeric not between 20 and 700
        or (p_input->>'context') is null or p_input->>'context' not in ('fasting','before_meal','after_meal','random','unspecified') then
      raise exception using errcode = 'PT422', message = 'VALIDATION', detail = 'Valor o contexto de glucosa invalido.';
    end if;
    update public.measurements set glucose_mg_dl = (p_input->>'glucoseMgDl')::numeric,
      measurement_context = p_input->>'context',measured_at = v_observed,
      correction_reason = p_reason,attributed_doctor_id = p_doctor_id where id = v_row.id returning * into v_row;
  else
    if p_input - array['kind','patientId','observedAt','systolicMmHg','diastolicMmHg'] <> '{}'::jsonb
        or jsonb_typeof(p_input->'systolicMmHg') is distinct from 'number'
        or jsonb_typeof(p_input->'diastolicMmHg') is distinct from 'number'
        or (p_input->>'systolicMmHg')::numeric not between 60 and 260
        or (p_input->>'diastolicMmHg')::numeric not between 30 and 180
        or (p_input->>'systolicMmHg')::numeric <= (p_input->>'diastolicMmHg')::numeric
        or trunc((p_input->>'systolicMmHg')::numeric) <> (p_input->>'systolicMmHg')::numeric
        or trunc((p_input->>'diastolicMmHg')::numeric) <> (p_input->>'diastolicMmHg')::numeric then
      raise exception using errcode = 'PT422', message = 'VALIDATION', detail = 'Presion fuera de los criterios de captura de validation.ts.';
    end if;
    update public.measurements set systolic_mm_hg = (p_input->>'systolicMmHg')::integer,
      diastolic_mm_hg = (p_input->>'diastolicMmHg')::integer,measured_at = v_observed,
      correction_reason = p_reason,attributed_doctor_id = p_doctor_id where id = v_row.id returning * into v_row;
  end if;
  perform private.clinical_review_measurement(v_unit,p_patient_id,v_row.id,p_doctor_id,v_now,p_reason);
  v_derived := private.clinical_recalculate(v_unit,p_patient_id,p_doctor_id,v_now,p_reason);
  return jsonb_build_object('data',jsonb_build_object('measurement',to_jsonb(v_row)) || v_derived,'error',null);
end;
$$;

create function public.correct_medication_response(p_patient_id uuid, p_response_id uuid,
  p_expected_updated_at timestamptz, p_schedule_id uuid, p_scheduled_at timestamptz,
  p_taken boolean, p_reason text, p_doctor_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_unit uuid; v_row public.medication_responses; v_interaction public.bot_interactions;
  v_prescription public.prescriptions; v_timezone text; v_local timestamp; v_matches uuid[]; v_now timestamptz;
begin
  v_unit := private.clinical_actor(p_patient_id,p_doctor_id);
  perform private.clinical_reason(p_reason);
  select * into v_row from public.medication_responses where id = p_response_id
    and unit_id = v_unit and patient_id = p_patient_id for update;
  if not found then raise exception using errcode = 'PT403', message = 'FORBIDDEN'; end if;
  if p_expected_updated_at is null or p_expected_updated_at is distinct from v_row.updated_at then
    raise exception using errcode = 'PT409', message = 'CONFLICT', detail = 'La respuesta cambio; recargar antes de corregir.';
  end if;
  if p_taken is null or p_schedule_id is null or p_scheduled_at is null or not isfinite(p_scheduled_at) then
    raise exception using errcode = 'PT422', message = 'VALIDATION', detail = 'Indicar resultado, horario y ocurrencia original.';
  end if;
  select * into v_interaction from public.bot_interactions where id = v_row.interaction_id
    and unit_id = v_unit and patient_id = p_patient_id and kind = 'medication' for update;
  if not found then raise exception using errcode = 'PT403', message = 'FORBIDDEN'; end if;
  select * into v_prescription from public.prescriptions where id = v_interaction.prescription_id
    and unit_id = v_unit and patient_id = p_patient_id for share;
  if not found then raise exception using errcode = 'PT403', message = 'FORBIDDEN'; end if;
  perform 1 from public.prescription_schedules where id = p_schedule_id and unit_id = v_unit
    and prescription_id = v_prescription.id for share;
  if not found then raise exception using errcode = 'PT403', message = 'FORBIDDEN'; end if;
  select timezone into v_timezone from public.health_units where id = v_unit;
  v_local := v_interaction.scheduled_at at time zone v_timezone;
  select array_agg(id order by id) into v_matches from public.prescription_schedules
    where unit_id = v_unit and prescription_id = v_prescription.id and local_time = v_local::time
      and extract(isodow from v_local)::smallint = any(weekdays);
  if p_scheduled_at is distinct from v_interaction.scheduled_at
      or coalesce(cardinality(v_matches),0) <> 1 or v_matches[1] is distinct from p_schedule_id
      or v_prescription.status = 'draft' or v_local::date < v_prescription.start_date
      or (v_prescription.end_date is not null and v_local::date > v_prescription.end_date) then
    raise exception using errcode = 'PT409', message = 'CONFLICT', detail = 'La toma original no se identifica sin ambiguedad.';
  end if;
  v_now := clock_timestamp();
  update public.medication_responses set taken = p_taken,correction_reason = p_reason,
    attributed_doctor_id = p_doctor_id where id = v_row.id returning * into v_row;
  -- Existing response evidence closes an obsolete pending alert, never its timeout history.
  update public.alerts set status = 'resolved',resolved_at = v_now,resolution_note = p_reason,
    attributed_doctor_id = p_doctor_id,detail = detail || jsonb_build_object('resolvedByUserId',auth.uid(),
      'automatic',true,'resolutionCause','existing_medication_response')
    where unit_id = v_unit and patient_id = p_patient_id and interaction_id = v_interaction.id
      and kind = 'no_response' and status in ('open','acknowledged') and v_row.reported_at <= v_now;
  return jsonb_build_object('data',jsonb_build_object('medicationResponse',to_jsonb(v_row)) ||
    private.clinical_recalculate(v_unit,p_patient_id,p_doctor_id,v_now,p_reason),'error',null);
end;
$$;

create function public.adjust_prescription(p_patient_id uuid, p_prescription_id uuid,
  p_expected_version integer, p_expected_updated_at timestamptz, p_input jsonb, p_reason text, p_doctor_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_unit uuid; v_old public.prescriptions; v_new public.prescriptions; v_now timestamptz;
  v_today date; v_end date; v_medication uuid; v_schedule jsonb; v_cancelled uuid[]; v_derived jsonb;
begin
  v_unit := private.clinical_actor(p_patient_id,p_doctor_id);
  perform private.clinical_reason(p_reason);
  select * into v_old from public.prescriptions where id = p_prescription_id
    and unit_id = v_unit and patient_id = p_patient_id for update;
  if not found then raise exception using errcode = 'PT403', message = 'FORBIDDEN'; end if;
  if p_expected_version is null or p_expected_version is distinct from v_old.version
      or p_expected_updated_at is null or p_expected_updated_at is distinct from v_old.updated_at or v_old.status <> 'active' then
    raise exception using errcode = 'PT409', message = 'CONFLICT', detail = 'La receta cambio o ya no esta activa.';
  end if;
  v_now := clock_timestamp();
  select (v_now at time zone timezone)::date into v_today from public.health_units where id = v_unit;
  if v_old.start_date > v_today or (v_old.end_date is not null and v_old.end_date < v_today) then
    raise exception using errcode = 'PT409', message = 'CONFLICT', detail = 'La receta no esta vigente hoy.';
  end if;
  if jsonb_typeof(p_input) is distinct from 'object'
      or p_input - array['patientId','medicationId','doseText','instructions','startsAt','endsAt','schedules','prescribedByDoctorId','previousPrescriptionId'] <> '{}'::jsonb
      or p_input->>'patientId' is distinct from p_patient_id::text
      or p_input->>'prescribedByDoctorId' is distinct from p_doctor_id::text
      or (p_input->>'previousPrescriptionId' is not null and p_input->>'previousPrescriptionId' <> p_prescription_id::text)
      or jsonb_typeof(p_input->'doseText') is distinct from 'string' or p_input->>'doseText' !~ '[^[:space:]]'
      or jsonb_typeof(p_input->'instructions') is distinct from 'string'
      or p_input->>'startsAt' is distinct from v_today::text
      or not (p_input ? 'endsAt') or jsonb_typeof(p_input->'schedules') is distinct from 'array' then
    raise exception using errcode = 'PT422', message = 'VALIDATION', detail = 'Receta incompatible. El ajuste debe iniciar hoy en la zona de la unidad.';
  end if;
  if jsonb_array_length(p_input->'schedules') = 0 or jsonb_array_length(p_input->'schedules') > 168 then
    raise exception using errcode = 'PT422', message = 'VALIDATION', detail = 'Indicar entre 1 y 168 pares dia/hora.';
  end if;
  begin
    v_medication := (p_input->>'medicationId')::uuid;
    if p_input->>'endsAt' is not null and p_input->>'endsAt' !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception using errcode = 'PT422', message = 'VALIDATION', detail = 'Fecha final invalida.';
    end if;
    v_end := (p_input->>'endsAt')::date;
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception using errcode = 'PT422', message = 'VALIDATION', detail = 'Medicamento o fecha final invalidos.';
  end;
  if v_end < v_today then raise exception using errcode = 'PT422', message = 'VALIDATION', detail = 'La fecha final precede al ajuste.'; end if;
  perform 1 from public.medications where id = v_medication and unit_id = v_unit and active for share;
  if not found then raise exception using errcode = 'PT403', message = 'FORBIDDEN'; end if;
  for v_schedule in select value from jsonb_array_elements(p_input->'schedules') loop
    if jsonb_typeof(v_schedule) is distinct from 'object' or v_schedule - array['weekday','localTime'] <> '{}'::jsonb
        or jsonb_typeof(v_schedule->'weekday') is distinct from 'number'
        or v_schedule->>'weekday' not in ('1','2','3','4','5','6','7')
        or jsonb_typeof(v_schedule->'localTime') is distinct from 'string'
        or v_schedule->>'localTime' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      raise exception using errcode = 'PT422', message = 'VALIDATION', detail = 'Horario ISO invalido.';
    end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(p_input->'schedules') s
      group by s->>'weekday',s->>'localTime' having count(*) > 1) then
    raise exception using errcode = 'PT422', message = 'VALIDATION', detail = 'No duplicar una toma dia/hora.';
  end if;
  update public.prescriptions set status = 'superseded',change_reason = p_reason,
    attributed_doctor_id = p_doctor_id where id = v_old.id;
  insert into public.prescriptions(unit_id,patient_id,medication_id,series_id,version,supersedes_id,
    dose_text,route,instructions,start_date,end_date,status,change_reason,attributed_doctor_id,created_at)
    values(v_unit,p_patient_id,v_medication,v_old.series_id,v_old.version+1,v_old.id,
      p_input->>'doseText',v_old.route,p_input->>'instructions',v_today,v_end,'draft',p_reason,p_doctor_id,v_now)
    returning * into v_new;
  insert into public.prescription_schedules(unit_id,prescription_id,local_time,weekdays)
    select v_unit,v_new.id,(s->>'localTime')::time,array_agg((s->>'weekday')::smallint order by (s->>'weekday')::smallint)
      from jsonb_array_elements(p_input->'schedules') s group by s->>'localTime';
  update public.prescriptions set status = 'active' where id = v_new.id returning * into v_new;
  -- Exclude all claimed/attempted/accepted/delivered/ambiguous sends, even if
  -- a callback accidentally put the row back into a queue-like state.
  with candidates as materialized (
    select i.id,to_jsonb(i) as old_data from public.bot_interactions i
      where i.unit_id = v_unit and i.patient_id = p_patient_id and i.prescription_id = v_old.id
      and i.scheduled_at > v_now and i.delivery_status in ('queued','blocked_window','blocked_template')
      and i.attempt_count = 0 and i.claimed_at is null and i.accepted_at is null and i.delivered_at is null
      and i.read_at is null and i.provider_message_id is null and i.response_at is null and i.timeout_at is null
      and not exists(select 1 from public.medication_responses r where r.unit_id = v_unit and r.interaction_id = i.id)
      for update of i
  ), cancelled as (
    update public.bot_interactions i set delivery_status = 'cancelled',failure_code = 'prescription_superseded',failure_detail = p_reason
      from candidates c where i.id = c.id returning i.*,c.old_data
  ), audited as (
    -- bot_interactions has no clinical_audit trigger in 0001. Record this manual
    -- cancellation explicitly using the same audit table and actual Auth actor.
    insert into public.audit_log(unit_id,entity_table,entity_id,action,actor_user_id,attributed_doctor_id,old_data,new_data)
      select unit_id,'bot_interactions',id,'UPDATE',auth.uid(),p_doctor_id,old_data,to_jsonb(c) - 'old_data'
      from cancelled c returning id
  ) select coalesce(array_agg(id order by id),array[]::uuid[]) into v_cancelled from cancelled;
  v_derived := private.clinical_recalculate(v_unit,p_patient_id,p_doctor_id,v_now,p_reason);
  return jsonb_build_object('data',jsonb_build_object('prescription',to_jsonb(v_new),
    'cancelledInteractionIds',to_jsonb(v_cancelled)) || v_derived,'error',null);
end;
$$;

create function public.mark_urgent(p_patient_id uuid, p_event_id uuid, p_reason text, p_doctor_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_unit uuid; v_alert public.alerts; v_now timestamptz; v_key text;
begin
  v_unit := private.clinical_actor(p_patient_id,p_doctor_id);
  perform private.clinical_reason(p_reason);
  if p_event_id is null then raise exception using errcode = 'PT422', message = 'VALIDATION', detail = 'Indicar un ID estable para este evento.'; end if;
  v_now := clock_timestamp();
  v_key := 'urgent_followup:' || p_patient_id::text || ':' || p_event_id::text;
  select * into v_alert from public.alerts where unit_id = v_unit and patient_id = p_patient_id
    and kind = 'urgent_followup' and (deduplication_key = v_key
      or detail->'eventIds' @> jsonb_build_array(p_event_id) or status in ('open','acknowledged'))
    order by (deduplication_key = v_key or coalesce(detail->'eventIds' @> jsonb_build_array(p_event_id),false)) desc,
      created_at,id limit 1 for update;
  if v_alert.id is null then
    insert into public.alerts(unit_id,patient_id,kind,severity,deduplication_key,title,detail,attributed_doctor_id)
      values(v_unit,p_patient_id,'urgent_followup','critical',v_key,'Citar a Urgencias',
        jsonb_build_object('eventId',p_event_id,'eventIds',jsonb_build_array(p_event_id),'reason',p_reason,'markedAt',v_now,'markedByUserId',auth.uid(),
          'responsibleDoctorId',p_doctor_id,'localActionOnly',true),p_doctor_id) returning * into v_alert;
  elsif v_alert.deduplication_key <> v_key and not coalesce(v_alert.detail->'eventIds' @> jsonb_build_array(p_event_id),false) then
    -- Retain aliases so a retried, coalesced request cannot resurrect a closed flag.
    update public.alerts set attributed_doctor_id = p_doctor_id,detail = detail || jsonb_build_object(
      'eventIds',coalesce(detail->'eventIds','[]'::jsonb) || jsonb_build_array(p_event_id),
      'lastRequestReason',p_reason,'lastRequestByUserId',auth.uid(),'lastRequestDoctorId',p_doctor_id,'lastRequestAt',v_now)
      where id = v_alert.id returning * into v_alert;
  end if;
  return jsonb_build_object('data',jsonb_build_object('alert',to_jsonb(v_alert)) ||
    private.clinical_recalculate(v_unit,p_patient_id,p_doctor_id,v_now,p_reason,false),'error',null);
end;
$$;

create function public.resolve_alert(p_patient_id uuid, p_alert_id uuid, p_expected_updated_at timestamptz,
  p_next_status text, p_reason text, p_doctor_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_unit uuid; v_alert public.alerts; v_now timestamptz; v_derived jsonb;
begin
  v_unit := private.clinical_actor(p_patient_id,p_doctor_id);
  perform private.clinical_reason(p_reason);
  select * into v_alert from public.alerts where id = p_alert_id and unit_id = v_unit and patient_id = p_patient_id for update;
  if not found then raise exception using errcode = 'PT403', message = 'FORBIDDEN'; end if;
  if p_expected_updated_at is null or p_expected_updated_at is distinct from v_alert.updated_at
      or v_alert.status not in ('open','acknowledged') then
    raise exception using errcode = 'PT409', message = 'CONFLICT', detail = 'La alerta cambio o ya fue cerrada.';
  end if;
  if p_next_status is null or p_next_status not in ('acknowledged','resolved','dismissed') then
    raise exception using errcode = 'PT422', message = 'VALIDATION', detail = 'Estado de atencion invalido.';
  end if;
  if v_alert.interaction_id is not null then
    perform 1 from public.bot_interactions where id = v_alert.interaction_id and unit_id = v_unit and patient_id = p_patient_id for share;
    if not found then raise exception using errcode = 'PT403', message = 'FORBIDDEN'; end if;
  end if;
  if v_alert.measurement_id is not null then
    perform 1 from public.measurements where id = v_alert.measurement_id and unit_id = v_unit and patient_id = p_patient_id for share;
    if not found then raise exception using errcode = 'PT403', message = 'FORBIDDEN'; end if;
  end if;
  if v_alert.risk_assessment_id is not null then
    perform 1 from public.risk_assessments where id = v_alert.risk_assessment_id and unit_id = v_unit and patient_id = p_patient_id for share;
    if not found then raise exception using errcode = 'PT403', message = 'FORBIDDEN'; end if;
  end if;
  v_now := clock_timestamp();
  update public.alerts set status = p_next_status,resolution_note = p_reason,
    resolved_at = case when p_next_status in ('resolved','dismissed') then v_now else null end,
    attributed_doctor_id = p_doctor_id,
    detail = detail || case when p_next_status = 'acknowledged'
      then jsonb_build_object('acknowledgedByUserId',auth.uid(),'acknowledgedAt',v_now)
      else jsonb_build_object('resolvedByUserId',auth.uid(),'resolutionReason',p_reason) end
    where id = v_alert.id returning * into v_alert;
  -- Attending an alert does not erase the measurement or override the risk.
  -- A closed high-risk alert is not reopened in the very operation that closes it.
  v_derived := private.clinical_recalculate(v_unit,p_patient_id,p_doctor_id,v_now,p_reason,false);
  -- Recalculation can update this same high-risk alert. Return its final token.
  select * into v_alert from public.alerts where id = p_alert_id and unit_id = v_unit and patient_id = p_patient_id;
  return jsonb_build_object('data',jsonb_build_object('alert',to_jsonb(v_alert)) || v_derived,'error',null);
end;
$$;

revoke all on function private.clinical_review_measurement(uuid,uuid,uuid,uuid,timestamptz,text)
  from public,anon,authenticated,service_role;
revoke all on function public.correct_measurement(uuid,uuid,timestamptz,jsonb,text,uuid),
  public.correct_medication_response(uuid,uuid,timestamptz,uuid,timestamptz,boolean,text,uuid),
  public.adjust_prescription(uuid,uuid,integer,timestamptz,jsonb,text,uuid),
  public.mark_urgent(uuid,uuid,text,uuid),public.resolve_alert(uuid,uuid,timestamptz,text,text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.correct_measurement(uuid,uuid,timestamptz,jsonb,text,uuid),
  public.correct_medication_response(uuid,uuid,timestamptz,uuid,timestamptz,boolean,text,uuid),
  public.adjust_prescription(uuid,uuid,integer,timestamptz,jsonb,text,uuid),
  public.mark_urgent(uuid,uuid,text,uuid),public.resolve_alert(uuid,uuid,timestamptz,text,text,uuid)
  to authenticated;

commit;
