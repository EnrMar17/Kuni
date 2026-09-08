-- Kuni / Migración incremental — B4: clase terapéutica de `medications`.
-- Persona B. Ejecutar sobre un proyecto con 0001-0004 ya aplicadas.
-- Columna nueva sobre una tabla existente; no crea tablas ni toca RLS,
-- disparadores o grants: `medications` ya participa en los genéricos de
-- 0001 (immutable_identity, clinical_audit, unit_read/insert/update),
-- que aplican a cualquier columna nueva sin cambios.
--
-- NULL = "sin clasificar todavía", igual que el resto del esquema (ver el
-- comentario de monitoring_plans en 0001: "NULL en un límite significa no
-- configurado. No clasificar como normal por ausencia de rango"). No hay
-- default: clasificar por defecto en 'other' escondería medicamentos reales
-- de antidiabético/antihipertensivo detrás de un valor que parece una
-- clasificación hecha. `MlFeatureInput.antidiabeticAdherence`/
-- `antihypertensiveAdherence` en domain-core/src/lib/ml/features.ts ya
-- aceptan `null` como "no se puede separar por clase" — es exactamente
-- este caso mientras el medicamento no se clasifique.
begin;

alter table public.medications add column therapeutic_class text
  check (therapeutic_class is null or therapeutic_class in ('antidiabetic','antihypertensive','other'));

comment on column public.medications.therapeutic_class is
  'Clase terapéutica para separar la cohorte de adherencia por tipo de medicamento (RF29). NULL = sin clasificar todavía, no "otro". Alimenta adherencia_antidiabeticos/adherencia_antihipertensivos en domain-core/src/lib/ml/features.ts.';

commit;
