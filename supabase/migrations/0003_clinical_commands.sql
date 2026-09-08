-- Persona C. Transport proposal and integration boundaries: docs/documentacionC.md.
begin;

create function private.clinical_review_measurement(p_unit uuid, p_patient uuid, p_measurement uuid,
  p_doctor uuid, p_now timestamptz, p_reason text) returns void
language plpgsql security invoker set search_path = '' as $$
declare v_components jsonb; v_result jsonb; v_known boolean; v_alert public.alerts;
  v_key text := 'measurement_out_of_range:' || p_patient::text || ':' || p_measurement::text || ':risk-rules-v2-hackathon-2026-09';
begin
  select components into v_components from private.clinical_measurement_inputs(p_unit,p_patient,p_now) where measurement_id = p_measurement;
  v_components := coalesce(v_components,'[]'::jsonb);
  v_result := private.clinical_evaluate_risk(jsonb_build_object('evaluatedAt',p_now,
    'patient',jsonb_build_object('urgentFlagActive',false,'monitoringRequirements','[]'::jsonb),
    'measurements',v_components,'timeouts','[]'::jsonb));
  select count(*) > 0 and bool_and(
    (private.clinical_number(m#>'{thresholds,targetMin}') is not null or private.clinical_number(m#>'{thresholds,targetMax}') is not null)
    and not exists(select 1 from jsonb_each(coalesce(nullif(m->'thresholds','null'::jsonb),'{}'::jsonb)) t
      where jsonb_typeof(t.value) not in ('number','null'))) into v_known from jsonb_array_elements(v_components) m;
  update public.alerts set attributed_doctor_id = p_doctor,detail = detail || jsonb_build_object(
    'correctionReviewedAt',p_now,'correctionReason',p_reason,'reviewRequired',not v_known or kind not in ('measurement_out_of_range','high_risk'))
    where unit_id = p_unit and patient_id = p_patient and measurement_id = p_measurement and status in ('open','acknowledged');
  if v_known then
    update public.alerts set status = 'resolved',resolved_at = p_now,resolution_note = p_reason,attributed_doctor_id = p_doctor,
      detail = detail || jsonb_build_object('resolvedByUserId',auth.uid(),'automatic',true,'resolutionCause','corrected_measurement')
      where unit_id = p_unit and patient_id = p_patient and measurement_id = p_measurement and status in ('open','acknowledged')
        and ((kind = 'measurement_out_of_range' and v_result->>'level' = 'unknown') or (kind = 'high_risk' and v_result->>'level' <> 'high'));
  end if;
  if v_result->>'level' in ('medium','high') then
    select * into v_alert from public.alerts where unit_id = p_unit and patient_id = p_patient
      and kind = 'measurement_out_of_range' and measurement_id = p_measurement
      and (status in ('open','acknowledged') or deduplication_key = v_key)
      order by (status in ('open','acknowledged')) desc,created_at,id limit 1 for update;
    if v_alert.id is null then
      insert into public.alerts(unit_id,patient_id,kind,severity,measurement_id,deduplication_key,title,detail,attributed_doctor_id)
        values(p_unit,p_patient,'measurement_out_of_range',case when v_result->>'level' = 'high' then 'critical' else 'warning' end,
          p_measurement,v_key,'Medicion fuera de limites personalizados',jsonb_build_object('ruleVersion',v_result->>'ruleVersion','correctionReason',p_reason),p_doctor);
    else
      update public.alerts set status = case when status in ('open','acknowledged') then status else 'open' end,
        severity = case when v_result->>'level' = 'high' then 'critical' else 'warning' end,
        resolved_at = null,resolution_note = null,attributed_doctor_id = p_doctor,
        detail = detail || jsonb_build_object('ruleVersion',v_result->>'ruleVersion','correctionReason',p_reason) where id = v_alert.id;
    end if;
  end if;
end;
$$;

create function public.correct_measurement(p_patient_id uuid, p_measurement_id uuid, p_expected_updated_at timestamptz,
  p_input jsonb, p_reason text, p_doctor_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_unit uuid; v_row public.measurements; v_now timestamptz; v_observed timestamptz; v_derived jsonb;
  v_glucose numeric; v_systolic numeric; v_diastolic numeric;
begin
  v_unit := private.clinical_actor(p_patient_id,p_doctor_id,p_reason);
  select * into v_row from public.measurements where id = p_measurement_id and unit_id = v_unit and patient_id = p_patient_id for update;
  perform private.clinical_assert(found,'PT403','Medicion no disponible para el paciente.');
  perform private.clinical_assert(p_expected_updated_at = v_row.updated_at and v_row.voided_at is null,'PT409','La medicion cambio o fue anulada. Recargar antes de corregir.');
  if v_row.interaction_id is not null then
    perform 1 from public.bot_interactions where id = v_row.interaction_id and unit_id = v_unit and patient_id = p_patient_id
      and kind = 'measurement' and monitoring_plan_id = v_row.monitoring_plan_id for share;
    perform private.clinical_assert(found,'PT403','Interaccion incompatible con la medicion.');
  end if;
  if v_row.monitoring_plan_id is not null then
    perform 1 from public.monitoring_plans where id = v_row.monitoring_plan_id and unit_id = v_unit and patient_id = p_patient_id and kind = v_row.kind for share;
    perform private.clinical_assert(found,'PT403','Plan incompatible con la medicion.');
  end if;
  perform private.clinical_assert(jsonb_typeof(p_input) = 'object','PT422','Se requiere un objeto de medicion.');
  perform private.clinical_assert(p_input->>'patientId' = p_patient_id::text and p_input->>'kind' = v_row.kind
    and p_input->>'observedAt' ~ '^\d{4}-\d{2}-\d{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.\d+)?(Z|[+-]\d{2}:\d{2})$',
    'PT422','Paciente, variable o fecha ISO con zona invalidos.');
  v_now := clock_timestamp(); v_observed := (p_input->>'observedAt')::timestamptz;
  perform private.clinical_assert(isfinite(v_observed) and v_observed <= v_now,'PT422','La medicion no puede ser futura.');
  if v_row.kind = 'glucose' then
    v_glucose := private.clinical_number(p_input->'glucoseMgDl');
    perform private.clinical_assert(p_input - array['kind','patientId','observedAt','glucoseMgDl','context'] = '{}'::jsonb
      and v_glucose between 20 and 700 and p_input->>'context' in ('fasting','before_meal','after_meal','random','unspecified'),
      'PT422','Glucosa/contexto fuera de los criterios de captura de validation.ts.');
    update public.measurements set glucose_mg_dl = v_glucose,measurement_context = p_input->>'context',measured_at = v_observed,
      correction_reason = p_reason,attributed_doctor_id = p_doctor_id where id = v_row.id returning * into v_row;
  else
    v_systolic := private.clinical_number(p_input->'systolicMmhg'); v_diastolic := private.clinical_number(p_input->'diastolicMmhg');
    perform private.clinical_assert(p_input - array['kind','patientId','observedAt','systolicMmhg','diastolicMmhg'] = '{}'::jsonb
      and v_systolic between 60 and 260 and v_diastolic between 30 and 180 and v_systolic > v_diastolic
      and trunc(v_systolic) = v_systolic and trunc(v_diastolic) = v_diastolic,'PT422','Presion fuera de los criterios de captura de validation.ts.');
    update public.measurements set systolic_mm_hg = v_systolic::integer,diastolic_mm_hg = v_diastolic::integer,measured_at = v_observed,
      correction_reason = p_reason,attributed_doctor_id = p_doctor_id where id = v_row.id returning * into v_row;
  end if;
  perform private.clinical_review_measurement(v_unit,p_patient_id,v_row.id,p_doctor_id,v_now,p_reason);
  v_derived := private.clinical_recalculate(v_unit,p_patient_id,p_doctor_id,v_now,p_reason);
  return jsonb_build_object('data',jsonb_build_object('measurement',to_jsonb(v_row)) || v_derived,'error',null);
exception when invalid_datetime_format or datetime_field_overflow then
  raise exception using errcode = 'PT422', message = 'VALIDATION', detail = 'Fecha de medicion invalida.';
end;
$$;

create function public.correct_medication_response(p_patient_id uuid, p_response_id uuid, p_expected_updated_at timestamptz,
  p_schedule_id uuid, p_scheduled_at timestamptz, p_taken boolean, p_reason text, p_doctor_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_unit uuid; v_row public.medication_responses; v_interaction public.bot_interactions; v_prescription public.prescriptions;
  v_zone text; v_local timestamp; v_matches uuid[]; v_now timestamptz;
begin
  v_unit := private.clinical_actor(p_patient_id,p_doctor_id,p_reason);
  select * into v_row from public.medication_responses where id = p_response_id and unit_id = v_unit and patient_id = p_patient_id for update;
  perform private.clinical_assert(found,'PT403','Respuesta no disponible para el paciente.');
  perform private.clinical_assert(p_expected_updated_at = v_row.updated_at,'PT409','La respuesta cambio; recargar antes de corregir.');
  perform private.clinical_assert(p_taken is not null and p_schedule_id is not null and p_scheduled_at is not null
    and isfinite(p_scheduled_at),'PT422','Indicar resultado, horario e instante original.');
  select * into v_interaction from public.bot_interactions where id = v_row.interaction_id and unit_id = v_unit
    and patient_id = p_patient_id and kind = 'medication' for share;
  perform private.clinical_assert(found,'PT403','Interaccion incompatible.');
  select * into v_prescription from public.prescriptions where id = v_interaction.prescription_id and unit_id = v_unit and patient_id = p_patient_id for share;
  perform private.clinical_assert(found,'PT403','Receta incompatible.');
  perform 1 from public.prescription_schedules where id = p_schedule_id and unit_id = v_unit and prescription_id = v_prescription.id for share;
  perform private.clinical_assert(found,'PT403','El horario no pertenece a la receta original.');
  select timezone into v_zone from public.health_units where id = v_unit;
  v_local := v_interaction.scheduled_at at time zone v_zone;
  select array_agg(id order by id) into v_matches from public.prescription_schedules where unit_id = v_unit
    and prescription_id = v_prescription.id and local_time = v_local::time and extract(isodow from v_local)::smallint = any(weekdays);
  perform private.clinical_assert(p_scheduled_at = v_interaction.scheduled_at and cardinality(v_matches) = 1 and v_matches[1] = p_schedule_id
    and v_prescription.status <> 'draft' and v_local::date >= v_prescription.start_date
    and (v_prescription.end_date is null or v_local::date <= v_prescription.end_date),'PT409','La toma original no se identifica sin ambiguedad.');
  v_now := clock_timestamp();
  update public.medication_responses set taken = p_taken,correction_reason = p_reason,attributed_doctor_id = p_doctor_id
    where id = v_row.id returning * into v_row;
  update public.alerts set status = 'resolved',resolved_at = v_now,resolution_note = p_reason,attributed_doctor_id = p_doctor_id,
    detail = detail || jsonb_build_object('resolvedByUserId',auth.uid(),'automatic',true,'resolutionCause','existing_medication_response')
    where unit_id = v_unit and patient_id = p_patient_id and interaction_id = v_interaction.id and kind = 'no_response'
      and status in ('open','acknowledged') and private.clinical_instant(v_row.reported_at) <= private.clinical_instant(v_now);
  return jsonb_build_object('data',jsonb_build_object('medicationResponse',to_jsonb(v_row)) ||
    private.clinical_recalculate(v_unit,p_patient_id,p_doctor_id,v_now,p_reason),'error',null);
end;
$$;

create function public.adjust_prescription(p_patient_id uuid, p_prescription_id uuid, p_expected_version integer,
  p_expected_updated_at timestamptz, p_input jsonb, p_reason text, p_doctor_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_unit uuid; v_old public.prescriptions; v_new public.prescriptions; v_now timestamptz; v_today date; v_end date;
  v_medication uuid; v_schedule jsonb; v_cancelled uuid[]; v_derived jsonb;
begin
  v_unit := private.clinical_actor(p_patient_id,p_doctor_id,p_reason);
  select * into v_old from public.prescriptions where id = p_prescription_id and unit_id = v_unit and patient_id = p_patient_id for update;
  perform private.clinical_assert(found,'PT403','Receta no disponible para el paciente.');
  perform private.clinical_assert(p_expected_version = v_old.version and p_expected_updated_at = v_old.updated_at and v_old.status = 'active',
    'PT409','La receta cambio o ya no esta activa.');
  v_now := clock_timestamp();
  select (v_now at time zone timezone)::date into v_today from public.health_units where id = v_unit;
  perform private.clinical_assert(v_old.start_date <= v_today and (v_old.end_date is null or v_old.end_date >= v_today),'PT409','La receta no esta vigente hoy.');
  perform private.clinical_assert(jsonb_typeof(p_input) = 'object','PT422','Se requiere un objeto de receta.');
  perform private.clinical_assert(p_input - array['patientId','medicationId','doseText','instructions','startsAt','endsAt','schedules','prescribedByDoctorId','previousPrescriptionId'] = '{}'::jsonb
    and p_input->>'patientId' = p_patient_id::text and p_input->>'prescribedByDoctorId' = p_doctor_id::text
    and (p_input->>'previousPrescriptionId' is null or p_input->>'previousPrescriptionId' = p_prescription_id::text)
    and jsonb_typeof(p_input->'doseText') = 'string' and p_input->>'doseText' ~ '[^[:space:]]'
    and jsonb_typeof(p_input->'instructions') = 'string' and p_input->>'startsAt' = v_today::text
    and p_input ? 'endsAt' and jsonb_typeof(p_input->'schedules') = 'array','PT422','Receta incompatible: el ajuste debe iniciar hoy en la zona de la unidad.');
  perform private.clinical_assert(jsonb_array_length(p_input->'schedules') between 1 and 168,'PT422','Indicar entre 1 y 168 pares dia/hora.');
  v_medication := (p_input->>'medicationId')::uuid;
  perform private.clinical_assert(p_input->>'endsAt' is null or p_input->>'endsAt' ~ '^\d{4}-\d{2}-\d{2}$','PT422','Fecha final invalida.');
  v_end := (p_input->>'endsAt')::date;
  perform private.clinical_assert(v_end is null or v_end >= v_today,'PT422','La fecha final precede al ajuste.');
  perform 1 from public.medications where id = v_medication and unit_id = v_unit and active for share;
  perform private.clinical_assert(found,'PT403','Medicamento no disponible en la unidad.');
  for v_schedule in select value from jsonb_array_elements(p_input->'schedules') loop
    perform private.clinical_assert(jsonb_typeof(v_schedule) = 'object','PT422','Horario invalido.');
    perform private.clinical_assert(v_schedule - array['weekday','localTime'] = '{}'::jsonb
      and jsonb_typeof(v_schedule->'weekday') = 'number' and v_schedule->>'weekday' in ('1','2','3','4','5','6','7')
      and jsonb_typeof(v_schedule->'localTime') = 'string' and v_schedule->>'localTime' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$',
      'PT422','Indicar dia ISO 1-7 y hora HH:mm.');
  end loop;
  perform private.clinical_assert(not exists(select 1 from jsonb_array_elements(p_input->'schedules') s
    group by s->>'weekday',s->>'localTime' having count(*) > 1),'PT422','No duplicar una toma dia/hora.');
  update public.prescriptions set status = 'superseded',change_reason = p_reason,attributed_doctor_id = p_doctor_id where id = v_old.id;
  insert into public.prescriptions(unit_id,patient_id,medication_id,series_id,version,supersedes_id,dose_text,route,instructions,
    start_date,end_date,status,change_reason,attributed_doctor_id,created_at)
    values(v_unit,p_patient_id,v_medication,v_old.series_id,v_old.version+1,v_old.id,p_input->>'doseText',v_old.route,
      p_input->>'instructions',v_today,v_end,'draft',p_reason,p_doctor_id,v_now) returning * into v_new;
  insert into public.prescription_schedules(unit_id,prescription_id,local_time,weekdays)
    select v_unit,v_new.id,(s->>'localTime')::time,array_agg((s->>'weekday')::smallint order by (s->>'weekday')::smallint)
      from jsonb_array_elements(p_input->'schedules') s group by s->>'localTime';
  update public.prescriptions set status = 'active' where id = v_new.id returning * into v_new;
  -- Never modify claimed, attempted or externally accepted/ambiguous sends.
  with candidates as materialized (
    select i.id,to_jsonb(i) as old_data from public.bot_interactions i where i.unit_id = v_unit and i.patient_id = p_patient_id
      and i.prescription_id = v_old.id and i.scheduled_at > v_now and i.delivery_status in ('queued','blocked_window','blocked_template')
      and i.attempt_count = 0 and i.claimed_at is null and i.accepted_at is null and i.delivered_at is null and i.read_at is null
      and i.provider_message_id is null and i.response_at is null and i.timeout_at is null
      and not exists(select 1 from public.medication_responses r where r.unit_id = v_unit and r.interaction_id = i.id) for update of i
  ), cancelled as (
    update public.bot_interactions i set delivery_status = 'cancelled',failure_code = 'prescription_superseded',failure_detail = p_reason
      from candidates c where i.id = c.id returning i.*,c.old_data
  ), audited as (
    -- No clinical audit trigger exists on this table in the base migration.
    insert into public.audit_log(unit_id,entity_table,entity_id,action,actor_user_id,attributed_doctor_id,old_data,new_data)
      select unit_id,'bot_interactions',id,'UPDATE',auth.uid(),p_doctor_id,old_data,to_jsonb(c) - 'old_data' from cancelled c returning id
  ) select coalesce(array_agg(id order by id),array[]::uuid[]) into v_cancelled from cancelled;
  v_derived := private.clinical_recalculate(v_unit,p_patient_id,p_doctor_id,v_now,p_reason);
  return jsonb_build_object('data',jsonb_build_object('prescription',to_jsonb(v_new),'cancelledInteractionIds',to_jsonb(v_cancelled)) || v_derived,'error',null);
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
  raise exception using errcode = 'PT422', message = 'VALIDATION', detail = 'Medicamento o fecha final invalidos.';
end;
$$;

create function public.mark_urgent(p_patient_id uuid, p_event_id uuid, p_reason text, p_doctor_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_unit uuid; v_alert public.alerts; v_now timestamptz; v_key text;
begin
  v_unit := private.clinical_actor(p_patient_id,p_doctor_id,p_reason);
  perform private.clinical_assert(p_event_id is not null,'PT422','Se requiere un ID estable del evento.');
  v_now := clock_timestamp(); v_key := 'urgent_followup:' || p_patient_id::text || ':' || p_event_id::text;
  select * into v_alert from public.alerts where unit_id = v_unit and patient_id = p_patient_id and kind = 'urgent_followup'
    and (deduplication_key = v_key or detail->'eventIds' @> jsonb_build_array(p_event_id) or status in ('open','acknowledged'))
    order by (deduplication_key = v_key or coalesce(detail->'eventIds' @> jsonb_build_array(p_event_id),false)) desc,created_at,id limit 1 for update;
  if v_alert.id is null then
    insert into public.alerts(unit_id,patient_id,kind,severity,deduplication_key,title,detail,attributed_doctor_id)
      values(v_unit,p_patient_id,'urgent_followup','critical',v_key,'Citar a Urgencias',jsonb_build_object(
        'eventId',p_event_id,'eventIds',jsonb_build_array(p_event_id),'reason',p_reason,'markedAt',v_now,'markedByUserId',auth.uid(),
        'responsibleDoctorId',p_doctor_id,'localActionOnly',true),p_doctor_id) returning * into v_alert;
  elsif v_alert.deduplication_key <> v_key and not coalesce(v_alert.detail->'eventIds' @> jsonb_build_array(p_event_id),false) then
    -- Remember coalesced events: their retries must not resurrect a closed flag.
    update public.alerts set attributed_doctor_id = p_doctor_id,detail = detail || jsonb_build_object(
      'eventIds',coalesce(detail->'eventIds','[]'::jsonb) || jsonb_build_array(p_event_id),'lastRequestReason',p_reason,
      'lastRequestByUserId',auth.uid(),'lastRequestDoctorId',p_doctor_id,'lastRequestAt',v_now) where id = v_alert.id returning * into v_alert;
  end if;
  return jsonb_build_object('data',jsonb_build_object('alert',to_jsonb(v_alert)) ||
    private.clinical_recalculate(v_unit,p_patient_id,p_doctor_id,v_now,p_reason,false),'error',null);
end;
$$;

create function public.resolve_alert(p_patient_id uuid, p_alert_id uuid, p_expected_updated_at timestamptz,
  p_next_status text, p_reason text, p_doctor_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_unit uuid; v_alert public.alerts; v_now timestamptz; v_derived jsonb;
begin
  v_unit := private.clinical_actor(p_patient_id,p_doctor_id,p_reason);
  select * into v_alert from public.alerts where id = p_alert_id and unit_id = v_unit and patient_id = p_patient_id for update;
  perform private.clinical_assert(found,'PT403','Alerta no disponible para el paciente.');
  perform private.clinical_assert(p_expected_updated_at = v_alert.updated_at and v_alert.status in ('open','acknowledged'),
    'PT409','La alerta cambio o ya fue cerrada.');
  perform private.clinical_assert(p_next_status in ('acknowledged','resolved','dismissed'),'PT422','Estado de atencion invalido.');
  if v_alert.interaction_id is not null then
    perform 1 from public.bot_interactions where id = v_alert.interaction_id and unit_id = v_unit and patient_id = p_patient_id for share;
    perform private.clinical_assert(found,'PT403','Interaccion incompatible.');
  end if;
  if v_alert.measurement_id is not null then
    perform 1 from public.measurements where id = v_alert.measurement_id and unit_id = v_unit and patient_id = p_patient_id for share;
    perform private.clinical_assert(found,'PT403','Medicion incompatible.');
  end if;
  if v_alert.risk_assessment_id is not null then
    perform 1 from public.risk_assessments where id = v_alert.risk_assessment_id and unit_id = v_unit and patient_id = p_patient_id for share;
    perform private.clinical_assert(found,'PT403','Evaluacion incompatible.');
  end if;
  v_now := clock_timestamp();
  update public.alerts set status = p_next_status,resolution_note = p_reason,attributed_doctor_id = p_doctor_id,
    resolved_at = case when p_next_status in ('resolved','dismissed') then v_now else null end,
    detail = detail || case when p_next_status = 'acknowledged'
      then jsonb_build_object('acknowledgedByUserId',auth.uid(),'acknowledgedAt',v_now)
      else jsonb_build_object('resolvedByUserId',auth.uid(),'resolutionReason',p_reason) end where id = v_alert.id;
  v_derived := private.clinical_recalculate(v_unit,p_patient_id,p_doctor_id,v_now,p_reason,false);
  -- Recalculation may touch the same high-risk alert; return its final token.
  select * into v_alert from public.alerts where id = p_alert_id and unit_id = v_unit and patient_id = p_patient_id;
  return jsonb_build_object('data',jsonb_build_object('alert',to_jsonb(v_alert)) || v_derived,'error',null);
end;
$$;

revoke all on function private.clinical_review_measurement(uuid,uuid,uuid,uuid,timestamptz,text) from public,anon,authenticated,service_role;
revoke all on function public.correct_measurement(uuid,uuid,timestamptz,jsonb,text,uuid),
  public.correct_medication_response(uuid,uuid,timestamptz,uuid,timestamptz,boolean,text,uuid),
  public.adjust_prescription(uuid,uuid,integer,timestamptz,jsonb,text,uuid),public.mark_urgent(uuid,uuid,text,uuid),
  public.resolve_alert(uuid,uuid,timestamptz,text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.correct_measurement(uuid,uuid,timestamptz,jsonb,text,uuid),
  public.correct_medication_response(uuid,uuid,timestamptz,uuid,timestamptz,boolean,text,uuid),
  public.adjust_prescription(uuid,uuid,integer,timestamptz,jsonb,text,uuid),public.mark_urgent(uuid,uuid,text,uuid),
  public.resolve_alert(uuid,uuid,timestamptz,text,text,uuid) to authenticated;
commit;
