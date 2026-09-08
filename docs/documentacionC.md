# Documentación C

## Resumen del avance

C mantiene el dominio de negocio: reglas de prioridad actual, adherencia, interpretación de respuestas, vencimientos, tendencias y el cliente del modelo predictivo. En esta revisión se corrigieron contradicciones entre el código, el plan técnico y el esquema SQL. Los cambios quedan sin commit en `develop` y no modifican el diseño.

Las funciones de riesgo y adherencia se comparten con el adaptador de lectura `src/lib/domain/dashboard.ts`, trabajado junto con B. Esta conexión permite calcular sobre filas SQL; no sustituye la persistencia de evaluaciones ni el circuito completo de WhatsApp y acciones clínicas.

## Lo que se hizo de C

### Reglas de prioridad actual

- Se actualizó `rule_version` a `risk-rules-v2-hackathon-2026-09`.
- Ya no se infiere prioridad baja por una lectura reciente sin límites objetivo, con un objeto vacío de rangos o solo por confirmar una toma.
- `monitoringRequirements` describe cada variable y contexto que exige un plan y su última solicitud esperada. Inferir bajo requiere evidencia reciente evaluable para todos esos requisitos; sin lista explícita queda insuficiente.
- Los requisitos con `monitoringPlanId` exigen una lectura del mismo plan resuelto. Una medición de otro plan con igual variable/contexto, o sin vinculación inequívoca, no acredita la pauta faltante. Los requisitos antiguos sin ID conservan compatibilidad; el adaptador SQL aporta los ID de los planes.
- Las fechas se comparan como instantes absolutos con zona explícita. Mediciones, solicitudes y valoraciones futuras o fechas imposibles no acreditan información válida.
- Se conserva la precedencia de urgencia, límites críticos, fuera de objetivo, no-respuestas y valoración médica vigente. Datos ausentes de otra variable no degradan una señal existente.
- Una valoración médica explícita y vigente puede ser baja aun cuando el cálculo automático sea insuficiente; los motivos identifican esa procedencia. No es un valor bajo inferido por silencio.

### Contratos, parser y vencimientos

- El parser acepta las referencias SQL de ocho caracteres y conserva compatibilidad con los ejemplos cortos de tres a seis caracteres.
- Las palabras POSPRANDIAL/POSTPRANDIAL se traducen a `after_meal`, el valor permitido por SQL. Los DTO de glucosa usan `fasting/before_meal/after_meal/random/unspecified`; la procedencia usa `whatsapp/manual/image_reviewed`.
- Los esquemas de alta/ficha usan `intersex`, conforme al DDL; no se equipara el antiguo `other` con ese valor.
- Los tipos de interacciones de persistencia son `medication/measurement/appointment/nonresponse_summary`. Los discriminantes del parser describen comandos, por lo que `medication_confirm` sigue siendo un comando entrante y no un valor que deba copiarse a `bot_interactions.kind`.
- Expiración acepta `delivered` y `read`, exige `deliveredAt` y un plazo válido, y excluye fallos/bloqueos/cancelaciones. Una revocación posterior no borra seguimiento de mensajes entregados; el consentimiento se comprueba antes de enviar.
- `expire_due_interactions()` es la persistencia canónica del timeout y su alerta. La función pura permite probar/previsualizar criterios; `claim_due_interactions()` solo reclama envíos. No se ejecutaron estas RPC contra una base remota durante esta revisión.

### Adherencia y tendencias

- Se conservan las fórmulas Y/N/U, sus denominadores nulos y la agregación por numeradores/denominadores. La cohorte es de tomas de medicamento, no de solicitudes de medición.
- Se corrigió el fixture cuya fecha de agosto estaba dentro de la ventana de 30 días aunque la prueba esperaba excluirla.
- Tres lecturas del mismo instante ya no acreditan tendencia. Pendiente cero con `sufficientForTrend=false` significa no calculable; el consumidor no debe presentarla como estable.
- La ventana descarta valores no finitos y fechas inválidas/futuras antes de contar suficiencia. Se verificaron los extremos exactos de 30 días y offsets equivalentes.

### Cliente predictivo

- El resultado exige probabilidad finita en [0,1] y los tres booleanos de suficiencia. Una respuesta que solo trae probabilidad ya no publica un porcentaje parcial.
- La versión ausente sigue siendo `null`; nunca se inventa una identificación. El endpoint real necesitará una versión identificable conforme al plan.
- Ocultar una respuesta con las tres variables insuficientes es una política provisional de Kuni, pendiente de confirmar elegibilidad con el equipo de IA. El código admite un resultado parcial por variable para compatibilidad con el ejemplo recibido; eso no demuestra validez clínica ni habilita por sí solo el servicio.
- URL ausente, errores HTTP, JSON inválido y timeout devuelven resultado vacío. La probabilidad cero con contrato válido se conserva como cero.
- El cliente no expone riesgo actual, alerta roja ni los campos de brecha/alerta naranja del contrato antiguo.

## Archivos principales trabajados

- `domain-core/src/contracts/dto.ts`
- `domain-core/src/lib/domain/risk.ts`, `adherence.ts`, `trend.ts`, `time.ts`
- `domain-core/src/lib/whatsapp/parser.ts`
- `domain-core/src/lib/jobs/expire.ts`
- `domain-core/src/lib/ml/client.ts`
- `domain-core/tests/unit/`, `scripts/smoke-check.ts`, `tsconfig.json`, `README.md`
- `src/contracts/clinical.ts`
- `docs/documentacionC.md`

## Decisiones que conviene conocer

- `lastExpectedRequestAt` global se conserva como campo opcional obsoleto para compatibilidad; no basta para inferir bajo. Los consumidores nuevos deben construir `monitoringRequirements` con horarios y zona del plan, incluyendo ambos componentes de presión.
- Quien consulta los datos selecciona mediciones no anuladas y rangos pertinentes. No se introdujo una caducidad clínica universal ni límites médicos automáticos.
- `evaluateRisk()` conserva su firma con respuestas por compatibilidad, pero una respuesta de medicamento no sustituye medición clínica.
- `hasConsent` en candidatos de expiración es opcional y obsoleto: no interviene en ese cálculo. La evidencia de entrega y el plazo sí son obligatorios para vencer.
- Los límites numéricos de winsorización continúan provisionales. Los mínimos de dos lecturas para promedio y tres para tendencia provienen del contexto del equipo de IA, no de validación clínica propia.
- Las etiquetas de UI pueden ser españolas; los valores persistidos respetan SQL. Las pruebas comparan los contratos clínicos y la salida del parser con la migración base.

## Verificación realizada

- `rtk npm --prefix domain-core test`: **150 pruebas aprobadas en nueve archivos**, con las dependencias disponibles del repositorio; Vitest 5.0.0.
- `rtk npm --prefix domain-core run typecheck`: aprobado. Se declararon los tipos Node para la prueba que lee el DDL.
- `rtk proxy npx --no-install eslint domain-core src/contracts/clinical.ts`: aprobado, sin desactivar reglas. Se retiró el `any` del smoke check mediante discriminación del resultado del parser.
- `rtk proxy node --import tsx domain-core/scripts/smoke-check.ts`: **47 comprobaciones aprobadas**.
- La suite incluye referencias reales de ocho caracteres, entradas sin rangos, planes/contextos incompletos, fechas inválidas/futuras, offsets, precedencia médica, entrega leída, revocación tras entrega, timeout idempotente y respuestas ML parciales/fallidas.

Estas comprobaciones son locales. No se instalaron dependencias, no se aplicaron migraciones, no se enviaron mensajes reales ni se contactó el modelo. No acreditan por sí solas el ciclo de producción ni validación clínica del modelo.

## De qué va C

C es responsable de que una respuesta, un silencio o una corrección tengan significado consistente en todas las capas: evidencia conservada, métricas con denominadores claros, prioridad explicable y comandos clínicos transaccionales. Las reglas actuales pertenecen a Kuni; el modelo predictivo es un complemento experimental de futuro.

## Qué falta de C

1. Implementar las cinco RPC clínicas: `correctMeasurement`, `correctMedicationResponse`, `adjustPrescription`, `markUrgent` y `resolveAlert`, con actor Auth real, médico seleccionado como atribución declarada, concurrencia, auditoría y recálculo.
2. Integrar procesamiento de mensajes: identidad del remitente, correlación inequívoca, validación, evidencia de entrega/respuesta y persistencia atómica. El parser solo interpreta texto.
3. Conectar la ejecución de vencimientos, respuestas tardías y resúmenes con el worker y probar paridad de la función pura frente a la RPC real.
4. Persistir evaluaciones y sus entradas reproducibles; recalcular tras cambios de mediciones, planes, respuestas, recetas, urgencias y atención de alertas.
5. Construir `ml-features.ts` cuando esté acordado el diccionario completo de 17 entradas, unidades, ausencias, métrica de adherencia, escala, codificaciones y winsorización. Captura/migración y contratos internos pueden avanzar en paralelo.
6. Obtener endpoint, autenticación y ejemplos reales del equipo de IA; definir horizonte, evento objetivo, población, elegibilidad y versión. No hay una conexión real al modelo en esta entrega.
7. Definir vigencia/caducidad de las predicciones, invalidación por edición y recálculo por paso del tiempo; incorporar fecha de corte y aislamiento por paciente/unidad.
8. Ejecutar pruebas de integración y del ciclo completo con A y B antes de declarar el MVP terminado. El uso clínico real requiere además resolver calibración y la diferencia entre adherencia administrativa de entrenamiento y autorreporte de Kuni.

## Sesión: RPC clínicas transaccionales (2026-09-08)

### Resumen del avance

Se implementaron las cinco operaciones de C en `0002_clinical_derivations.sql` y `0003_clinical_commands.sql`, posteriores a la migración base de B. El SQL se ejecuta en las pruebas locales junto con `0001_kuni.sql` íntegra. No se aplicaron migraciones remotas ni se conectaron Server Actions, UI o worker. Esta entrada se añade al registro anterior; los pendientes de aquella revisión describen el estado previo.

### Decisiones que conviene conocer

- Se propone una interfaz SQL de transporte con nombres `correct_measurement`, `correct_medication_response`, `adjust_prescription`, `mark_urgent` y `resolve_alert`. Los DTO congelados no cambian. Los argumentos adicionales de identidad del objeto, concurrencia, motivo y médico son una propuesta explícita para integrar con A/B, no un contrato de Server Actions ya conectado.
- `correct_measurement` recibe el JSON de `src/contracts/clinical.ts` (`kind`, `patientId`, `observedAt`, valores y contexto); `adjust_prescription` recibe el DTO de `domain-core/src/contracts/dto.ts` (pares `weekday/localTime`). El adaptador de A deberá mapear sus nombres y expandir sus días/horas. Ninguna operación acepta una evaluación de riesgo calculada por el cliente.
- El DDL no tiene `schedule_id` en la interacción ni en la respuesta. No se agrega una columna: la corrección exige el ID del horario original y el instante exacto de la interacción; comprueba receta, unidad, paciente, fecha local, día semanal y hora. Solo acepta un horario compatible único de la versión inmutable. Si hay ambigüedad, devuelve conflicto. Persistir esa FK explícita en las futuras ocurrencias sigue pendiente de propuesta/migración de B.
- El actor es siempre `auth.uid()`, comprobado con membresía activa y rol clínico. El médico seleccionado es atribución declarada validada en esa unidad. `audit_log.actor_user_id` conserva al usuario autenticado; no se sustituye por el médico ni por `service_role`.
- No existe `resolved_by_user_id` ni una tabla de marcas urgentes: se utilizan la auditoría existente y `alerts.kind = urgent_followup`, como ya lee el dashboard. Se proponen claves JSON de trazabilidad en `alerts.detail`; no son columnas nuevas ni una reserva/traslado hospitalario.
- El recálculo SQL debe mantener paridad con `evaluateRisk`, `computeAdherence` y los adaptadores actuales: planes inequívocos, última lectura por plan/contexto en 90 días, ambos componentes de presión, cobertura del horario esperado y denominadores Y/N/U en 30 días. La vista base `patient_adherence` difiere del adaptador en fallos/cancelaciones; se preserva y el resultado de las RPC seguirá el dominio canónico, dejando esa reconciliación pendiente para B.
- Se preparan pruebas locales con PGlite (PostgreSQL WASM en memoria) y un sustituto de Auth exclusivo de tests. No hay Docker/`psql` disponibles en el entorno. Esto permite ejecutar el SQL y sus triggers, pero no acredita JWT/PostgREST de Supabase ni concurrencia de dos conexiones reales. Referencias consultadas: [SECURITY DEFINER en PostgreSQL](https://www.postgresql.org/docs/current/sql-createfunction.html) y [PGlite](https://pglite.dev/docs/about).
- Los tokens `p_expected_updated_at` deben reenviarse como la cadena exacta leída de PostgreSQL, incluidos sus microsegundos. Pasarlos por `Date.toISOString()` puede perder precisión y provocar un conflicto legítimo. Los nuevos triggers `rpc_version_clock`, posteriores a `immutable_identity`, garantizan un token creciente incluso dentro de una transacción larga; no modifican la definición del trigger base ni agregan `version` a las mediciones.
- Cada RPC verifica actor, membresía activa, rol clínico y médico, y bloquea el paciente y las entradas existentes de su cálculo. Se comprueban las referencias de unidad/paciente dentro del camino SQL privilegiado; los helpers privados no se pueden ejecutar como `authenticated`, `anon` ni `service_role`. Solo `authenticated` recibe acceso a las cinco RPC. No hay parámetro para suplantar `auth.uid()`.
- Se conserva la política de `validation.ts` para captura: glucosa 20–700 mg/dL; sistólica 60–260 y diastólica 30–180 mmHg, con sistólica mayor. SQL requiere presión entera porque las columnas son enteras. Son criterios de captura ya existentes, no límites de riesgo nuevos. Los objetivos/críticos de riesgo siguen viniendo exclusivamente de los planes personalizados.
- Se corrigió una diferencia detectada por las pruebas: `AT TIME ZONE` y `date-fns-tz` no eligen siempre el mismo instante en cambios de horario. El helper SQL sigue el ajuste de offsets de `date-fns-tz` con semilla UTC. **Requisito de integración: ejecutar Node con `TZ=UTC`** para paridad determinista en horas repetidas de otras zonas; la implementación actual de `fromZonedTime` depende de la zona del proceso en ciertos casos. Se verificaron México, Nepal, cambio de horario de Nueva York y una hora repetida de Berlín con Node UTC. No se cambió la configuración de ejecución de A/B ni se afirma que cualquier zona del proceso sea equivalente. Las reglas dependen también de las bases IANA instaladas en Node/PostgreSQL.
- La selección SQL desempata lecturas del mismo instante por ID ascendente, conforme a `.order("id")` de la consulta actual de B y al orden estable del adaptador. Se conserva el resto como historial. El desempate garantiza consistencia técnica, no una preferencia clínicamente validada entre lecturas simultáneas.
- Los bloqueos estabilizan las entradas entre los comandos de C y frenan inserciones relacionadas mediante las FK. No se promete ausencia de interbloqueos con otros escritores: los workers deben tratar `40P01`/`40001` como transacción fallida y reintentar desde una lectura nueva. Las pruebas de carreras reales y rendimiento de este bloqueo por paciente siguen pendientes.
- Se preservaron los permisos directos de tablas de `0001`. Por tanto, estas garantías son las del camino RPC: los permisos de escritura heredados todavía permiten que otro consumidor intente DML directo. Restringir ese acceso exige acordarlo con B y con el alta de recetas de A; no se revocaron privilegios que esos flujos pudieran necesitar.

### Lo que se hizo de C

- `correct_measurement`: exige motivo/token, valida captura, conserva ID, paciente, vínculo de plan/interacción, fuente y fecha de recepción, y corrige valor/contexto/fecha observada. El trigger existente registra antes/después y el actor real. Revisa alertas asociadas; resuelve las derivadas que ya no se justifican, adapta severidad y reutiliza la alerta equivalente. Sin rangos evaluables conserva la alerta activa con `reviewRequired`. Guarda riesgo recalculado y devuelve adherencia.
- `correct_medication_response`: exige respuesta, horario original e instante exacto; valida la versión histórica aunque ya esté `superseded`. Corrige solamente `taken`, motivo y médico, conservando `reported_at`, fuente y todos los hitos de la interacción. Una alerta de no-respuesta pendiente se resuelve si existe respuesta válida, sin borrar `timeout_at`. Devuelve la cohorte Y/N/U actualizada y recalcula riesgo.
- `adjust_prescription`: bloquea la versión vigente, compara versión/token, la pasa a `superseded`, crea la siguiente en `draft`, inserta horarios agrupados y la activa. Cualquier fallo revierte todo. Exige `startsAt` igual al día actual de la unidad. La nueva `created_at` guarda el instante efectivo del ajuste; no se admite ajuste diferido. Se conserva la vía anterior porque el DTO no ofrece cambio de vía.
- Solo se cancelan interacciones de esa receta con `scheduled_at` posterior al instante efectivo, estado `queued/blocked_window/blocked_template`, cero intentos y ninguna evidencia de reclamación, proveedor, aceptación, entrega, lectura o respuesta. Se conservan los payloads originales y se auditan explícitamente las cancelaciones con antes/después, motivo, médico y `auth.uid()`: la base no tiene trigger clínico para `bot_interactions`. Las demás auditorías reutilizan los triggers existentes; los horarios no tienen columna de médico, y su atribución se obtiene de la receta padre.
- `mark_urgent`: crea la alerta `urgent_followup`, que es la marca local que ya interpreta el dashboard. Guarda motivo, responsable, fecha y actor. Un UUID de evento permite reintentar; solicitudes distintas mientras existe una marca activa se reúnen en la misma alerta y sus ID quedan conservados para que un reintento posterior al cierre tampoco reactive la marca. No crea citas, reservas ni traslados.
- `resolve_alert`: admite `acknowledged`, `resolved` o `dismissed`, exige token/motivo y guarda fecha/usuario/atribución. `open` es el estado inicial, no una resolución. Una alerta ya cerrada o modificada devuelve conflicto. Atenderla no borra evidencia ni reduce por sí solo el riesgo; no se reabre en la misma operación de cierre. Una alerta de riesgo descartada tampoco se reabre por una corrección de toma si las entradas de riesgo siguen iguales.
- El recálculo se ejecuta dentro de la misma transacción. Guarda en `risk_assessments.input_snapshot` el corte, unidad/paciente, entradas normalizadas de riesgo, resultado de adherencia, actor, médico y motivo. Las entradas de riesgo permiten reproducir `evaluateRisk`. No se confunde ese snapshot con una predicción de IA ni con un recálculo automático de todos los demás eventos del sistema.
- Las alertas de medición se deduplican por paciente/tipo/medición, y las de riesgo por paciente/tipo/versión de regla. Se reutilizan equivalentes activas reconocibles aunque tengan otra clave histórica. La reapertura de una alerta de riesgo requiere cambios de sus entradas; las resoluciones anteriores siguen disponibles en la auditoría.

#### Firmas SQL propuestas para integración

Todos los identificadores son `uuid`, los tokens/ocurrencias son `timestamptz` y los motivos son `text`. Los argumentos son obligatorios; el motivo de ajuste no se toma de `instructions`.

```text
correct_measurement(
  p_patient_id, p_measurement_id, p_expected_updated_at,
  p_input jsonb, p_reason, p_doctor_id)

correct_medication_response(
  p_patient_id, p_response_id, p_expected_updated_at,
  p_schedule_id, p_scheduled_at, p_taken boolean, p_reason, p_doctor_id)

adjust_prescription(
  p_patient_id, p_prescription_id, p_expected_version integer,
  p_expected_updated_at, p_input jsonb, p_reason, p_doctor_id)

mark_urgent(p_patient_id, p_event_id, p_reason, p_doctor_id)

resolve_alert(
  p_patient_id, p_alert_id, p_expected_updated_at,
  p_next_status text, p_reason, p_doctor_id)
```

- Éxito: `{ data: { measurement | medicationResponse | prescription | alert, riskAssessmentId, risk, adherence }, error: null }`. La barra representa el campo específico de cada comando, no una clave literal. `adjust_prescription` también devuelve `cancelledInteractionIds`. El objeto clínico es la fila SQL, con nombres de columnas originales; no es un DTO de UI ya adaptado. `risk` y `adherence` siguen las formas canónicas de C.
- Error: se lanza una excepción para forzar rollback completo. `PT401/PT403/PT422/PT409` llevan `message = UNAUTHENTICATED/FORBIDDEN/VALIDATION/CONFLICT` y detalle legible; PostgREST puede traducir el prefijo `PT` al estado HTTP correspondiente. La acción de A debe mapear esa excepción al envelope congelado. No debe convertir un error SQL en un éxito parcial ni confiar en un usuario de resolución enviado por el navegador.
- JSON propuesto de `alerts.detail`: trazabilidad de urgencia (`eventId`, `eventIds`, `reason`, `markedAt`, `markedByUserId`, `responsibleDoctorId`, `localActionOnly` y datos de la última solicitud reunida), atención (`acknowledgedByUserId/At`, `resolvedByUserId`, `resolutionReason`) y revisión de reglas (`ruleVersion`, `correctionReviewedAt`, `correctionReason`, `reviewRequired`, `automatic`, `resolutionCause`). La fuente histórica de autoría sigue siendo `audit_log`; las claves no sustituyen FK ni autenticación.

### Archivos principales trabajados

- `supabase/migrations/0002_clinical_derivations.sql`: autorización compartida, bloqueo de entradas, tokens crecientes, normalización de mediciones/horarios, evaluación de riesgo, adherencia y persistencia de derivados.
- `supabase/migrations/0003_clinical_commands.sql`: cinco RPC, revisión de alertas y cancelación auditada de cola.
- `domain-core/tests/integration/clinical-rpcs.test.ts`: base efímera con Auth de prueba, migraciones completas, roles/RLS/triggers reales de PostgreSQL y comparación con las funciones y adaptadores actuales.
- `domain-core/package.json`, `domain-core/package-lock.json`: dependencia de desarrollo `@electric-sql/pglite@0.5.8` y lock reproducible del paquete de C. Se respetaron sus rangos existentes de Vitest/TypeScript; la suite ahora usa Vitest **2.1.9** local de `domain-core`, no el 5.0.0 de la revisión anterior.
- `docs/documentacionC.md`: esta entrada. Los contratos congelados, UI, migración base, tipos generados y jobs de B permanecen sin cambios de esta sesión.

### Verificación realizada

- `npm --prefix domain-core test`: **213 pruebas aprobadas en 10 archivos**; 150 pruebas previas y 63 de integración SQL. Uno de los tests ejecuta además 60 combinaciones de paridad contra `evaluateRisk`, comparando nivel, motivos, versión y campos de entrada, no solo etiquetas.
- `npm --prefix domain-core run typecheck`: aprobado.
- `npx --no-install eslint domain-core src/contracts/clinical.ts`: aprobado.
- `node --import tsx domain-core/scripts/smoke-check.ts`: **47 comprobaciones aprobadas**.
- Se aplican las tres migraciones reales en una base PGlite nueva, creada exclusivamente en memoria. Se prueban identidad ausente, membresía ajena/inactiva, viewer, médico/unidad inactivos, referencias de otro paciente, privilegios de funciones y helpers, motivos vacíos, tokens obsoletos/crecientes, rollback ante fallos de recálculo/horarios, historial de dosis/entrega intacto, cancelación selectiva, atención/reapertura/deduplicación y reintentos de urgencias.
- La paridad cubre valores frontera, valoración inicial, urgencia, ventana de timeouts, planes ausentes/ambiguos, datos futuros/anulados/fuera de ventana, presión incompleta, valores SQL no finitos, estados técnicos y ventanas de adherencia, y horarios en distintas zonas. Se detectaron y corrigieron diferencias de horario de verano antes de cerrar la verificación.

Estas pruebas **no son una ejecución en Supabase remoto ni en Supabase local completo**. Auth se sustituye únicamente en el bootstrap de prueba; no se verificó firma de JWT ni transporte PostgREST. PGlite ejecuta PostgreSQL, pero no permite demostrar carreras de múltiples conexiones en este montaje. No se leyeron credenciales ni `.env.local`, no se enviaron mensajes y no se contactó el modelo. Se instaló la dependencia de pruebas; el sandbox bloqueó inicialmente npm/esbuild/tsx y esas ejecuciones locales se repitieron con permisos autorizados.

### Qué falta de C

1. Integrar y aprobar con A/B las firmas propuestas, mapear envelopes y regenerar tipos de Supabase después de aplicar las migraciones en un entorno de prueba explícito. No declarar que la UI ya llama a estas operaciones.
2. Probar JWT/PostgREST/RLS con dos unidades reales de prueba, conflictos con dos conexiones, reintentos, rol compartido y concurrencia con callbacks/cron. Medir bloqueo por paciente con volúmenes representativos.
3. B debe materializar las ocurrencias de la versión nueva a partir del instante efectivo `prescriptions.created_at`, respetando `start_date`, horarios y zona, sin regenerar tomas anteriores del mismo día. Esta entrega cancela la cola elegible; no genera ni envía mensajes nuevos. La revalidación final de receta/consentimiento antes del envío sigue siendo responsabilidad del worker.
4. Acordar con B una FK/contrato explícito de `schedule_id` para ocurrencias futuras, la reconciliación de `patient_adherence` y la restricción de DML directo. No se agregaron tablas/columnas de esas propuestas.
5. Configurar/verificar Node con `TZ=UTC` para las zonas con cambios de horario; revisar la coherencia de las versiones IANA al desplegar. No se alteró la configuración de A/B.
6. Conectar recálculo por los demás eventos: ingestión/respuesta tardía, expiración, altas/cambios de planes, valoración inicial y paso del tiempo. Las RPC resuelven sus propios cambios; un snapshot persistido todavía puede quedar obsoleto por eventos externos a este camino. El dashboard conserva su cálculo en lectura.
7. Continúan pendientes el diccionario de 17 entradas, endpoint/autenticación/versionado/elegibilidad del modelo y pruebas de ciclo completo. La especificación de vigencia siguiente es una propuesta, no una predicción persistida o conectada.

### Tarea secundaria: propuesta de vigencia de predicciones

Esta especificación no modifica los DTO congelados ni agrega tablas. El DDL actual no tiene almacenamiento de predicciones ni una revisión de features por paciente; proponerlos con B y confirmar la política con IA sigue pendiente.

- Cada resultado deberá identificarse por `(unitId, patientId, modelVersion, featureSchemaVersion, featureRevision, asOf)`. `asOf` es el corte de los datos realmente usados; `computedAt` es la hora del cálculo y nunca sustituye ese corte. El horizonte de la predicción es distinto de su vigencia técnica.
- `featureRevision` deberá ser un hash estable del conjunto de entradas acordado, incluyendo sus ID/valores/unidades/fechas, pautas y máscaras de ausencia. No basta la fecha del último mensaje ni el ID de la última medición. El servidor recalcula/verifica esa revisión dentro del aislamiento del paciente y su unidad.
- La política necesita `maxAge` aprobado por IA y un `validUntil` calculado en servidor como el mínimo entre `computedAt + maxAge`, el siguiente vencimiento de evidencia/features y el vencimiento publicado del modelo. No se propone aquí un TTL clínico arbitrario. Hasta acordar esa política y la elegibilidad, una respuesta guardada no se presentará como predicción vigente.
- Una corrección/anulación de medición, corrección de toma, ajuste de receta o cambio de plan invalida conservadoramente la predicción de ese paciente cuando pueda cambiar sus entradas. La ingestión de nueva evidencia y los cruces de ventanas temporales también requieren revisar la revisión/caducidad. Resolver una alerta no valida ni renueva una predicción; solo afecta features si el futuro diccionario usa ese dato.
- Una respuesta de IA que llegue después de un cambio de revisión se conserva, si se acuerda almacenamiento histórico, como resultado obsoleto y no se publica como actual. Antes de publicar se comparan nuevamente unidad, paciente, revisión, versión, suficiencia y reloj. Una corrección en otro paciente/unidad no invalida ni autoriza acceso a esta predicción.
- Estados de lectura propuestos: disponible, caducada, invalidada, insuficiente o servicio no disponible. Son una propuesta de presentación/contrato, no enums añadidos a SQL. Al caducar/invalidar se oculta el porcentaje actual; no se sustituye por cero ni por el riesgo de reglas, y no se cambia medicación automáticamente.
- El futuro servidor/worker debe programar revisión por paso del tiempo y comprobar vigencia también al leer. Hasta que existan esa integración y persistencia, las cinco RPC no afirman invalidar una tabla de predicciones inexistente.
