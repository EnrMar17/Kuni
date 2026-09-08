# Kuni

Proyecto desarrollado en el **Innovation Fest 2026**.

Plataforma de monitoreo remoto de pacientes (RPM) para enfermedades crónico-degenerativas (diabetes e hipertensión), dirigida a unidades de primer nivel de atención (IMSS-Bienestar). Combina un bot de WhatsApp que da seguimiento a tomas de medicamentos, mediciones y citas, con un tablero clínico que prioriza el seguimiento mediante reglas explicables (sin predicción clínica inventada).

> Los documentos completos de requerimientos y plan técnico son de trabajo interno del equipo y **no se suben al repositorio** (ver `.gitignore`). La revisión funcional versionada está en `docs/plan-integracion.md` y el avance por integrante en `docs/documentacionA.md`, `docs/documentacionB.md` y `docs/documentacionC.md`. Este README resume lo necesario para que los tres integrantes tengan contexto compartido; para el detalle completo, consultar los archivos locales `requerimientos-rpm-cronicos.md` y `kuni-plan-tecnico.md` compartidos fuera de Git.

---

## 1. El ciclo que debe funcionar (core del MVP)

```
alta -> consentimiento -> receta y monitoreo -> WhatsApp ->
respuesta o vencimiento -> medicion/adherencia -> alerta -> revision medica
```

Este ciclo se desarrolla **antes** que estadísticas o funcionalidades extra (RF18 OCR, RF19 avisos al médico, analítica avanzada).

## 2. Stack y arquitectura

- **Next.js 16** (App Router) + **TypeScript**, Node.js **24 LTS**.
- **Supabase**: Auth (email/contraseña por unidad), Postgres con **RLS** por unidad, **Cron** (invoca cada minuto un endpoint propio de jobs).
- **Mensajería**: Twilio/WhatsApp permanece disponible; como alternativa de salida, SMS Gateway for Android envía SMS celular desde una SIM real. Adaptador `mock` disponible para desarrollo sin canal real.
- Sin backend adicional (Express/Redis/ORM/agente de IA): Next.js concentra páginas, Server Actions, webhooks y worker; Supabase aporta Auth/Postgres/Cron.

**Flujo técnico:**

```
navegador -> Next.js (sesion SSR) -> Supabase (JWT del usuario + RLS)
WhatsApp -> webhook firmado de Next.js -> persistencia -> procesamiento
Supabase Cron -> endpoint privado /api/jobs/tick -> cola en Postgres -> proveedor -> callback de entrega
```

## 3. Estructura del repositorio

```
kuni/
  src/
    app/
      (auth)/login/                        # Login por unidad
      (protected)/consultorios/            # Seleccion de consultorio
      (protected)/dashboard/               # Tablero principal
      (protected)/pacientes/nuevo/         # Alta de paciente
      (protected)/pacientes/[id]/          # Ficha del paciente
      (protected)/alertas/                 # Alertas activas/historico
      (protected)/citas/                   # Proximas citas
      (protected)/estadisticas/            # Agregados de unidad/consultorio
      api/webhooks/whatsapp/               # Webhook entrante WhatsApp
      api/webhooks/whatsapp/status/        # Callback de estado de entrega
      api/jobs/tick/                       # Job invocado por Supabase Cron
      api/health/                          # Healthcheck
    actions/            # Server Actions: autenticacion y comandos clinicos
    components/         # Componentes derivados del diseno de Stitch
    features/           # patients/ prescriptions/ measurements/ appointments/ alerts/
    lib/
      supabase/         # client.ts, server.ts, admin.ts (server-only), proxy.ts
      auth/             # Sesion + membresia + consultorio validado
      queries/          # Lecturas paginadas, DTO
      domain/           # risk.ts, adherence.ts, scheduling.ts, validation.ts
      whatsapp/         # provider.ts (interfaz), twilio.ts, parser.ts
      jobs/             # materialize.ts, send.ts, expire.ts, process-webhooks.ts
    contracts/          # DTO/Zod y fixtures acordados entre el equipo
    types/               # database.types.ts (generado desde Supabase)
  supabase/
    migrations/          # Migraciones SQL (la primera: DDL base del esquema)
  scripts/                # Scripts de apoyo (p. ej. reloj/eventos de prueba para demo)
  tests/
    unit/ integration/ e2e/
  docs/                   # Documentacion viva del proyecto para el equipo
  .env.example            # Plantilla de variables de entorno (sin datos reales)
```

> El árbol anterior es el objetivo del plan: no todas sus rutas están implementadas. Actualmente operan login, selección de consultorio y dashboard de lectura. Las reglas compartidas viven en `domain-core/` y la app las consume mediante `src/lib/domain/dashboard.ts`; no se duplican en otro motor.

## 4. Reparto del equipo (3 integrantes)

| Integrante                                 | Responsabilidad                                                                                                                                                      | Entregable verificable                                                               |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **A** - Aplicación e integración de Stitch | `app/(auth)`, `app/(protected)`, componentes, formularios, consultas/DTO, SSR de login; CRUD de pacientes y citas.                                                   | Las 8 vistas funcionan con fixtures y luego con Supabase.                            |
| **B** - Persistencia y transporte          | Migración/RLS/seed/tipos, cliente administrativo, adaptador Twilio, firmas, persistencia de webhooks, `jobs/materialize.ts` y `jobs/send.ts`, Cron/Vault/deploy.     | Dos unidades aisladas; envío/recepción real de WhatsApp; callbacks deduplicados.     |
| **C** - Negocio e integración              | `domain/*`, parser, procesamiento de respuestas, `jobs/expire.ts`, RPC de dosis/correcciones/consentimiento/urgencia, adherencia/riesgo, alertas y pruebas de flujo. | Respuesta o silencio actualiza métricas/alerta; dosis versionada; corrección manual. |

Reglas de coordinación clave:

- A no espera a B: trabaja sobre fixtures con los contratos acordados.
- C prueba reglas/parser con objetos en memoria y reloj inyectable.
- B y C acuerdan la interfaz `WhatsAppProvider.send()` y la tabla de outbox en la primera hora.
- La migración base ya está aplicada. B y C agregan migraciones posteriores de datos/RLS y RPC, respectivamente, coordinando su orden y tipos.
- Cada persona revisa una prueba crítica de otra (A -> flujo bot, B -> autorización de acciones, C -> formularios y métricas).

## 5. Modelo de datos (resumen)

El esquema base versionado vive en `supabase/migrations/0001_kuni.sql` y contiene **20 tablas y 6 vistas**. Su aplicación previa está documentada en la bitácora B. No volver a aplicar la base sobre una BD inicializada; usar migraciones incrementales para RF28 y las RPC pendientes.

Convenciones: PK `uuid`, tiempos absolutos en `timestamptz` (UTC), fechas civiles en `date`, horarios de recurrencia en `time`, cantidades en `numeric`, estados restringidos con `check`. Todo dato clínico está delimitado por `unit_id` y aislado mediante RLS.

Tablas principales: `health_units`, `unit_memberships`, `doctors`, `consulting_rooms`, `patients`, `patient_diagnoses`, `consent_events`, `patient_messaging_state`, `medications`, `prescriptions`, `prescription_schedules`, `monitoring_plans`, `appointments`, `bot_interactions`, `medication_responses`, `measurements`, `alerts`, `risk_assessments`, `webhook_events`, `audit_log`.

## 6. Contratos de negocio (no rehacer código)

- **Programación de ocurrencias:** materializador crea ocurrencias de las próximas 24 h, corre cada minuto. Clave única: `tipo:ID_horario_o_cita:instante_UTC` (nunca solo paciente+fecha).
- **Correlación de mensajes:** cada mensaje clínico lleva una referencia corta única (ejemplo de formato: `SI A7F3`, `GLUCOSA B9K2 120`, `PRESION C6M4 120/80`).
- **No-respuestas:** solo cuentan solicitudes con `expects_response=true`, entregadas, vencidas y sin respuesta válida. Fallos técnicos y bloqueo por ventana/plantilla no cuentan.
- **Adherencia (cohorte de tomas concluidas, Y=sí, N=no, U=desconocido):**
  ```
  adherencia confirmada = 100 x Y / (Y + N)
  cobertura de respuesta = 100 x (Y + N) / (Y + N + U)
  ```
  Denominador cero -> "sin datos". Nunca promediar porcentajes individuales entre pacientes.
- **Riesgo:** función pura `evaluateRisk(...)`, basada en reglas explicables y versionadas (`rule_version`), no en un modelo predictivo. Precedencia: urgencia/límite crítico -> alto; fuera de objetivo o >=3 no-respuestas en 7 días -> medio; sin señales y con datos suficientes -> bajo; datos insuficientes -> "sin evaluar" (nunca inferir bajo riesgo por defecto).
- **Alertas:** una alerta activa por paciente/tipo/regla (se acumulan eventos, no se duplican). "Atendida" no borra evidencia ni cambia el riesgo automáticamente.
- **Ajuste de dosis:** transacción que cierra la versión vigente, crea la nueva y cancela solo las ocurrencias futuras no enviadas. Los mensajes ya entregados conservan su dosis original.

Contratos DTO/Zod a congelar en la primera hora: `PatientSummary`, `PatientDetail`, `CreatePatientInput`, `PrescriptionVersionInput`, `MeasurementInput`, `AppointmentInput`, `AlertResolutionInput`, `RiskResult`. Respuesta común: `{ data, error: { code, message, fields } | null }`.

Estados a usar tal cual del SQL: citas `scheduled/completed/missed/cancelled`; alertas `open/acknowledged/resolved/dismissed`; riesgo `low/medium/high/unknown`; recetas `draft/active/superseded/stopped/completed`.

## 7. Variables de entorno

Copiar `.env.example` a `.env.local` y completar las variables documentadas en `src/lib/env/client.ts` y `src/lib/env/server.ts`; `.env.local` es local y no se versiona. Resumen de lo esencial:

- URL y clave publicable de Supabase: pueden viajar al navegador (`NEXT_PUBLIC_*`).
- Clave secreta de Supabase, secreto del cron y credenciales del proveedor de WhatsApp: **solo servidor**, nunca como variable pública.
- Selector compatible `MESSAGE_PROVIDER`: `mock | twilio | meta | smsgate`. Si no se define, se sigue usando `WHATSAPP_PROVIDER` y nada cambia. `mock` no envía mensajes reales. La instalación y operación de SMS están en [la guía de SMSGate](docs/sms-gateway-android.md).
- Zona horaria por defecto `America/Mexico_City`, tiempo de espera de respuesta, tamaño de lote de jobs.

## 8. Alcance de la demo (ajustes respecto al planteamiento original)

- Botones nativos de WhatsApp: mejora posterior; el core usa menú textual y comandos con referencia (contrato de texto siempre disponible como respaldo).
- Riesgo actual: reglas explicables versionadas con suficiencia por plan/variable/contexto y valoración médica. Predicción futura RF29–RF30: integración opcional aún pendiente; no se muestra un segundo riesgo actual ni porcentajes inventados.
- Retención de 90 días: ventana de visualización/análisis, no eliminación automática de historia clínica.
- RF18 (OCR de mediciones) y RF19 (aviso al médico) son **extras**, apagados por defecto y no bloquean el MVP.

## 9. Estado del proyecto

El trabajo continúa con un [backlog único](docs/continuidad-unificada.md): entrega realizada, verificación y pendientes. La [auditoría previa](docs/auditoria-estado-actual.md) conserva los porcentajes históricos por integrante. Los resultados remotos se distinguen de la verificación local.

La [fase 1 de U08](docs/u08-alta-edicion-fase1.md) conecta el alta y la edición de expediente, diagnósticos y consentimiento. Requiere la migración 0008 después de 0006/0007; recetas y planes iniciales siguen pendientes.

- [x] Requerimientos y plan técnico definidos (documentos internos, no versionados).
- [x] Estructura de carpetas del repositorio.
- [x] Inicialización de la app Next.js (`create-next-app`) + dependencias del plan instaladas.
- [x] Esquema aplicado y tipos generados, según la bitácora B (no reejecutado durante esta integración).
- [x] Viabilidad del Sandbox validada desde Twilio Console, según bitácora B.
- [x] Login/logout y selección de consultorio conectados a Supabase SSR.
- [x] Dashboard de lectura conectado a consultas por unidad/consultorio y al dominio común.
- [x] Correcciones de riesgo, referencias, contratos, tendencias y cliente ML con regresiones.
- [x] Proveedor, firma, recepción de webhooks, callbacks y tick implementados; Cron documentado por B.
- [ ] Cierre del transporte: efecto clínico del inbound/BAJA, envío seguro ante cambios, recuperación y volumen.
- [x] Cinco RPC clínicas y adaptadores de acciones; ensayo completo de UI/cola pendiente.
- [ ] Alta/edición y citas con persistencia desde sus formularios.
- [x] Migraciones RF28/clase terapéutica, vector/adaptador ML y panel RF30 implementados.
- [ ] Endpoint predictivo alojado y procedencia/corte/vigencia verificados.
- [ ] Ciclo completo (alta -> WhatsApp -> alerta -> revisión médica) funcionando en demo.

La documentación de avance del equipo (decisiones, bitácora, notas de integración) vive en `docs/`.

## 10. Verificación y continuidad

Comando unificado: `rtk npm run verify` (ambas suites, ambos typechecks, lint y build). Los scripts de Next arrancan Node con `TZ=UTC` para la paridad SQL documentada; las horas clínicas siguen usando la zona de cada unidad. Se requiere Node >=22.12 para Vitest 5.

En un clon limpio instalar las dependencias de ambos paquetes en el mismo sistema operativo que ejecutará las pruebas:

```sh
rtk npm ci
rtk npm --prefix domain-core ci
```

```sh
rtk npm test
rtk npm run typecheck
rtk npm run lint
rtk npm run build
rtk npm --prefix domain-core test
rtk npm --prefix domain-core run typecheck
```

La suite raíz reúne dominio, contratos, autenticación, adaptadores/queries y presentación (408 pruebas). La suite independiente de `domain-core` incluye integración SQL con migraciones en PostgreSQL efímero PGlite (299 pruebas). Hay pruebas unitarias compartidas: no sumar ambos conteos. No envían WhatsApp ni aplican migraciones remotas. La bitácora B acredita ensayos alojados específicos; el ciclo completo sigue pendiente.

La [entrega U06](docs/u06-inbound-y-baja.md) añade respuestas clínicas y BAJA atómicas. Requiere aplicar `0006_inbound_commands.sql` después de las migraciones anteriores antes de operar el nuevo webhook/cron; la validación alojada está pendiente.

Consultar [plan de integración](docs/plan-integracion.md), [A](docs/documentacionA.md), [B](docs/documentacionB.md) y [C](docs/documentacionC.md) para conocer qué está implementado y qué entrega cada miembro a continuación.
