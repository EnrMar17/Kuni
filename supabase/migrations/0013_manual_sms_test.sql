-- Envio SMS manual desde la ficha del paciente. Es una operacion de prueba
-- distinta de los recordatorios clinicos automaticos y queda identificada en
-- bot_interactions para no contaminar adherencia ni no-respuestas.
begin;

alter table public.bot_interactions
  drop constraint if exists bot_interactions_kind_check;
alter table public.bot_interactions
  add constraint bot_interactions_kind_check
  check (kind in ('medication','measurement','appointment','nonresponse_summary','manual_test'));

alter table public.bot_interactions
  drop constraint if exists bot_interactions_check;
alter table public.bot_interactions
  add constraint bot_interactions_check
  check ((kind = 'medication' and prescription_id is not null and monitoring_plan_id is null and appointment_id is null and expects_response)
    or (kind = 'measurement' and monitoring_plan_id is not null and prescription_id is null and appointment_id is null and expects_response)
    or (kind = 'appointment' and appointment_id is not null and prescription_id is null and monitoring_plan_id is null and not expects_response)
    or (kind in ('nonresponse_summary','manual_test') and num_nonnulls(prescription_id,monitoring_plan_id,appointment_id) = 0 and not expects_response));

create function public.request_manual_sms_test(
  p_patient_id uuid,
  p_unit_id uuid,
  p_room_id uuid,
  p_request_id uuid,
  p_provider text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_existing public.bot_interactions;
  v_interaction public.bot_interactions;
  v_phone text;
  v_key text := 'manual_sms_test:' || p_request_id::text;
begin
  if auth.uid() is null then
    raise exception using errcode='PT401', message='UNAUTHENTICATED';
  end if;
  if p_provider not in ('sms8','smsgate') then
    raise exception using errcode='PT422', message='SMS_PROVIDER_REQUIRED';
  end if;
  if not private.can_write_unit(p_unit_id) then
    raise exception using errcode='PT403', message='FORBIDDEN';
  end if;

  -- Serializa las pruebas por paciente para que dos clics concurrentes no
  -- esquiven el limite. El request_id conserva idempotencia ante reintentos.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_unit_id::text || ':' || p_patient_id::text, 0)
  );

  select * into v_existing
  from public.bot_interactions
  where unit_id = p_unit_id and deduplication_key = v_key;
  if found then
    return jsonb_build_object('data', jsonb_build_object('interaction', jsonb_build_object(
      'id', v_existing.id,
      'created', false,
      'deliveryStatus', v_existing.delivery_status
    )), 'error', null);
  end if;

  select p.whatsapp_e164 into v_phone
  from public.patients p
  join public.health_units u on u.id = p.unit_id and u.active
  join public.patient_consent_status c on c.unit_id = p.unit_id
    and c.patient_id = p.id and c.consent_granted
  where p.id = p_patient_id and p.unit_id = p_unit_id
    and p.consulting_room_id = p_room_id and p.active
  for share of p, u;
  if not found then
    raise exception using errcode='PT409', message='PATIENT_NOT_ELIGIBLE_FOR_SMS';
  end if;

  if exists (
    select 1 from public.bot_interactions i
    where i.unit_id = p_unit_id and i.patient_id = p_patient_id
      and i.kind = 'manual_test'
      and i.created_at >= clock_timestamp() - interval '30 seconds'
  ) then
    raise exception using errcode='PT409', message='MANUAL_SMS_RATE_LIMIT';
  end if;

  insert into public.bot_interactions(
    unit_id, patient_id, kind, deduplication_key, scheduled_at,
    expects_response, provider, delivery_status, attempt_count, claimed_at,
    payload_snapshot
  ) values (
    p_unit_id, p_patient_id, 'manual_test', v_key, clock_timestamp(),
    false, p_provider, 'sending', 1, clock_timestamp(),
    jsonb_build_object(
      'purpose', 'manual_sms_test',
      'trigger', 'patient_profile_button',
      'requestedBy', auth.uid()
    )
  ) returning * into v_interaction;

  return jsonb_build_object('data', jsonb_build_object('interaction', jsonb_build_object(
    'id', v_interaction.id,
    'created', true,
    'deliveryStatus', v_interaction.delivery_status,
    'claimedAt', v_interaction.claimed_at,
    'phoneE164', v_phone
  )), 'error', null);
end;
$$;

revoke all on function public.request_manual_sms_test(uuid,uuid,uuid,uuid,text)
  from public, anon, authenticated, service_role;
grant execute on function public.request_manual_sms_test(uuid,uuid,uuid,uuid,text)
  to authenticated;

commit;
