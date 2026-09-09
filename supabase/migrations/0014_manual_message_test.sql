-- Generaliza la prueba manual de 0013 para permitir WhatsApp mediante Twilio
-- Sandbox, sin tocar la cola ni los recordatorios automaticos.
begin;

create function public.request_manual_message_test(
  p_patient_id uuid,
  p_unit_id uuid,
  p_room_id uuid,
  p_request_id uuid,
  p_provider text,
  p_channel text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_existing public.bot_interactions;
  v_interaction public.bot_interactions;
  v_phone text;
  v_key text := 'manual_message_test:' || p_request_id::text;
begin
  if auth.uid() is null then
    raise exception using errcode='PT401', message='UNAUTHENTICATED';
  end if;
  if not (
    (p_provider in ('sms8','smsgate') and p_channel = 'sms')
    or (p_provider = 'twilio' and p_channel = 'whatsapp')
  ) then
    raise exception using errcode='PT422', message='MESSAGE_PROVIDER_MISMATCH';
  end if;
  if not private.can_write_unit(p_unit_id) then
    raise exception using errcode='PT403', message='FORBIDDEN';
  end if;

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
    raise exception using errcode='PT409', message='PATIENT_NOT_ELIGIBLE_FOR_MESSAGE';
  end if;

  -- WhatsApp libre solo es válido durante las 24 h posteriores al último
  -- mensaje entrante. También rechaza timestamps futuros.
  if p_channel = 'whatsapp' and not exists (
    select 1 from public.patient_messaging_state s
    where s.unit_id = p_unit_id and s.patient_id = p_patient_id
      and s.last_inbound_at > clock_timestamp() - interval '24 hours'
      and s.last_inbound_at <= clock_timestamp()
  ) then
    raise exception using errcode='PT409', message='WHATSAPP_WINDOW_CLOSED';
  end if;

  if exists (
    select 1 from public.bot_interactions i
    where i.unit_id = p_unit_id and i.patient_id = p_patient_id
      and i.kind = 'manual_test'
      and i.created_at >= clock_timestamp() - interval '30 seconds'
  ) then
    raise exception using errcode='PT409', message='MANUAL_MESSAGE_RATE_LIMIT';
  end if;

  insert into public.bot_interactions(
    unit_id, patient_id, kind, deduplication_key, scheduled_at,
    expects_response, provider, delivery_status, attempt_count, claimed_at,
    payload_snapshot
  ) values (
    p_unit_id, p_patient_id, 'manual_test', v_key, clock_timestamp(),
    false, p_provider, 'sending', 1, clock_timestamp(),
    jsonb_build_object(
      'purpose', 'manual_' || p_channel || '_test',
      'channel', p_channel,
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

revoke all on function public.request_manual_message_test(uuid,uuid,uuid,uuid,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.request_manual_message_test(uuid,uuid,uuid,uuid,text,text)
  to authenticated;

commit;
