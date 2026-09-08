# Reporte de develop - 2026-09-08

## Hallazgos prioritarios

### 1. [P1] Las respuestas de WhatsApp no producen efectos clinicos

El webhook verifica firma, identifica al paciente y conserva el mensaje interpretado, pero deja el evento en `received`: no crea mediciones/respuestas ni actualiza `response_at`. El tick solo expira, materializa y envia; no consume esos eventos. Un paciente puede contestar y seguir apareciendo como no respondido. BAJA tampoco tiene un camino de revocacion persistente conectado.

Evidencia: [webhook entrante](C:/Users/pau87/Documents/Hackaton/Proyecto_2/Kuni/src/app/api/webhooks/whatsapp/route.ts:151) y [tick](C:/Users/pau87/Documents/Hackaton/Proyecto_2/Kuni/src/app/api/jobs/tick/route.ts:40).

**Continuacion C+B:** implementar un consumidor recuperable y un comando transaccional de ingestion: evento + identidad del remitente + `reply_code` + interaccion original; validar variable, contexto y captura; guardar dato, respuesta, historial de timeout y derivados atomicamente. Las cinco RPC actuales son de correccion/atencion con Auth clinico, NO sustituyen este comando de registro desde el canal. No invocarlas como un medico ficticio desde `service_role`.

**Cierre:** SI/NO, glucosa, presion, respuesta tardia, codigo ajeno, mensaje ambiguo, duplicado y BAJA probados de extremo a extremo; cada evento valido produce un solo efecto. Un fallo intermedio se puede recuperar sin duplicar datos.

### 2. [P1] Un ajuste puede generar una toma retroactiva de la receta nueva

El materializador consulta fecha de inicio y horarios, pero no `prescriptions.created_at`. `todaysOccurrenceInstant()` acepta cualquier horario ya cumplido hoy. Ejemplo: ajustar a las 14:00 una receta con horario 08:00 permite materializar y enviar una toma de las 08:00 para la version nueva, aunque esa version no existia entonces. La deduplicacion por ID de receta no la equipara a la toma anterior.

Evidencia: [consulta/materializacion](C:/Users/pau87/Documents/Hackaton/Proyecto_2/Kuni/src/lib/jobs/materialize.ts:66), [seleccion de ocurrencia](C:/Users/pau87/Documents/Hackaton/Proyecto_2/Kuni/src/lib/jobs/materialize.ts:99) y [regla horaria](C:/Users/pau87/Documents/Hackaton/Proyecto_2/Kuni/src/lib/whatsapp/schedule.ts:39). Es una deduccion del camino de codigo; no se enviaron mensajes para reproducirla.

**Continuacion B+C:** limitar ocurrencias de versiones ajustadas al instante efectivo; transportar el horario original y probar la carrera ajuste/materializador/claim. Revalidar receta y consentimiento cerca del envio: actualmente el claim valida, pero el envio posterior usa el lote ya reclamado. Una revocacion o ajuste entre ambas operaciones requiere politica y manejo explicitos.

**Cierre:** ajuste antes/despues de una hora, cambio de dia/zona y dos workers no producen tomas retroactivas ni reescriben mensajes entregados.

### 3. [P1] Los reintentos de webhook pueden quedar anulados por la deduplicacion

Se inserta primero el evento. Si despues falla una consulta o el update del efecto, se responde 500; el siguiente intento encuentra `23505` y devuelve 200 sin reanudar el trabajo. En callbacks, un SID aun no vinculado a la interaccion se marca `ignored`; puede ocurrir si el callback llega antes de guardar el resultado del envio. No se encontro un consumidor de recuperacion en el tick.

Evidencia: [deduplicacion inbound](C:/Users/pau87/Documents/Hackaton/Proyecto_2/Kuni/src/app/api/webhooks/whatsapp/route.ts:70), [deduplicacion de estado](C:/Users/pau87/Documents/Hackaton/Proyecto_2/Kuni/src/app/api/webhooks/whatsapp/status/route.ts:79) y [SID no encontrado](C:/Users/pau87/Documents/Hackaton/Proyecto_2/Kuni/src/app/api/webhooks/whatsapp/status/route.ts:96).

**Continuacion B:** distinguir evento recibido de evento procesado; reclamar/reintentar eventos pendientes o fallidos, con estados y bloqueo. Conservar temporalmente callbacks aun no correlacionados para reconciliarlos, sin atribuirlos arbitrariamente.

**Cierre:** inyectar fallo despues del insert y antes del update, reenviar el mismo evento y comprobar recuperacion; callback adelantado y callbacks concurrentes conservan el estado mas avanzado.

### 4. [P1] El envio puede reportar exito aunque no guarde el SID

`sendAndRecord()` espera el update de Supabase pero no revisa su campo `error`, y luego devuelve `sent`. Los updates de fallo tampoco revisan el resultado. Una aceptacion del proveedor seguida de error de base puede dejar la fila en `sending` y sin SID; el catch no detecta un error devuelto como dato. Esto impide correlacionar callbacks y deja al cron con un resultado enganoso.

Evidencia: [persistencia del envio](C:/Users/pau87/Documents/Hackaton/Proyecto_2/Kuni/src/lib/jobs/send.ts:143).

**Continuacion B:** comprobar errores y filas afectadas, separar aceptacion externa de persistencia local e incorporar reconciliacion de `sending/unknown`. No reenviar a ciegas un mensaje potencialmente aceptado.

**Cierre:** prueba de proveedor aceptando + Supabase rechazando el update; el sistema conserva una incidencia recuperable y no informa un envio completamente registrado.

### 5. [P1] La suite SQL de C esta rota tras cambios del DTO

Resultado reproducido: 11 de 253 pruebas de `domain-core` fallan y su typecheck informa dos errores TS2352. Los fixtures en las lineas 86 y 524 no aportan `complications`; `buildDashboardData()` ahora ejecuta `rows.complications.filter(...)`. No demuestra por si mismo un fallo de produccion: demuestra fixtures incompatibles y deja sin verificar esas comparaciones SQL/TypeScript.

Evidencia: [fixture comun](C:/Users/pau87/Documents/Hackaton/Proyecto_2/Kuni/domain-core/tests/integration/clinical-rpcs.test.ts:86), [segundo fixture](C:/Users/pau87/Documents/Hackaton/Proyecto_2/Kuni/domain-core/tests/integration/clinical-rpcs.test.ts:524) y [consumidor](C:/Users/pau87/Documents/Hackaton/Proyecto_2/Kuni/src/lib/domain/dashboard.ts:188).

**Continuacion C:** actualizar ambos fixtures con el contrato completo, incluyendo las entradas necesarias para cohortes terapeuticas; preferir una factoria tipada y no esconder incompatibilidades con casts. Volver a ejecutar paridad antes de decidir si hay otras diferencias SQL. Agregar ambas suites y ambos typechecks al control de integracion.

**Cierre:** 253/253 o el nuevo total completo en verde y typecheck de C aprobado. La suite raiz no cubre las integraciones SQL: [configuracion](C:/Users/pau87/Documents/Hackaton/Proyecto_2/Kuni/vitest.config.mts:18). Su typecheck tambien excluye esos tests.

### 6. [P2] Alta de pacientes y agenda siguen siendo preparaciones sin guardar

El alta ejecuta un submit vacio y la agenda solo actualiza una vista previa. No existe un flujo operativo completo para incorporar pacientes con diagnosticos/consentimiento ni administrar citas desde estos formularios.

Evidencia: [alta](C:/Users/pau87/Documents/Hackaton/Proyecto_2/Kuni/src/components/patient-create-form.tsx:74) y [agenda](C:/Users/pau87/Documents/Hackaton/Proyecto_2/Kuni/src/components/appointment-form.tsx:60).

**Continuacion A+B/C:** acordar comandos atomicos de captura y agenda; conectar Server Actions con validacion, contexto Auth, errores y conflictos. Guardar consentimiento como evento con evidencia. Completar planes, objetivos y receta/horarios iniciales. Cambiar/cancelar citas debe invalidar cola pendiente sin alterar mensajes ya enviados.

**Cierre:** crear, recargar y recuperar datos persistidos; fallo parcial revierte; usuario viewer u otra unidad no puede mutar; cancelacion/reprogramacion no envia un aviso obsoleto.

## Alcance y evidencia

- Rama local revisada: `develop`, commit `2d4a06df4955acd14d8330151d77d4a2ce85edb5` (merge PR #6, C8).
- `HEAD` y la referencia local `origin/develop` coincidian. No se ejecuto fetch: no se afirma que el servidor remoto no tenga commits posteriores.
- Arbol limpio al empezar. Revision de fuentes, migraciones, pruebas y documentacion; no se modifico codigo, configuracion ni migraciones. Se agrega solamente este reporte.
- Sin lectura de secretos, consultas remotas, mensajes reales ni llamadas al modelo. Los defectos de transporte se identificaron por inspeccion; el fallo de suite se reprodujo ejecutando las pruebas.

## Que ya existe y no debemos rehacer

| Area | Estado sustentado |
|---|---|
| Acceso/dashboard | SSR, ambito de unidad/consultorio, lecturas reales, indicadores y rutas protegidas implementados. |
| RPC clinicas | Cinco funciones SQL; las cinco tienen Server Action en `src/actions/clinical.ts`. La correccion de toma aun no tiene control conectado en `clinical-actions.tsx` ni horario original expuesto por el DTO del dashboard. |
| RF28 | Migracion de complicaciones, tipos, captura en ficha y adaptacion a features presentes. |
| C8 | Cohortes por clase terapeutica ya calculadas y enviadas al vector; no sigue pendiente escribir ese adaptador. |
| ML | Vector de 17 entradas, cliente, adaptador por paciente, panel RF30, servicio Python y modelo entrenado presentes. |
| Transporte | Proveedor, firma, callback, normalizacion de telefono, cola, expiracion, recordatorios de citas y resumen de no-respuesta implementados. Falta cerrar ingestion/recuperacion. |
| Despliegue reportado | B documenta migraciones 0002-0005 aplicadas, Cron y RLS de dos unidades probados. Es evidencia historica del equipo, no verificacion remota de esta revision. |
| Modelo reportado | `docs/ml-service-para-B.md` declara C1 probado con autenticacion y panel; falta confirmar operacion en la maquina elegida para la demo. No corresponde declararlo "sin implementar". |

Fuentes complementarias: [documentacion B](C:/Users/pau87/Documents/Hackaton/Proyecto_2/Kuni/docs/documentacionB.md), [operacion ML](C:/Users/pau87/Documents/Hackaton/Proyecto_2/Kuni/docs/ml-service-para-B.md) y [adaptador C8](C:/Users/pau87/Documents/Hackaton/Proyecto_2/Kuni/src/lib/ml/patient-features.ts:44).

## Otros pendientes

| Pendiente | Responsable propuesto | Criterio de cierre |
|---|---|---|
| Recalculo por ingestion, expiracion, cambios de plan y tiempo | C+B | Persistencia de riesgo y alertas consistente con el calculo en lectura; prueba de paridad de expiracion. |
| Correccion de tomas e historial completo de recetas | A+B/C | Exponer respuesta, token, horario/ocurrencia original y versiones historicas; control UI conectado a la accion existente. |
| Permisos DML heredados y `patient_adherence` | B+C | Acordar caminos autorizados de alta/edicion y una semantica unica; RLS no sustituye tokens ni transacciones clinicas. |
| Plantillas y Sender WhatsApp | B, tramite externo | Segun bitacora aun en proceso; confirmar aprobaciones/configuracion y probar fuera de sesion. No asumir estado actual del proveedor. |
| Operacion de app, cron y modelo | B+C | URL estable o procedimiento de actualizacion, arranque/reinicio, health checks y reconciliacion/alerta de jobs fallidos. Confirmar `TZ=UTC` y zonas IANA. |
| Elegibilidad de prediccion con gaps | C+equipo IA/A | Politica explicita para datos ausentes, version y corte; no confundir relleno con dato observado. Modelo separado del riesgo actual. |
| QA de navegador y recorrido integrado | A+B+C | Dos roles/unidades, foco/teclado/movil, formularios, conflictos, CSV/impresion y ciclo completo con datos ficticios. |
| Volumen del worker | B | Paginar consultas de materializacion/historia y probar limites de Supabase; hoy no usan la paginacion defensiva del dashboard. |
| Higiene de lint y documentacion | A+B+C | Excluir `.venv` del lint, consolidar pendientes actuales y registrar evidencia por commit, sin borrar la historia. |

No editar retroactivamente migraciones que B reporta aplicadas: cualquier cambio SQL posterior debe ir en una migracion incremental nueva, coordinando el numero con el equipo.

## Como seguir

1. **Primera tarea de C: restaurar pruebas de paridad.** Es acotada y desbloquea confianza para modificar ingestion/derivados. Agregar verificaciones de ambos paquetes al proceso de merge; no basta `npm test` de la raiz.
2. **Primera tarea de B, en paralelo: asegurar materializacion y registro del envio.** Resolver el corte efectivo de receta, errores de persistencia, eventos reintentables y reconciliacion; no depende del panel ML.
3. **Siguiente entrega C+B: cerrar el circuito entrante.** Contrato de ingestion de servicio separado de las RPC humanas; correlacion, duplicados, respuesta tardia, BAJA y recalc en una transaccion. Cablear consumidor al tick o al mecanismo acordado.
4. **A en paralelo: contratos y formularios de alta/agenda.** Puede avanzar en validacion/estados y pruebas con mocks; conectar persistencia cuando esten los comandos. Completar toma corregible e historia cuando llegue el DTO ampliado.
5. **Cierre conjunto de demo:** elegir maquina/URLs definitivas, confirmar estado de plantillas y modelo, y ejecutar recorrido con pacientes ficticios desde alta hasta respuesta y correccion. Registrar resultados por escenario; no declarar listo por tener solo tests unitarios verdes.

Orden recomendado: primero integridad del circuito y pruebas; despues CRUD pendiente y operacion. No invertir otra entrega en rehacer RPC, el vector ML o C8, que ya estan en la rama.

## Verificacion realizada hoy

| Comando | Resultado |
|---|---|
| `npm test` | 369 pruebas aprobadas, 34 archivos, Vitest 5.0.0. Incluye pruebas unitarias de domain-core; no sumar ambos totales como si fueran casos distintos. |
| `npm --prefix domain-core test` | 242 aprobadas y 11 fallidas, 253 totales en 13 archivos, Vitest 2.1.9. Fallos por fixtures sin `complications`. |
| `npm run typecheck` | Aprobado. Excluye `domain-core/tests`. |
| `npm --prefix domain-core run typecheck` | Fallo: TS2352 en fixtures, lineas 86 y 524. |
| `npm run lint` | Cero errores, tres advertencias de JS de scikit-learn dentro de `ml-service/.venv`. |
| `node --import tsx domain-core/scripts/smoke-check.ts` | 48 comprobaciones aprobadas. |

El primer arranque de Vitest de C y de tsx fallo por restricciones del sandbox. Se repitieron los mismos comandos con permisos autorizados: el fallo final de las 11 pruebas es real, no el fallo de acceso inicial.

No se ejecuto build de produccion, QA en navegador, Python/endpoint ML, pruebas de concurrencia con varias conexiones ni validacion remota durante esta revision. Las menciones a pruebas reales anteriores se atribuyen a las bitacoras, no a esta ejecucion. Los documentos antiguos que aun listan B1/B2/B3/B4/B6/B7/B8 o C1/C2/C7/C8 como no implementados necesitan conciliacion con las entradas recientes y el codigo.
