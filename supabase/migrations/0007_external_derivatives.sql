-- U07. Reconcile external changes and time windows without manufacturing a doctor.
begin;

create function private.refresh_patient_derivatives(p_unit uuid, p_patient uuid, p_cutoff timestamptz)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_now timestamptz; v_snapshot jsonb; v_risk jsonb; v_adherence jsonb;
  v_previous public.risk_assessments; v_measurement uuid; v_risk_changed boolean;
begin
  -- Same patient-first ordering as clinical commands; no remote call holds these locks.
  perform 1 from public.patients where id = p_patient and unit_id = p_unit for update;
  if not found then raise exception using errcode = 'PT403', message = 'FORBIDDEN'; end if;
  if not exists(select 1 from public.patients p join public.health_units u on u.id = p.unit_id
    where p.id = p_patient and p.unit_id = p_unit and p.active and u.active) then return false; end if;
  perform 1 from public.monitoring_plans where unit_id = p_unit and patient_id = p_patient order by id for share;
  perform 1 from public.bot_interactions where unit_id = p_unit and patient_id = p_patient order by id for update;
  perform 1 from public.measurements where unit_id = p_unit and patient_id = p_patient order by id for update;
  perform 1 from public.medication_responses where unit_id = p_unit and patient_id = p_patient order by id for update;
  perform 1 from public.alerts where unit_id = p_unit and patient_id = p_patient order by id for update;
  v_now := coalesce(p_cutoff,clock_timestamp());
  if not isfinite(v_now) then raise exception 'INVALID_DERIVATION_CUTOFF'; end if;
  v_snapshot := private.clinical_risk_snapshot(p_unit,p_patient,v_now);
  v_risk := private.clinical_evaluate_risk(v_snapshot);
  v_adherence := private.clinical_adherence(p_unit,p_patient,v_now);
  select * into v_previous from public.risk_assessments where unit_id = p_unit and patient_id = p_patient
    order by assessed_at desc,id desc limit 1;
  v_risk_changed := v_previous.id is null
    or (v_previous.input_snapshot - array['evaluatedAt','adherence','actorUserId','attributedDoctorId','reason'])
      is distinct from (v_snapshot - 'evaluatedAt')
    or v_previous.level is distinct from v_risk->>'level'
    or v_previous.rule_version is distinct from v_risk->>'ruleVersion'
    or v_previous.reasons is distinct from v_risk->'reasons';
  if not v_risk_changed then
    v_risk_changed := (private.clinical_evaluate_risk(v_previous.input_snapshot) - 'evaluatedAt')
      is distinct from (v_risk - 'evaluatedAt');
  end if;
  if not v_risk_changed and v_previous.input_snapshot->'adherence' = v_adherence then return false; end if;
  if v_risk_changed then
    -- Review latest evidence and already-open measurement alerts after plan changes.
    -- An unchanged tick must not touch alert edit tokens or reopen a dismissed signal.
    for v_measurement in
      select (m->>'measurementId')::uuid from jsonb_array_elements(v_snapshot->'measurements') m
      union select measurement_id from public.alerts where unit_id = p_unit and patient_id = p_patient
        and measurement_id is not null and status in ('open','acknowledged')
    loop
      perform private.clinical_review_measurement(p_unit,p_patient,v_measurement,null,v_now,'Recalculo por datos o tiempo');
    end loop;
  end if;
  perform private.clinical_recalculate(p_unit,p_patient,null,v_now,'Recalculo por datos o tiempo',v_risk_changed);
  return true;
end;
$$;

create function public.refresh_patient_derivatives(p_unit_id uuid, p_patient_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then raise exception using errcode = 'PT403', message = 'FORBIDDEN'; end if;
  -- Cutoff is server-owned. The private clock parameter only enables deterministic tests.
  return private.refresh_patient_derivatives(p_unit_id,p_patient_id,null);
end;
$$;
revoke all on function private.refresh_patient_derivatives(uuid,uuid,timestamptz)
  from public,anon,authenticated,service_role;
revoke all on function public.refresh_patient_derivatives(uuid,uuid) from public,anon,authenticated;
grant execute on function public.refresh_patient_derivatives(uuid,uuid) to service_role;

-- Preserve column names/types and security_invoker: session RLS remains effective.
-- Same concluded cohort as toAdherenceInput() / clinical_adherence(), not all sends.
create or replace view public.patient_adherence with (security_invoker = true) as
with cohort as (
  select i.unit_id,i.patient_id,
    case when r.id is not null then case when r.taken then 'yes' else 'no' end
      when i.delivery_status in ('delivered','read') and i.delivered_at <= now()
        and i.response_deadline_at <= now() then 'unknown' else 'pending' end as outcome
  from public.bot_interactions i left join public.medication_responses r
    on r.unit_id = i.unit_id and r.patient_id = i.patient_id and r.interaction_id = i.id and r.reported_at <= now()
  where i.kind = 'medication' and i.scheduled_at between now() - interval '720 hours' and now()
    and i.delivery_status not in ('cancelled','failed')
), counts as (
  select p.unit_id,p.id as patient_id,
    count(*) filter(where c.outcome in ('yes','no','unknown')) as eligible_count,
    count(*) filter(where c.outcome = 'yes') as yes_count,
    count(*) filter(where c.outcome = 'no') as no_count,
    count(*) filter(where c.outcome = 'unknown') as unknown_count
  from public.patients p left join cohort c on c.unit_id = p.unit_id and c.patient_id = p.id
  group by p.unit_id,p.id
)
select *,round(100.0 * yes_count / nullif(yes_count + no_count,0),1) as confirmed_adherence_pct,
  round(100.0 * (yes_count + no_count) / nullif(eligible_count,0),1) as coverage_pct from counts;
commit;
