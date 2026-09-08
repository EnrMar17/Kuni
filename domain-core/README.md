# Kuni — dominio de negocio (Persona C)

Funciones puras compartidas de riesgo, adherencia, parser de WhatsApp,
vencimientos, tendencias y cliente predictivo. El adaptador de lectura de
la aplicación en `src/lib/domain/dashboard.ts` importa riesgo/adherencia
desde este paquete; no mantener copias de los mismos algoritmos en Next.js.

## Cómo correr las pruebas

El dominio no necesita Supabase/Twilio en vivo. Ejecutar desde el repositorio
con sus dependencias ya instaladas: las pruebas de contrato también comparan
los esquemas Zod de la aplicación con la migración SQL.

```sh
rtk npm --prefix domain-core test
rtk npm --prefix domain-core run typecheck
```

El script complementario ejecuta 47 comprobaciones básicas usando
`node:assert` y `tsx` instalados en el repositorio:

```sh
rtk proxy node --import tsx domain-core/scripts/smoke-check.ts
```

## Qué hay aquí

- `src/contracts/dto.ts` — enums y DTOs compartidos con A y B (deben
  coincidir con `kuni-schema.sql`). Si cambian, avisar al equipo.
- `src/lib/domain/risk.ts` — `evaluateRisk()`: motor de riesgo con
  precedencia urgencia > crítico > fuera de objetivo / no-respuestas >
  bajo/desconocido, y respeto a la valoración inicial médica vigente.
  Inferir bajo requiere `monitoringRequirements` explícitos por variable/contexto
  y mediciones recientes con límites objetivo; una confirmación de toma no los sustituye.
- `src/lib/domain/adherence.ts` — `computeAdherence()` /
  `aggregateAdherence()`: fórmulas de adherencia confirmada, cobertura de
  respuesta y agregación correcta (suma numeradores, no promedia %).
- `src/lib/domain/validation.ts` — validación de plausibilidad de captura
  (glucosa/presión), separada de los umbrales clínicos de riesgo.
- `src/lib/whatsapp/parser.ts` — `parseIncomingMessage()`: interpreta
  `SI/NO [código]`, `GLUCOSA [código] valor [contexto]`,
  `PRESION [código] sistólica/diastólica`.
- `src/lib/jobs/expire.ts` — criterios puros acordes a la RPC SQL de expiración;
  distingue reclamar envíos de vencer interacciones y conserva historial tras BAJA.
- `src/lib/domain/trend.ts`, `time.ts` — ventanas, suficiencia temporal e instantes válidos.
- `src/lib/ml/client.ts` — contrato de salida experimental, timeout y fallback vacío.

## Lo que falta

- Conectar parser/vencimientos con el worker, callbacks y persistencia transaccional.
- Las 5 RPC transaccionales (`correctMeasurement`, `correctMedicationResponse`,
  `adjustPrescription`, `markUrgent`, `resolveAlert`) — igual, sobre tablas
  reales una vez migradas.
- Persistir evaluaciones/recalcular después de comandos clínicos; el adaptador
  de lectura por sí solo no implementa ese circuito.
- Vector ML tipado, diccionario de 17 features, endpoint real, elegibilidad y caducidad.

Ver `docs/documentacionC.md` y `kuni-plan-tecnico.md` para el avance y los pendientes.
