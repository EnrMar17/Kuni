# Plan de integración y continuidad en develop

## Alcance de esta entrega

Este documento versiona las decisiones funcionales de la revisión del plan original y el punto desde el cual continúa el equipo. Los originales internos (`kuni-plan-tecnico.md` y requerimientos) siguen excluidos por `.gitignore`; las instrucciones necesarias para continuar están aquí y en la documentación de cada integrante.

La revisión inicial solo modificó el Markdown. La entrega actual aplica correcciones sobre `develop`, sin crear commit, desplegar, ejecutar migraciones remotas ni enviar mensajes. La composición, paleta, tipografías y estilos globales existentes se conservan.

## Correcciones implementadas

| Área | Resultado de este commit preparado | Límite que permanece |
|---|---|---|
| Acceso | Login/logout Supabase SSR, membresía/unidad/médico activos, preferencia de consultorio validada, errores recuperables y cookies preservadas en redirecciones. Se retira el flujo fixture y sus credenciales. | Falta ensayo alojado con usuarios de dos unidades y roles. Las pruebas actuales simulan Supabase. |
| Contratos | Enums de SQL compartidos: `intersex`, `after_meal`, `whatsapp`; parser compatible con referencias reales de 8 caracteres. | Los nuevos formularios deben usar estos contratos y no enviar traducciones a SQL. |
| Riesgo | Versión de reglas actualizada; sin umbrales ni evidencia suficiente no se infiere bajo. Suficiencia por plan/variable/contexto, fechas válidas y preservación de urgencia/valoración médica. | La evaluación se calcula al leer; worker, persistencia histórica y recálculo transaccional siguen pendientes. |
| Expiración | Función pura alineada con tipos SQL, `delivered/read` y evidencia de entrega. Se separa reclamar envíos de vencer interacciones. Revocación no borra la historia de lo ya entregado. | Falta el job que llama la RPC, integra respuestas y revalida consentimiento antes de enviar. |
| Dashboard | Consulta SSR por unidad/consultorio, sin fixtures; adapta SQL a reglas y adherencia comunes. Búsqueda/orden/filtro de prioridad, selección coherente, series observadas, citas y estados de ausencia/error. | Alta/edición, ajuste de dosis, urgencia, resolución y vistas completas siguen por construir. |
| Métricas | Adherencia confirmada y cobertura por tomas Y/N/U, ceros y ausencias diferenciados, fallos técnicos excluidos; glucosa en ayuno y datos del paciente seleccionado. | Falta validar datos completos del piloto y medir latencia en entorno alojado. |
| Tendencias y cliente ML | Corregidos fixture de ventana, timestamps iguales y respuestas ML parciales. Probabilidad cero válida no equivale a ausencia. | No existe vector final ni endpoint conectado; el cliente sigue probado con mocks. |
| Verificación | Comandos raíz `test` y `typecheck`, configuración Vitest común y regresiones de dominio/auth/queries/presentación. | Pruebas de contrato con mocks no sustituyen RLS ejecutado ni WhatsApp real de extremo a extremo. |

Los controles clínicos que aún no tienen transacción están deshabilitados; no simulan haber guardado. El contacto manual mediante `wa.me` abre WhatsApp por acto del usuario y no manda contenido automáticamente.

## Documentación por integrante

- [A — aplicación, acceso y dashboard](documentacionA.md): avance, archivos, decisiones, pruebas y formularios/acciones pendientes.
- [B — persistencia y transporte](documentacionB.md): esquema, clientes, consultas, configuración y próximo circuito de WhatsApp. Conserva el historial operativo en [bitacora-canal-b.md](bitacora-canal-b.md).
- [C — dominio e integración](documentacionC.md): reglas, parser, adherencia, tendencias, cliente ML, correcciones y RPC/features pendientes.

## Próximos pasos y dependencias

| Orden | A | B | C | Criterio de cierre |
|---|---|---|---|---|
| 1. Captura clínica | Alta/ficha, consentimiento, receta/horarios, monitoreo y citas. | Datos sintéticos completos y tipos compatibles. | Contratos de comandos y validaciones comunes. | Paciente persistido con indicación programable y consentimiento auditable. |
| 2. Circuito WhatsApp | Mostrar entrega, respuesta, pendientes y errores reales. | Adaptador, firma, webhooks, materialización/envío, `/api/jobs/tick`, Cron. | Procesar parser, guardar mediciones/confirmaciones, expiración y recálculo. | Mensaje real vinculado → respuesta o timeout único → métricas/alerta. |
| 3. Revisión médica | Formularios de corrección, dosis, urgencia y resolución. | Revisar RLS, bloqueos y cola con cambios concurrentes. | `correctMeasurement`, `correctMedicationResponse`, `adjustPrescription`, `markUrgent`, `resolveAlert`. | Acción auditada y atómica, motivos/versiones conservados, pendientes invalidados sin cambiar mensajes entregados. |
| 4. Nuevos datos IA | Capturar complicaciones y fases, sin inferencia automática. | Migración incremental RF28 con RLS/auditoría/tipos. | Contrato interno y derivaciones, con fixtures. | Desconocido, ninguna complicación y códigos vigentes se distinguen; captura por médico. |
| 5. Predicción opcional | RF30 solo con resultado utilizable y procedencia. | Configuración ML solo servidor. | RF29 vector tipado, escala/ausencias/ventana; integrar endpoint del equipo IA. | Fallo o ausencia ML no afecta captura, riesgo actual, alertas ni acciones. |
| 6. Cierre de demo | Formularios y flujo completo en navegador. | RLS de dos unidades, entrega/firma/concurrencia y deploy. | Pruebas de escenarios y guion repetible. | Ensayo completo, tiempos medidos y limitaciones declaradas. |

OCR y avisos externos al médico siguen siendo extras. La IA predictiva no pospone el circuito principal de medicamentos, mediciones y revisión.

## Ampliación del plan original: RF28–RF30

Estos identificadores son extensiones de Kuni, no requisitos añadidos al enunciado original del reto. El adjunto de contexto posterior corrige las propuestas incompatibles del primer documento de cambios.

### RF28 — Complicaciones y fases capturadas por el médico

- B añade una migración posterior a `0001_kuni.sql`, sin reescribir la base aplicada. Tabla `patient_complications` con unidad/paciente, código, fecha nullable, revisión, vigencia/corrección y actor; FK compuesta, RLS y auditoría explícitas.
- El catálogo del prototipo es E110–E119. Conteo de códigos vigentes distintos E110–E118; E119 queda fuera y representa captura explícita de ninguna complicación. Un expediente sin revisión no se interpreta como E119. No duplicar conteos ni mantener E119 junto a otras complicaciones vigentes.
- Derivar `num_complicaciones_dm`, `tiene_complicacion_dm` y el flag de E110/E111/E112. “Grave” describe el criterio experimental del equipo IA; no provoca urgencia ni cambio de dosis automáticamente. No inferir un número de complicaciones individuales a partir de E117.
- Fase DM nullable: `estable_oral`, `ajuste_insulina`, `insulina_estable_hba1c`. Fase HAS nullable: `controlada`, `en_ajuste`. Solo acto médico; sin disparadores, fases por defecto ni cambios automáticos de cadencia.
- Auditar usuario Auth real y médico seleccionado como atribución declarada, conforme a la cuenta por unidad del MVP. Campos ausentes no bloquean el alta core ni se rellenan con ceros inventados.

### RF29 — Variables e integración con el modelo

- Reutilizar `computeAdherence()` y `trend.ts`; no mantener algoritmos distintos para tablero y modelo. Proponer adherencia confirmada `Y/(Y+N)` y confirmar con IA el nombre exacto de la feature y escala 0–100/0–1. La función devuelve varias métricas: el nombre de la función no cierra esa elección.
- Calcular desde expediente/histórico: edad y diagnósticos, promedios/tendencias, adherencia, complicaciones, fases y días desde reporte válido. Un envío, callback, mensaje de ayuda o BAJA no equivale a reporte clínico.
- Falta el diccionario completo citado de 17 entradas: nombres, unidades, categorías, imputación/nulos, referencia temporal, ventanas, redondeo y límites de winsorización. La migración de B permite avanzar; no resuelve esas dependencias externas.
- Promedio/tendencia con suficiencia explícita; tres lecturas sin intervalo temporal no son una tendencia estable. No transmitir pendiente cero por falta de datos como si fuera una observación válida.
- Cliente solo servidor, sin nombres/CURP/teléfonos ni acceso directo del equipo IA a Supabase. POST/Bearer actuales deben contrastarse con el endpoint real. URL ausente deshabilita inferencia, sin afectar el arranque clínico.
- Si se guarda predicción, conservar versión, fecha de cálculo, versión/corte de features y vigencia/TTL. Invalidar por correcciones y paso del tiempo; retirar porcentajes caducados del estado actual.

### RF30 — Predicción futura separada del riesgo actual

Contrato mínimo informado en el adjunto más reciente:

```json
{
  "probabilidad_empeoramiento_futuro": 0.0,
  "model_version": "prediccion_futura_v1_2026-09-08",
  "datos_suficientes": {
    "glucosa_ayuno": true,
    "glucosa_postprandial": false,
    "presion_arterial": true
  }
}
```

Es un ejemplo de contrato, no una respuesta obtenida del modelo. No incluye segundo riesgo actual ni alertas rojas del modelo. La brecha de monitoreo y la alerta naranja siguen sin confirmar y no forman parte de la implementación vigente.

`evaluateRisk()` conserva el riesgo actual y su precedencia médica. Mostrar probabilidad futura solo como estimación experimental, con suficiencia/versión/fecha. No inventar horizonte de siete días. La versión puede ser null en pruebas; para activar un modelo real se exige procedencia identificable. Política provisional de Kuni: suficiencia toda falsa oculta la predicción hasta cerrar elegibilidad con IA.

Un fallo HTTP, timeout, respuesta parcial o ausencia de endpoint no cambia riesgo, adherencia, alertas ni disponibilidad del tablero. La predicción no retrasa una llamada por cada paciente de la lista. La AUC y procedencia reportadas por el equipo no equivalen a validación prospectiva del piloto; calibración, evento objetivo y transferencia de adherencia quedan por evaluar antes de uso clínico real.

### Cadencia HAS

No adoptar “tres meses” como default automático del bot. La fuente y la finalidad están pendientes. Frecuencia orientativa de consulta, cita concreta, horario de medicamentos y plan de mediciones son datos diferentes; los últimos permanecen definidos por el médico. Tres meses calendario tampoco se convierten silenciosamente en 90 días.

## Verificación y preparación del commit

Ejecutar desde la raíz:

```sh
rtk npm test
rtk npm run typecheck
rtk npm run lint
rtk npm run build
rtk git diff --check
```

Las pruebas automatizadas actuales usan datos sintéticos/mocks; no envían mensajes, no aplican migraciones ni autentican usuarios reales. La comprobación local HTTP del login se registra al cerrar la integración. El plan no afirma que WhatsApp o las RPC pendientes funcionen por el hecho de aprobar build.

Resultado al cerrar esta entrega:

- **208 pruebas aprobadas en 17 archivos**, incluyendo 150 de dominio, 31 de acceso, 18 de adaptadores/consultas y 9 de presentación/render del dashboard.
- TypeScript, ESLint, build de producción y `git diff --check`: aprobados.
- Regresión HTTP contra el build local con la antigua cookie fixture: `/login` devuelve 200, `/consultorios` redirige a login, ese login devuelve 200 y `/dashboard` sigue protegido. Ya no existe el ciclo login/consultorios. El servidor temporal quedó detenido.
- Revisión independiente añadida: dos planes con límites diferentes conservan ambas señales; una lectura normal posterior de otro plan no oculta la lectura crítica. También se verificaron citas más allá de tres, reportes informativos, último reporte anterior a la interacción más reciente y metadatos de glucosa posprandial.
- No se probó login con credenciales remotas ni el ciclo completo de la aplicación contra Supabase/WhatsApp. Permanecen como criterios del siguiente tramo del plan.

El commit lo realiza el usuario. Revisar `git status` y el diff antes de agregar archivos; `package-lock.json` ya tenía cambios antes de esta intervención y se conserva. No se incorporan `.env.local`, credenciales, archivos de trabajo de asistentes ni los documentos internos ignorados.
