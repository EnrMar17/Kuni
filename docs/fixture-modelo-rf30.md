# Fixture clínico para RF29/RF30

El script `scripts/seed-ml-demo.ts` crea un expediente completamente ficticio y reutilizable para probar el vector clínico y el panel de predicción. No es una migración y no sustituye al servicio del modelo.

## Preparación

La unidad, el médico y el consultorio demo deben existir. Si todavía no existen:

```powershell
npx tsx scripts/seed-health-unit.ts
npx tsx scripts/seed-doctor-room.ts
```

Después ejecuta:

```powershell
npx tsx scripts/seed-ml-demo.ts
```

El script usa `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SECRET_KEY` desde `.env.local`. Es idempotente: conserva el mismo paciente y refresca las observaciones para mantenerlas dentro de la ventana móvil de 30 días.

## Cobertura

- Edad, diabetes tipo 2, hipertensión y comorbilidad.
- Catorce glucosas en ayuno y catorce presiones arteriales deterministas con deterioro gradual.
- Tres glucosas postprandiales para completar las tres señales de suficiencia del panel.
- Prescripciones activas y medicamentos clasificados como `antidiabetic` y `antihypertensive`.
- Veinte respuestas por tratamiento: adherencia confirmada de 35% y 40%, respectivamente.
- Revisión explícita de complicaciones con `E119`: revisado, sin hallazgos.
- Consentimiento ficticio para que el expediente sea coherente con el circuito de mensajería demo.

Los valores no usan `random()`. Por ello, una ejecución repetida produce el mismo vector clínico aunque las fechas se desplacen para seguir siendo recientes.

## Mostrar la predicción

El fixture solo prepara la entrada. Para mostrar la probabilidad, el servidor de Next necesita `ML_ENDPOINT_URL`, `ML_API_KEY` y un servicio ML disponible. Tras cambiar esas variables hay que reiniciar `next dev`.

El paciente aparece como **Elena Martínez Soto (Paciente ficticia RF30)** en el consultorio que el script informa al terminar.
