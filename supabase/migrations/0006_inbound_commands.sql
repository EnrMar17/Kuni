-- U06. System-only ingestion of a previously signature-verified durable event.
-- Plan tecnico RF10/RF16/RF17, section 3; no medical actor is fabricated.
begin;

create function public.process_inbound_event(p_event_id uuid, p_phone_candidates text[], p_parsed jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  e public.webhook_events; p public.patients; i public.bot_interactions;
  mp public.monitoring_plans; consent public.consent_events;
  matches uuid[]; parsed jsonb; outcome text := 'ignored'; reason text;
  measurement_id uuid; received timestamptz; cutoff timestamptz := clock_timestamp();
begin
  -- Patient first, then event/interactions: same ordering as clinical commands.
  select array_agg(id order by id) into matches from public.patients
    where active and whatsapp_e164 = any(p_phone_candidates);
  if cardinality(matches) = 1 then
    select * into p from public.patients where id = matches[1] for update;
  end if;
  select * into e from public.webhook_events where id = p_event_id and event_type = 'inbound' for update;
  if not found then raise exception 'INBOUND_EVENT_NOT_FOUND'; end if;
  if e.processing_status in ('processed','ignored') then
    return jsonb_build_object('outcome',coalesce(e.normalized_payload->>'outcome',e.processing_status),'reason',e.last_error,'duplicate',true);
  end if;
  received := e.received_at;
  if not isfinite(received) or received > cutoff then raise exception 'INVALID_RECEIPT_TIME'; end if;
  parsed := coalesce(e.normalized_payload->'parsed',p_parsed);
  -- Legacy events used the parser before BAJA existed. Upgrade that one command.
  if p_parsed->>'kind' = 'opt_out' then parsed := p_parsed; end if;
  if p.id is null or not p.active or not (p.whatsapp_e164 = any(p_phone_candidates)) then
    reason := 'Remitente no registrado o ambiguo; requiere revision.';
  else
    if e.unit_id is not null and e.unit_id <> p.unit_id
      or e.normalized_payload->>'patientId' is not null and e.normalized_payload->>'patientId' <> p.id::text then
      raise exception 'INBOUND_IDENTITY_CHANGED';
    end if;
    perform 1 from public.bot_interactions where unit_id = p.unit_id and patient_id = p.id order by id for update;
    insert into public.patient_messaging_state(patient_id,unit_id,last_inbound_at)
      values(p.id,p.unit_id,received)
      on conflict(patient_id) do update set last_inbound_at = greatest(public.patient_messaging_state.last_inbound_at,excluded.last_inbound_at);
    if parsed->>'kind' = 'opt_out' then
      select * into consent from public.consent_events where unit_id = p.unit_id and patient_id = p.id
        order by sequence_no desc limit 1;
      if consent.id is null then
        -- There is no authorization to revoke and no documented notice version to invent.
        outcome := 'review'; reason := 'BAJA sin aviso de consentimiento previo; requiere revision.';
      else
        insert into public.consent_events(unit_id,patient_id,event,notice_version,method,evidence_note,created_at)
          values(p.unit_id,p.id,'revoked',consent.notice_version,'whatsapp','BAJA; webhook ' || e.id::text,received);
        outcome := 'opt_out';
      end if;
    elsif parsed->>'kind' in ('medication_confirm','measurement_report') then
      select array_agg(b.id order by b.id) into matches from public.bot_interactions b
        left join public.monitoring_plans m on m.id = b.monitoring_plan_id and m.unit_id = b.unit_id
        where b.unit_id = p.unit_id and b.patient_id = p.id and b.provider = e.provider
          and b.expects_response and b.response_at is null and b.scheduled_at <= received
          and b.created_at <= received
          and coalesce(b.claimed_at,b.accepted_at,b.delivered_at,b.created_at) <= received
          and b.delivery_status in ('sending','accepted','delivered','read','unknown')
          and (parsed->>'referenceCode' is null or b.reply_code = parsed->>'referenceCode')
          and ((parsed->>'kind' = 'medication_confirm' and b.kind = 'medication')
            or (parsed->>'kind' = 'measurement_report' and b.kind = 'measurement' and m.kind = parsed->>'variable'));
      if coalesce(cardinality(matches),0) <> 1 then
        outcome := 'help'; reason := 'No hay una unica solicitud pendiente compatible. Usa el codigo de la solicitud.';
      else
        select * into i from public.bot_interactions where id = matches[1];
        if parsed->>'kind' = 'medication_confirm' then
          if jsonb_typeof(parsed->'taken') is distinct from 'boolean' then raise exception 'INVALID_PARSED_TAKEN'; end if;
          insert into public.medication_responses(unit_id,patient_id,interaction_id,taken,reported_at,source)
            values(p.unit_id,p.id,i.id,(parsed->>'taken')::boolean,received,'whatsapp');
          outcome := 'recorded';
        else
          select * into mp from public.monitoring_plans where id = i.monitoring_plan_id and unit_id = p.unit_id for share;
          -- Same capture plausibility as domain-core validation.ts, not risk thresholds.
          if (mp.kind = 'glucose' and jsonb_typeof(parsed->'valueMgDl') = 'number'
              and (parsed->>'valueMgDl')::numeric between 20 and 700)
            or (mp.kind = 'blood_pressure' and jsonb_typeof(parsed->'systolicMmHg') = 'number'
              and jsonb_typeof(parsed->'diastolicMmHg') = 'number'
              and (parsed->>'systolicMmHg')::numeric between 60 and 260
              and (parsed->>'diastolicMmHg')::numeric between 30 and 180
              and (parsed->>'systolicMmHg')::numeric > (parsed->>'diastolicMmHg')::numeric
              and (parsed->>'systolicMmHg')::numeric = trunc((parsed->>'systolicMmHg')::numeric)
              and (parsed->>'diastolicMmHg')::numeric = trunc((parsed->>'diastolicMmHg')::numeric)) then
            if mp.kind = 'glucose' and coalesce(parsed->>'context','unspecified') <> 'unspecified'
              and parsed->>'context' <> coalesce(mp.measurement_context,'unspecified') then
              outcome := 'help'; reason := 'El contexto no coincide con la solicitud.';
            else
              insert into public.measurements(unit_id,patient_id,interaction_id,monitoring_plan_id,kind,measured_at,
                glucose_mg_dl,systolic_mm_hg,diastolic_mm_hg,measurement_context,source)
                values(p.unit_id,p.id,i.id,mp.id,mp.kind,received,
                  (parsed->>'valueMgDl')::numeric,(parsed->>'systolicMmHg')::integer,(parsed->>'diastolicMmHg')::integer,
                  coalesce(mp.measurement_context,'unspecified'),'whatsapp') returning id into measurement_id;
              outcome := 'recorded';
            end if;
          else
            outcome := 'help'; reason := 'Valores fuera de los limites de captura o presion ambigua. Revisa el dato.';
          end if;
        end if;
        if outcome = 'recorded' then
          update public.bot_interactions set response_at = received,
            delivered_at = least(coalesce(delivered_at,received),received),
            delivery_status = case when delivery_status = 'read' then 'read' else 'delivered' end,
            timeout_at = coalesce(timeout_at,case when response_deadline_at < received then response_deadline_at end)
            where id = i.id;
          -- A late reply retains timeout history, even if the expiry job had not run yet.
          if i.response_deadline_at < received and i.timeout_at is null then
            insert into public.alerts(unit_id,patient_id,kind,severity,interaction_id,deduplication_key,title,
              status,resolved_at,resolution_note)
              values(p.unit_id,p.id,'no_response','warning',i.id,'no_response:' || i.id::text,
                'Interaccion sin respuesta','resolved',cutoff,'Respuesta tardia recibida')
              on conflict(unit_id,deduplication_key) do nothing;
          end if;
          update public.alerts set status = 'resolved',resolved_at = cutoff,resolution_note = 'Respuesta valida recibida',
            detail = detail || jsonb_build_object('automatic',true,'webhookEventId',e.id)
            where unit_id = p.unit_id and patient_id = p.id and interaction_id = i.id
              and kind = 'no_response' and status in ('open','acknowledged');
          if measurement_id is not null then
            perform private.clinical_review_measurement(p.unit_id,p.id,measurement_id,null,cutoff,'Reporte WhatsApp');
          end if;
          perform private.clinical_recalculate(p.unit_id,p.id,null,cutoff,'Respuesta WhatsApp');
        end if;
      end if;
    else
      outcome := 'help'; reason := 'Formato no reconocido. Usa SI codigo, NO codigo, GLUCOSA codigo valor o PRESION codigo sistolica/diastolica.';
    end if;
  end if;
  update public.webhook_events set unit_id = coalesce(p.unit_id,unit_id),
    normalized_payload = normalized_payload || jsonb_build_object('parsed',parsed,'patientId',p.id,'outcome',outcome),
    processing_status = case when outcome in ('ignored','review') then 'ignored' else 'processed' end,
    processed_at = cutoff,processing_attempts = processing_attempts + 1,last_error = reason where id = e.id;
  return jsonb_build_object('outcome',outcome,'reason',reason,'duplicate',false);
end;
$$;
revoke all on function public.process_inbound_event(uuid,text[],jsonb) from public,anon,authenticated;
grant execute on function public.process_inbound_event(uuid,text[],jsonb) to service_role;
commit;
