# Bitácora de B — canal y tubería de datos

Registro de lo hecho por **B (persistencia y transporte)**: Supabase (esquema, datos, tipos) y el canal de WhatsApp (Twilio). Complementa [`decisiones.md`](decisiones.md), que es para decisiones que afectan a los tres; esta bitácora es el detalle operativo de la parte de B.

---

## 2026-09-07 — Supabase: proyecto, esquema y tipos

- Proyecto Supabase de demo creado: **Kuni BDD** (`oqueczraadiylqdshqfu`), región `us-east-1`, Postgres 17.
- `.env.local` creado a partir de `kuni.env.example`, con `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_SECRET_KEY` reales del proyecto.
- CLI de Supabase inicializado y vinculado (`supabase init`, `supabase login`, `supabase link --project-ref oqueczraadiylqdshqfu`).
- DDL completo (`kuni-schema.sql`) copiado a `supabase/migrations/0001_kuni.sql` y aplicado con `supabase db push` (20 tablas + 6 vistas + RLS).
- Tipos TypeScript generados desde el esquema real: `src/types/database.types.ts` (`supabase gen types typescript --linked`).
- Verificado: `tsc --noEmit` sin errores con los tipos generados.

## 2026-09-07 — Datos de prueba (seed)

Scripts creados en `scripts/` (usan `SUPABASE_SECRET_KEY`, se corren con `npx tsx`, son idempotentes):

- `seed-health-unit.ts` — crea la unidad de salud demo y, si se le pasa un `auth_user_id`, lo vincula en `unit_memberships`.
- `seed-doctor-room.ts` — crea un médico y su consultorio para esa unidad.
- `seed-demo-patients.ts` — crea 3 pacientes ficticios (con diagnóstico y consentimiento de WhatsApp otorgado).

Datos cargados:

| Entidad | Valor |
|---|---|
| Unidad de salud | Centro de Salud "Dr. Juan Manuel González Urueña" (IMSS Bienestar, Morelia) — `IMSSB-MICH-MORELIA-JMGU` |
| Usuario Auth de la unidad | `unidad.morelia.jmgu@kuni-demo.mx`, vinculado en `unit_memberships` como `shared_clinician` |
| Médico | Dra. María Fernanda López Torres (cédula de ejemplo `8452193`) |
| Consultorio | Consultorio 3 - Medicina Familiar |
| Pacientes demo | José Luis Hernández Ramírez (diabetes tipo 2), Guadalupe Torres Mendoza (hipertensión), Rosa Elena Pérez Gómez (diabetes tipo 2 + hipertensión) |

Nota: los tres pacientes son personas **inventadas** para pruebas, con CURP de formato válido pero ficticio y teléfono con lada de Morelia (443). No corresponden a expedientes reales.

Incidente y corrección: al correr `seed-health-unit.ts` después de renombrar la unidad, el script buscaba el código institucional viejo y creó una unidad duplicada. Se corrigió re-apuntando la membresía a la unidad correcta y borrando el duplicado; se actualizó `seed-health-unit.ts` para usar el código real y evitar que se repita.

## 2026-09-07 — Canal de WhatsApp (Twilio Sandbox)

- Cuenta Twilio creada en modalidad **Trial** (no se usó "Pay as you go"; el Sandbox no lo requiere).
- WhatsApp Sandbox activado; teléfono personal unido con `join <código>`.
- **Prueba de ida y vuelta confirmada:**
  - Entrante: el `join` llegó correctamente a Twilio.
  - Saliente: se envió una plantilla "Appointment Reminders" desde la Console y llegó al WhatsApp real del probador.
- Esto cierra la **puerta de viabilidad** del roadmap (mensaje real de ida y vuelta) sin necesitar todavía código propio de la app.
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` y `TWILIO_WHATSAPP_FROM` (`whatsapp:+14155238886`, número del sandbox) actualizados en `.env.local`.
- Limitación conocida y aceptada para la demo: el contacto se ve como **"Twilio"** en WhatsApp (nombre del perfil de negocio del número compartido del Sandbox), no como "Kuni" ni el nombre de la unidad — un número propio con perfil verificado requeriría aprobación de Meta/Twilio de hasta 48 h, inviable en la ventana del hackathon. Se compensa identificando a Kuni/la unidad dentro del texto de los mensajes del bot.

## 2026-09-08 — Clientes de Supabase, sesión y contexto de autorización

Código base (`src/lib/`) del que depende todo lo demás:

- `lib/env/client.ts` y `lib/env/server.ts` — variables de entorno validadas con Zod; fallan al arrancar con mensaje claro si falta algo, en vez de un `undefined` silencioso más adelante.
- `lib/supabase/client.ts` — cliente de navegador, singleton por pestaña, solo clave publicable.
- `lib/supabase/server.ts` — cliente por request (nunca compartido entre requests), cookies de sesión, respeta RLS siempre.
- `lib/supabase/admin.ts` — clave secreta, `server-only`, singleton, **omite RLS**; reservado a jobs/webhooks ya verificados.
- `lib/supabase/proxy.ts` + `src/proxy.ts` — Next 16 renombró `middleware.ts` a `proxy.ts`; refresca la sesión en cada navegación y hace un primer filtro de rutas privadas (capa de red, no la autorización real).
- `lib/auth/context.ts` — `getAuthContext()`: valida JWT (`getClaims()`, nunca `getSession()` como prueba de identidad) + membresía activa + unidad activa en cada llamada; revalida la cookie de consultorio contra la unidad real (la cookie es preferencia, nunca autoridad). `requireConsultingRoom()` para acciones que ya necesitan consultorio elegido.
- `contracts/errors.ts` — `AppError` + contrato `{data, error:{code,message,fields}}` del plan.
- TanStack Query instalado y conectado (`app/providers.tsx`), listo para que A lo use en Client Components.

**Revisión de seguridad OWASP Top 10 sobre todo esto** (a petición explícita del equipo, "al pie de la letra"):

- **A01 Broken Access Control** — dos capas: `proxy.ts` (red) + `getAuthContext()` (real, por request). Cookie de consultorio siempre revalidada contra la unidad, nunca aceptada como autoridad. Se agregó `safeRedirectPath()` (`lib/utils/safe-redirect.ts`) para cuando A implemente `/login`: el query param `redirectTo` **debe** pasar por ahí — sin validar, es un open redirect clásico.
- **Bug encontrado y corregido en esta misma revisión:** `isPublicPath` usaba `pathname.startsWith("/")` para la ruta raíz, lo cual es cierto para *cualquier* ruta y anulaba toda la protección del proxy. Se cambió a comparación exacta para `/`. Se verificó en caliente con `npm run dev` antes y después del fix.
- **Bug encontrado y corregido (2):** el matcher del proxy no excluía `api/health`, así que un monitor de uptime habría recibido un redirect 307 a `/login` en vez de `200`. Se agregó a la lista de exclusiones.
- **A02 Cryptographic Failures** — secretos solo en archivos `server-only`, nunca en variables `NEXT_PUBLIC_*`; `.env.local` gitignored y verificado. Se agregó `setConsultingRoomCookie()`/`clearConsultingRoomCookie()` con `httpOnly + secure (prod) + sameSite=lax` para que, cuando alguien la implemente, no se le ocurra hacerlo sin esas flags.
- **A03 Injection** — todo el acceso a datos pasa por el query builder de supabase-js (parametrizado); no hay SQL ni comandos de shell construidos con texto de usuario en ningún archivo de esta entrega. Se agregó validación de formato UUID a la cookie de consultorio antes de usarla en una query (defensa en profundidad, no porque hubiera inyección posible).
- **A04 Insecure Design** — fail-safe por defecto: sin sesión → deniega; sin membresía activa → `FORBIDDEN`; cookie de consultorio inválida → se ignora (nunca concede acceso).
- **A05 Security Misconfiguration** — `next.config.ts`: se agregaron cabeceras `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security` (Next no las manda por defecto). En `supabase/config.toml`: se quitó `graphql_public` de los schemas expuestos (no usamos GraphQL) y se puso `auto_expose_new_tables = false` explícito (una tabla nueva no debe quedar accesible por accidente solo por existir). **Pendiente manual:** falta un CSP (Content-Security-Policy) — se difirió a propósito por el riesgo de romper el build de Next si se configura mal en el tiempo disponible; queda como limitación declarada.
- **A06 Vulnerable Components** — `npm audit`: 0 vulnerabilidades (runtime y dev).
- **A07 Identification and Authentication Failures** — revisión completa de `supabase/config.toml` contra el proyecto real vía `supabase config diff` (encontró que el remoto ya tenía MFA TOTP habilitado y OTP de 8 dígitos — más fuerte que la plantilla default local; se alineó el archivo local a eso en vez de debilitarlo por accidente al hacer push). Cambios aplicados al proyecto real con `supabase config push` (confirmados, no solo locales):
  - `enable_signup` (global y email) → `false`: RF04 no permite autorregistro pública.
  - `minimum_password_length`: 6 → 12.
  - `password_requirements`: (vacío) → `lower_upper_letters_digits`.
  - `secure_password_change` → `true`: exige sesión reciente para cambiar contraseña.
  - `rate_limit.sign_in_sign_ups`: 30 → 10 por 5 min por IP.
  - **Pendiente manual (no se pudo por CLI):** `auth.sms.twilio.enabled` sigue en `true` en el proyecto — Supabase no permite apagar el proveedor de SMS activo vía `config push` ("disable phone sign-in or use the dashboard"). Impacto bajo (el registro por teléfono ya está bloqueado por `enable_signup=false`), pero falta apagarlo a mano en Dashboard → Authentication → Providers → Phone.
  - CAPTCHA en login: sigue sin configurar (limitación aceptada para el hackathon).
- **A08 Software and Data Integrity Failures** — `package-lock.json` commiteado (deps fijas para los tres integrantes); sin ejecución de código no confiable en ningún script.
- **A09 Security Logging and Monitoring Failures** — errores inesperados se loguean server-side (`console.error`) sin exponer el detalle interno al cliente (`toApiError` solo devuelve `INTERNAL` genérico). Limitación aceptada: no hay logging estructurado ni alertas todavía — razonable para el alcance del hackathon, señalado aquí para no perderlo de vista.
- **A10 SSRF** — no aplica todavía (no hay código que haga fetch a una URL controlada por el usuario; se revisará de nuevo cuando se construya el adaptador de Twilio/webhooks).

Verificado después de cada cambio: `tsc --noEmit`, `npm run lint`, `npm run build`, y pruebas en caliente con `npm run dev` (rutas públicas/protegidas, headers de seguridad presentes con `curl`).

## Pendiente para B (siguiente)

- `src/lib/whatsapp/provider.ts` (interfaz) y `twilio.ts` (adaptador real).
- Exponer la app por HTTPS (túnel local o deploy) para configurar el webhook entrante y el `StatusCallback` de Twilio.
- `api/webhooks/whatsapp/route.ts`, `api/webhooks/whatsapp/status/route.ts`, `api/jobs/tick/route.ts`.
- `jobs/materialize.ts`, `jobs/send.ts`.
- Manual: apagar el proveedor SMS de Twilio en el dashboard de Supabase (Authentication → Providers → Phone).
- Evaluar un Content-Security-Policy para `next.config.ts` con tiempo suficiente para probarlo bien.

## 2026-09-08 — Correcciones de integración: lectura clínica real

- Se añadió `src/lib/queries/dashboard.ts`: cliente SSR con RLS, consultorio revalidado, filtros de unidad/paciente en todas las relaciones y consultas agrupadas. El censo se lee completo hasta 1,000 pacientes; las relaciones se solicitan en grupos de 100 pacientes y páginas de 500 registros con conteo exacto. Un volumen superior al soportado falla explícitamente, sin porcentajes parciales.
- Se añadió `src/lib/domain/dashboard.ts`: DTO seguro de dashboard y adaptación al `evaluateRisk()` y `computeAdherence()` canónicos de C. Se calculan Y/N/U, cobertura y agregados por numeradores/denominadores, sin promediar porcentajes de pacientes.
- Se muestran lecturas válidas de 90 días, métricas de 30 días, citas futuras de 90 días, recetas vigentes, alertas activas y conteos históricos. No se inventan mediciones, estadísticas, stock, conversación del bot ni predicciones. La media de glucosa se limita a ayuno para no mezclar contextos.
- El riesgo se calcula al leer a partir de las últimas lecturas por plan/variable/contexto, umbrales individualizados vigentes, horarios reales del plan, marca urgente e inicial médica. La lectura de un plan no borra señales ni acredita la cobertura de otro. No se persiste un cálculo con el cliente administrativo. Guardar evaluaciones, corregir de manera atómica y recalcular alertas sigue siendo trabajo de las RPC/worker.
- Los tests añadidos cubren autorización de consultas, paginación por encima de un límite de respuesta, errores sin fallback ficticio, unidades/consultorios mezclados, mediciones anuladas/futuras, ausencia/ambigüedad de umbrales, calendario local, adherencia ponderada y respuesta válida anterior al callback.
- Se creó `docs/documentacionB.md` con el mismo esquema de responsabilidades/avance/archivos/decisiones/verificación/pendientes usado en la documentación de A.
- La revisión posterior corrigió la coexistencia de varios planes con el mismo contexto, la media descriptiva a partir de una lectura con conteo de muestra y la última respuesta calculada sobre todo el histórico disponible antes del recorte visual. Los recordatorios informativos llevan `expectsResponse=false`; la consulta también recupera respuestas recientes a solicitudes de más de 90 días.
- Verificado tras la revisión: 18 tests de adaptadores/queries aprobados, ESLint de los cuatro archivos añadidos sin errores y `tsc --noEmit` sin errores. Las pruebas no utilizaron base de datos ni credenciales reales.

Esta entrega modifica código y documentación localmente. No ejecutó SQL remoto, no leyó secretos, no corrió semillas ni envió mensajes. La prueba histórica de Twilio Console permanece como evidencia de viabilidad del canal, no como prueba end-to-end del bot de Kuni. Los pendientes de transporte anteriores y la migración de IA continúan abiertos.

## 2026-09-08 — Bug de login en producción: proveedor Email deshabilitado en Supabase

- El equipo reportó que ningún usuario podía iniciar sesión, con o sin credenciales correctas. Diagnóstico por descarte: cuenta existente sana (Admin API: email confirmado, sin baneo, membresía activa, sin MFA), usuario nuevo creado a mano con el mismo resultado, mensaje de error genérico (no el de "credenciales incorrectas") descartando rate limit (`sign_in_sign_ups=10/5min`) y contraseña.
- Causa real: el proveedor **Email** estaba deshabilitado a nivel de proyecto en Supabase Auth (`Authentication → Providers → Email`), probablemente apagado por accidente junto con el pendiente de apagar el proveedor SMS de Twilio en el mismo panel. Confirmado pegándole directo al endpoint `POST /auth/v1/token?grant_type=password` con credenciales inventadas: `422 {"error_code":"email_provider_disabled"}`. Ese campo no está en el schema declarativo de `supabase config.toml`/`config push` (verificado con `config diff`/`config pull`), así que solo se corrige a mano en el dashboard — quien lo encuentre en el futuro no puede resolverlo por CLI.
- El equipo lo reactivó manualmente en el dashboard; login verificado funcionando después.
- Corrección de código que queda de este diagnóstico: `src/actions/auth.ts` distingue ahora el error 429 (límite de intentos) de credenciales incorrectas, con su propio mensaje ("Demasiados intentos. Espera unos minutos.") en vez de caer en el genérico — evita que el próximo bug de este tipo se confunda otra vez con rate limit. Test agregado en `tests/unit/auth-actions.test.ts`.
- Se creó `.claude/launch.json` (`npm run dev`, puerto 3000) para poder previsualizar la app localmente durante el diagnóstico.

## 2026-09-08 — Circuito WhatsApp: proveedor, adaptador Twilio y webhooks

Primeras piezas del hito 2 ("Circuito WhatsApp") de `plan-integracion.md`.

- `src/lib/whatsapp/provider.ts`: interfaz `WhatsAppProvider` (envío por plantilla vs. texto libre, verificación de firma) desacoplada del contenido clínico — quien arma el mensaje sigue siendo el futuro `jobs/materialize.ts`, este módulo solo sabe hablar con el canal. `WhatsAppProviderError` tipado (code/retriable/detail) para que la cola decida reintentos sin conocer el SDK de origen. `getWhatsAppProvider()` selecciona el adaptador según `WHATSAPP_PROVIDER` (`mock` por default — nunca envía nada real, persiste como `provider='demo'`).
- `src/lib/whatsapp/twilio.ts`: adaptador real con el SDK `twilio` ya en `package.json`. `verifyWebhookSignature` usa `twilio.validateRequest` (nunca HMAC reimplementado a mano); falla cerrado ante cualquier excepción del validador. Mapeo de errores del SDK a `WhatsAppProviderErrorCode` (rate_limited/template_rejected/invalid_recipient/etc.).
- `src/lib/env/server.ts`: `WHATSAPP_PROVIDER`, credenciales Twilio y `APP_PUBLIC_URL` (URL pública exacta sin `/` final — la firma de Twilio se recalcula sobre esa URL exacta), con `superRefine` que exige las credenciales solo cuando `WHATSAPP_PROVIDER=twilio`.
- `src/lib/whatsapp/status.ts`: lógica pura de progresión del `StatusCallback` (queued→sending→accepted→delivered→read), sin I/O. Un callback fuera de orden nunca retrocede el estado ni "revive" una interacción ya en `failed`/`read`; `response_deadline_at` se calcula una sola vez, al confirmarse la ENTREGA (no el envío), con el `bot_response_timeout_minutes` del paciente.
- `src/app/api/webhooks/whatsapp/status/route.ts`: wiring de `status.ts` con Supabase — valida firma, deduplica por `(MessageSid, MessageStatus)` en `webhook_events`, aplica el patch a `bot_interactions`. SID sin interacción correspondiente → se marca `ignored` y se hace ACK igual (nada que reintentar).
- `src/app/api/webhooks/whatsapp/route.ts` (entrante): valida firma, deduplica por `MessageSid`, resuelve el paciente por `whatsapp_e164` y guarda el mensaje ya interpretado por `parseIncomingMessage()` (de C) junto al crudo en `webhook_events.normalized_payload`. **Alcance acotado a propósito:** NO escribe el efecto clínico (medición, confirmación de toma, `response_at`) — correlacionar contra la interacción pendiente y persistir con las RPC de C sigue pendiente (ver "Qué falta de B" #4/#5 en `documentacionB.md`); el evento queda durable en `processing_status='received'` para que ese trabajo lo retome sin perder ni reinterpretar el mensaje original.
- Tests: 26 nuevos (env, selección de proveedor, adaptador Twilio con SDK mockeado, progresión de `status.ts`, y ambas Route Handlers con Supabase/proveedor mockeados — sin red ni credenciales reales). Suite completa: `tsc --noEmit`, ESLint y `next build` de producción sin errores; 257 tests aprobados.
- Pendiente inmediato: `jobs/materialize.ts` + `jobs/send.ts` + `api/jobs/tick/route.ts` (la cola que decide qué mandar y llama al provider), exponer la app por HTTPS para configurar los webhooks en el panel de Twilio, y con C: la persistencia real del mensaje entrante ya interpretado.

## 2026-09-08 — Materialización/envío y prueba real de ida y vuelta

Cierra el hito 2 ("Circuito WhatsApp") de `plan-integracion.md`: primer mensaje real de Kuni enviado y confirmado (`delivered`/`read`) desde la app, con respuesta del paciente procesada por el webhook entrante.

- `src/lib/whatsapp/schedule.ts`: cálculo puro de "¿toca hoy?" para horarios semanales (recetas/planes de monitoreo), mismo criterio de "qué día es hoy" que `lastExpectedAt()` de `domain/dashboard.ts`. A propósito NO rellena días donde el tick no corrió (ver el archivo para el porqué).
- `src/lib/whatsapp/message-body.ts`: primer borrador del texto del recordatorio saliente (formato SI/NO/GLUCOSA/PRESION + código, que sí es contrato fijo del plan; el copy alrededor no lo es — avisar si A/C quieren ajustarlo).
- `src/lib/jobs/materialize.ts`: recetas/planes activos → `bot_interactions` de hoy. Alcance acotado a `medication`/`measurement` (el CORE); `appointment` y `nonresponse_summary` quedan fuera a propósito (sin plantilla real ni disparador preciso, respectivamente). Idempotente por `deduplication_key` + `upsert(...,{ignoreDuplicates:true})`, sin condición de carrera entre ticks.
- `src/lib/jobs/send.ts`: reclama con `claim_due_interactions` (RPC ya existente) y manda por `provider.sendFreeformMessage()` SOLO si hay sesión de WhatsApp reciente (`patient_messaging_state.last_inbound_at` < 24h) — WhatsApp real exige plantilla aprobada para iniciar fuera de esa ventana, y ninguna existe todavía para medicamento/medición (solo hay un ejemplo sin verificar para citas). Sin sesión ni plantilla, falla explícito con `template_not_configured` en vez de intentar un envío que WhatsApp rechazaría.
- `src/app/api/jobs/tick/route.ts`: endpoint protegido con Bearer `CRON_SECRET` (nuevo en `serverEnv`, min 16 caracteres); corre materialize → send en la misma invocación.
- El webhook entrante ahora también actualiza `patient_messaging_state.last_inbound_at` (bookkeeping de transporte, no efecto clínico) — es lo que `send.ts` usa para decidir la ventana de sesión.
- **Prueba real de extremo a extremo**, con `ngrok` exponiendo `localhost:3000` y un paciente demo con el número real del probador:
  1. Mensaje entrante (`hola`) → webhook entrante lo recibe, valida firma, resuelve paciente, guarda `parsed.kind='unrecognized'`, abre ventana de sesión.
  2. `POST /api/jobs/tick` → materializa una `bot_interaction` de medicamento vencida y la manda por WhatsApp real (`sendFreeformMessage`) → `delivery_status='accepted'` con `provider_message_id` real de Twilio.
  3. Callback de estado (`sent` → `read`) confirmado por el probador en su teléfono.
  4. Respuesta real (`SI <código>`) → webhook entrante la recibe y la guarda como `parsed.kind='medication_confirm', taken:true` (la escritura del efecto clínico — vincularla a la interacción y confirmar la toma — sigue pendiente de C, como ya estaba documentado).
- **Bug real encontrado y corregido durante la prueba:** los números de WhatsApp de México llegan con un "1" extra después del código de país (`+521XXXXXXXXXX`), distinto del E.164 sin ese dígito que se había usado para los pacientes demo (`+52XXXXXXXXXX`) — el mensaje entrante no encontraba al paciente por ese desajuste. Corregido el dato demo; **queda pendiente** normalizar esa variante en la resolución de paciente del webhook para no depender de que cada número demo/real ya venga en el formato "correcto" (ver "Qué falta de B").
- **Bug real encontrado y corregido durante la prueba:** dos callbacks de estado casi simultáneos (`sent` y `read`) provocaron una condición de carrera — ambos leyeron el mismo estado "antes", y el que escribió último pisó al que había avanzado más (`read` con `delivered_at`/`read_at` ya puestos terminó reportado como `accepted`). Corregido con concurrencia optimista en `api/webhooks/whatsapp/status/route.ts` (`UPDATE ... WHERE delivery_status = <leído>`, relee y recalcula si 0 filas se afectan, hasta 5 intentos). Test de regresión agregado.
- Entorno local: se detectó y corrigió que WSL ejecutaba el `node.exe` de Windows en vez de un Node nativo de Linux (mezcla que rompía toda la red entre `ngrok` y `next dev`) — documentado aquí solo como nota de entorno, no afecta a compañeros en Windows puro.
- Verificado: `tsc --noEmit`, ESLint y `npm run build` de producción sin errores; **285 tests aprobados** (28 archivos), corridos con Node nativo de WSL tras la migración de entorno.

## Pendiente para B (siguiente)

- Normalizar la variante `+521XXXXXXXXXX` vs `+52XXXXXXXXXX` de números mexicanos al resolver paciente por teléfono en el webhook entrante (bug real encontrado en la prueba de arriba).
- Con C: persistir el efecto clínico del mensaje entrante ya interpretado (correlacionar con la interacción pendiente por `reply_code`, escribir medición/confirmación, `response_at`).
- Plantillas aprobadas de Twilio (Content Templates) para medicamento y medición — sin eso, `send.ts` solo puede mandar fuera de la ventana de 24h con una plantilla que no existe todavía.
- `appointment` y `nonresponse_summary` en el materializador (dejados fuera a propósito de esta entrega).
- Migración RF28, RLS de dos unidades, CSP, apagar proveedor SMS de Twilio en Supabase — pendientes previos, sin cambios.

## 2026-09-08 — Auditoría de integración y B1: migraciones `0002`/`0003` aplicadas

Tras la auditoría (`docs/auditoria-integracion.md`, `docs/pendientes-y-modelo.md`), retomo el trabajo de B en el orden que la auditoría marca como el que más gente desbloquea. Primer paso: B1.

- **Verificación previa con `migration list --linked`**: `0001` aparecía aplicada en remoto; `0002` y `0003` solo en local, ninguna a medias — confirmaba que el `db push` podía correr limpio sin necesidad de limpiar nada a mano (relevante porque `0002`/`0003` usan `create function`, no `create or replace`, así que no son idempotentes: un push parcial habría dejado funciones a medio crear y un reintento directo habría fallado con "already exists").
- **`supabase login`** (nueva sesión de CLI, no existía token guardado) y **`supabase db push`**: aplicó `0002_clinical_derivations.sql` y `0003_clinical_commands.sql` sin errores, confirmación explícita antes de ejecutar.
- **`supabase gen types typescript --linked`** sobre `src/types/database.types.ts`: confirmado que las cinco RPC clínicas de C aparecen ahora en la sección `Functions` — `adjust_prescription`, `correct_measurement`, `correct_medication_response`, `mark_urgent`, `resolve_alert` — junto a las dos ya existentes (`claim_due_interactions`, `expire_due_interactions`).
- Verificado después: `tsc --noEmit` sin errores, ESLint sin errores, **322 pruebas en 31 archivos** (raíz, incluye `domain-core/tests/unit` vía el include compartido) aprobadas vía WSL, `next build` de producción exitoso (14 rutas, incluida `/api/health`).
- Es el desbloqueo #1 de `docs/auditoria-integracion.md` §2.1: la mitad del entregable de A (Server Actions clínicas) y la integración de las RPC de C (`docs/pendientes-y-modelo.md` C6) ya pueden avanzar sin esperar a B.
- Nada de esto tocó datos ni ejecutó semillas; solo DDL de las dos migraciones ya escritas y probadas en PGlite, y regeneración de tipos.

**Siguiente en la cola de B** (orden de `docs/pendientes-y-modelo.md`, de lo que desbloquea a más gente a lo que no bloquea a nadie): B3 (migración RF28, `patient_complications`) y B4 (clase terapéutica en `medications`) — ambas desbloquean las cinco variables que hoy le faltan al vector de `buildMlFeatureVector()`; después B2 (Cron), B6 (RLS real de dos unidades), B7 (`appointment`/`nonresponse_summary` en el materializador), B8 (CSP, apagar SMS de Twilio) y B5 al final (plantillas de Twilio, depende de aprobación externa).

## 2026-09-08 — B3: migración RF28 (`patient_complications`) diseñada, validada y aplicada

- **Diseño:** `supabase/migrations/0004_patient_complications.sql`, migración nueva posterior a `0001`-`0003` (ninguna de las tres tocada). Leí antes `buildMlFeatureVector()` en `domain-core/src/lib/ml/features.ts`, que era quien definía el contrato real: catálogo `E110`-`E119` (`E119` = "ninguna complicación" explícita, distinto de "expediente sin revisar" = ausencia total de fila), y que `distinctActiveComplications()` nunca cuenta `E119` junto a una complicación real.
- Tabla `patient_complications`: `unit_id`/`patient_id` con FK compuesta a `patients(unit_id, id)` (mismo patrón que el resto de `0001`), `code` restringido al catálogo, `diagnosed_on` nullable (mismo criterio que `patient_diagnoses.diagnosed_on`), `active` (vigencia) + `correction_reason` obligatorio en todo UPDATE (mismo patrón que `measurements`/`medication_responses`), `attributed_doctor_id` NOT NULL como actor.
- Regla de negocio propia, en un trigger (`private.validate_patient_complication`): a lo más una fila vigente por código y paciente (índice único parcial) y `E119` vigente excluye cualquier complicación real vigente del mismo paciente, y viceversa — para que el dato que produce la tabla sea exactamente el que `buildMlFeatureVector()` ya espera en `MlComplicationsCapture.codes`.
- Reutiliza sin modificar los helpers de `0001`: `private.can_read_unit`/`can_write_unit` para RLS, `private.preserve_identity()` para inmutabilidad de `id`/`unit_id`/`created_at`/`patient_id`, `private.audit_clinical_change()` para `audit_log`. Grants explícitos a `service_role` porque el `grant all on all tables` de `0001` solo alcanzó a las tablas que existían en ese momento.
- **Validada en PGlite antes de tocar el remoto**, como pide la regla de trabajo: `domain-core/tests/integration/patient-complications.test.ts` (nuevo, 12 pruebas) — RLS entre dos unidades y con cuenta viewer/anon, rechazo de código fuera de catálogo, unicidad de fila vigente por código, exclusión mutua con `E119` en ambos sentidos, `correction_reason` obligatorio, reapertura de un código tras corregirlo, inmutabilidad de identidad, y que el `audit_log` registra INSERT y UPDATE. No toqué `clinical-rpcs.test.ts` de C.
- Suite completa de `domain-core`: **248 pruebas en 12 archivos** (antes 236), incluidas las 63 de C sin regresión. Corrida con el Node nativo de **Windows** (`npx vitest run` directo, sin WSL) — al revés que la raíz: a `domain-core/node_modules` le falta el binding `@rollup/rollup-linux-x64-gnu` del lado WSL. Nota de entorno nueva, no bloquea nada porque el comando que sí funciona (`npx vitest` en Windows) es más simple que el de la raíz.
- **Aplicada al proyecto Supabase real**: `db push` (solo `0004_patient_complications.sql`, las tres anteriores ya estaban) y `gen types typescript --linked` — `patient_complications` ya aparece en `src/types/database.types.ts`. Verificado después: `tsc --noEmit` y ESLint de la raíz sin errores.
- **Qué desbloquea:** tres de las cinco variables que `buildMlFeatureVector()` reportaba en `gaps` (`num_complicaciones_dm`, `tiene_complicacion_dm`, `complicacion_grave_dm`) ya tienen una tabla real que las respalda — falta que A capture datos y que C escriba el adaptador (C2/C7). A puede construir la UI de captura/edición de RF28 contra esta tabla ya mismo. Las otras dos variables de adherencia siguen esperando B4.

**Siguiente en la cola de B:** B4 (clase terapéutica en `medications`), después B2 (Cron), B6, B7, B8 y B5 al final.

## 2026-09-08 — B4: clase terapéutica de `medications` diseñada, validada y aplicada

- **Diseño:** `supabase/migrations/0005_medication_therapeutic_class.sql`. A diferencia de B3, no es una tabla nueva: `medications` ya participaba en los genéricos de `0001` (`immutable_identity`, `clinical_audit`, RLS de lectura/escritura por unidad), así que el `ALTER TABLE` no necesitó tocar triggers, RLS ni grants — todos ya cubren cualquier columna nueva de la tabla.
- `therapeutic_class text` con `check (... in ('antidiabetic','antihypertensive','other'))`, **sin `NOT NULL` ni default**. Decisión deliberada: un default en `'other'` escondería un medicamento real de antidiabético/antihipertensivo detrás de un valor que parece una clasificación ya hecha — mismo criterio que ya usa el esquema (`monitoring_plans`: "NULL en un límite significa no configurado. No clasificar como normal por ausencia de rango"). `MlFeatureInput.antidiabeticAdherence`/`antihypertensiveAdherence` en `domain-core/src/lib/ml/features.ts` ya aceptan `null` como "no se puede separar por clase": es exactamente ese estado mientras el medicamento no se clasifique.
- **Validada en PGlite antes de tocar el remoto**: `domain-core/tests/integration/medication-therapeutic-class.test.ts` (nuevo, 5 pruebas) — un medicamento insertado antes de clasificar queda `NULL` (no `'other'`), el catálogo acepta los tres valores válidos, rechaza uno inválido, se puede clasificar por UPDATE, y la RLS ya existente (de `0001`) impide que otra unidad lo modifique.
- Suite completa de `domain-core`: **253 pruebas en 13 archivos** (antes 248), sin regresión en las 63 de C ni en las 12 de B3.
- **Aplicada al proyecto Supabase real**: `db push` (solo `0005_medication_therapeutic_class.sql`) y `gen types typescript --linked` — `medications.therapeutic_class` ya aparece en `src/types/database.types.ts`. Verificado después: `tsc --noEmit` y ESLint de la raíz sin errores.
- **Con esto, B1+B3+B4 juntas cierran las cinco variables que `buildMlFeatureVector()` reportaba en `gaps`.** Falta que A capture/clasifique los datos desde la UI y que C escriba los adaptadores (C2/C7/C8): complicaciones hacia `MlComplicationsCapture.codes` y adherencia por clase terapéutica hacia `antidiabeticAdherence`/`antihypertensiveAdherence`. Aviso importante para C: `therapeutic_class = NULL` es "sin clasificar", no debe tratarse como `'other'` ni excluirse silenciosamente sin dejarlo en `gaps`.

**Siguiente en la cola de B:** B2 (programar el Cron), después B6 (RLS real de dos unidades), B7 (`appointment`/`nonresponse_summary` en el materializador), B8 (CSP, apagar SMS de Twilio) y B5 al final.

## 2026-09-08 — B2: Cron programado con Supabase Cron (`pg_cron`+`pg_net`+Vault)

- **Decisión:** Supabase Cron en vez de un cron externo (GitHub Actions, cron-job.org, etc.) porque vive dentro del mismo proyecto Supabase que ya se administra, y porque el propio `0001_kuni.sql` ya lo anticipaba en su comentario final ("Programar cron externo/Supabase Cron -> endpoint Next.js protegido").
- **No se versionó como migración SQL.** El `cron.schedule(...)` necesita el `CRON_SECRET` real y la URL pública de la app — meter eso en un archivo `.sql` en git habría filtrado un secreto en el historial. En vez de eso, el secreto y la URL se guardaron cifrados en **Supabase Vault** (`vault.create_secret`), y el cron los lee por nombre en cada corrida (`vault.decrypted_secrets`), nunca en texto plano dentro de `cron.job`.
- Extensiones habilitadas por el equipo desde el dashboard: `pg_cron`, `pg_net`.
- Dos secretos en Vault: `kuni_cron_secret` (el `CRON_SECRET` de `.env.local`) y `kuni_tick_endpoint_url` (`APP_PUBLIC_URL` + `/api/jobs/tick`).
- Cron programado (`jobname = 'kuni-jobs-tick'`) cada minuto (`* * * * *`, `jobid = 2` — se reprogramó una vez desde cada 5 minutos, que fue el `jobid = 1` inicial), haciendo `net.http_post` con `Authorization: Bearer <kuni_cron_secret>` hacia `kuni_tick_endpoint_url`.
- **Tropiezos reales durante la puesta en marcha (documentados para que no se repitan):**
  1. Los dos secretos de Vault se guardaron la primera vez con los símbolos `<` `>` incluidos literalmente (copiados del placeholder de la instrucción en vez del valor real) — la URL quedó como `<https://...>/...`. Síntoma: `cron.job_run_details` marcaba `failed` con `ERROR: invalid URL`. Corregido con `vault.update_secret(...)` pasando el valor limpio.
  2. Con la URL corregida pero el secreto del `CRON_SECRET` todavía con `<>`, `net._http_response` mostraba `status_code = NULL` y `error_msg = 'A libcurl function was given a bad argument'` — consistente con un header mal formado (`Authorization` con un valor no válido para pg_net). Corregido igual, con `vault.update_secret`.
  3. Una corrida aislada devolvió `status_code = 404` con URL y secreto ya correctos — no reproducible; probablemente `next dev`/`ngrok` no estaban listos en ese instante exacto o la sesión de `ngrok` se había reiniciado momentáneamente. Verificado aparte con `curl -i -X POST <url> -H "Authorization: Bearer <secreto-invalido>"` desde la misma máquina → `401 No autorizado`, confirmando que la ruta y el proxy (`src/proxy.ts`, que ya excluye `api/jobs/*` de su matcher) funcionaban bien en ese momento.
  4. Corrida siguiente: `status_code = 200`, `content = {"expire":{"expired":1},"materialize":{"candidates":1,"created":0},"send":{"claimed":0,"sent":0,"failed":0}}` — **una interacción real venció automáticamente sin intervención manual**, confirmando el circuito completo (Vault → `pg_net` → `ngrok` → Next.js → RPC/jobs) de punta a punta.
- **Riesgo operativo real, no técnico, de cara a la demo:** `kuni_tick_endpoint_url` apunta hoy a un túnel de `ngrok` (plan gratuito), que **rota su URL cada vez que se reinicia**. Si eso pasa antes de la demo, el Cron le pega a una URL muerta hasta que se actualice el secreto:
  ```sql
  select vault.update_secret(
    (select id from vault.secrets where name = 'kuni_tick_endpoint_url'),
    '<NUEVA_URL_DE_NGROK>/api/jobs/tick'
  );
  ```
  Si se consigue un despliegue con dominio estable antes de la demo, actualizar el secreto una sola vez y este riesgo desaparece por completo.
- No se versionó ningún archivo de migración para esto (es configuración operativa con secretos reales, no DDL del esquema); queda documentado aquí como la referencia si hay que repetirlo o depurarlo.

**Siguiente en la cola de B:** B6 (RLS real de dos unidades), después B7 (`appointment`/`nonresponse_summary` en el materializador), B8 (CSP, apagar SMS de Twilio) y B5 al final.

## 2026-09-08 — B6: aislamiento RLS verificado contra el proyecto real

Entregable verificable declarado en el README que nunca se había ejecutado contra el proyecto real (`docs/auditoria-integracion.md` §1, fila "RLS real de dos unidades, concurrencia, rendimiento" — 10 % de avance). Las pruebas unitarias existentes (`tests/unit/dashboard-queries.test.ts`) verifican el código de las consultas con mocks; esto verifica las políticas RLS mismas, contra Postgres real.

- **Nuevo** `scripts/verify-rls-isolation.ts`. Con la clave secreta (se salta RLS a propósito) prepara el escenario: dos unidades de prueba aisladas (`RLS-TEST-UNIT-A`/`B`, con prefijo distintivo para no mezclarse con los datos demo existentes), un médico, un consultorio y un paciente en cada una, y tres usuarios de Auth — uno con membresía en A, uno en B, y uno **sin membresía en ninguna unidad**. Idempotente: reutiliza lo que ya existe en corridas siguientes y regenera la contraseña de los tres usuarios de prueba cada vez (son cuentas desechables, no reales).
- Después, con la clave **publicable** (la misma que usa el navegador — RLS activo de verdad, nunca la clave secreta) abre sesión real como cada uno de los tres y corre 10 aserciones: cada quien ve solo su propia unidad y su propio paciente aunque pida explícitamente los ids de ambas unidades/pacientes en la misma consulta; un intento de A de escribir sobre el paciente de B afecta 0 filas (RLS también bloquea escritura, no solo lectura) y el paciente de B queda intacto (confirmado aparte con la clave secreta); la cuenta sin membresía no ve una sola fila en `health_units`, `patients` ni `unit_memberships`.
- **Corrida por el usuario, resultado real contra el proyecto Supabase de producción**: **10/10 aserciones en verde**. Sin fallos, sin necesidad de ajustar RLS — las políticas de `0001_kuni.sql` (`private.can_read_unit`/`can_write_unit`, `memberships_read_self`) funcionan exactamente como se documentaron.
- No se tocaron los datos demo existentes (los tres pacientes ficticios, la unidad Morelia). No se envió WhatsApp ni se corrió ningún otro job durante la verificación.

**Siguiente en la cola de B:** B7 (`appointment`/`nonresponse_summary` en el materializador), después B8 (CSP, apagar SMS de Twilio) y B5 al final.

## 2026-09-08 — B7: `appointment` y `nonresponse_summary` en el materializador

`materialize.ts` los dejaba fuera a propósito desde su primera entrega: `appointment` porque no había plantilla aprobada con contenido real, `nonresponse_summary` porque su disparador ("al siguiente contacto permitido") nunca quedó definido con precisión en el plan. Antes de escribir código, dos decisiones de producto se acordaron con el equipo (no las inventé):

- **Anticipación del recordatorio de cita:** 24h antes de `starts_at`.
- **`nonresponse_summary`** — va dirigido al **paciente** (por WhatsApp) y también debe verse en el dashboard; se dispara con el mismo criterio que ya usa `evaluateRisk()` para elevar a riesgo medio (≥3 no-respuestas), pero **una sola vez por racha**, no cada tick mientras la racha sigue viva; tono deliberadamente amable, sin presión.

**Diseño del disparador de `nonresponse_summary`** (la parte no trivial): en vez de una ventana móvil de 7 días — que se volvería a disparar en cada tick mientras la racha sigue activa — se cuenta *desde la última respuesta del paciente* (o desde siempre, si nunca ha respondido) sus no-respuestas seguidas. Al llegar a 3, el `id` de esa 3ª no-respuesta se usa como **ancla fija** de la clave de deduplicación (`nonresponse_summary:<patient_id>:<anchorId>`): aunque la racha siga creciendo a 4, 5, 10 no-respuestas, el ancla no cambia, así que el `upsert` con `ignoreDuplicates` nunca vuelve a insertar el mismo mensaje. La racha solo "se rompe" — y una nueva podría volver a disparar un mensaje, con un ancla distinta — en cuanto el paciente responde cualquier cosa. Implementado como función pura (`nonresponseStreakAnchors()`), testeable sin base de datos, igual que el resto del dominio.

- `src/lib/jobs/materialize.ts`: dos bloques nuevos por unidad —
  - `appointment`: consulta `appointments` con `status='scheduled'` y `starts_at` futuro; materializa cuando `starts_at - 24h <= now`. `expects_response=false`, dedup key `appointment:<id>:reminder`. El texto local de la cita (`startsAtLocal`) se formatea en el momento de materializar con la zona horaria de la unidad (mismo patrón que ya usa el snapshot de medicamento/medición), para que `send.ts` no necesite conocer la zona horaria.
  - `nonresponse_summary`: consulta el historial de `bot_interactions` de medicamento/medición con `timeout_at`/`response_at`, agrupa por paciente y aplica `nonresponseStreakAnchors()` (nueva, exportada, pura).
- `src/lib/whatsapp/message-body.ts`: `AppointmentReminderInput` (informativo, sin código de respuesta) y `NonresponseSummaryReminderInput` (tono amable, sin presión, sin pedir dato alguno).
- `src/lib/jobs/send.ts`: `renderMessageBody()` ahora cubre los cuatro `kind`; ambos nuevos reutilizan el mismo flujo de entrega que medicamento/medición — **misma limitación conocida**: sin ventana de sesión reciente, fallan con `template_not_configured` hasta que exista plantilla aprobada (B5). No hice ningún tratamiento especial para "esperar a que el paciente escriba": el sistema ya no tiene un mecanismo de reintento distinto de eso para ningún `kind`, así que introducir uno solo para `nonresponse_summary` habría sido inconsistente con el resto.
- Visibilidad en el dashboard: gratis, sin tocar nada — `src/lib/domain/dashboard.ts` ya mapea cualquier `kind` de `bot_interactions` a los "hitos de interacción" de la ficha (línea `interactions: ...map((r) => ({ id: r.id, kind: r.kind, ... }))`), sin narrowing a un enum cerrado.
- Tests: `tests/unit/jobs-materialize.test.ts` — 3 casos nuevos de integración (recordatorio de cita a tiempo, cita todavía lejana no genera nada, check-in disparado al cruzar el umbral) + 5 casos unitarios de `nonresponseStreakAnchors()` (sin racha, ancla estable al crecer la racha, una respuesta rompe la racha, una racha nueva usa un ancla distinta, dos pacientes se evalúan por separado). `tests/unit/jobs-send.test.ts` — 2 casos nuevos (cita se manda con sesión reciente, check-in se manda sin código de respuesta en el texto).
- Verificado: `tsc --noEmit`, ESLint y `next build` de producción sin errores; **337 pruebas en 32 archivos** (antes 322).

**Siguiente en la cola de B:** B8 (CSP, apagar SMS de Twilio), y B5 al final (plantillas de Twilio, depende de aprobación externa).

## 2026-09-08 — B8: CSP con nonce por request, probado en caliente

Pendiente diferido desde la revisión OWASP inicial (§A05, 2026-09-07) "por el riesgo de romper el build si se configura mal en el tiempo disponible". Esta vez sí se probó en caliente antes de darlo por cerrado, como pedía ese mismo comentario.

**Primer intento (descartado):** una CSP estática en `next.config.ts` (`script-src 'self'`, sin nonce). Compiló, pasó `tsc`/ESLint/`next build` sin errores — pero al abrir `/login` en el navegador real (vía `ngrok`, con el `next dev` del equipo), la consola mostró:

```
Executing inline script violates the following Content Security Policy directive 'script-src 'self' 'unsafe-eval''...
Uncaught (in promise) InvariantError: Expected a request ID to be defined... via self.__next_r. This is a bug in Next.js.
```

Next.js App Router inyecta scripts inline (`self.__next_f.push(...)`) para hidratar el streaming de RSC — **en producción también, no solo en dev**. `script-src 'self'` sin excepción los bloquea y rompe la hidratación de verdad, no solo la política. Es exactamente el riesgo que ya se había señalado y por el que se difirió la primera vez.

**Solución (la documentada oficialmente por Next.js para App Router):** un nonce único por request, generado en el middleware, mandado dos veces con el mismo valor — en `request.headers` (para que Next lo detecte al renderizar y marque sus propios `<script>` con ese nonce) y en `response.headers` (lo que recibe el navegador). Implementado en `updateSession()` (`src/lib/supabase/proxy.ts`), que ya era el único lugar donde corre lógica de request/response por navegación:

- `script-src 'self' 'nonce-<random>' 'strict-dynamic'` (+ `'unsafe-eval'` solo si `NODE_ENV !== 'production'`, que es lo que exige el HMR de Turbopack en `npm run dev`; `next build`/producción no lo necesita).
- `style-src 'self' 'unsafe-inline'`: cuatro vistas usan `style={{...}}` de React (`clinical-workspace.tsx`, `clinical-dashboard.tsx`, `statistics-view.tsx`, `global-error.tsx`); nonar cada estilo inline es una refactorización aparte fuera de este pendiente, y el riesgo de inyección CSS es mucho menor que uno de script.
- `connect-src 'self'` + origen https/wss del proyecto Supabase real (leído de `serverEnv.NEXT_PUBLIC_SUPABASE_URL`, no hardcodeado) — el navegador nunca habla con Twilio ni con el servicio de ML, ambos server-only.
- El resto de directivas (`img-src`, `font-src`, `form-action`, `frame-ancestors`, `base-uri`, `object-src`) estrictas: el repo no carga scripts, fuentes ni imágenes de terceros (verificado: cero uso de `next/font`, `next/image` con `remotePatterns`, o `<script src=` externo).
- `next.config.ts` conserva las cabeceras estáticas de siempre (`X-Frame-Options`, HSTS, etc.) para todas las rutas, más una CSP mínima y estática (`default-src 'none'; frame-ancestors 'none'; base-uri 'none'`) solo para las tres rutas que el matcher del proxy excluye a propósito (`api/webhooks/*`, `api/jobs/*`, `api/health` — se autentican con firma de Twilio/Bearer, no con cookies): son JSON puro sin HTML, así que una CSP con nonce ahí no aporta nada y una estática muy estricta es perfectamente segura.

**Verificado en caliente, contra la app real** (no solo `next build`): con el `next dev` + `ngrok` del equipo ya corriendo, se pidió reiniciar el proceso dos veces (`next.config.ts`/middleware no se recargan en caliente) — primero con el diseño roto (confirmando el error real en consola), después con el nonce:

- Header `Content-Security-Policy` con nonce distinto en cada request, confirmado por `fetch()` directo desde la consola del navegador.
- `/login` renderiza sin ningún error de CSP en consola, con estilos inline aplicados correctamente.
- Redirect de `/dashboard` (sin sesión) a `/login` también lleva el mismo header con nonce.
- `/api/health` lleva la CSP mínima estática (`default-src 'none'`), confirmado con `curl`.
- El único error de consola que quedó (`WebSocket ... /_next/hmr failed`) no es una violación de CSP — es la conexión de HMR de Turbopack sobre el túnel de `ngrok`, ajeno a este cambio.

Tests nuevos: `tests/unit/auth-proxy.test.ts` — 3 casos (`Content-Security-Policy` con nonce en `script-src` cuando no redirige, el mismo header también en la respuesta de redirect a `/login`, y que dos requests distintos generan nonces distintos). Suite completa: `tsc --noEmit`, ESLint y `next build` de producción sin errores; **340 pruebas en 32 archivos** (antes 337).

**Segundo pendiente de B8, manual — hecho:** proveedor SMS apagado en Supabase (Authentication → Sign In/Providers → Phone → OFF). Verificado después con el recordatorio explícito del bug del 2026-09-08 (esa vez se había apagado Email por accidente junto con SMS): `curl -X POST ".../auth/v1/token?grant_type=password"` con credenciales inventadas devolvió `400 invalid_credentials`, no `422 email_provider_disabled` — Email sigue activo, login del equipo no se rompió.

Con esto, **B8 queda completo.**

**Siguiente en la cola de B:** B5 (plantillas aprobadas de Twilio), el último punto de la lista original — depende de aprobación externa (Twilio/Meta), fuera del control directo de B.

## 2026-09-08 — B5: código listo, plantillas diseñadas, en espera de aprobación externa

**Código (terminado, verificado):**
- `serverEnv` (`src/lib/env/server.ts`) gana cinco Content SID opcionales: `TWILIO_MEDICATION_CONTENT_SID`, `TWILIO_MEASUREMENT_GLUCOSE_CONTENT_SID`, `TWILIO_MEASUREMENT_BP_CONTENT_SID`, `TWILIO_APPOINTMENT_CONTENT_SID`, `TWILIO_NONRESPONSE_CONTENT_SID`. Cada una vacía = ese `kind` sigue fallando explícito con `template_not_configured` fuera de la ventana de sesión, exactamente el comportamiento de antes de B5.
- `send.ts`: `templateFor(interaction)` resuelve el Content SID + variables por `kind` (y por variable de medición, glucosa/presión cada una con su propio SID — son plantillas de WhatsApp distintas, no se puede reutilizar una). Cuando no hay sesión reciente, intenta `sendTemplateMessage()` si hay SID configurado; si no, cae al mismo `markFailed("template_not_configured", ...)` de siempre. `sendAndRecord()` factoriza el registro de éxito/error para no duplicarlo entre la ruta de plantilla y la de texto libre.
- 4 pruebas nuevas en `jobs-send.test.ts`: envío por plantilla cuando no hay sesión pero sí SID, glucosa/presión usan SID distintos, y presión sin su propio SID sigue fallando aunque glucosa sí lo tenga configurado (nadie hereda el SID de otro `kind`).
- Verificado: `tsc --noEmit`, ESLint, **361 pruebas en 33 archivos** (antes 357), `next build` de producción — todo sin errores.

**Plantillas — 5 diseñadas y creadas en Twilio Content Template Builder** (categoría Utility, español MEX), con emojis/negritas para verse mejor que texto plano puro:

| Nombre en Twilio | Variable env | Uso |
|---|---|---|
| `kuni_medication_reminder` | `TWILIO_MEDICATION_CONTENT_SID` | Recordatorio de medicamento (`{{1}}`=medicamento+dosis, `{{2}}`=código) |
| `kuni_measurement_glucose_reminder` | `TWILIO_MEASUREMENT_GLUCOSE_CONTENT_SID` | Solicitud de glucosa (`{{1}}`=código) |
| `kuni_measurement_bp_reminder` | `TWILIO_MEASUREMENT_BP_CONTENT_SID` | Solicitud de presión (`{{1}}`=código) |
| `kuni_appointment_reminder` | `TWILIO_APPOINTMENT_CONTENT_SID` | Recordatorio de cita (`{{1}}`=consultorio, `{{2}}`=fecha/hora local) |
| `kuni_nonresponse_checkin` | `TWILIO_NONRESPONSE_CONTENT_SID` | Check-in de no-respuesta, sin variables |

**Bloqueo real encontrado (documentado, no inventado):** el Sandbox de Twilio (número compartido) no deja someter plantillas propias a aprobación de Meta — exige un **WhatsApp Sender propio**, y crear uno exige **cuenta de Twilio de pago** (no solo Trial). El usuario decidió pagar el upgrade mínimo y avanzar. Trámite en curso, iniciado hoy:
1. Cuenta de Twilio actualizada a de pago.
2. Número propio (chip sin WhatsApp activo, formato `+52` + 10 dígitos) registrado como candidato a WhatsApp Sender.
3. Cuenta de WhatsApp Business y Meta Business Manager creadas para "Kuni" vía el flujo de Twilio ("Continue with Facebook").
4. Estado actual: **cuenta de WhatsApp Business en revisión de Meta** ("Cuenta restringida" — estado normal para una cuenta nueva sin verificar, no una sanción); se solicitó la revisión explícitamente ("Solicitar revisión" en Meta Business Support). Meta indica que las revisiones típicamente tardan 24 horas.
5. Las 5 plantillas quedaron creadas y guardadas en Twilio (`Not Submitted` — todavía no se pueden enviar a aprobación de WhatsApp hasta que el Sender quede verificado).

**Siguiente, una vez llegue la confirmación de Meta (por correo):**
1. Confirmar en Twilio Console que el WhatsApp Sender quedó activo (ya no "Pendiente").
2. Someter las 5 plantillas a aprobación de WhatsApp desde el Content Template Builder ("Save and submit for WhatsApp approval" — es una revisión aparte, por plantilla).
3. Copiar cada Content SID aprobado (`HX...`) a `.env.local`. Sin más cambios de código: `templateFor()` ya sabe usarlos en cuanto detecta el valor.

No se aplicó nada al proyecto Supabase durante esta entrega; todo lo de Twilio/Meta se hizo en la cuenta real del usuario, con su decisión explícita de pagar el upgrade.

## 2026-09-08 — Prueba SMS desde la ficha y continuidad automática

- Se agregó `0013_manual_sms_test.sql`: amplía `bot_interactions.kind` con `manual_test` y publica la RPC autenticada `request_manual_sms_test`.
- La RPC revalida membresía de escritura, unidad, consultorio, paciente activo y consentimiento; serializa clics concurrentes, conserva idempotencia por `requestId` y limita una prueba por paciente cada 30 segundos.
- `src/lib/jobs/manual-sms-test.ts` usa el mismo adaptador SMS configurado que el cron, guarda `accepted/failed/unknown` con compare-and-set y nunca trata una aceptación HTTP como entrega confirmada.
- `src/actions/messaging.ts` es la frontera de Server Action: valida UUID, vuelve a autenticar/autorizar y solo devuelve el estado mínimo necesario a la interfaz.
- La ficha del paciente incluye confirmación previa con destino y texto fijo. El botón solo sirve para prueba inmediata; no altera el `POST /api/jobs/tick`, que sigue materializando y enviando recordatorios programados.
- En iPhone, la generación/encolado puede ocurrir automáticamente, pero iOS puede exigir escoger SIM y confirmar físicamente el SMS. La interfaz lo dice de forma explícita.
- Las pruebas `tests/unit/manual-sms-test.test.ts` cubren éxito, idempotencia, proveedor incorrecto, límite de frecuencia y fallo ambiguo. No realizan envíos reales.

## 2026-09-08 — Botón de WhatsApp para la demo del Sandbox

- Se verificó que los botones anteriores `Abrir WhatsApp` solo abren el chat y no llaman al proveedor ni al job.
- `0014_manual_message_test.sql` generaliza la prueba manual para `twilio/whatsapp`, manteniendo compatibilidad con `sms8/smsgate`.
- La ficha conserva el botón del transporte efectivo y, cuando hay credenciales Twilio, añade `Enviar WhatsApp de prueba` como vía independiente. Así SMS8 puede seguir siendo el proveedor del cron durante la demo.
- WhatsApp falla cerrado si `patient_messaging_state.last_inbound_at` no está entre ahora y las 24 horas previas. Esto evita intentar texto libre fuera de las reglas del canal mientras las plantillas propias siguen sin aprobación.
- La prueba llama solo al destinatario elegido; no ejecuta `/api/jobs/tick` y no arrastra otras interacciones vencidas.
- Procedimiento operativo completo: `docs/whatsapp-sandbox-demo.md`.
- Durante la validación simultánea SMS8 + Sandbox se observó `403` real en `/api/webhooks/whatsapp`: la ruta estaba resolviendo el proveedor global (`sms8`) y por ello fallaba cerrada ante una firma Twilio válida. Se corrigieron webhook entrante y callback de estado para seleccionar explícitamente el adaptador Twilio; el cron conserva SMS8. Después de estabilizar la compilación, las siguientes ejecuciones observadas de `/api/jobs/tick` regresaron `200`.
