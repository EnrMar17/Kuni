-- Kuni / Migración incremental — RF28: complicaciones de diabetes registradas.
-- Persona B. Ejecutar sobre un proyecto con 0001/0002/0003 ya aplicadas.
-- Tabla nueva; no modifica ninguna migración anterior.
--
-- Catálogo E110-E119 (mismo que domain-core/src/lib/ml/features.ts):
--   E110-E118 = complicación real capturada por el médico.
--   E119      = declaración explícita de "ninguna complicación" (expediente revisado).
-- Ausencia total de fila para un paciente = expediente SIN REVISAR, algo distinto
-- de E119. buildMlFeatureVector() ya distingue los dos casos (ver `gaps` cuando
-- `complications` llega null) — esta tabla es la fuente que cierra ese hueco.
begin;

create table public.patient_complications (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null,
  patient_id uuid not null,
  code text not null check (code in
    ('E110','E111','E112','E113','E114','E115','E116','E117','E118','E119')),
  -- Fecha de detección/diagnóstico; nullable porque no siempre se conoce con
  -- precisión (expediente migrado, referencia externa, revisión retrospectiva).
  -- Mismo criterio que patient_diagnoses.diagnosed_on.
  diagnosed_on date,
  -- Vigencia: una complicación resuelta/corregida se desactiva, nunca se borra.
  active boolean not null default true,
  correction_reason text,
  notes text,
  attributed_doctor_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unit_id, id),
  unique (unit_id, patient_id, id),
  foreign key (unit_id, patient_id) references public.patients(unit_id, id),
  foreign key (unit_id, attributed_doctor_id) references public.doctors(unit_id, id)
);
create index patient_complications_patient_idx
  on public.patient_complications(unit_id, patient_id) where active;
-- Como máximo una fila vigente por código y paciente: reabrir una complicación
-- corregida exige primero desactivar la fila anterior, nunca duplicarla.
create unique index patient_complications_active_code_idx
  on public.patient_complications(unit_id, patient_id, code) where active;

-- Motivo obligatorio en toda corrección, igual que measurements/medication_responses.
-- Además: E119 ("ninguna complicación") es mutuamente excluyente con cualquier
-- complicación real vigente del mismo paciente — igual que
-- distinctActiveComplications() en domain-core/src/lib/ml/features.ts, que nunca
-- cuenta E119 junto a las demás.
create function private.validate_patient_complication() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.correction_reason is null or btrim(new.correction_reason) = '') then
    raise exception 'Toda corrección necesita correction_reason';
  end if;
  if new.active then
    if new.code = 'E119' and exists (
        select 1 from public.patient_complications c
        where c.unit_id = new.unit_id and c.patient_id = new.patient_id and c.active
          and c.code <> 'E119' and c.id is distinct from new.id) then
      raise exception 'E119 (ninguna complicación) no puede convivir con una complicación vigente';
    end if;
    if new.code <> 'E119' and exists (
        select 1 from public.patient_complications c
        where c.unit_id = new.unit_id and c.patient_id = new.patient_id and c.active
          and c.code = 'E119' and c.id is distinct from new.id) then
      raise exception 'No se puede registrar una complicación vigente mientras E119 (ninguna complicación) siga vigente';
    end if;
  end if;
  return new;
end;
$$;
create trigger patient_complications_validate before insert or update on public.patient_complications
  for each row execute function private.validate_patient_complication();

-- Reutiliza los mismos disparadores genéricos que el resto de tablas clínicas de 0001.
create trigger immutable_identity before update on public.patient_complications
  for each row execute function private.preserve_identity();
create trigger clinical_audit after insert or update or delete on public.patient_complications
  for each row execute function private.audit_clinical_change();

alter table public.patient_complications enable row level security;
create policy unit_read on public.patient_complications for select to authenticated
  using (private.can_read_unit(unit_id));
create policy unit_insert on public.patient_complications for insert to authenticated
  with check (private.can_write_unit(unit_id));
create policy unit_update on public.patient_complications for update to authenticated
  using (private.can_write_unit(unit_id)) with check (private.can_write_unit(unit_id));

-- 0001 otorgó "all on all tables" a service_role solo sobre las tablas que
-- existían en ese momento; una tabla nueva necesita su propio grant explícito.
grant select on public.patient_complications to authenticated;
grant insert, update on public.patient_complications to authenticated;
grant all on public.patient_complications to service_role;

comment on table public.patient_complications is
  'RF28. Catálogo E110-E119 de complicaciones de diabetes. Ausencia de fila = expediente sin revisar, distinto de E119 (revisado, ninguna). Como máximo una fila vigente por código; E119 vigente excluye cualquier otra complicación vigente del mismo paciente. Alimenta num_complicaciones_dm/tiene_complicacion_dm/complicacion_grave_dm en domain-core/src/lib/ml/features.ts.';

commit;
