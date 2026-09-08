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
