# Prompt para Astra — Persona C: RPC clínicas transaccionales

Copia y pega esto directo como instrucción para Astra. Está escrito para
que pueda trabajar sin bloquear ni esperar a A o B.

---

## Contexto (léelo antes de escribir código)

Eres parte del equipo del hackatón **Kuni** (Innovation Fest 2026):
monitoreo remoto de pacientes crónicos (diabetes/hipertensión) para
SSM/IMSS-Bienestar Michoacán. El equipo tiene tres roles:

- **Persona A** — app/dashboard, integración de Stitch, formularios.
- **Persona B** — esquema de base de datos, RLS, transporte (Twilio),
  jobs de materialización/envío.
- **Persona C** — dominio de negocio: reglas de riesgo, adherencia,
  parser de WhatsApp, vencimientos, comandos clínicos transaccionales.
  **Esta tarea es de Persona C.**

Antes de escribir una sola línea, lee `docs/documentacionC.md` completo
— es la fuente de verdad del estado actual del código (qué se hizo, qué
decisiones se tomaron y por qué, qué falta). No asumas nada que
contradiga ese documento. Si algo de este prompt choca con lo que dice
`documentacionC.md`, gana `documentacionC.md` y avisas en tu propia
documentación de esta sesión por qué.

Archivos relevantes que ya existen y **no debes rehacer desde cero**:

```
domain-core/src/contracts/dto.ts
domain-core/src/lib/domain/risk.ts, adherence.ts, trend.ts, time.ts
domain-core/src/lib/whatsapp/parser.ts
domain-core/src/lib/jobs/expire.ts
domain-core/src/lib/ml/client.ts
domain-core/tests/unit/
domain-core/scripts/smoke-check.ts
src/contracts/clinical.ts
src/lib/domain/dashboard.ts
supabase/migrations/0001_kuni.sql   ← LÉELA COMPLETA antes de escribir SQL nuevo
docs/documentacionC.md
```

**Verifica el estado real antes de reportar nada como "hecho".** En una
revisión anterior alguien reportó las 5 RPC como "ya implementadas y
probadas localmente" y NO era cierto — no existía ni una sola migración
nueva más allá de `0001_kuni.sql`, ni pruebas para ninguna RPC. Antes de
escribir tu propia entrada en `documentacionC.md`, confirma con
`git status`/`git diff` y con el árbol de archivos real qué existe de
verdad, no lo que "debería" existir según una sesión de chat anterior.

---

## Tarea de esta sesión: las 5 RPC clínicas transaccionales

Este es el punto 1 de "Qué falta de C" en `documentacionC.md`, y es el
trabajo más grande que sigue sin empezar. Es autocontenido: el esquema
base ya está migrado por B, así que no necesitas coordinarte con A ni B
para arrancar.

Implementa estos 5 comandos como funciones SQL `SECURITY DEFINER`
(migraciones nuevas, numeradas después de la migración base de B — no
toques la migración base):

| Comando | Reglas clave |
|---|---|
| `correctMeasurement` | Motivo obligatorio; control de concurrencia (`version`/`updated_at`, rechazar edición concurrente con conflicto explícito); auditoría; recalcular derivados (riesgo/adherencia afectados); revisar alertas asociadas a esa medición. |
| `correctMedicationResponse` | Igual patrón que arriba, pero vinculado a la toma programada original (`schedule_id` + ocurrencia), no solo al nombre del medicamento — evita corregir la toma equivocada si hay ambigüedad. |
| `adjustPrescription` | Transacción completa: bloquear receta vigente → cerrar versión actual (`status: superseded`) → insertar versión y horarios nuevos → cancelar SOLO las interacciones futuras **no enviadas todavía**. Ajuste inmediato (el MVP no soporta cambios de dosis diferidos). Los mensajes ya entregados conservan su dosis original — nunca se reescribe historial. |
| `markUrgent` | Registra marca urgente + motivo + alerta + responsable (RF27, "Citar a Urgencias"). Es una acción local explícita — no implica reserva hospitalaria ni traslado real. |
| `resolveAlert` | Estados del catálogo exacto: `open/acknowledged/resolved/dismissed`. Resolución con motivo, fecha y usuario. Deduplicar por paciente+tipo+evento/regla — no crear una alerta nueva si ya hay una activa equivalente. |

### Patrón obligatorio para las 5

Todas deben ser `SECURITY DEFINER` con `search_path` fijo, y validar
**dentro** de la función: `auth.uid()` real, membresía del actor a la
unidad, y que todos los objetos referenciados (paciente, receta, alerta,
etc.) pertenezcan a esa misma unidad. Esto es lo que hace que el trigger
de auditoría capture al médico real y no a un actor de sistema genérico
— es no negociable, no lo simplifiques "para ahorrar tiempo".

---

## Infraestructura que B YA construyó — reutilízala, no la reinventes

Revisé `supabase/migrations/0001_kuni.sql` línea por línea. Hay más
piezas ya resueltas de lo que parece — úsalas tal cual:

- **`private.can_read_unit(target_unit uuid)` / `private.can_write_unit(target_unit uuid)`**
  — funciones `SECURITY DEFINER` ya existentes que validan membresía vía
  `auth.uid()`. Llámalas dentro de cada RPC nueva en vez de reescribir el
  chequeo de membresía a mano.
- **Trigger `private.audit_clinical_change()`** — ya está aplicado
  automáticamente (vía loop de `execute format(...)`) sobre las tablas
  clínicas, incluyendo `measurements`, `medication_responses`,
  `prescriptions`, `alerts` y `risk_assessments`. Tu RPC NO necesita
  insertar manualmente en `audit_log` — el trigger lo hace solo con
  cualquier `insert/update/delete` sobre esas tablas.
- **Trigger `private.validate_clinical_record()`** — ya asigna
  `attributed_doctor_id = auth.uid()` automáticamente cuando viene nulo.
  No lo asignes tú a mano salvo que necesites sobreescribirlo
  explícitamente.
- **`prescriptions` ya tiene el patrón de versión completo**: columna
  `version integer` con `check (version > 0)`, `supersedes_id`, un índice
  único que garantiza una sola versión activa por serie
  (`prescription_one_active_version_idx`), y el trigger
  `private.preserve_prescription_version()` que exige `version = version
  anterior + 1` y que las versiones activadas no se reescriban. Gran
  parte de lo que pedía `adjustPrescription` (cerrar versión vigente,
  insertar la nueva) ya está garantizado por el esquema — tu función solo
  necesita insertar la fila nueva correctamente y cancelar las
  interacciones futuras no enviadas, no reimplementar el versionado.
- **Control de concurrencia**: `measurements`, `medication_responses`,
  `prescriptions` y `alerts` ya tienen columna `updated_at`. Úsala como
  base del optimistic locking (recibe el `updated_at` esperado como
  parámetro de la RPC, compáralo contra el real, y devuelve un error de
  conflicto explícito si no coincide — no hay columna `version` genérica
  fuera de `prescriptions`, así que no la inventes para las otras tablas).
- **RLS ya deja escribir directo** (`insert`/`update`) a `authenticated`
  en las tablas clínicas generales, gateado por unidad vía
  `private.can_write_unit()`. `alerts` tiene una policy más angosta
  (`alerts_manage`) que solo permite tocar
  `status/resolution_note/resolved_at/attributed_doctor_id`.

### Decisión de seguridad que debes marcar como pendiente de alinear con B (no la tomes tú solo)

Ahora mismo, como RLS ya permite `insert`/`update` directo a
`authenticated` en `measurements`, `prescriptions`, etc., un cliente
podría escribir sin pasar por tus RPC y sin cumplir tus reglas de
negocio (motivo obligatorio, concurrencia, recálculo). Si quieres que las
5 RPC sean el ÚNICO camino de escritura para estas acciones, hace falta
un `revoke insert, update on public.<tabla> from authenticated` adicional
en tu migración nueva — pero es una decisión de arquitectura que afecta a
B (y a cualquier otro código que hoy escriba directo), así que
**documéntala como pregunta abierta en tu entrada de `documentacionC.md`
en vez de decidirla unilateralmente.**

---

## Restricciones — qué NO tocar ni inventar

- No toques nada del scope de A (UI, Stitch, formularios) ni de B
  (migración base, adaptador de Twilio, jobs de materialización/tick).
- No inventes columnas o tablas nuevas sin dejarlas documentadas
  explícitamente como pendiente en tu sesión de `documentacionC.md` — si
  necesitas algo que el esquema no tiene, dilo, no lo agregues por tu
  cuenta como si ya existiera.
- No dupliques lógica de negocio que ya vive en `risk.ts`/`adherence.ts`
  dentro de SQL de forma inconsistente — si una RPC necesita recalcular
  riesgo/adherencia, usa el mismo criterio que esas funciones puras ya
  establecen (o llama al mismo camino que usa el resto del sistema).
- Respeta los contratos ya congelados en `contracts/dto.ts` y
  `contracts/clinical.ts` — si una RPC necesita una forma de dato que no
  existe ahí, propénla, no la inventes silenciosamente.
- No ejecutes estas RPC contra una base remota real salvo que confirmes
  que tienes un entorno Supabase local/de prueba disponible — si solo
  pudiste probarlas de forma simulada o con SQL revisado manualmente, dilo
  explícitamente en la verificación, como ya se ha hecho en sesiones
  anteriores de `documentacionC.md`.

---

## Entregable adicional: wrapper en Server Actions

Las RPC solas no sirven de nada a A si nadie las llama desde la app. Crea
en `src/actions/` (hoy solo existe `auth.ts`) una función por comando que
llame la RPC vía el cliente de Supabase y traduzca el resultado al
contrato `ActionResult<T>` que ya define `src/contracts/clinical.ts`
(mismo patrón `{ data, error: null } | { data: null, error: ActionError }`
que ya usa el resto de la app). Esto es lo que A necesita para conectar
los botones de corrección/ajuste/urgencia/resolución desde la ficha del
paciente.

---

## Entorno necesario para probarlas de verdad

Las pruebas actuales de `domain-core` corren contra funciones puras en
memoria — no contra Postgres real. Para las RPC sí necesitas un Postgres
real:

- Supabase CLI corriendo local (`supabase start`, Docker) para aplicar
  `0001_kuni.sql` + tu migración nueva y probar las RPC de verdad.
- Un usuario de prueba real en `auth.users` con una fila en
  `unit_memberships` activa, para poder probar el flujo completo de
  `auth.uid()` + `private.can_write_unit()` de principio a fin — sin esto
  no puedes probar la atribución real al médico ni el trigger de
  auditoría.
- Si no tienes ese entorno disponible, dilo explícitamente — no reportes
  "probado" algo que solo revisaste leyendo el SQL.

## Verificación mínima antes de reportar terminado

Sigue el mismo estándar que ya se usó en sesiones anteriores (verlo en
`documentacionC.md`, sección "Verificación realizada"):

```
npm --prefix domain-core test
npm --prefix domain-core run typecheck
npx --no-install eslint domain-core src/contracts/clinical.ts
node --import tsx domain-core/scripts/smoke-check.ts
```

Para las RPC en sí (SQL puro, fuera de `domain-core`), la verificación
mínima real es: aplicar la migración contra el Supabase local sin errores,
y ejecutar cada RPC al menos una vez contra datos de prueba confirmando
el camino feliz Y al menos un camino de error (motivo faltante, conflicto
de concurrencia, actor sin membresía). Si solo pudiste revisar el SQL
manualmente sin ejecutarlo contra Postgres real, dilo explícitamente — no
lo reportes como "probado".

---

## Entregable obligatorio: actualizar `docs/documentacionC.md`

Agrega una sección nueva siguiendo el MISMO formato que ya tiene el
documento (resumen del avance, qué se hizo, archivos trabajados,
decisiones que conviene conocer, verificación realizada, qué falta).
**No reemplaces el contenido existente** — se agrega, no se sobreescribe.
Sé tan preciso y honesto ahí como lo fueron las entradas anteriores:
si algo quedó simulado, sin probar contra base real, o con una decisión
provisional, dilo explícitamente — ese documento es lo que usa el resto
del equipo (y quien continúe después) para saber en qué estado está el
trabajo de verdad, no una versión optimista de él.

---

## Tarea secundaria (solo si terminas la principal con tiempo de sobra)

Punto 7 de "Qué falta de C": definir la vigencia/caducidad de las
predicciones del modelo de IA — cuándo una predicción guardada deja de
ser válida (por paso del tiempo, o porque se editó una medición/receta
que la invalida), y cómo se aísla por paciente/unidad. Esto es trabajo de
**especificación** (puede quedar como tipos/contratos y una nota de
diseño), no necesita conectarse al modelo real todavía — el endpoint del
equipo de IA sigue sin existir.
