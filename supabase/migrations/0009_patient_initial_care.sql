-- U08 fase 2: receta y planes de monitoreo iniciales, atomicos con el alta.
-- Extiende private.save_patient/public.register_patient (0008) agregando dos
-- parametros con default al final de la firma. IMPORTANTE: `create or replace
-- function` NO sirve para esto — Postgres identifica una funcion por su lista
-- COMPLETA de tipos de parametro, asi que agregar parametros (aunque tengan
-- default) crea un OVERLOAD nuevo en vez de reemplazar el existente, dejando
-- dos versiones ambiguas para cualquier llamada con el numero de argumentos
-- viejo (se confirmo el error real: "function ... is not unique" al probarlo
-- en PGlite). Por eso aqui se hace DROP explicito de la firma vieja seguido
-- de CREATE de la nueva, con sus propios REVOKE/GRANT.
-- Nunca aplica en la edicion (p_create=false): ajustar receta/planes de un
-- paciente existente sigue siendo adjust_prescription y trabajo futuro, no
-- este comando. update_patient_registration (0008) no cambia: su firma
-- publica sigue sin exponer p_prescription/p_plans en absoluto.
begin;

drop function private.save_patient(uuid,uuid,uuid,jsonb,jsonb,text,boolean);
drop function public.register_patient(uuid,uuid,uuid,jsonb);

create function private.save_patient(p_patient uuid, p_room uuid, p_doctor uuid,
  p_input jsonb, p_revision jsonb, p_reason text, p_create boolean,
  p_prescription jsonb default null, p_plans jsonb default null) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v_unit uuid; v_zone text; v_patient public.patients; v_consent uuid; v_codes text[];
  v_diagnoses jsonb; v_expected_diagnoses jsonb; v_birth date; v_phone text; v_derived jsonb; v_c jsonb;
  v_today date; v_medication uuid; v_end date; v_prescription_id uuid; v_schedule jsonb;
  v_plan jsonb; v_kind text;
begin
  if auth.uid() is null then raise exception using errcode='PT401',message='UNAUTHENTICATED'; end if;
  select r.unit_id,u.timezone into v_unit,v_zone from public.consulting_rooms r
    join public.health_units u on u.id=r.unit_id
    join public.unit_memberships m on m.unit_id=r.unit_id and m.user_id=auth.uid()
    join public.doctors d on d.id=r.doctor_id and d.unit_id=r.unit_id
    where r.id=p_room and r.doctor_id=p_doctor and r.active and u.active and d.active and m.active
      and m.role in ('clinician','shared_clinician') for share of r,u,m,d;
  if not found then raise exception using errcode='PT403',message='FORBIDDEN'; end if;
  v_today := (clock_timestamp() at time zone v_zone)::date;
  perform private.clinical_reason(p_reason);
  if p_patient is null or p_input is null or jsonb_typeof(p_input) <> 'object'
    or p_input - array['fullName','birthDate','sex','clinicalRecord','curp','whatsappE164','bloodType',
      'initialRisk','initialRiskReason','diagnoses','consent'] <> '{}'::jsonb then
    raise exception using errcode='PT422',message='VALIDATION';
  end if;
  if not coalesce(jsonb_typeof(p_input->'fullName')='string' and length(btrim(p_input->>'fullName')) between 3 and 300
    and jsonb_typeof(p_input->'clinicalRecord')='string' and length(btrim(p_input->>'clinicalRecord')) between 1 and 100
    and p_input->>'sex' in ('female','male','intersex','unknown')
    and p_input->>'initialRisk' in ('low','medium','high','unknown')
    and jsonb_typeof(p_input->'initialRiskReason')='string' and length(btrim(p_input->>'initialRiskReason')) between 1 and 2000
    and p_input->>'birthDate' ~ '^\d{4}-\d{2}-\d{2}$'
    and p_input->>'whatsappE164' ~ '^\+[1-9][0-9]{7,14}$'
    and (p_input->>'curp' is null or p_input->>'curp' ~ '^[A-Z0-9]{18}$')
    and (p_input->>'bloodType' is null or p_input->>'bloodType' in ('A+','A-','B+','B-','AB+','AB-','O+','O-','unknown'))
    and jsonb_typeof(p_input->'diagnoses')='array' and p_input ? 'consent',false) then
    raise exception using errcode='PT422',message='VALIDATION';
  end if;
  v_birth := (p_input->>'birthDate')::date;
  if v_birth > (clock_timestamp() at time zone v_zone)::date then raise exception using errcode='PT422',message='VALIDATION'; end if;
  select array_agg(value order by value) into v_codes from jsonb_array_elements_text(p_input->'diagnoses');
  if not coalesce(cardinality(v_codes) between 1 and 6 and v_codes <@ array[
    'diabetes_type_1','diabetes_type_2','diabetes_gestational','diabetes_other','hypertension','other']
    and cardinality(v_codes)=(select count(distinct c) from unnest(v_codes) c),false) then
    raise exception using errcode='PT422',message='VALIDATION';
  end if;
  v_c := nullif(p_input->'consent','null'::jsonb);
  if v_c is not null and not coalesce(jsonb_typeof(v_c)='object'
    and v_c - array['event','noticeVersion','method','evidenceNote']='{}'::jsonb
    and v_c->>'event' in ('granted','revoked') and v_c->>'method' in ('in_person','written','whatsapp','other')
    and jsonb_typeof(v_c->'noticeVersion')='string' and length(btrim(v_c->>'noticeVersion')) between 1 and 100
    and jsonb_typeof(v_c->'evidenceNote')='string' and length(btrim(v_c->>'evidenceNote')) between 1 and 2000,false) then
    raise exception using errcode='PT422',message='VALIDATION';
  end if;
  if p_create then
    if p_revision is not null or v_c->>'event'='revoked' then raise exception using errcode='PT422',message='VALIDATION'; end if;
  else
    -- Receta/planes iniciales son exclusivos del alta: ajustar una receta ya
    -- existente sigue siendo adjust_prescription, no este comando.
    if p_prescription is not null or p_plans is not null then
      raise exception using errcode='PT422',message='VALIDATION';
    end if;
    perform private.clinical_actor(p_patient,p_doctor);
    select * into v_patient from public.patients where id=p_patient and unit_id=v_unit
      and consulting_room_id=p_room and active for update;
    if not found then raise exception using errcode='PT403',message='FORBIDDEN'; end if;
    perform 1 from public.patient_diagnoses where patient_id=p_patient and unit_id=v_unit order by id for update;
    select coalesce(jsonb_agg(jsonb_build_object('id',id,'updatedAt',updated_at) order by id),'[]'::jsonb)
      into v_diagnoses from public.patient_diagnoses where patient_id=p_patient and unit_id=v_unit and active;
    select id into v_consent from public.consent_events where patient_id=p_patient and unit_id=v_unit order by sequence_no desc limit 1;
    if not coalesce(jsonb_typeof(p_revision)='object' and p_revision ? 'consentId'
      and jsonb_typeof(p_revision->'diagnoses')='array',false) then
      raise exception using errcode='PT422',message='VALIDATION';
    end if;
    -- Compare timestamps as instants, retaining microseconds across PostgREST formats.
    select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'updatedAt',x."updatedAt") order by x.id),'[]'::jsonb)
      into v_expected_diagnoses from jsonb_to_recordset(p_revision->'diagnoses') as x(id uuid,"updatedAt" timestamptz);
    if not coalesce((p_revision->>'updatedAt')::timestamptz=v_patient.updated_at
      and (p_revision->>'consentId')::uuid is not distinct from v_consent
      and v_expected_diagnoses=v_diagnoses,false) then raise exception using errcode='PT409',message='CONFLICT'; end if;
    -- Changing a recipient while retaining an old WhatsApp session/consent is a separate workflow.
    if p_input->>'whatsappE164' <> v_patient.whatsapp_e164 then
      raise exception using errcode='PT422',message='El cambio de telefono requiere un flujo de revalidacion de identidad.';
    end if;
  end if;
  v_phone := regexp_replace(p_input->>'whatsappE164','^\+521([0-9]{10})$','+52\1');
  -- Serialize equivalent Mexican number variants before checking the global MVP identity.
  perform pg_advisory_xact_lock(hashtextextended(v_phone,0));
  if exists(select 1 from public.patients where id<>p_patient
    and regexp_replace(whatsapp_e164,'^\+521([0-9]{10})$','+52\1')=v_phone) then
    raise exception using errcode='PT409',message='CONFLICT';
  end if;
  if p_create then
    insert into public.patients(id,unit_id,consulting_room_id,full_name,birth_date,sex,record_number,curp,
      whatsapp_e164,blood_type,initial_risk,initial_risk_reason,attributed_doctor_id)
      values(p_patient,v_unit,p_room,btrim(p_input->>'fullName'),v_birth,p_input->>'sex',btrim(p_input->>'clinicalRecord'),
        p_input->>'curp',p_input->>'whatsappE164',p_input->>'bloodType',p_input->>'initialRisk',btrim(p_input->>'initialRiskReason'),p_doctor);
  else
    update public.patients set full_name=btrim(p_input->>'fullName'),birth_date=v_birth,sex=p_input->>'sex',
      record_number=btrim(p_input->>'clinicalRecord'),curp=p_input->>'curp',blood_type=p_input->>'bloodType',
      initial_risk=p_input->>'initialRisk',initial_risk_reason=btrim(p_input->>'initialRiskReason'),attributed_doctor_id=p_doctor
      where id=p_patient and unit_id=v_unit;
  end if;
  update public.patient_diagnoses set active=false,attributed_doctor_id=p_doctor
    where unit_id=v_unit and patient_id=p_patient and active and not (condition_code=any(v_codes));
  insert into public.patient_diagnoses(unit_id,patient_id,condition_code,attributed_doctor_id)
    select v_unit,p_patient,c,p_doctor from unnest(v_codes) c where not exists(
      select 1 from public.patient_diagnoses d where d.unit_id=v_unit and d.patient_id=p_patient and d.condition_code=c and d.active);
  if v_c is not null then
    insert into public.consent_events(unit_id,patient_id,event,notice_version,method,evidence_note,attributed_doctor_id)
      values(v_unit,p_patient,v_c->>'event',btrim(v_c->>'noticeVersion'),v_c->>'method',btrim(v_c->>'evidenceNote'),p_doctor);
  end if;

  -- Receta inicial: version 1, sin receta anterior que superseder. Misma
  -- forma de entrada (schedules planos weekday/localTime) que ya valida
  -- adjust_prescription en 0003, para no duplicar reglas de negocio.
  if p_prescription is not null then
    if jsonb_typeof(p_prescription) is distinct from 'object'
        or p_prescription - array['medicationId','doseText','instructions','endsAt','schedules'] <> '{}'::jsonb
        or jsonb_typeof(p_prescription->'doseText') is distinct from 'string' or p_prescription->>'doseText' !~ '[^[:space:]]'
        or jsonb_typeof(p_prescription->'instructions') is distinct from 'string'
        or jsonb_typeof(p_prescription->'schedules') is distinct from 'array' then
      raise exception using errcode='PT422',message='VALIDATION',detail='Receta inicial incompleta.';
    end if;
    if jsonb_array_length(p_prescription->'schedules') = 0 or jsonb_array_length(p_prescription->'schedules') > 168 then
      raise exception using errcode='PT422',message='VALIDATION',detail='Indicar entre 1 y 168 pares dia/hora.';
    end if;
    begin
      v_medication := (p_prescription->>'medicationId')::uuid;
      if p_prescription->>'endsAt' is not null and p_prescription->>'endsAt' !~ '^\d{4}-\d{2}-\d{2}$' then
        raise exception using errcode='PT422',message='VALIDATION',detail='Fecha final invalida.';
      end if;
      v_end := (p_prescription->>'endsAt')::date;
    exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
      raise exception using errcode='PT422',message='VALIDATION',detail='Medicamento o fecha final invalidos.';
    end;
    if v_end is not null and v_end < v_today then raise exception using errcode='PT422',message='VALIDATION',detail='La fecha final precede al inicio.'; end if;
    perform 1 from public.medications where id = v_medication and unit_id = v_unit and active for share;
    if not found then raise exception using errcode='PT403',message='FORBIDDEN'; end if;
    for v_schedule in select value from jsonb_array_elements(p_prescription->'schedules') loop
      if jsonb_typeof(v_schedule) is distinct from 'object' or v_schedule - array['weekday','localTime'] <> '{}'::jsonb
          or jsonb_typeof(v_schedule->'weekday') is distinct from 'number'
          or v_schedule->>'weekday' not in ('1','2','3','4','5','6','7')
          or jsonb_typeof(v_schedule->'localTime') is distinct from 'string'
          or v_schedule->>'localTime' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
        raise exception using errcode='PT422',message='VALIDATION',detail='Horario ISO invalido.';
      end if;
    end loop;
    if exists(select 1 from jsonb_array_elements(p_prescription->'schedules') s
        group by s->>'weekday',s->>'localTime' having count(*) > 1) then
      raise exception using errcode='PT422',message='VALIDATION',detail='No duplicar una toma dia/hora.';
    end if;
    insert into public.prescriptions(unit_id,patient_id,medication_id,version,dose_text,instructions,
      start_date,end_date,status,attributed_doctor_id)
      values(v_unit,p_patient,v_medication,1,p_prescription->>'doseText',p_prescription->>'instructions',
        v_today,v_end,'draft',p_doctor)
      returning id into v_prescription_id;
    insert into public.prescription_schedules(unit_id,prescription_id,local_time,weekdays)
      select v_unit,v_prescription_id,(s->>'localTime')::time,array_agg((s->>'weekday')::smallint order by (s->>'weekday')::smallint)
        from jsonb_array_elements(p_prescription->'schedules') s group by s->>'localTime';
    update public.prescriptions set status='active' where id=v_prescription_id;
  end if;

  -- Planes de monitoreo iniciales: como mucho uno por variable (glucosa,
  -- presion), vigencia desde hoy. Los umbrales que no vengan quedan NULL a
  -- proposito (0001: "NULL en un limite significa no configurado. No
  -- clasificar como normal por ausencia de rango"); las restricciones CHECK
  -- de monitoring_plans son la ultima palabra sobre coherencia de rangos.
  if p_plans is not null then
    if jsonb_typeof(p_plans) is distinct from 'array' or jsonb_array_length(p_plans) > 2 then
      raise exception using errcode='PT422',message='VALIDATION',detail='Como mucho un plan de glucosa y uno de presion.';
    end if;
    if exists(select 1 from jsonb_array_elements(p_plans) p group by p->>'kind' having count(*) > 1) then
      raise exception using errcode='PT422',message='VALIDATION',detail='Un solo plan inicial por variable.';
    end if;
    for v_plan in select value from jsonb_array_elements(p_plans) loop
      if jsonb_typeof(v_plan) is distinct from 'object'
          or v_plan - array['kind','localTime','weekdays','measurementContext','glucoseMinMgDl','glucoseMaxMgDl',
            'criticalGlucoseMinMgDl','criticalGlucoseMaxMgDl','systolicMinMmHg','systolicMaxMmHg','diastolicMinMmHg',
            'diastolicMaxMmHg','criticalSystolicMinMmHg','criticalSystolicMaxMmHg','criticalDiastolicMinMmHg',
            'criticalDiastolicMaxMmHg'] <> '{}'::jsonb
          or v_plan->>'kind' not in ('glucose','blood_pressure')
          or jsonb_typeof(v_plan->'localTime') is distinct from 'string'
          or v_plan->>'localTime' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
          or jsonb_typeof(v_plan->'weekdays') is distinct from 'array' then
        raise exception using errcode='PT422',message='VALIDATION',detail='Plan de monitoreo incompleto.';
      end if;
      v_kind := v_plan->>'kind';
      -- `->'campo'` no distingue una llave ausente de una llave presente con
      -- valor JSON null (asi la manda el formulario para "sin capturar"), asi
      -- que se compara contra 'null'::jsonb explicitamente en vez de "is not null".
      if v_kind = 'glucose' and (nullif(v_plan->'systolicMinMmHg','null'::jsonb) is not null
          or nullif(v_plan->'systolicMaxMmHg','null'::jsonb) is not null
          or nullif(v_plan->'diastolicMinMmHg','null'::jsonb) is not null
          or nullif(v_plan->'diastolicMaxMmHg','null'::jsonb) is not null
          or nullif(v_plan->'criticalSystolicMinMmHg','null'::jsonb) is not null
          or nullif(v_plan->'criticalSystolicMaxMmHg','null'::jsonb) is not null
          or nullif(v_plan->'criticalDiastolicMinMmHg','null'::jsonb) is not null
          or nullif(v_plan->'criticalDiastolicMaxMmHg','null'::jsonb) is not null) then
        raise exception using errcode='PT422',message='VALIDATION',detail='Un plan de glucosa no lleva umbrales de presion.';
      end if;
      if v_kind = 'blood_pressure' and (nullif(v_plan->'glucoseMinMgDl','null'::jsonb) is not null
          or nullif(v_plan->'glucoseMaxMgDl','null'::jsonb) is not null
          or nullif(v_plan->'criticalGlucoseMinMgDl','null'::jsonb) is not null
          or nullif(v_plan->'criticalGlucoseMaxMgDl','null'::jsonb) is not null
          or nullif(v_plan->'measurementContext','null'::jsonb) is not null) then
        raise exception using errcode='PT422',message='VALIDATION',detail='Un plan de presion no lleva umbrales de glucosa ni contexto de glucosa.';
      end if;
    end loop;
    insert into public.monitoring_plans(unit_id,patient_id,kind,local_time,weekdays,start_date,measurement_context,
      glucose_min_mg_dl,glucose_max_mg_dl,systolic_min_mm_hg,systolic_max_mm_hg,diastolic_min_mm_hg,diastolic_max_mm_hg,
      critical_glucose_min_mg_dl,critical_glucose_max_mg_dl,critical_systolic_min_mm_hg,critical_systolic_max_mm_hg,
      critical_diastolic_min_mm_hg,critical_diastolic_max_mm_hg,attributed_doctor_id)
      select v_unit,p_patient,p->>'kind',(p->>'localTime')::time,
        (select array_agg((w)::smallint) from jsonb_array_elements_text(p->'weekdays') w),
        v_today,p->>'measurementContext',
        (p->>'glucoseMinMgDl')::numeric,(p->>'glucoseMaxMgDl')::numeric,
        (p->>'systolicMinMmHg')::integer,(p->>'systolicMaxMmHg')::integer,
        (p->>'diastolicMinMmHg')::integer,(p->>'diastolicMaxMmHg')::integer,
        (p->>'criticalGlucoseMinMgDl')::numeric,(p->>'criticalGlucoseMaxMgDl')::numeric,
        (p->>'criticalSystolicMinMmHg')::integer,(p->>'criticalSystolicMaxMmHg')::integer,
        (p->>'criticalDiastolicMinMmHg')::integer,(p->>'criticalDiastolicMaxMmHg')::integer,p_doctor
      from jsonb_array_elements(p_plans) p;
  end if;

  v_derived := private.clinical_recalculate(v_unit,p_patient,p_doctor,clock_timestamp(),p_reason);
  select * into v_patient from public.patients where id=p_patient and unit_id=v_unit;
  return jsonb_build_object('data',jsonb_build_object('patient',jsonb_build_object('id',v_patient.id,'updatedAt',v_patient.updated_at)) || v_derived,'error',null);
exception
  when unique_violation then raise exception using errcode='PT409',message='El registro ya existe o sus identificadores estan en uso.';
  when invalid_datetime_format or datetime_field_overflow or invalid_text_representation then
    raise exception using errcode='PT422',message='VALIDATION';
  when check_violation then
    raise exception using errcode='PT422',message='VALIDATION',detail='Los umbrales del plan de monitoreo no son coherentes.';
end;
$$;

create function public.register_patient(p_patient_id uuid,p_room_id uuid,p_doctor_id uuid,p_input jsonb,
  p_prescription jsonb default null,p_plans jsonb default null)
returns jsonb language sql security definer set search_path = '' as $$
  select private.save_patient(p_patient_id,p_room_id,p_doctor_id,p_input,null,'Alta de paciente',true,p_prescription,p_plans);
$$;

revoke all on function private.save_patient(uuid,uuid,uuid,jsonb,jsonb,text,boolean,jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.register_patient(uuid,uuid,uuid,jsonb,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.register_patient(uuid,uuid,uuid,jsonb,jsonb,jsonb) to authenticated;

commit;
