-- Agenda: alta de citas con persistencia atomica (antes solo quedaba en preview,
-- ver docs/reporte-develop-2026-09-08.md "Alta de pacientes y agenda siguen
-- siendo formularios sin guardar"). Mismo patrón que 0008 (RPC privada
-- security invoker con su propio chequeo de auth + wrapper security definer).
begin;

-- Evita doble-reservar el mismo consultorio en el mismo instante (dos altas
-- concurrentes para el mismo horario). Solo aplica a citas 'scheduled': una
-- cancelada u completada no bloquea reusar ese horario.
create unique index appointments_room_slot_uidx on public.appointments(unit_id, consulting_room_id, starts_at)
  where status = 'scheduled';

create function private.schedule_appointment(p_patient uuid, p_room uuid, p_doctor uuid,
  p_starts_at timestamptz, p_urgency text, p_reason text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v_unit uuid; v_appointment public.appointments;
begin
  if auth.uid() is null then raise exception using errcode='PT401',message='UNAUTHENTICATED'; end if;
  select r.unit_id into v_unit from public.consulting_rooms r
    join public.health_units u on u.id=r.unit_id
    join public.unit_memberships m on m.unit_id=r.unit_id and m.user_id=auth.uid()
    join public.doctors d on d.id=r.doctor_id and d.unit_id=r.unit_id
    where r.id=p_room and r.doctor_id=p_doctor and r.active and u.active and d.active and m.active
      and m.role in ('clinician','shared_clinician') for share of r,u,m,d;
  if not found then raise exception using errcode='PT403',message='FORBIDDEN'; end if;
  if p_urgency not in ('routine','urgent') or p_reason is null or p_reason !~ '[^[:space:]]'
    or length(btrim(p_reason)) > 1000 or p_starts_at is null or p_starts_at <= clock_timestamp() then
    raise exception using errcode='PT422',message='VALIDATION';
  end if;
  perform 1 from public.patients where id=p_patient and unit_id=v_unit and consulting_room_id=p_room and active for share;
  if not found then raise exception using errcode='PT403',message='FORBIDDEN'; end if;
  insert into public.appointments(unit_id,patient_id,consulting_room_id,starts_at,urgency,reason,attributed_doctor_id)
    values(v_unit,p_patient,p_room,p_starts_at,p_urgency,btrim(p_reason),p_doctor)
    returning * into v_appointment;
  return jsonb_build_object('data',jsonb_build_object('appointment',jsonb_build_object(
    'id',v_appointment.id,'startsAt',v_appointment.starts_at,'updatedAt',v_appointment.updated_at)),'error',null);
exception
  when unique_violation then raise exception using errcode='PT409',message='Ese consultorio ya tiene una cita agendada en ese horario.';
end;
$$;

create function public.schedule_appointment(p_patient_id uuid, p_room_id uuid, p_doctor_id uuid,
  p_starts_at timestamptz, p_urgency text, p_reason text)
returns jsonb language sql security definer set search_path = '' as $$
  select private.schedule_appointment(p_patient_id,p_room_id,p_doctor_id,p_starts_at,p_urgency,p_reason);
$$;

revoke all on function private.schedule_appointment(uuid,uuid,uuid,timestamptz,text,text) from public,anon,authenticated,service_role;
revoke all on function public.schedule_appointment(uuid,uuid,uuid,timestamptz,text,text) from public,anon,authenticated,service_role;
grant execute on function public.schedule_appointment(uuid,uuid,uuid,timestamptz,text,text) to authenticated;

commit;
