# Documentación B

## Resumen del avance

B mantiene la persistencia, autorización de datos y transporte. La base disponible en `develop` contiene el esquema de Supabase, tipos, clientes por sesión, semillas de prueba y las operaciones SQL de cola/expiración. La entrega de correcciones incorpora la consulta real del dashboard y adaptadores que alimentan las funciones de dominio de C. La app puede leer datos del consultorio autorizado sin depender de pacientes o porcentajes fijos.

La prueba previa de Twilio fue una recepción del comando de ingreso al Sandbox y un envío desde su consola. Acredita la viabilidad del proveedor; todavía no acredita un circuito de envío/respuesta iniciado por la aplicación.

Las migraciones `0002_clinical_derivations.sql` y `0003_clinical_commands.sql` (RPC clínicas de C) ya están aplicadas al proyecto Supabase real y los tipos regenerados: era el bloqueo número uno de todo el proyecto según `docs/auditoria-integracion.md` §2.1 y `docs/pendientes-y-modelo.md` (B1). Ver detalle en `bitacora-canal-b.md` 2026-09-08.

`0004_patient_complications.sql` (RF28) también está aplicada al proyecto real y los tipos regenerados incluyen `patient_complications` (B3, ver `bitacora-canal-b.md` 2026-09-08). Con B1+B3 ya en remoto, tres de las cinco variables que `buildMlFeatureVector()` reportaba en `gaps` (`num_complicaciones_dm`, `tiene_complicacion_dm`, `complicacion_grave_dm`) tienen ya una fuente de datos real en la base — falta que alguien la llene y que C escriba el adaptador (C2/C7 en `docs/pendientes-y-modelo.md`). Las otras dos (`adherencia_antidiabeticos`/`antihipertensivos`) siguen esperando B4 (clase terapéutica en `medications`).

**Lo que esto ya desbloquea para A y C, concretamente:**
- **A** puede escribir Server Actions reales contra las cinco RPC clínicas (`adjust_prescription`, `correct_measurement`, `correct_medication_response`, `mark_urgent`, `resolve_alert`) — ya están en `src/types/database.types.ts` con sus firmas. Sugerencia de la auditoría: empezar por `resolve_alert` (menor superficie) para acordar el mapeo `PT401/403/422/409 → {data, error}` una sola vez y replicarlo en las otras cuatro (A6 en `docs/pendientes-y-modelo.md`).
- **A** puede construir la captura/edición de complicaciones (RF28) contra `patient_complications` — tabla, RLS y catálogo `E110-E119` ya existen y están probados.
- **C** puede declarar las cinco RPC como integradas (C6) y escribir el adaptador de complicaciones hacia `buildMlFeatureVector()` (parte de C2/C7): `patient_complications` ya tiene filas vigentes por código, `active`, `diagnosed_on` y la regla de que `E119` nunca convive con una complicación real — el mapeo a `MlComplicationsCapture.codes` es directo (ausencia total de fila = `complications: null`, fila(s) activa(s) = `codes: [...]`).
- Sigue bloqueado hasta B4: `adherencia_antidiabeticos`/`antihipertensivos` (necesitan `medications.therapeutic_class`).
- Sigue bloqueado hasta que A/B/C se sienten diez minutos: el nombre del campo de presión arterial (§2.3 de la auditoría, `systolicMmhg` vs `systolicMmHg`) y los rangos de captura (§2.4) — nada de lo aplicado hoy cambia eso.

## Lo que se hizo de B

### Persistencia y acceso existentes

- `0001_kuni.sql`: 20 tablas, 6 vistas, FKs compuestas por unidad/paciente, consentimiento histórico, RLS, auditoría y recetas versionadas.
- RPC de cola `claim_due_interactions` y expiración `expire_due_interactions`, reservadas al backend.
- Tipos generados y clientes de navegador/SSR/administrativo; la lectura clínica usa el cliente SSR y la identidad del usuario, con RLS.
- Scripts idempotentes para unidad, médico, consultorio y pacientes ficticios; su ejecución previa está registrada en la bitácora.

### Consultas y adaptación incorporadas

- `getDashboardData()` revalida sesión, unidad y consultorio mediante `requireConsultingRoom()`. No recibe autoridad desde campos de navegador ni usa el cliente administrativo.
- Recupera el censo completo del consultorio, hasta 1,000 pacientes, y ordena el resultado por prioridad calculada. Las relaciones se consultan en grupos de hasta 100 pacientes, evitando consultas individuales y URLs de tamaño excesivo.
- Pagina respuestas de Supabase en bloques de 500 con conteo exacto. Los límites de volumen (1,000 pacientes o 50,000 registros por relación) generan un error explícito, sin entregar métricas parciales.
- Lee mediciones válidas de 90 días, tomas para métricas de 30 días, citas futuras de 90 días, recetas vigentes, planes de monitoreo, consentimiento, alertas activas y conteos históricos de no-respuesta.
- Calcula riesgo en lectura con `evaluateRisk()` y adherencia/cobertura con `computeAdherence()`/`aggregateAdherence()`. No duplica sus reglas ni guarda una valoración automática con privilegios administrativos.
- La cohorte de adherencia distingue sí/no/desconocido; excluye solicitudes futuras, canceladas, fallidas e informativas. Una respuesta validada o manual vinculada acredita contacto aunque el callback aún no haya fijado `delivered_at`. Las incidencias técnicas permanecen visibles por separado.
- Conecta cada medición con sus objetivos individuales por variable/contexto y plan vigente. Ante planes ambiguos o ausencia de límites, conserva umbrales nulos. No carga límites universales.
- Calcula el último horario esperado con los días semanales, vigencia y zona IANA del plan de monitoreo. La frecuencia de consulta no interviene en esa cadencia.
- La ficha entrega fecha observada y fecha de ingreso (`measurements.created_at`), fuente, corrección, recetas, citas e hitos de interacción. No expone payloads de webhook ni inventa conversaciones a partir de esos hitos.

## Archivos principales trabajados

- `src/lib/queries/dashboard.ts`: lectura por sesión y unidad, filtros y paginación.
- `src/lib/domain/dashboard.ts`: DTO del tablero y adaptadores SQL al dominio canónico.
- `src/lib/whatsapp/provider.ts` / `twilio.ts`: interfaz y adaptador real del canal (envío, verificación de firma).
- `src/lib/whatsapp/status.ts`: progresión pura del callback de entrega (sin I/O, testeable sin base de datos; incluye la concurrencia optimista descubierta en la prueba real).
- `src/lib/whatsapp/schedule.ts` / `message-body.ts`: cálculo puro de ocurrencias de horario y redacción del recordatorio saliente.
- `src/lib/jobs/materialize.ts` / `send.ts`: cola de materialización y envío real por WhatsApp.
- `src/app/api/webhooks/whatsapp/route.ts` / `status/route.ts`: webhooks entrante y de estado — firma, deduplicación, wiring a Supabase.
- `src/app/api/jobs/tick/route.ts`: disparador del Cron (Bearer `CRON_SECRET`).
- `supabase/migrations/0004_patient_complications.sql`: RF28, tabla `patient_complications`, catálogo `E110-E119`, RLS, auditoría.
- `domain-core/tests/integration/patient-complications.test.ts`: 12 pruebas de integración (PGlite) de RLS y reglas de negocio de `0004`.
- `tests/unit/dashboard-adapters.test.ts`: regresiones de cohortes, riesgo, horarios e información faltante.
- `tests/unit/dashboard-queries.test.ts`: límites, paginación, errores y filtros de autorización en las consultas.
- `tests/unit/whatsapp-*.test.ts`, `tests/unit/jobs-*.test.ts`: proveedor/adaptador/estado/webhooks/cola del canal WhatsApp.
- `docs/bitacora-canal-b.md`: detalle operativo histórico y registro de esta entrega.

Los archivos de base ya existentes siguen siendo `supabase/migrations/0001_kuni.sql`, `src/types/database.types.ts`, `src/lib/supabase/*`, `src/lib/auth/context.ts` y `scripts/seed-*.ts`. La migración base se conserva; esta entrega no ejecutó migraciones remotas fuera de los datos demo/prueba documentados en la bitácora (paciente demo, medicamento/receta/horario de prueba).

## Decisiones que conviene conocer

- Los cálculos corresponden al consultorio completo autorizado, no a toda la unidad ni a porcentajes de una muestra. El cliente puede buscar y filtrar la presentación; las métricas generales siguen representando el consultorio cargado.
- La media descriptiva de glucosa agrega únicamente lecturas en ayuno de 30 días y está disponible desde una lectura real, junto con el número de observaciones; no mezcla contextos ni promete comparación con otra semana. La suficiencia para features de IA se calcula separadamente en el módulo de tendencias.
- El riesgo utiliza la última lectura válida por plan, variable y contexto dentro de los 90 días disponibles. Una lectura posterior de otro plan no borra una señal crítica. Las anteriores de la misma serie se conservan como historial. Para acreditar suficiencia se requiere una medición reciente correspondiente a cada plan esperado; los reportes manuales solo se asocian si existe un plan compatible único. No se establece una caducidad clínica universal.
- La última respuesta usa el mayor `response_at` válido de los últimos 90 días, calculado antes de limitar la historia visible a 20 interacciones. Incluye respuestas tardías a solicitudes antiguas. El DTO distingue los avisos informativos mediante `expectsResponse`.
- `urgent_followup` abierta/en revisión acredita la marca urgente. La valoración inicial médica se conserva porque el esquema actual no tiene un campo para caducarla; su revisión formal sigue pendiente de las operaciones clínicas.
- Las lecturas actuales recalculan el riesgo; no usan una `risk_assessments` potencialmente obsoleta. La persistencia, recálculo por eventos y resolución de alertas requieren las RPC/worker pendientes.
- Las consultas concurrentes comparten un reloj de corte, pero no constituyen una transacción SQL con snapshot único. Cambios simultáneos pueden requerir refrescar; la consistencia transaccional de captura y corrección se debe resolver en las operaciones del backend.
- La integración de IA debe seguir el contrato de tres campos del contexto actualizado. La migración de complicaciones/fases sigue pendiente, y no hay inferencia clínica ni cambio automático de medicación.
- La propuesta “HAS cada tres meses” permanece pendiente de aclarar finalidad y fuente; no se aplica a horarios de fármacos o mediciones.

## Verificación realizada

- `npx vitest run tests/unit/dashboard-adapters.test.ts tests/unit/dashboard-queries.test.ts`: 18 pruebas aprobadas en 2 archivos tras las correcciones de revisión.
- ESLint de los cuatro archivos TypeScript añadidos: sin errores después de los ajustes finales de paginación.
- `npx tsc --noEmit`: sin errores con los cambios compartidos presentes al momento de la verificación.
- No se accedió a `.env.local`, a la base remota ni a Twilio durante esta entrega. Los tests de filtros verifican el código de consulta; no sustituyen una prueba real de políticas RLS con dos usuarios/unidades.

## De qué va B

B es responsable del esquema, migraciones incrementales, RLS, tipos, datos de prueba, canales de WhatsApp, callbacks verificados, materialización/envío y operación del scheduler. Comparte con A el contrato de lecturas y con C la persistencia transaccional de los resultados del dominio.

## Qué falta de B

1. ~~Migración `0002`/`0003` (RPC clínicas de C) aplicadas al Supabase remoto; tipos regenerados~~ — hecho (§B1, ver `bitacora-canal-b.md` 2026-09-08). Las cinco RPC (`adjust_prescription`, `correct_measurement`, `correct_medication_response`, `mark_urgent`, `resolve_alert`) ya aparecen en `src/types/database.types.ts`. ~~Migración incremental de complicaciones DM (RF28)~~ — hecho (§B3 más abajo). Sigue pendiente clase terapéutica de medicamentos (B4). No modificar la migración base ni `0002`/`0003`/`0004` ya aplicadas.
2. ~~Interfaz de proveedor y adaptador Twilio, validación de firma, webhooks entrante y de estado, deduplicación~~ — hecho (`src/lib/whatsapp/{provider,twilio,status}.ts`, `src/app/api/webhooks/whatsapp/{route,status/route}.ts`, ver `bitacora-canal-b.md` 2026-09-08). Falta el **procesamiento transaccional con C**: el webhook entrante guarda el mensaje ya interpretado pero no escribe el efecto clínico (medición, confirmación de toma) — eso exige las RPC de registro de C, que ya están aplicadas (#1) pero nadie las llama todavía desde el webhook.
3. ~~Materialización y envío, endpoint `api/jobs/tick`, prueba real de ida y vuelta desde la app~~ — hecho (`src/lib/jobs/{materialize,send}.ts`, `src/app/api/jobs/tick/route.ts`; mensaje real enviado y confirmado `delivered`/`read`, respuesta del paciente recibida — ver `bitacora-canal-b.md` 2026-09-08). Falta programar el Cron (Supabase Cron / externo) que llame ese endpoint solo; hoy se dispara a mano. `appointment` y `nonresponse_summary` quedan fuera del materializador a propósito (sin plantilla real / disparador preciso).
4. ~~Normalizar `+521XXXXXXXXXX` vs `+52XXXXXXXXXX` (números de WhatsApp de México) al resolver paciente por teléfono en el webhook entrante~~ — hecho (`src/lib/whatsapp/phone.ts`, `phoneLookupCandidates()`, ver auditoría §3.1 y `bitacora-canal-b.md` 2026-09-08). Falta integrar BAJA, plantillas aprobadas de Twilio para medicamento/medición (`send.ts` hoy solo puede mandar dentro de la ventana de sesión de 24h, sin plantilla configurada para esos tipos), respuestas tardías e incidencias técnicas con la cola existente (los callbacks desordenados de entrega ya están cubiertos por `status.ts`, con concurrencia optimista).
5. Completar con C las RPC de corrección, ajustes, urgencia y resolución con auditoría y recálculo coherente; las dos RPC actuales de cola no realizan esas acciones.
6. Probar aislamiento real entre dos unidades y roles, concurrencia de workers y consentimiento revocado durante un envío.
7. Medir rendimiento con datos reales del tamaño de la demo; para mayor escala, consultar agregados/snapshot mediante RPC y paginar el censo desde servidor.
8. Pendientes operativos previos: configurar CSP tras probar compatibilidad, revisar proveedor SMS de Supabase y observabilidad de jobs. No confundir autenticación SMS de Supabase con transporte clínico WhatsApp.
