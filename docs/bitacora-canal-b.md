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

## Pendiente para B (siguiente)

- `src/lib/supabase/client.ts`, `server.ts`, `admin.ts`, `proxy.ts`.
- `src/lib/whatsapp/provider.ts` (interfaz) y `twilio.ts` (adaptador real).
- Exponer la app por HTTPS (túnel local o deploy) para configurar el webhook entrante y el `StatusCallback` de Twilio.
- `api/webhooks/whatsapp/route.ts`, `api/webhooks/whatsapp/status/route.ts`, `api/jobs/tick/route.ts`.
- `jobs/materialize.ts`, `jobs/send.ts`.
