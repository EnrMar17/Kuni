# U06 — Respuestas entrantes y BAJA

Entrega local del 8 de septiembre de 2026. Fuente funcional: `kuni-plan-tecnico.md`, RF10, RF16, RF17 y sección 3; parser y validaciones de `domain-core`; esquema y funciones clínicas de las migraciones 0001–0005. Esta entrega implementa esas reglas y no sustituye los pendientes de U07–U14.

## Qué se realizó

- El webhook verifica la firma antes de tocar la base. Guarda el mensaje original en `webhook_events` y recupera ese registro también en los reintentos. Un duplicado ya no oculta un fallo posterior al primer insert.
- La migración **0006_inbound_commands.sql** añade `process_inbound_event`, ejecutable únicamente por `service_role`. Las sesiones de médicos y anónimos no pueden invocarla. Bloquea paciente, evento e interacciones y escribe el efecto clínico, auditoría, derivados y cierre del evento en una transacción. No fabrica un médico responsable: la auditoría conserva actor de sistema.
- La correlación exige remitente único, paciente, unidad, proveedor, tipo compatible y referencia. Sin referencia exige una sola solicitud compatible sin respuesta. Excluye futuros, cancelados, bloqueados y fallidos, y no atribuye un mensaje antiguo a un envío posterior. Una identidad ya normalizada no puede cambiar silenciosamente durante el reproceso.
- `SI`/`NO` crea una sola respuesta por interacción. Glucosa y presión se validan con los límites de captura ya existentes; el contexto procede del plan solicitado. Un contexto explícito contradictorio pide revisión del mensaje. Estos límites no son umbrales de riesgo nuevos.
- La respuesta válida acredita entrega, conserva `read` y fija `response_at` con la recepción original. Una respuesta tardía conserva `timeout_at`, resuelve la alerta de no-respuesta de esa interacción y recalcula riesgo/adherencia usando los helpers existentes. Si el cron aún no había registrado el vencimiento, se conserva también ese hito histórico.
- Las mediciones nuevas pasan por la revisión de límites personalizados existente. Se reutilizan sus alertas y la función de recálculo; no se incorporan decisiones clínicas nuevas.
- `BAJA` se reconoce en el parser y crea una revocación con la versión del aviso previo y referencia al evento como evidencia. El trigger existente cancela `queued`, `blocked_window` y `blocked_template`; la revalidación del worker sigue protegiendo la cola antes del envío. BAJA no se registra como toma o medición ni recalcula riesgo por sí sola.
- La ventana de sesión usa la recepción original y nunca retrocede por reprocesar un evento antiguo.
- `reconcileInboundEvents` pagina eventos `received/failed` y aplica la misma RPC antes de vencer, materializar o enviar. Si falla la ingesta, el tick se detiene antes de nuevos envíos; el evento sigue disponible para reintento. El orden completo es callbacks → inbound → expiración → materialización → envío → callbacks.
- Los mensajes no interpretables, incompatibles o ambiguos reciben ayuda en la respuesta HTTP del webhook, sin crear un dato clínico. La respuesta usa [TwiML, como documenta Twilio](https://www.twilio.com/docs/usage/webhooks/messaging-webhooks), y escapa el texto XML. No se llama a una API de envío durante las pruebas.

## Verificación realizada

`npm run verify` pasó: **408 pruebas raíz**, **299 pruebas de dominio**, comprobaciones TypeScript de ambos paquetes, ESLint y compilación de producción. Son suites parcialmente compartidas: no sumar sus conteos como cobertura única.

La integración SQL incorpora 32 casos nuevos y aplica las seis migraciones en PostgreSQL efímero mediante PGlite. Comprueba tomas, presión, glucosa, referencias ajenas, ambigüedad, límites de captura, evidencia de entrega, respuestas tardías, revocación/cancelación, permisos, sesión monotónica e idempotencia. Inyecta errores de recálculo y cierre del evento para verificar rollback de respuestas, consentimiento y cola. El riesgo y la adherencia resultantes se contrastan con el dominio existente.

Las pruebas del webhook cubren firma, payload incompleto, duplicado con contenido cambiado, errores de insert/lectura/RPC, botones con Body vacío y escape de ayuda. Las del cron comprueban paginación y que un fallo de inbound impide enviar.

También se comprobó la instancia de desarrollo de Windows en `localhost:3000`: `/login` responde 200 y `GET /api/webhooks/whatsapp` responde 405, sin errores de compilación. No se ejecutaron mensajes firmados reales ni jobs autorizados.

## Qué falta y límites explícitos

1. **Aplicar la migración 0006 en Supabase después de 0005 y verificar el circuito alojado.** No se aplicó ninguna migración remota en esta entrega. El código necesita esa RPC: si falta, el webhook devuelve 500 y conserva el evento; el tick tampoco avanzará al envío cuando encuentre inbound pendiente. Coordinar migración y actualización del servidor.
2. **Prueba real controlada:** entrega → respuesta → medición/toma → alerta/derivados; BAJA → próximo envío bloqueado; reintento del proveedor y permisos mediante PostgREST. PGlite no demuestra carreras entre conexiones ni la entrega efectiva de ayuda por WhatsApp.
3. **Reporte espontáneo sin solicitud compatible:** se conserva el mensaje y se pide referencia, sin crear una medición. El plan exige tipo/contexto y confirmación; falta concretar e implementar ese flujo de confirmación. No se inventó una conversación de varios pasos.
4. **BAJA sin evento de consentimiento previo:** se conserva como `outcome=review`, estado `ignored` y motivo explícito. No existe una versión de aviso que podamos copiar sin inventarla. La ausencia de consentimiento vigente ya impide los envíos automáticos. Requiere revisión del expediente, no una autorización ficticia.
5. **Ayuda de eventos históricos:** el reproceso persiste el resultado; no genera un envío independiente. Si el proveedor vuelve a invocar el webhook, recibe la ayuda almacenada. Sin ese reintento, falta un mecanismo de entrega durable de ayuda. Su entrega externa no es atómica con PostgreSQL y puede repetirse si se repite el webhook.
6. **Eventos anteriormente `ignored`:** no se reactivan masivamente. Requieren revisar la identidad o el motivo antes de reprocesar. Un error de RPC deja el evento pendiente y se registra en el log del servidor; no se declara procesado por haber guardado el crudo.
7. **Envío concurrente ya aceptado por el proveedor:** BAJA no puede retirar ese mensaje. Se mantiene la limitación de U03/U04 sobre la ventana externa y recuperación de estados ambiguos.

**Estado:** núcleo de U06 implementado y verificado localmente; U06 completo y operación alojada aún pendientes de los puntos anteriores. No se modificó el diseño.
