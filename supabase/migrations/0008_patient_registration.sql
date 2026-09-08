-- U08 phase 1: demographics, diagnoses and consent. No implicit prescriptions/plans.
begin;

create trigger rpc_version_clock before update on public.patients
  for each row execute function private.clinical_version_clock();
create trigger rpc_version_clock before update on public.patient_diagnoses
  for each row execute function private.clinical_version_clock();

create function private.save_patient(p_patient uuid, p_room uuid, p_doctor uuid,
  p_input jsonb, p_revision jsonb, p_reason text, p_create boolean) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v_unit uuid; v_zone text; v_patient public.patients; v_consent uuid; v_codes text[];
  v_diagnoses jsonb; v_expected_diagnoses jsonb; v_birth date; v_phone text; v_derived jsonb; v_c jsonb;
begin
  if auth.uid() is null then raise exception using errcode='PT401',message='UNAUTHENTICATED'; end if;
  select r.unit_id,u.timezone into v_unit,v_zone from public.consulting_rooms r
    join public.health_units u on u.id=r.unit_id
    join public.unit_memberships m on m.unit_id=r.unit_id and m.user_id=auth.uid()
    join public.doctors d on d.id=r.doctor_id and d.unit_id=r.unit_id
    where r.id=p_room and r.doctor_id=p_doctor and r.active and u.active and d.active and m.active
      and m.role in ('clinician','shared_clinician') for share of r,u,m,d;
  if not found then raise exception using errcode='PT403',message='FORBIDDEN'; end if;
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
  v_derived := private.clinical_recalculate(v_unit,p_patient,p_doctor,clock_timestamp(),p_reason);
  select * into v_patient from public.patients where id=p_patient and unit_id=v_unit;
  return jsonb_build_object('data',jsonb_build_object('patient',jsonb_build_object('id',v_patient.id,'updatedAt',v_patient.updated_at)) || v_derived,'error',null);
exception
  when unique_violation then raise exception using errcode='PT409',message='El registro ya existe o sus identificadores estan en uso.';
  when invalid_datetime_format or datetime_field_overflow or invalid_text_representation then
    raise exception using errcode='PT422',message='VALIDATION';
end;
$$;
create function public.register_patient(p_patient_id uuid,p_room_id uuid,p_doctor_id uuid,p_input jsonb)
returns jsonb language sql security definer set search_path = '' as $$
  select private.save_patient(p_patient_id,p_room_id,p_doctor_id,p_input,null,'Alta de paciente',true);
$$;
create function public.update_patient_registration(p_patient_id uuid,p_room_id uuid,p_doctor_id uuid,
  p_input jsonb,p_revision jsonb,p_reason text)
returns jsonb language sql security definer set search_path = '' as $$
  select private.save_patient(p_patient_id,p_room_id,p_doctor_id,p_input,p_revision,p_reason,false);
$$;
revoke all on function private.save_patient(uuid,uuid,uuid,jsonb,jsonb,text,boolean) from public,anon,authenticated,service_role;
revoke all on function public.register_patient(uuid,uuid,uuid,jsonb),
  public.update_patient_registration(uuid,uuid,uuid,jsonb,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.register_patient(uuid,uuid,uuid,jsonb),
  public.update_patient_registration(uuid,uuid,uuid,jsonb,jsonb,text) to authenticated;
commit;
