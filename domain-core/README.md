# Kuni — dominio de negocio (Persona C)

Funciones puras de riesgo, adherencia y parser de WhatsApp, listas para
copiarse tal cual dentro de la app Next.js una vez que A la escafolde
(las rutas ya coinciden con `src/lib/domain/`, `src/lib/whatsapp/` y
`src/contracts/` del plan técnico).

## Cómo correr las pruebas

Este paquete es independiente de Next.js a propósito, para poder
desarrollarlo y probarlo sin esperar al scaffold de A ni a que B tenga
Supabase/Twilio en vivo.

```sh
npm install
npm test          # corre las pruebas con vitest
npm run typecheck # tsc --noEmit
```

Si por algún motivo no tienes acceso a instalar `vitest` (por ejemplo, una
red restringida), `scripts/smoke-check.ts` corre las mismas aserciones
clave usando solo `node:assert` y `tsx` (sin dependencias extra):

```sh
npx tsx scripts/smoke-check.ts
```

## Qué hay aquí

- `src/contracts/dto.ts` — enums y DTOs compartidos con A y B (deben
  coincidir con `kuni-schema.sql`). Si cambian, avisar al equipo.
- `src/lib/domain/risk.ts` — `evaluateRisk()`: motor de riesgo con
  precedencia urgencia > crítico > fuera de objetivo / no-respuestas >
  bajo/desconocido, y respeto a la valoración inicial médica vigente.
- `src/lib/domain/adherence.ts` — `computeAdherence()` /
  `aggregateAdherence()`: fórmulas de adherencia confirmada, cobertura de
  respuesta y agregación correcta (suma numeradores, no promedia %).
- `src/lib/domain/validation.ts` — validación de plausibilidad de captura
  (glucosa/presión), separada de los umbrales clínicos de riesgo.
- `src/lib/whatsapp/parser.ts` — `parseIncomingMessage()`: interpreta
  `SI/NO [código]`, `GLUCOSA [código] valor [contexto]`,
  `PRESION [código] sistólica/diastólica`.

## Lo que falta (siguiente en la lista de persona-c-tareas.md)

- `jobs/expire.ts` (vencimiento de interacciones) — depende de que B tenga
  el esquema migrado en Supabase.
- Las 5 RPC transaccionales (`correctMeasurement`, `correctMedicationResponse`,
  `adjustPrescription`, `markUrgent`, `resolveAlert`) — igual, sobre tablas
  reales una vez migradas.
- Conectar `evaluateRisk`/`computeAdherence` a datos reales para que el
  dashboard de A deje de usar fixtures.

Ver `persona-c-tareas.md` en la raíz del repo para el detalle completo y el
orden sugerido.
