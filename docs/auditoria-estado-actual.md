# Auditoría de estado, integración y rendimiento — 8 septiembre 2026

> Estado anterior a la entrega unificada. Consultar [continuidad unificada](continuidad-unificada.md) para lo realizado después de esta auditoría y el backlog vigente. Los porcentajes por integrante quedan como registro histórico.

Revisión sobre `2d4a06d`, con árbol limpio al comenzar. Esta auditoría actualiza el estado de las revisiones anteriores; no reescribe sus resultados históricos. Fuentes: README, plan de integración, documentación A/B/C, bitácora B, contratos TypeScript, migraciones 0001–0005 y código actual. No se modificaron reglas de riesgo, fórmulas de adherencia, migraciones ni diseño.

## Resultado

La aplicación compila y sus comprobaciones locales pasan después de las correcciones. **El circuito completo todavía no está cerrado**: alta y citas no persisten desde sus formularios, el inbound no registra el efecto clínico y la cola tiene brechas de concurrencia e integración. Una suite verde no acredita ese circuito.

Ya existen cinco adaptadores de RPC clínicas, RF28, clase terapéutica, expiración en el tick, vector ML y panel RF30. No deben seguir apareciendo como inexistentes. B documenta migraciones aplicadas, Cron operativo y aislamiento RLS remoto; esta sesión verificó código/tipos y pruebas locales, **no volvió a verificar esos servicios remotos**. Los tipos generados por sí solos no prueban qué está desplegado.

## Correcciones realizadas

| Problema | Corrección | Respaldo |
|---|---|---|
| Una urgencia guardada con estado `open` se mostraba como respuesta inválida | El lector de `markUrgent` acepta `open`; resolución mantiene su restricción a estados de atención/cierre. Se conserva la respuesta de un reintento ya resuelto. | `0003_clinical_commands.sql`, documentación C: urgencia inicial e idempotencia |
| Ajustar dosis fallaba antes de llegar a SQL: acción exigía segundos, formulario y RPC usan minutos | Reutilizar `prescriptionAdjustmentInputSchema.shape.schedules` (`HH:MM`). Regresión con el mismo formato que envía la interfaz y rechazo de segundos. | `src/contracts/clinical.ts`, validación de horarios en `0003` |
| Exportaciones de objetos Zod desde un archivo `use server` | Mover los dos esquemas exportados a `src/contracts/clinical-actions.ts`; acciones y pruebas los importan. | Guía local `next/dist/docs/01-app/03-api-reference/01-directives/use-server.md` y validador `action-validate.js`: solo funciones async como exportaciones de ejecución |
| QueryClient singleton también podía usarse durante prerender en servidor | Crear instancia independiente cuando no existe `window`; conservar instancia del navegador | Aislamiento por sesión descrito en `providers.tsx`; guía local Server/Client Components |
| Suite SQL: 11 fallos y typecheck de dominio roto | Añadir `complications: []` a los dos fixtures de paridad de 0001–0003, donde no hay captura RF28 | Contrato obligatorio `DashboardRows`; no se hizo opcional el dato de producción ni se desactivaron pruebas |
| Ejecutables locales de pruebas/build ausentes | `npm ci` en raíz y `domain-core`, sin modificar manifiestos/locks | Archivos lock existentes |

## Rendimiento medido

En `buildDashboardData()` se agrupan alertas y citas una sola vez por paciente, se reutiliza el grupo existente de complicaciones y se construye una sola cohorte por receta para presentarla y agregarla por clase terapéutica. Se mantienen orden, filtros de ámbito y todas las funciones canónicas. No se añadió caché compartida de datos clínicos.

Comparación en el mismo proceso Node contra el archivo de `2d4a06d`: tres rondas de calentamiento, diez muestras por versión, alternando orden; mediana. **Igualdad profunda de toda la salida en ambos tamaños**, además de las regresiones de ámbito/riesgo/adherencia existentes.

| Pacientes sintéticos | Interacciones | Alertas / citas | Antes | Después | Reducción de CPU |
|---:|---:|---:|---:|---:|---:|
| 100 | 4,000 | 2,000 / 2,000 | 23.78 ms | 14.33 ms | 39.7 % |
| 1,000 | 40,000 | 20,000 / 20,000 | 889.84 ms | 134.87 ms | 84.8 % |

Es un benchmark sintético del adaptador: no representa latencia HTTP, red, Supabase, navegador ni un dataset del piloto. No contiene mediciones/planes; ejercita asociaciones, recetas y cohortes. No se atribuye la mejora del segundo build a estos cambios: ese build ya tenía caché.

Reproducir versión actual: `rtk proxy node --import tsx scripts/benchmark-dashboard.ts`. Para comparar, guardar el contenido original de `git show 2d4a06d:src/lib/domain/dashboard.ts` como `src/lib/domain/audit-baseline.tmp.ts`, pasar esa ruta como argumento y eliminar ese archivo al terminar. El script no consulta servicios ni escribe registros.

Pendientes de rendimiento, **B con A**: consultas específicas para ficha/citas/estadísticas (hoy cargan el DTO completo del consultorio), medir latencia y planes SQL con volumen representativo, revisar coste de conteos exactos paginados. El materializador también necesita paginación completa antes de escalar. No se recortaron ventanas o filas para aparentar velocidad.

## Avance por integrante

**Porcentaje de hitos de implementación acreditados**, no esfuerzo, calidad individual, tiempo restante ni preparación para producción. Rúbrica explícita: 12 hitos de igual peso por integrante; se acredita la implementación indicada, con sus límites anotados. Los hitos grandes de circuito/ensayo no se acreditan por tener mocks. Esta rúbrica difiere de las ponderaciones estimadas del informe anterior, por lo que sus porcentajes no son una serie temporal comparable.

Identidades según historial y documentación: A = Enrique (`enriq`/Enrique Martínez); B = César (`Cesaredmyt`); C = Rudy (`Rudy-77`/Rudy). La asignación siguiente es responsabilidad del módulo, no una atribución de quién introdujo cada defecto.

| Integrante | Hitos acreditados | Avance de implementación |
|---|---:|---:|
| A — Enrique | 9 / 12 | **75 %** |
| B — César | 9 / 12 | **75 %** |
| C — Rudy | 8 / 12 | **67 %** |

### A: evidencia y pendientes

| Hito | Acreditado | Evidencia o pendiente |
|---|---|---|
| Acceso SSR y selección de consultorio | Sí | auth, contexto y pruebas |
| Rutas protegidas y navegación | Sí | rutas compiladas |
| Dashboard de lectura | Sí | queries, adaptador, render |
| Censo con búsqueda/filtros implementados | Sí | `clinical-workspace.tsx`; periodo aún pendiente |
| Vistas de ficha, citas, alertas y estadísticas | Sí | componentes/rutas de lectura; no equivale a CRUD |
| Loading y fronteras de error | Sí | archivos por ruta y global |
| Adaptadores de las cinco RPC | Sí | `actions/clinical.ts`, pruebas; corrección de tomas carece de datos suficientes en UI |
| Captura RF28 y clase terapéutica | Sí | acciones/componentes; ensayo remoto de esta UI pendiente |
| Panel RF30 integrado | Sí | ficha + Suspense + adaptador; procedencia/corte pendientes abajo |
| Alta/edición, consentimiento, receta y plan persistentes | No | falta comando atómico y conexión del formulario |
| CRUD persistente de citas | No | preparación de formulario sin guardar |
| Ensayo completo de interfaz, roles y accesibilidad | No | revisión de navegador diferida según documentación A |

### B: evidencia y pendientes

| Hito | Acreditado | Evidencia o pendiente |
|---|---|---|
| Esquema y tipos base | Sí | migraciones y `database.types.ts` |
| Clientes SSR/admin y controles de acceso | Sí | clientes, contexto, pruebas |
| Consultas de dashboard acotadas | Sí | unidad/consultorio, paginación y errores explícitos |
| Adaptador de proveedor y firmas | Sí | Twilio + pruebas de proveedor/webhooks |
| Recepción durable y ruta de callbacks | Sí | rutas implementadas; no acredita persistencia clínica ni carreras completas |
| Materializador de cuatro tipos | Sí | cuatro ramas implementadas; no acredita corte efectivo/paginación |
| Expiración y tick | Sí | expire → materialize → send y pruebas; Cron acreditado por bitácora B |
| RF28 y clase terapéutica | Sí | 0004/0005, tipos, pruebas PGlite |
| Verificación de aislamiento RLS entre unidades | Sí | script y resultado 10/10 documentado por B, no reejecutado aquí |
| Inbound con efecto clínico y BAJA | No | permanece `received` |
| Cola segura ante cambios/reintentos/concurrencia | No | hallazgos graves siguientes |
| Cierre operacional: plantillas, recuperación y volumen | No | aprobación externa/ensayos/mediciones pendientes |

### C: evidencia y pendientes

| Hito | Acreditado | Evidencia o pendiente |
|---|---|---|
| Reglas actuales de riesgo | Sí | dominio y paridad SQL |
| Adherencia canónica | Sí | dominio + SQL + adaptadores |
| Parser y validaciones | Sí | pruebas unitarias |
| Expiración pura | Sí | pruebas unitarias; no sustituye paridad SQL completa |
| Cinco RPC transaccionales | Sí | 0002/0003 y 63 pruebas SQL |
| Contratos y adaptadores de comandos | Sí | contratos, tipos y acciones; correcciones menores arriba |
| Vector ML y adaptador de datos/clases | Sí | features, patient-features, cohortes por clase |
| Cliente ML y servicio en repositorio | Sí | parser/cliente probado con mocks y FastAPI presente |
| Ingestión clínica transaccional | No | sin procesador conectado |
| Recálculo por eventos externos y paridad de expiración | No | las RPC cubren sus cambios; faltan otros eventos |
| Predicción alojada con procedencia y vigencia verificadas | No | no acreditada en esta sesión; corte/versión/elegibilidad pendientes |
| Ensayo completo de concurrencia y circuito clínico | No | PGlite de una conexión no lo demuestra |

No se promedian estos porcentajes para declarar el MVP completo: las responsabilidades se solapan y un solo eslabón faltante bloquea todo el circuito.

## Problemas grandes que debe resolver el equipo

### P1 — Inbound y BAJA sin efecto clínico: C responsable, B integra

`src/app/api/webhooks/whatsapp/route.ts` conserva `processing_status='received'` y guarda el parser; no registra mediciones, tomas, `response_at` ni revocación. La integración obligatoria de `0001` exige efecto clínico atómico y `BAJA → consent_events.revoked`. Consecuencia: contestar no cambia métricas y pedir BAJA no revoca por este camino.

**Cierre:** RPC/worker con correlación de referencia/paciente, validación, deduplicación, respuestas tardías y BAJA auditada; pruebas de reintento, ambigüedad y rollback. B debe permitir reprocesar eventos durables: un fallo después del insert seguido de webhook duplicado hoy puede terminar en ACK sin completar normalización.

### P1 — Cambios posteriores al claim no se revalidan al enviar: B, con C

`claim_due_interactions` verifica consentimiento/vigencia al reclamar, pero `send.ts` después solo obtiene teléfono/ventana y envía un lote secuencial. Revocar consentimiento, desactivar paciente/unidad o sustituir receta entre claim y envío deja una ventana no protegida. Está expresamente pendiente en documentación C y en la integración obligatoria de `0001`.

**Cierre:** protocolo de revalidación final y concurrencia antes del proveedor, sin alterar registros entregados; pruebas con cambios entre reclamación y envío, y recuperación de `sending/unknown` tras interrupciones. No basta añadir un filtro aislado y declarar atomicidad con un proveedor externo.

### P1 — Receta ajustada puede generar ocurrencias anteriores al ajuste: B, C valida

`materialize.ts` no lee `prescriptions.created_at`; genera ocurrencias de hoy por horario. C exige empezar la nueva versión desde su instante efectivo. Un ajuste a mediodía puede generar la toma de la mañana para la nueva versión; el claim la considera vencida y enviable.

**Cierre:** respetar el corte efectivo sin perder horarios posteriores; conservar la identificación del horario/ocurrencia para correcciones. Probar ajuste antes/después de cada toma, reintentos y cambios de zona. No se cambió el algoritmo de programación en esta auditoría.

### P1 — Persistencia del envío no garantiza progresión ni reconoce errores SQL: B

En `sendAndRecord()` la actualización a `accepted` filtra solo por ID y no inspecciona `error`; `markFailed()` tampoco. Puede contarse como enviado un resultado cuya escritura falló. Además, la protección optimista del callback no protege esta escritura del emisor: si un callback ya adelantó el estado, el `accepted` posterior puede hacerlo retroceder. Un callback que llega antes de guardar el SID requiere reconciliación.

**Cierre:** persistir/conciliar SID y estados con progresión monotónica, comprobar errores y ensayar callback antes/durante/después de la escritura. No reintentar ciegamente un mensaje que pudo ser aceptado por el proveedor.

### P2 — Materializador sin lectura paginada: B

Las consultas de recetas, planes, citas e historial de no-respuestas no usan paginación ni comprueban el límite del API. A diferencia del dashboard, pueden trabajar con resultados truncados. Con historial incompleto, una respuesta que rompe la racha puede no estar entre las filas leídas.

**Cierre:** lecturas completas/acotadas según criterio documentado, estabilidad del orden, pruebas que excedan el límite de respuesta y medición SQL. No asumir un límite remoto concreto sin verificar configuración.

### P2 — Alta, edición y citas aún sin persistencia: A; B/C contrato atómico

Los formularios preparan datos y no deben afirmar éxito de guardado. Falta cerrar paciente/diagnósticos/consentimiento/receta/planes y CRUD de citas con zona horaria, autorización e invalidación de cola. Son desarrollos funcionales, no reparaciones pequeñas.

### P2 — Predicción sin corte visible y contrato de vigencia incompleto: C + A

El panel muestra versión cuando existe, pero no fecha de corte; el cliente admite `modelVersion=null`. La documentación permite null en pruebas, exige procedencia para el modelo real y pide distinguir corte/cálculo/vigencia. La ficha obtiene datos en un instante y el panel construye features con un reloj posterior. También falta cerrar la política de publicación con brechas/imputaciones y TTL.

**Cierre:** C acuerda procedencia/elegibilidad/vigencia con IA; A representa corte y estados usando esa información real. No inventar una fecha de predicción, horizonte o TTL. El endpoint alojado no se contactó.

### P2 — Dependencias de pruebas de C con avisos de seguridad: C

`npm audit` en raíz: 0 avisos. En `domain-core`: 5 (1 crítico, 1 alto, 3 moderados), todos en dependencias de desarrollo de Vitest 2/Vite/esbuild. El aviso crítico de Vitest es condicionado a su servidor UI; esta auditoría usó `vitest run`, no expuso ese servidor. El remedio sugerido por npm cambia una versión mayor y requiere migración/validación deliberada; no se ejecutó `audit fix --force`.

**Cierre:** actualizar runner y dependencias transitivas en una entrega propia, repetir suite SQL/paridad y audit. Referencias entregadas por npm: [Vitest](https://github.com/advisories/GHSA-5xrq-8626-4rwp), [Vite Windows](https://github.com/advisories/GHSA-fx2h-pf6j-xcff), [esbuild](https://github.com/advisories/GHSA-67mh-4wv8-2f99).

### P2 — Paridad horaria y eventos fuera de las RPC: C + B

Documentación C exige Node con `TZ=UTC` para paridad en cambios de horario. Los scripts de arranque no lo establecen y no se verificó configuración alojada. Además, falta reconciliar `patient_adherence` y recalcular derivados tras ingesta, expiración, cambios de plan y paso del tiempo. No confundir riesgo recalculado al leer el dashboard con snapshots siempre vigentes.

## Verificación final

| Comprobación | Resultado |
|---|---|
| Raíz `npm test` | **371 pruebas / 34 archivos**, aprobadas |
| `npm --prefix domain-core test` | **253 pruebas / 13 archivos**, aprobadas; incluye 80 pruebas SQL en 3 archivos |
| Typecheck raíz y dominio | Aprobados |
| ESLint | Aprobado |
| Build Next 16.3.4 | Aprobado |
| Smoke dominio | **48 comprobaciones**, aprobadas |
| Benchmark antes/después | Igualdad completa de salida; tiempos arriba |
| HTTP del build local | `/login` y `/api/health`: 200; `/dashboard` y `/pacientes`: 307 a login; tick sin autorización: 401; CSP presente en las cuatro respuestas GET |
| `git diff --check` | Aprobado |

Las suites raíz y dominio comparten pruebas unitarias: **no sumar 371+253 como pruebas distintas**. La suite SQL usa PostgreSQL efímero en memoria, no JWT/PostgREST alojado ni múltiples conexiones. El servidor HTTP temporal se detuvo. No se aplicaron migraciones remotas ni se enviaron mensajes; tampoco se activó el modelo o se hizo un commit.

## Orden de trabajo

1. **B+C:** cerrar envío/reclamación/corte de receta y recuperación, antes de dar por seguro el flujo de ajustes.
2. **C+B:** persistir inbound, BAJA, respuestas tardías y derivados.
3. **A con B/C:** alta y citas atómicas, corrección de tomas con ocurrencia recuperable.
4. **B:** paginación del worker, plantillas/configuración pública estable y volumen; **C:** actualizar dependencias de pruebas.
5. **A+B+C:** ensayo del ciclo completo con dos unidades y roles; **C+A:** cerrar procedencia/corte de RF30. Revisar los porcentajes contra esta misma rúbrica en la siguiente auditoría.
