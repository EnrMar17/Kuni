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

El checkout de esta sesión parte de `8ce27e5`, con solo `0001_kuni.sql` y la documentación anterior: los archivos de RPC mencionados previamente en la conversación no estaban presentes aquí. Se tomó el estado de este documento y del repositorio como fuente de verdad, sin dar por entregado trabajo de otra revisión. Esta entrada se agrega al historial, sin sustituir la anterior.

Quedan implementadas las cinco RPC en dos migraciones incrementales, con pruebas SQL ejecutables. El punto 1 del listado anterior queda implementado y verificado localmente; no significa que las acciones de A estén conectadas ni que se hayan desplegado en Supabase. El punto 4 avanza para estos cinco caminos: se persisten evaluaciones reproducibles y adherencia al ejecutar los comandos, pero faltan otros eventos de recálculo.

### Decisiones que conviene conocer

- El transporte SQL es una propuesta explícita para integrar con A/B; no modifica los DTO congelados. Las funciones públicas usan `SECURITY DEFINER` y `search_path = ''`, solo conceden ejecución a `authenticated`, y exigen dentro de SQL `auth.uid()`, unidad activa, membresía activa `clinician/shared_clinician`, médico activo de esa unidad y motivo no vacío. Los helpers son internos, `SECURITY INVOKER`, con ruta fija y sin ejecución concedida a roles de aplicación. Las referencias se comprueban por unidad y paciente, respaldadas también por las FK compuestas de la base.
- `auth.uid()` es el actor real. `p_doctor_id` es atribución declarada, no suplantación de Auth ni prueba de identidad individual del médico seleccionado. No existe un argumento para elegir `actor_user_id`. Los triggers de B registran actor, médico y antes/después; las cancelaciones de interacciones añaden auditoría explícita porque esa tabla no tiene el trigger clínico. Los horarios no tienen columna de médico: su auditoría identifica al actor y la receta padre conserva la atribución médica.
- La concurrencia usa `p_expected_updated_at` y, para recetas, también `p_expected_version`. Se agregan triggers de reloj monotónico a mediciones, respuestas, recetas y alertas, después del trigger `immutable_identity`; no se modifica el trigger de B. A debe reenviar el texto exacto de `updated_at` devuelto por SQL, incluidos microsegundos, sin pasarlo por `Date.toISOString()`. Un token ausente/viejo o un objeto cerrado/inactivo devuelve conflicto. La precisión de milisegundos se usa solo para derivados, para coincidir con `Date.parse`, nunca para los tokens ni para identificar la ocurrencia de una toma.
- Se bloquea el paciente y, en orden común, sus planes, interacciones, mediciones, respuestas y alertas. Esto serializa los cinco comandos y estabiliza entradas existentes; las FK hacen esperar nuevas filas que referencian al paciente bloqueado. No se ha medido el coste con historiales grandes ni probado intercalación de varias conexiones con los jobs de B. Integración debe manejar rollback/reintento acotado de `40P01/40001`, sin repetir ciegamente envíos externos.
- La base no tiene `schedule_id` en interacciones/respuestas. La corrección exige el ID del horario inmutable original y el instante exacto de la interacción, comprobando receta, paciente, unidad, día/hora local y vigencia histórica; si no se identifica una sola toma devuelve conflicto. Puede corregirse una respuesta de una receta ya sustituida. Es una reconstrucción conservadora, no una FK persistida: proponer esa FK en futuras ocurrencias sigue pendiente de B, especialmente ante cambios históricos de zona horaria o materialización no alineada al horario. No se agregó una columna por cuenta propia.
- Ajustar una receta exige inicio hoy, según la zona de la unidad; no se aceptan cambios diferidos. Se conserva la versión anterior, se crea una nueva en borrador con horarios agrupados por hora y luego se activa. Solo se cancelan ocurrencias futuras `queued/blocked_window/blocked_template` sin intentos, reclamación, identificador de proveedor, aceptación, entrega, lectura, respuesta ni timeout. Se preservan íntegros los mensajes enviados o de envío incierto y sus snapshots de dosis. La nueva versión guarda `created_at` con el instante del ajuste; B debe materializarla desde ese instante, no generar retrospectivamente tomas anteriores del mismo día. No se implementó materialización ni se modificaron jobs.
- La marca urgente usa `alerts.kind = urgent_followup`, tal como la consume el dashboard. `p_event_id` es un UUID estable de la solicitud y se reutiliza al reintentar. Se conserva una sola urgencia activa equivalente y se recuerdan los eventos coalescidos; repetir un evento ya cerrado no lo resucita. Crear un evento nuevo después del cierre sí permite una nueva marca. No crea citas, reservas hospitalarias ni traslados.
- Se proponen claves JSON en `alerts.detail` porque no hay columnas de resolución por usuario ni tabla de urgencias: `eventId/eventIds`, `reason`, `markedAt`, `markedByUserId`, `responsibleDoctorId`, `localActionOnly`; metadatos `lastRequest*` al coalescer; `acknowledgedByUserId/acknowledgedAt`, `resolvedByUserId/resolutionReason`; y datos de revisión `correctionReviewedAt/correctionReason/reviewRequired`, `automatic/resolutionCause`. La responsabilidad original de una urgencia queda en `responsibleDoctorId`; peticiones posteriores conservan su propio médico y actor. La auditoría mantiene el historial completo.
- `resolve_alert` acepta `acknowledged/resolved/dismissed` desde `open/acknowledged`, no traducciones ni reapertura. Guarda motivo, actor y fecha; `resolved_at` solo corresponde a estados terminales. Cerrar una alerta no elimina una medición crítica ni obliga a bajar el riesgo. Las alertas de riesgo se deduplican por paciente/tipo/regla, leyendo la regla del detalle o de la evaluación vinculada; las de medición, por paciente/tipo/medición. No se reabre inmediatamente una alerta al resolverla, ni por corregir una toma cuando las entradas de riesgo siguen iguales. Nuevas entradas relevantes pueden reabrir la alerta de regla. Duplicados históricos ajenos no se fusionan destructivamente.
- La corrección revisa también alertas de mediciones antiguas. Cierra automáticamente las señales que dejan de justificarse cuando hay rangos evaluables; sin plan/contexto/rangos suficientes conserva la alerta de medición para revisión. No inventa umbrales clínicos: glucosa 20-700 y presión sistólica 60-260/diastólica 30-180 con sistólica mayor que diastólica son validaciones de captura existentes, no criterios de riesgo. La presión exige enteros por las columnas actuales.
- SQL no acepta riesgo del cliente. Construye entradas con la misma selección del dashboard: evidencia no anulada, ventana absoluta de 90 días, último dato por plan resuelto/variable/contexto, desempate por ID ascendente, requisitos semanales locales, timeouts pendientes en siete días y valoración inicial. `evaluateRisk` conserva precedencia, motivos y `risk-rules-v2-hackathon-2026-09`. Fechas no finitas no cuentan y las comparaciones clínicas usan precisión de milisegundos para coincidir con JavaScript. La valoración inicial sigue usando `patients.updated_at` y `active=true`, igual que el adaptador actual; no se inventó caducidad.
- Adherencia sigue `toAdherenceInput` y `computeAdherence`: cohorte absoluta de 30 días, Y/N/U, redondeo a un decimal y denominadores cero como `null`. Cancelados quedan fuera; fallidos son exclusión técnica aun con respuesta. Una respuesta válida manual/WhatsApp acredita contacto sin fabricar entrega. Se preserva `timeout_at` histórico y no se modifica `response_at` durante una corrección. La vista base `patient_adherence` tiene diferencias para fallidos/cancelados; no se cambió. A/B deben usar el resultado canónico de C o acordar la alineación de esa vista.
- **Condición de integración temporal: ejecutar el adaptador Node con `TZ=UTC`.** La conversión SQL reproduce la política `fixOffset` de `date-fns-tz` con semilla UTC. Se verificaron México, Nepal y cambios de horario de Nueva York/Berlín; el adaptador existente puede escoger otro instante ambiguo si Node usa otra zona. No se modificó configuración de A/B. La zona IANA de la unidad sigue determinando las fechas/horas clínicas.
- No se modificaron los permisos DML directos heredados de B, que también sirven a altas y formularios existentes. Las garantías transaccionales nuevas corresponden al camino RPC: los permisos anteriores permiten otros caminos sin estos tokens/recalculos. Endurecer o retirar esos permisos requiere coordinar los caminos de alta/edición con A/B; esta entrega no declara cerrado ese límite de seguridad.

#### Transporte propuesto para A/B

Las firmas implementadas son:

```sql
correct_measurement(p_patient_id uuid, p_measurement_id uuid,
  p_expected_updated_at timestamptz, p_input jsonb, p_reason text, p_doctor_id uuid)
correct_medication_response(p_patient_id uuid, p_response_id uuid,
  p_expected_updated_at timestamptz, p_schedule_id uuid, p_scheduled_at timestamptz,
  p_taken boolean, p_reason text, p_doctor_id uuid)
adjust_prescription(p_patient_id uuid, p_prescription_id uuid, p_expected_version integer,
  p_expected_updated_at timestamptz, p_input jsonb, p_reason text, p_doctor_id uuid)
mark_urgent(p_patient_id uuid, p_event_id uuid, p_reason text, p_doctor_id uuid)
resolve_alert(p_patient_id uuid, p_alert_id uuid, p_expected_updated_at timestamptz,
  p_next_status text, p_reason text, p_doctor_id uuid)
```

`correct_measurement.p_input` usa `MeasurementInput` de `src/contracts/clinical.ts`: `kind/patientId/observedAt`, más `glucoseMgDl/context` o `systolicMmhg/diastolicMmhg`. No permite cambiar variable, paciente, procedencia, recepción ni enlaces. `observedAt` exige fecha ISO válida con zona y no futura.

`adjust_prescription.p_input` usa `PrescriptionVersionInput` de `domain-core/src/contracts/dto.ts`: `patientId/medicationId/doseText/instructions/startsAt/endsAt/schedules/prescribedByDoctorId/previousPrescriptionId?`. Cada horario es `{weekday, localTime}`; `startsAt` es fecha local de hoy, `endsAt` fecha o `null`. A debe mapear sus nombres y la combinación de horas/días a estos pares; no se alteró su contrato ni se conectó una Server Action.

Todas devuelven JSON `{data, error: null}`. `data` incluye `riskAssessmentId`, `risk` y `adherence`, además de `measurement`, `medicationResponse`, `prescription` o `alert` según el comando; ajuste agrega `cancelledInteractionIds`. Las filas conservan nombres SQL `snake_case`, no se presentan como DTO congelados ya adaptados. El riesgo y la adherencia mantienen las formas canónicas de C. `input_snapshot` guarda paciente, requisitos, mediciones, límites, timeouts, corte, unidad, adherencia, actor, médico y motivo para reproducir la evaluación sin consultar planes mutados.

Los errores esperados son excepciones SQL `PT401/UNAUTHENTICATED`, `PT403/FORBIDDEN`, `PT422/VALIDATION` y `PT409/CONFLICT`; su propagación revierte la llamada completa. El cliente Supabase/Server Action debe mapearlas al sobre de error ya congelado y conservar el conflicto como conflicto, no como éxito vacío. PostgreSQL puede rechazar argumentos tipados malformados antes de entrar a la función; también deben mapearse como validación. No se aceptan credenciales de sistema en sustitución de la sesión del usuario. La exposición HTTP de estos errores sigue pendiente de prueba con PostgREST.

### Lo que se hizo de C

- `0002_clinical_derivations.sql`: autorización y bloqueos internos, reloj de versiones, adaptación de fechas/evidencia, cálculo de riesgo/adherencia y persistencia de evaluaciones con deduplicación de alertas de regla.
- `0003_clinical_commands.sql`: cinco comandos públicos atómicos, revisión de alertas de medición, conservación de evidencia original, ajuste versionado con cancelaciones auditadas y urgencia local con reintentos identificables.
- Se agregaron 65 pruebas de integración con PGlite, aplicando las tres migraciones completas. Cubren autorización real dentro de cada función mediante un Auth de prueba, aislamiento, atribución, conflictos secuenciales, transiciones, deduplicación, rollback y paridad con las funciones/adaptadores TypeScript existentes.
- Las regresiones añadidas durante la revisión detectaron y corrigieron problemas antes de cerrar: duplicación/recreación al resolver alertas heredadas con regla en su evaluación vinculada, distinta selección SQL/JavaScript de mediciones separadas por microsegundos y cómputo de fechas no finitas en adherencia. El caso de medición futura se mantiene realmente posterior al corte de evaluación.
- No se reescribieron funciones puras, DTO, UI, migración base, Twilio ni jobs. No se añadieron tablas o columnas.

### Archivos principales trabajados

- `supabase/migrations/0002_clinical_derivations.sql`
- `supabase/migrations/0003_clinical_commands.sql`
- `domain-core/tests/integration/clinical-rpcs.test.ts`
- `domain-core/package.json` y `domain-core/package-lock.json`
- `docs/documentacionC.md`

Se añadió como dependencia de desarrollo `@electric-sql/pglite` fijada a `0.5.8`, ya disponible en `domain-core/node_modules`. El lockfile del paquete se generó con `npm --prefix domain-core install --package-lock-only --offline --ignore-scripts --no-audit --no-fund`; no se descargaron paquetes ni se cambiaron las dependencias de producción de la aplicación. El archivo preexistente no rastreado `prompt-astra-rpc-clinicas.md` se dejó intacto.

### Verificación realizada

- `npm --prefix domain-core test`: **215 pruebas aprobadas en diez archivos**, 150 anteriores más 65 de integración, con Vitest 2.1.9 resuelto en el paquete local. No se reutilizó el conteo ni la versión de la sesión anterior.
- `npm --prefix domain-core run typecheck`: aprobado.
- `npx --no-install eslint domain-core src/contracts/clinical.ts`: aprobado, sin desactivar reglas.
- `node --import tsx domain-core/scripts/smoke-check.ts`: **47 comprobaciones aprobadas**.
- Las pruebas ejecutan DDL, funciones, permisos, RLS, triggers y transacciones en PostgreSQL embebido PGlite 0.5.8. Inyectan fallos de inserción de evaluación y de horarios para comprobar que no quedan cambios parciales ni auditorías huérfanas. Comparan resultados completos de riesgo en 60 combinaciones y con el adaptador de dashboard, presión con ambos componentes, rangos ausentes/no finitos, planes ambiguos, límites temporales y 40 combinaciones de entrega/respuesta para adherencia.
- El arranque de Vitest falló inicialmente por lectura de directorios bloqueada por el sandbox; el smoke falló dentro de `tsx` al consultar el usuario del sistema (`uv_os_get_passwd`). Se repitieron los mismos comandos con permisos ampliados y terminaron correctamente. No fueron fallos del dominio ni se ocultaron pruebas.

**Límite de la verificación:** es SQL ejecutado realmente en una base efímera local, con roles y `auth.uid()` simulados a partir de una claim de prueba. No es un Supabase local completo, no comprueba validación criptográfica de JWT, PostgREST, varias conexiones concurrentes ni comportamiento de Twilio/worker. No se aplicaron migraciones a una base remota, no se leyeron secretos, no se enviaron mensajes ni se contactó el modelo. No acredita despliegue ni validación clínica.

### Qué falta de C

1. Integrar las Server Actions de A con estas firmas propuestas, sesión Auth real, mapeo de DTO/errores, `p_event_id` estable y tokens exactos. Regenerar/acordar los tipos RPC de Supabase al aplicar las migraciones; no se modificó `src/types/database.types.ts` de B.
2. Aplicar las migraciones y ejecutar pruebas HTTP/RLS con JWT reales en un entorno Supabase explícitamente de prueba; probar doble edición desde conexiones independientes, carreras con materialización/expiración, bloqueo y reintento. Evaluar rendimiento de los bloqueos con historiales grandes.
3. Confirmar `TZ=UTC` del runtime Node y la política para horas ambiguas/inexistentes; persistir vínculo inequívoco de horario/ocurrencia mediante propuesta de B. Verificar que nuevas recetas se materialicen desde el instante del ajuste y que el worker no envíe interacciones canceladas o de versiones sustituidas.
4. Coordinar el cierre de los caminos DML heredados y la diferencia de `patient_adherence` frente al criterio canónico de C. Las RPC implementadas no sustituyen esa revisión de permisos y consumidores.
5. Completar los puntos anteriores de procesamiento entrante, expiraciones, respuestas tardías y recálculo tras altas, cambios de planes o paso del tiempo. Los cinco comandos recalculan y persisten; esos otros caminos todavía no quedan conectados por esta sesión.
6. Mantener pendientes el diccionario de características ML, endpoint/autenticación/versionado, elegibilidad y caducidad de predicciones, y pruebas del ciclo completo con A/B. No se declara terminado el MVP ni listo para uso clínico real.
