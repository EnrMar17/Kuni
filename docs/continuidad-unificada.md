# Continuidad unificada de Kuni

Actualizado: 8 septiembre 2026. Desde esta entrega, el trabajo se organiza como **un solo backlog**, sin repartirlo por A/B/C. Sus documentos se conservan como antecedentes. Las fuentes funcionales siguen siendo contratos, migraciones, plan de integración y decisiones ya registradas; esta página no introduce reglas clínicas nuevas.

## Entrega 1: base de la cola y verificación común

**Actualización posterior — U07:** se añadió el recálculo por cambios externos/tiempo y se alineó `patient_adherence`; [detalle de U07](u07-derivados-externos.md). `develop` se actualizó a `f2de17b` antes de continuar. Verificación local: 413 pruebas raíz, 314 de dominio, ambos typechecks, lint sin errores y build aprobados. La migración nueva 0007 y la validación alojada siguen pendientes: el usuario autorizó el entorno de prueba, pero el CLI local carece de login y proyecto vinculado.

**Actualización posterior — U06:** se implementó la ingesta clínica atómica, BAJA y reproceso durable. Véase [la entrega U06](u06-inbound-y-baja.md) para cambios, 408/299 pruebas, migración 0006 pendiente de aplicar y límites de cierre. La entrega 1 se conserva a continuación como antecedente.

Se empezó por los bloqueos encontrados en la [auditoría anterior](auditoria-estado-actual.md). Las correcciones de esa auditoría siguen en el árbol; esta entrega añade lo siguiente.

### Materialización completa y corte de recetas

- Todas las lecturas del materializador usan paginación ordenada y conteo exacto: unidades, recetas, planes, citas e historial de respuestas/no-respuestas. Una respuesta acotada por el API ya no se interpreta como historia completa. Si falta el total o una página queda incompleta, el job falla explícitamente.
- Las inserciones se agrupan en lotes de 500, el mismo tamaño usado para lectura; `created` usa el conteo confirmado por PostgreSQL, no la longitud de una respuesta potencialmente truncada. La clave de deduplicación existente se conserva: un fallo entre lotes permite repetir el tick sin duplicar ocurrencias ya insertadas.
- Una receta solo genera ocurrencias desde `prescriptions.created_at`, conforme al instante efectivo documentado por las RPC. Se comparan también los microsegundos: convertir ambos instantes únicamente a `Date` podía admitir una toma anterior al ajuste dentro del mismo milisegundo.
- El snapshot de nuevas tomas conserva `scheduleId` del horario real. No se inventaron identificadores históricos ni se añadió una FK que todavía no existe.
- Empates de fecha en la racha de no-respuestas se ordenan por ID para que el ancla de deduplicación no dependa del orden del API.

Archivos: `src/lib/jobs/materialize.ts`, `pagination.ts`, `effective-time.ts`; regresiones en `tests/unit/jobs-*`.

### Revalidación antes de enviar

El emisor relee cada interacción después de terminar los envíos anteriores del lote. Comprueba el token de reclamación, estado y ausencia de evidencia previa; revalida paciente/unidad activos, consentimiento, receta/plan vigente o cita aún programada. Una cita reprogramada invalida el snapshot del horario anterior. Teléfono y última ventana de sesión se obtienen de esa lectura reciente.

Una interacción que ya avanzó o fue cancelada no vuelve a enviarse. Si pierde autorización/vigencia, se cancela condicionalmente sin alterar evidencia de proveedor, entrega, lectura o respuesta. Las escrituras quedan acotadas por unidad, ID y claim. Un error de lectura impide enviar; no se convierte en autorización por defecto.

La ventana de texto libre rechaza fechas futuras, inválidas y el límite exacto de 24 horas. Las plantillas siguen usando los Content SID documentados; no se cambiaron sus textos ni se enviaron solicitudes al proveedor.

**Límite:** esta relectura no mantiene una transacción PostgreSQL abierta durante la llamada HTTP. Un cambio posterior a la última comprobación puede coincidir con el envío. Tampoco recupera automáticamente un `sending/unknown` cuyo SID nunca se pudo guardar. No se declara entrega exactamente una vez.

### Persistencia y callbacks

- El resultado del emisor se guarda solo sobre su claim todavía `sending`, sin evidencia posterior. Si otro escritor ya registró el mismo SID como `accepted/delivered/read`, se conserva ese avance.
- Un error SQL después de aceptación no se clasifica como rechazo del proveedor ni dispara un segundo envío. La operación falla para que sea visible; la interacción queda fuera de los reenvíos ciegos de `claim_due_interactions`.
- Una excepción inesperada durante la llamada al proveedor se trata como `unknown`, porque no acredita que el proveedor haya rechazado el mensaje.
- Un callback firmado que llega antes de guardar el SID queda durable y pendiente; ya no se descarta como `ignored` por esa sola razón.
- Los duplicados pendientes vuelven a procesarse; los confirmados como procesados/ignorados solo reciben ACK. Se conserva `received_at` original para fijar entrega/plazo, sin desplazarlo al momento del reintento.
- `reconcileStatusEvents()` aplica callbacks pendientes con la misma función de progresión y concurrencia optimista que usa el webhook. Busca por proveedor y SID, sin atribución por teléfono o proximidad temporal.
- El tick ejecuta: **callbacks → expiración → materialización → envío → callbacks**. Su JSON añade `callbacksBefore` y `callbacksAfter`, cada uno con `processed/pending`. En `send`, `failed` cuenta los no enviados por esa ejecución, incluidos los detenidos al revalidar; no significa necesariamente fallo físico de entrega.

**Límites:** callbacks antiguos ya marcados `ignored` no se reactivan automáticamente. Los nuevos que nunca encuentren SID permanecen pendientes: falta definir revisión/retención operacional. Si el proveedor aceptó y la base no conservó su SID, aún hace falta reconciliación con evidencia del proveedor. No se hizo ninguna de esas operaciones sobre datos reales.

### Expiración, entorno y predicción

- Se añadieron **14 pruebas SQL de paridad** de `expire_due_interactions` frente a `evaluateExpirations`: todos los estados de entrega, plazo futuro/exacto, respuesta, interacción informativa y ausencia de evidencia. Comprueban idempotencia, deduplicación de alertas y conservación del timeout después de responder. Revocar consentimiento después de entregar no borra el seguimiento histórico. No se alteró la RPC ni la función pura.
- Los scripts `dev/build/start` arrancan Node con `TZ=UTC`, como exige la documentación de paridad SQL. Las conversiones clínicas siguen usando la zona de cada unidad. El lanzador pasa los argumentos a Next y propaga errores/código de salida; funciona sin sintaxis de shell dependiente de Windows/Linux.
- Ambos paquetes usan Vitest 5.0.0 en el lock. El paquete de dominio dejó de depender de la cadena vulnerable de Vitest 2/Vite/esbuild. Se siguió la [guía oficial de migración](https://vitest.dev/guide/migration/), que requiere Node >=22.12; esta sesión usó Node 24.13.0. No se ejecutó `audit fix --force`.
- RF30 construye features usando `generatedAt` de la lectura de la ficha. El panel muestra ese corte en la zona de la unidad dentro del pie existente. El punto de publicación rechaza predicciones sin versión identificable; el parser puro conserva la compatibilidad de versiones null en pruebas. No se inventó TTL, horizonte ni una fecha de cálculo del proveedor.

## Verificación común

Para instalar desde un checkout limpio:

```sh
rtk npm ci
rtk npm --prefix domain-core ci
```

Para ejecutar todas las comprobaciones de código:

```sh
rtk npm run verify
```

El comando ejecuta secuencialmente suite raíz, suite SQL/dominio, ambos typechecks, lint y build; se detiene ante un fallo. No aplica migraciones ni llama al proveedor. Evitar ejecutar una suite con dependencias instaladas para otro sistema operativo.

Comprobaciones adicionales:

```sh
rtk npm audit
rtk npm --prefix domain-core audit
rtk git diff --check
```

Resultado de cierre de esta entrega:

| Comprobación | Resultado |
|---|---|
| Suite raíz | 404 pruebas, 39 archivos |
| Suite dominio/SQL | 267 pruebas, 13 archivos; 94 pruebas SQL |
| TypeScript raíz y dominio | Aprobados |
| ESLint y build | Aprobados |
| Audit de dependencias raíz y dominio | 0 avisos en ambos |
| HTTP de producción local | login/health 200, dashboard 307 a login, tick sin autorización 401 |
| `git diff --check` | Aprobado |

Las suites comparten pruebas unitarias: no sumar sus totales como pruebas distintas. La evidencia de concurrencia de esta entrega es por mocks de carreras y PostgreSQL efímero de una conexión, no estrés multiconexión en Supabase. El servidor temporal se detuvo. Sin commit, despliegue, migraciones remotas, envío WhatsApp ni inferencia real.

## Backlog único y criterio de cierre

“Verificado local” significa código y pruebas de esta entrega; no certifica operación alojada. No se recalculan porcentajes por integrante: el objetivo ahora es cerrar el circuito común.

| ID | Trabajo | Estado actual | Qué falta para cerrarlo |
|---|---|---|---|
| U01 | Lecturas, sesión y dashboard | Implementados; auditoría previa y bitácora | Mantener regresiones; incluirlos en ensayo final |
| U02 | Materializador paginado y corte efectivo | **Verificado local** | Ensayo con volumen remoto y escrituras concurrentes; preservar captura coherente de rachas |
| U03 | Revalidación por envío | **Verificado local, cierre operacional pendiente** | Ensayo multiconexión de revocación/ajuste/claim/envío; definir tratamiento de la ventana externa inevitable |
| U04 | Persistencia, callbacks y recuperación | **Avanzado** | Recuperar SID no persistido y `sending/unknown` con evidencia del proveedor; revisión de pendientes antiguos; no reenviar a ciegas |
| U05 | Expiración y paridad SQL | **Verificado local** | Ensayo alojado dentro del circuito completo |
| U06 | Inbound clínico y BAJA | **Núcleo verificado local** | Aplicar 0006, ensayo alojado/concurrente, confirmación de reportes espontáneos y entrega durable de ayuda histórica; [detalle](u06-inbound-y-baja.md) |
| U07 | Derivados por eventos externos | **Núcleo verificado local** | Aplicar 0007 y ensayar recálculo alojado/contención/volumen; planes por DML se detectan en el siguiente tick exitoso. Vista alineada; [detalle](u07-derivados-externos.md) |
| U08 | Alta y edición persistentes | **Pendiente** | Comando atómico paciente/diagnósticos/consentimiento/receta/planes; conectar formulario existente, sin éxito ficticio |
| U09 | Citas persistentes | **Pendiente** | Crear/editar/cancelar/estado con zona, autorización e invalidación de cola; cerrar criterio de conflictos de agenda |
| U10 | Corrección de tomas e historia clínica | **Pendiente** | Recuperar ocurrencia/horario originales para la acción existente; consultas de historia y formularios documentados |
| U11 | RF30 | **Corte/procedencia verificados local; incompleto** | Endpoint alojado, elegibilidad con brechas, TTL/invalidación y contrato real aprobado con IA |
| U12 | Dependencias y paridad horaria | **Verificado local** | Asegurar que el despliegue use el lanzador y Node compatible; verificar versiones IANA |
| U13 | Ensayo funcional/accesibilidad | **Pendiente** | Navegador con dos unidades/roles, formularios, móvil, teclado/foco, reportes y flujo completo |
| U14 | Operación y rendimiento alojados | **Pendiente** | Plantillas aprobadas y configuradas, URL estable, métricas de latencia/cola, paginación/consultas especializadas, revisión de incidencias |

## Próxima entrega

**Cerrar la validación alojada de U06/U07 y continuar U08.** Ingesta, BAJA, reproceso y recálculo ya tienen núcleo local; falta comprobar el estado remoto y aplicar 0006/0007 según corresponda tras completar login/link del CLI. Los reportes espontáneos sin solicitud y la ayuda histórica mantienen los límites descritos en U06; U07 documenta la consistencia eventual del barrido y sus límites de volumen.

Después: U08 y U09. Las decisiones no cerradas de agenda y elegibilidad/TTL de IA se mantienen explícitas; escribir documentación nueva no basta para convertir una suposición en requisito aprobado. El alta, citas, BAJA y la operación completa **no se declaran terminados por haber mejorado la cola**.
