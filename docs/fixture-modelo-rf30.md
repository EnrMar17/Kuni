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
- Noventa días de historia: 45 glucosas en ayuno y 45 presiones arteriales, una observación cada dos días.
- Trece glucosas postprandiales distribuidas durante los 90 días para completar las tres señales de suficiencia.
- Prescripciones activas y medicamentos clasificados como `antidiabetic` y `antihypertensive`.
- Noventa respuestas por tratamiento. La adherencia ronda 70% en los dos primeros meses y cae aproximadamente a 35%/41% en los últimos 30 días.
- Revisión explícita de complicaciones con `E119`: revisado, sin hallazgos.
- Consentimiento ficticio para que el expediente sea coherente con el circuito de mensajería demo.

Los valores no usan `random()`. Por ello, una ejecución repetida produce el mismo vector clínico aunque las fechas se desplacen para seguir siendo recientes. El historial completo se muestra en la gráfica de 90 días, pero las medias, pendientes y adherencia enviadas a RF30 se calculan exclusivamente sobre la ventana reciente de 30 días.

## Mostrar la predicción

El fixture solo prepara la entrada. Para mostrar la probabilidad, el servidor de Next necesita `ML_ENDPOINT_URL`, `ML_API_KEY` y un servicio ML disponible. Tras cambiar esas variables hay que reiniciar `next dev`.

El paciente aparece como **Elena Martínez Soto (Paciente ficticia RF30)** en el consultorio que el script informa al terminar.
