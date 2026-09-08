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
