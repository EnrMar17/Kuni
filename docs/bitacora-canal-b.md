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
