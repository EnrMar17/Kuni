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
docs/documentacionC.md
```

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

## Verificación mínima antes de reportar terminado

Sigue el mismo estándar que ya se usó en sesiones anteriores (verlo en
`documentacionC.md`, sección "Verificación realizada"):

```
npm --prefix domain-core test
npm --prefix domain-core run typecheck
npx --no-install eslint domain-core src/contracts/clinical.ts
node --import tsx domain-core/scripts/smoke-check.ts
```

Si alguno de estos comandos no aplica porque las RPC viven en SQL puro
(no en `domain-core`), explica qué verificación equivalente hiciste
(revisión manual del SQL, pruebas contra un Supabase local, etc.) — no
dejes esa sección vacía.

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
