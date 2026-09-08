# Auditoría de integración — 8 septiembre 2026

> **Informe histórico sobre `7e60df9`.** Para el estado posterior a las nuevas integraciones consultar [auditoría actual](auditoria-estado-actual.md). No usar las cifras ni los bloqueos de este documento como estado vigente. La ausencia de RPC en tipos locales no demuestra por sí sola que no estén desplegadas en remoto.

Revisión completa de `develop` (`7e60df9`) contra `README.md`, `plan-integracion.md` y la documentación de cada integrante. Se ejecutaron typecheck, ESLint, la suite de pruebas y el build de producción; **no** se aplicaron migraciones remotas, no se enviaron mensajes y no se contactó el modelo.

Mapeo de autoría según `git shortlog`: **A** = `enriq`/Enrique Martínez, **B** = `Cesaredmyt`, **C** = `Rudy-77`. Las cuatro ramas (`feature/a-app`, `feature/b-datos`, `feature/c-negocio`, `main`) están fusionadas en `develop`; ninguna tiene commits pendientes.

---

## 1. Avance por integrante

Porcentajes calculados sobre el entregable declarado de cada quien en `README.md` §4 y su propia sección "De qué va / Qué falta". No miden esfuerzo ni líneas de código: miden cuánto del entregable verificable está cerrado.

### A — Aplicación e integración de Stitch: **~52 %**

| Bloque | Peso | Avance | Estado |
|---|---:|---:|---|
| Estructura de rutas y Server Components | 5 | 100 % | Cerrado |
| Acceso SSR (login/logout/consultorio) | 15 | 95 % | Falta ensayo alojado con dos unidades y roles |
| Dashboard de lectura conectado | 15 | 90 % | Funciona con datos reales |
| Vistas de lectura (censo, ficha, alertas, citas, estadísticas) | 15 | 75 % | Existen y leen datos reales, pero reusan el DTO del dashboard |
| Formularios de captura (alta, cita) | 15 | 40 % | UI y validación cliente; **cero persistencia** |
| Server Actions clínicas / CRUD real | 25 | **0 %** | `src/actions/` solo contiene `auth.ts` |
| Verificación en navegador y pruebas propias | 10 | 20 % | No ejecutada (ver §4.1) |

**Lo que sí está cerrado y verificado:** las 9 rutas compilan y son dinámicas (`next build` las lista); los 7 `loading.tsx` que documenta A existen; login/logout/selección de consultorio usan Supabase Auth SSR real con revalidación de unidad; el dashboard y las cinco vistas leen del consultorio autorizado.

**El bloque que arrastra el porcentaje** es el 25 % de Server Actions clínicas: `src/actions/` tiene un solo archivo (`auth.ts`) y `src/features/{patients,prescriptions,measurements,appointments,alerts}/` contiene únicamente `.gitkeep`. Alta, cita, corrección, urgencia y resolución de alerta no escriben nada. Eso es coherente con lo que A documenta —no hay sobredeclaración— pero es la mitad del entregable "CRUD de pacientes y citas".

### B — Persistencia y transporte: **~77 %**

| Bloque | Peso | Avance | Estado |
|---|---:|---:|---|
| Esquema, RLS, tipos, semillas | 20 | 95 % | Aplicado y verificado |
| Clientes Supabase, sesión, hardening OWASP | 15 | 95 % | Cerrado; falta CSP |
| Consultas de lectura y adaptadores | 15 | 90 % | Cerrado para el volumen de la demo |
| Canal WhatsApp (proveedor, Twilio, firma, webhooks, callbacks) | 20 | 90 % | Ida y vuelta real confirmada |
| Cola (materialize / send / tick) | 15 | 75 % | Falta Cron, plantillas y 2 de 4 `kind` |
| Migración RF28 y regeneración de tipos | 8 | **0 %** | No iniciada |
| RLS real de dos unidades, concurrencia, rendimiento | 7 | 10 % | Sin ejecutar contra el proyecto real |

**Es el avance más alto y el mejor evidenciado:** la bitácora registra un mensaje real enviado desde la app, confirmado `delivered`/`read`, y la respuesta del paciente recibida por el webhook. Los dos bugs encontrados en esa prueba (carrera de callbacks y variante `+521`) están documentados con su causa; el primero ya estaba corregido con concurrencia optimista y el segundo se corrigió en esta auditoría (§3.1).

**Lo que falta es operación, no construcción:** programar el Cron que llame a `/api/jobs/tick` (hoy se dispara a mano), plantillas aprobadas de Twilio y la migración RF28.

### C — Negocio e integración: **~55 %**

| Bloque | Peso | Avance | Estado |
|---|---:|---:|---|
| Dominio puro (riesgo, adherencia, tendencia, parser, expiración, validación) | 25 | 95 % | Cerrado y muy probado |
| Contratos congelados | 10 | 90 % | Con una discrepancia real (§2.3) |
| Cinco RPC clínicas en SQL | 25 | 85 % | Escritas y probadas en PGlite |
| Integración de las RPC con A/B | 15 | **0 %** | Nada las llama; migraciones sin aplicar |
| Procesamiento del mensaje entrante y expiración conectada | 15 | 5 % | El parser interpreta; nadie persiste el efecto |
| RF29/RF30 (vector ML, endpoint) | 10 | 5 % | Cliente listo, sin diccionario ni endpoint |

**El trabajo hecho es sólido y está sobre-verificado:** 684 líneas de SQL en `0002`/`0003`, 636 líneas de pruebas de integración sobre PostgreSQL real (PGlite), 60 combinaciones de paridad contra `evaluateRisk`, y la detección/corrección de una diferencia de horario de verano entre `AT TIME ZONE` y `date-fns-tz`. Nada de eso está exagerado en la documentación.

**El porcentaje lo limita que ese trabajo no toca todavía el sistema.** Es el hallazgo más importante de esta auditoría y está en §2.1.

### Global del ciclo core: **~45 %**

El ciclo que `README.md` §1 define como el MVP:

```
alta -> consentimiento -> receta/monitoreo -> WhatsApp -> respuesta o vencimiento
  -> medición/adherencia -> alerta -> revisión médica
```

| Eslabón | Estado real |
|---|---|
| alta | ✗ Solo por script de semilla; el formulario no persiste |
| consentimiento | ◑ Sembrado; no hay evento de consentimiento desde la UI |
| receta y monitoreo | ✗ Solo por semilla |
| WhatsApp (envío) | ✓ Real, dentro de la ventana de 24 h, con tick manual |
| respuesta | ◑ Se recibe, se interpreta y se guarda cruda; **no se escribe el efecto clínico** |
| vencimiento | ✗ **La RPC existe pero nadie la llama** (§2.2) |
| medición/adherencia | ✓ Se calculan al leer, sobre datos sembrados |
| alerta | ◑ Se leen; ninguna se crea automáticamente |
| revisión médica | ✗ Las RPC existen, no están desplegadas ni conectadas |

Ningún eslabón de escritura clínica cierra hoy desde la interfaz.

---

## 2. Hallazgos de integración

### 2.1 — CRÍTICO: las migraciones `0002` y `0003` no están aplicadas

`src/types/database.types.ts` declara exactamente dos funciones: `claim_due_interactions` y `expire_due_interactions`, ambas de `0001_kuni.sql`. **Ninguna de las cinco RPC clínicas de C aparece.** Como esos tipos se generan desde el proyecto real (`supabase gen types typescript --linked`), la conclusión es directa: `0002_clinical_derivations.sql` y `0003_clinical_commands.sql` existen en el repositorio pero nunca se aplicaron a Supabase.

Consecuencia: el entregable más grande de C —cinco operaciones transaccionales con auditoría, concurrencia y recálculo— no existe en la base de datos que usa la aplicación. Nada puede llamarlas aunque A escribiera las Server Actions hoy.

C lo documenta con honestidad ("regenerar tipos de Supabase después de aplicar las migraciones en un entorno de prueba explícito", "No declarar que la UI ya llama a estas operaciones"), pero **es el bloqueo número uno del proyecto** y conviene que quede visible fuera de su documento.

Riesgo adicional al aplicarlas: `0002`/`0003` usan `create function` (no `create or replace`), así que un `db push` parcial o repetido falla en vez de ser idempotente. Verificar antes en una base de prueba.

**Acción (grande, no la hago yo):** B aplica `0002` y `0003` en un entorno de prueba, regenera `database.types.ts`, y A/C acuerdan el mapeo de las firmas SQL al envelope `{ data, error }`.

### 2.2 — ALTO: `expire_due_interactions()` no la llama nadie

La función está completa en `0001_kuni.sql:774`: marca `timeout_at` de las interacciones entregadas y vencidas sin respuesta, y crea la alerta `no_response` deduplicada. Está en los tipos generados. Y el único `.rpc()` de todo `src/` es `claim_due_interactions` en `src/lib/jobs/send.ts:53`.

`src/app/api/jobs/tick/route.ts` corre `materialize` → `send` y nada más.

Consecuencia: **la mitad "silencio" del ciclo nunca ocurre.** Un paciente que no contesta no genera timeout, no genera alerta de no-respuesta, y por lo tanto la regla de riesgo "≥3 no-respuestas en 7 días → medio" no puede activarse jamás en la demo.

No lo corregí porque no es mecánico: C pide explícitamente "probar paridad de la función pura frente a la RPC real" antes de conectarla, y la llamada crea alertas reales en una base con datos. Pero el cambio en sí es de tres líneas en el tick, y es probablemente el mayor retorno por esfuerzo de todo el backlog.

**Acción (decisión de B+C):** añadir `expire` al tick, con la prueba de paridad que pide C.

### 2.3 — ALTO: tres nombres distintos para el mismo campo de presión arterial

| Capa | Archivo | Nombre |
|---|---|---|
| Contrato Zod (A) | `src/contracts/clinical.ts:67` | `systolicMmhg` / `diastolicMmhg` |
| RPC de C | `supabase/migrations/0003_clinical_commands.sql:113` | `systolicMmhg` / `diastolicMmhg` |
| DTO de dominio (C) | `domain-core/src/contracts/dto.ts:76` | `systolicMmHg` / `diastolicMmHg` (H mayúscula) |
| DTO de lectura (B) | `src/lib/domain/dashboard.ts:18` | `systolicMmHg` / `diastolicMmHg` (H mayúscula) |

`correct_measurement` valida las claves de forma **estricta**: `p_input - array['kind','patientId','observedAt','systolicMmhg','diastolicMmhg'] <> '{}'` rechaza cualquier clave sobrante. Es decir, el día que A construya el formulario de corrección a partir del DTO que ya muestra la ficha (`systolicMmHg`, con H mayúscula), la RPC devolverá `PT422 VALIDATION` y el error parecerá un problema de validación clínica cuando es una diferencia de una letra.

Está latente porque nada llama todavía a la RPC. Se activa el primer día de la integración.

**Recomendación:** unificar en `systolicMmHg`/`diastolicMmHg` (mayúscula), que es la forma usada en 3 de 4 lugares y la que ya consume la UI; el cambio es una línea en `clinical.ts` y dos en `0003`. **No lo apliqué porque `clinical.ts` es un contrato declarado como congelado** y tocarlo es decisión de los tres, no de una auditoría.

### 2.4 — MEDIO: la validación de captura del cliente es más laxa que la de la RPC

`measurementInputSchema` acepta `z.number().positive()` para glucosa y presión. La RPC exige glucosa 20–700, sistólica 60–260, diastólica 30–180, sistólica > diastólica y **ambas enteras**. Un formulario que valide solo con el esquema Zod dejará pasar `120.5` mmHg o `5` mg/dL y recibirá un `PT422` del servidor.

**Recomendación:** que `clinical.ts` refleje los mismos criterios de `domain-core/src/lib/domain/validation.ts`, que es la fuente que ya siguen tanto la RPC como C. Es un cambio pequeño pero cambia un contrato congelado: decisión del equipo.

### 2.5 — MEDIO: efecto clínico del mensaje entrante sin persistir

El webhook entrante guarda el mensaje ya interpretado (`parsed.kind='medication_confirm', taken:true`) en `webhook_events.normalized_payload` y deja `processing_status='received'`. Nadie lo correlaciona con la `bot_interaction` pendiente por `reply_code` ni escribe la medición, la confirmación de toma o el `response_at`.

Es una frontera declarada y bien documentada por ambos lados (B "Qué falta" #2, C "Qué falta" #2), no un descuido. Pero significa que **una respuesta real del paciente hoy no mueve ninguna métrica**: la evidencia queda durable y sin efecto. Es trabajo conjunto B+C y depende de §2.1.

### 2.6 — MEDIO: sin Cron, la cola no corre sola

`/api/jobs/tick` está listo y protegido con `Bearer CRON_SECRET`, pero nada lo invoca. La demo depende de que alguien haga el POST a mano en el momento correcto. Documentado por B; lo señalo porque es un riesgo directo del guion de la demo, no solo un pendiente técnico.

### 2.7 — MEDIO: `send.ts` solo puede enviar dentro de la ventana de 24 h

Sin plantillas aprobadas de Twilio para medicamento y medición, todo envío fuera de la ventana de sesión falla con `template_not_configured`. El manejo es correcto (falla explícito en vez de intentar algo que WhatsApp rechazaría), pero implica que **el bot solo puede hablarle a un paciente que le escribió en las últimas 24 h**. Para la demo hay que ensayar el orden: el paciente escribe primero, luego se dispara el tick.

### 2.8 — BAJO: sin `error.tsx` fuera del dashboard

Solo existe `src/app/(protected)/dashboard/error.tsx`. Las otras seis rutas protegidas comparten `getDashboardData()`, que falla explícitamente al superar sus límites de volumen (1.000 pacientes / 50.000 registros). Un error ahí en `/pacientes` o `/estadisticas` no tiene frontera de error propia ni hay `global-error.tsx`. A ya lo lista como pendiente.

---

## 3. Cambios menores aplicados en esta auditoría

Verificados con `tsc --noEmit`, ESLint, `next build` y la suite completa: **294 pruebas en 29 archivos** (antes 285 en 28), todo en verde.

### 3.1 — Normalización de teléfonos de México en el webhook entrante

Era el pendiente #4 de B, con el bug reproducido en la prueba real: WhatsApp entrega los móviles mexicanos como `+521XXXXXXXXXX` mientras `patients.whatsapp_e164` los guarda como `+52XXXXXXXXXX`, y el `eq()` exacto no encontraba al paciente. Se había corregido solo el dato demo, no el código.

- **Nuevo** `src/lib/whatsapp/phone.ts`: `stripWhatsAppPrefix()` y `phoneLookupCandidates()`, funciones puras que generan las variantes equivalentes para México y **solo** para México (agregar o quitar un dígito en otra numeración cambiaría de persona, no de formato).
- `src/app/api/webhooks/whatsapp/route.ts` busca con `.in("whatsapp_e164", candidatos)` en vez de `.eq(...)`.
- Si dos pacientes activos coinciden con variantes distintas del mismo número, **no se atribuye a ninguno**: se marca el evento como `ignored` y se hace ACK. Atribuir un dato clínico por desempate arbitrario sería peor que no procesarlo.
- **Nuevo** `tests/unit/whatsapp-phone.test.ts` (7 pruebas) y 2 casos nuevos en `tests/unit/whatsapp-inbound-route.test.ts`.

> Actualiza `documentacionB.md` "Qué falta de B" #4 y el "Pendiente para B" de `bitacora-canal-b.md`: esa parte ya está hecha.

### 3.2 — `npm run typecheck` volvió a pasar en la raíz

Estaba **roto en `develop`**: `domain-core/tests/integration/clinical-rpcs.test.ts` importa `@electric-sql/pglite`, que es devDependency de `domain-core` y no de la raíz, y el `include: ["**/*.ts"]` del `tsconfig.json` raíz lo arrastraba. `tsc --noEmit` fallaba con `TS2307`.

- `tsconfig.json`: se excluyen `domain-core/tests` y `domain-core/node_modules`. `domain-core/src` **sigue** compilándose, porque la app lo importa de verdad.
- `vitest.config.mts`: el include pasa de `domain-core/tests/**` a `domain-core/tests/unit/**`. La suite de integración SQL de C se sigue corriendo con su propio runner (`npm --prefix domain-core test`, Vitest 2.x + PGlite), que es donde C la documenta.

Esto contradice la línea de `plan-integracion.md` que declara typecheck aprobado: era cierto al escribirla y dejó de serlo al fusionar `feature/c-negocio`.

### 3.3 — `/api/health` existía en la configuración pero no como ruta

`src/proxy.ts` excluye `api/health` del filtro de cookies precisamente para que un monitor reciba 200 y no un redirect a `/login` (revisión OWASP A01 de la bitácora), y el README lo lista en la estructura. El directorio solo tenía un `.gitkeep`: cualquier monitor recibía **404**.

- **Nuevo** `src/app/api/health/route.ts`: responde `{ status, timestamp }` con `no-store`. No consulta Supabase ni el proveedor a propósito — un healthcheck que depende de terceros convierte la caída de ellos en "la app está caída", y además regalaría un ping gratis contra la base.

### 3.4 — `CRON_SECRET` faltaba en `.env.example`

Se añadió a `serverEnv` con el commit de la cola pero nunca a la plantilla. Quien clone el repo siguiendo `README.md` §7 no tiene forma de saber que `/api/jobs/tick` necesita ese token y obtendrá 401 sin explicación.

---

## 4. Lo que no se alinea con la documentación

### 4.1 — La suite no corre en Windows: `node_modules` tiene binarios de Linux

`node_modules/@rolldown/` contiene **únicamente** `binding-linux-x64-gnu` y `binding-linux-x64-musl`. No hay `binding-win32-x64-msvc`. El último `npm install` se hizo desde WSL (la bitácora de B lo confirma: "corridos con Node nativo de WSL tras la migración de entorno") sobre un árbol en `D:`, compartido con Windows.

Por eso `documentacionA.md` reporta que "la ejecución más reciente de `npm test` no arrancó por el binding nativo faltante de Rolldown/Vitest": **no es un problema del repositorio ni del entorno de A, es este `node_modules`.** Para esta auditoría se ejecutó la suite a través de WSL y pasó completa.

**Solución para quien trabaje en Windows:** `npm install` desde Windows (npm bajará el binding correcto). Ojo: eso reemplaza los bindings de Linux y romperá la ejecución desde WSL, y viceversa. Mientras el árbol se comparta entre los dos sistemas, hay que elegir uno para correr pruebas o mantener `node_modules` fuera del disco compartido.

### 4.2 — Las pruebas de C no se pueden correr con un clon limpio

`domain-core/node_modules/` está vacío. `npm --prefix domain-core test` —el comando con el que C acredita sus 213 pruebas— falla hasta ejecutar `npm --prefix domain-core install`. Ese paso no aparece en `README.md`, en `plan-integracion.md` ni en `documentacionC.md`. Conviene añadirlo a la sección de verificación del README.

### 4.3 — Conteos de pruebas desactualizados en la documentación

- `plan-integracion.md` §Verificación: "208 pruebas aprobadas en 17 archivos". Real hoy: **294 en 29** (incluye las 9 de esta auditoría).
- `README.md` §10 y `plan-integracion.md` presentan `npm test` / `npm run typecheck` como la verificación de referencia; el segundo estaba roto (§3.2) y el primero no arranca en Windows (§4.1).
- `documentacionC.md` conserva dos entradas con conteos distintos (150 con Vitest 5.0.0 y 213 con Vitest 2.1.9). Es correcto como registro histórico, pero conviene decir cuál es la vigente.

### 4.4 — `README.md` §9 subestima el avance de B

La casilla "Transporte WhatsApp integrado a Kuni (proveedor, firma, webhook, callbacks, jobs y Cron)" sigue sin marcar, pero de esos seis elementos **cinco están hechos y probados con un mensaje real**. Solo falta el Cron. Se deja sin marcar con razón, pero el README no permite ver que está al 90 % en lugar de sin empezar.

### 4.5 — Estructura declarada vs. estructura real

`README.md` §3 ya advierte que el árbol es "el objetivo del plan". Aun así, conviene tenerlo explícito:

- `src/features/{patients,prescriptions,measurements,appointments,alerts}/` — cinco directorios que solo contienen `.gitkeep`.
- `src/lib/jobs/expire.ts` y `process-webhooks.ts` — no existen; `expire` vive en `domain-core` como función pura y `process-webhooks` no está escrito.
- `src/lib/domain/` — solo `dashboard.ts`; `risk`, `adherence`, `scheduling` y `validation` viven en `domain-core` (esto sí está explicado en el README).

### 4.6 — Duplicación de DTO entre `src/contracts` y `domain-core/src/contracts`

`.ai-style-rules.md` incluye en sus DONTs: *"No duplicar DTO entre UI, acciones y consultas."* Hoy los mismos conceptos están definidos dos veces —Zod en `src/contracts/clinical.ts`, tipos TypeScript en `domain-core/src/contracts/dto.ts`— y §2.3 muestra que ya divergieron. No es un error de nadie en particular: es consecuencia de que A y C avanzaran en paralelo, como pedía el plan. Pero es la causa raíz del hallazgo 2.3 y volverá a morder si no se decide cuál es la fuente única.

### 4.7 — Nota de mantenibilidad: líneas de hasta 4.043 caracteres

`src/components/clinical-workspace.tsx` (59 líneas, 14 KB) tiene una sola línea de 4.043 caracteres; `clinical-dashboard.tsx`, 2.301; `patient-create-form.tsx`, 824. Nada lo prohíbe en `.ai-style-rules.md` y no afecta al comportamiento, pero un diff de esos archivos es ilegible en revisión y hace inviable el acuerdo del README §4 de que "cada persona revisa una prueba crítica de otra". Vale la pena pasar Prettier antes de la siguiente ronda de revisión cruzada.

### 4.8 — Pendientes de configuración ya documentados que siguen abiertos

Sin cambios desde que B los registró, se listan para que no se pierdan: CSP en `next.config.ts`, apagar el proveedor SMS de Twilio en el dashboard de Supabase, y CAPTCHA en login (limitación aceptada del hackathon).

---

## 5. Orden sugerido para lo que sigue

Priorizado por lo que desbloquea a más gente, no por tamaño.

1. **B aplica `0002` y `0003` en un entorno de prueba y regenera `database.types.ts`** (§2.1). Desbloquea todo lo de C y la mitad de lo de A. Verificar antes que el `db push` no choque con `create function`.
2. **B+C conectan `expire_due_interactions` al tick** (§2.2), con la prueba de paridad que pide C. Es lo que hace que el silencio del paciente signifique algo.
3. **Los tres cierran el nombre del campo de presión y los rangos de captura** (§2.3, §2.4). Es una reunión de diez minutos que evita un día de depuración.
4. **A escribe la primera Server Action clínica contra una RPC ya aplicada** —sugerencia: `resolve_alert`, la de menor superficie— y con ella se acuerda el mapeo `PT401/403/422/409` → envelope `{ data, error }`. Ese patrón se replica a las otras cuatro.
5. **B programa el Cron** (§2.6) y ensaya el guion de la demo respetando la ventana de 24 h (§2.7).
6. **B+C persisten el efecto clínico del mensaje entrante** (§2.5). Con esto el ciclo core cierra de punta a punta.
7. RF28, RF29 y RF30 después de lo anterior, como ya establece `plan-integracion.md`.

---

## 6. Verificación de esta auditoría

| Comprobación | Resultado |
|---|---|
| `tsc --noEmit` | Aprobado (fallaba antes del cambio §3.2) |
| `eslint .` | Aprobado, sin reglas desactivadas |
| `vitest run` (vía WSL, ver §4.1) | **294 pruebas en 29 archivos**, todas aprobadas |
| `next build` (producción) | Aprobado; `/api/health` aparece en el listado de rutas |
| `git diff --check` | Sin problemas de espacios |

No se aplicaron migraciones, no se ejecutaron semillas, no se envió ningún mensaje de WhatsApp, no se contactó el modelo y no se leyeron credenciales. Las conclusiones sobre el estado del proyecto Supabase remoto se derivan de `src/types/database.types.ts`, que se genera desde él.
