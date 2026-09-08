# Pendientes por integrante e integración del modelo predictivo

> **Lista histórica:** varias tareas de esta entrega ya se implementaron (RPC, RF28, clase terapéutica, Cron, adaptador y panel ML). Consultar [auditoría actual](auditoria-estado-actual.md) para pendientes, evidencia y responsables vigentes; este documento conserva el contexto de integración del modelo.

Continuación de [`auditoria-integracion.md`](auditoria-integracion.md). Este documento tiene dos partes:

1. **Qué le falta a cada quien**, separando lo que puede hacer solo de lo que depende de otro.
2. **Cómo se conecta el modelo predictivo** que entregó el equipo de IA (`KUNI5.zip`), qué ya quedó hecho y qué tiene que hacer C.

---

# Parte 1 — Pendientes por integrante

Cada bloque va en dos listas. **Independiente** = se puede empezar hoy sin esperar a nadie; es donde conviene poner las próximas horas. **Bloqueado** = necesita una entrega de otro integrante primero.

## A — Aplicación (Enrique)

### Independiente — empezar por aquí

| # | Pendiente | Por qué se puede hacer ya |
|---|---|---|
| A1 | **`error.tsx` en las seis rutas protegidas que no lo tienen** (`/pacientes`, `/pacientes/[id]`, `/pacientes/nuevo`, `/alertas`, `/citas`, `/estadisticas`) y un `global-error.tsx`. Hoy solo el dashboard tiene frontera de error. | `getDashboardData()` ya falla explícito al superar sus límites; solo falta la frontera que lo presente. |
| A2 | **Revisión en navegador**: accesibilidad, teclado, foco, errores por campo, móvil, skeletons, `prefers-reduced-motion`, CSV e impresión. Está implementado y nunca comprobado. | No depende de nadie. Es el pendiente #10 de A y el más barato de cerrar. |
| A3 | **Arreglar el entorno de pruebas** (`npm install` desde Windows — ver §4.1 de la auditoría) y correr la suite. | Es configuración local. |
| A4 | **Filtros avanzados del censo** por diagnóstico y pendientes, sobre el censo ya cargado. | Los datos ya llegan en el DTO. |
| A5 | **Formatear los archivos de líneas kilométricas** (`clinical-workspace.tsx` tiene una línea de 4.043 caracteres). | Sin esto, nadie puede revisar el código de A en un diff. |
| A6 | **Preparar la Server Action de `resolve_alert`** contra la firma ya publicada en `documentacionC.md`. Se puede escribir y probar con mock antes de que la RPC exista. | La firma SQL ya está congelada y documentada. |

### Bloqueado

| # | Pendiente | Espera a |
|---|---|---|
| A7 | Alta persistente de paciente + consentimiento como evento | Comando transaccional de captura (B/C) |
| A8 | Crear/editar/cancelar citas | Lo mismo |
| A9 | Conectar corrección, ajuste de dosis, urgencia y resolución de alerta | Que las RPC estén **aplicadas** (§2.1) y los tipos regenerados |
| A10 | Ficha completa con historial de versiones de receta | Consultas nuevas de B |
| A11 | Panel RF30 de predicción | Servicio del modelo desplegado (ver Parte 2) |

> **Lo más valioso que puede hacer A hoy:** A6 + A2. Con A6 el equipo cierra el patrón de mapeo `PT4xx → {data, error}` una sola vez y las otras cuatro acciones se vuelven copiar y pegar.

## B — Persistencia y transporte (tú)

### Independiente — empezar por aquí

| # | Pendiente | Nota |
|---|---|---|
| B1 | **Aplicar `0002` y `0003` al proyecto Supabase y regenerar los tipos.** | Es el desbloqueo #1 de todo el proyecto. Comando exacto abajo. Ya está verificado que aplican limpias. |
| B2 | **Programar el Cron** que llame a `/api/jobs/tick` con `Bearer CRON_SECRET`. | Sin esto la demo depende de un POST manual. |
| B3 | **Migración RF28** (`patient_complications`): unidad/paciente, código E110–E119, fecha nullable, vigencia, actor, FK compuesta, RLS y auditoría. | Desbloquea 3 de las 17 variables del modelo (ver Parte 2). |
| B4 | **Clasificar medicamentos por clase terapéutica** (`medications.therapeutic_class`: `antidiabetic` / `antihypertensive` / `other`). | Desbloquea las otras 2 variables del modelo, que son de las más importantes. |
| B5 | **Plantillas aprobadas de Twilio** para medicamento y medición. | Hoy solo se puede enviar dentro de la ventana de 24 h. |
| B6 | **Probar RLS real con dos unidades** y una cuenta sin membresía. | Es tu entregable verificable declarado en el README. |
| B7 | `appointment` y `nonresponse_summary` en el materializador. | Quedaron fuera a propósito. |
| B8 | Pendientes de configuración: CSP, apagar el proveedor SMS en el dashboard de Supabase. | Ya documentados. |

### Bloqueado

| # | Pendiente | Espera a |
|---|---|---|
| B9 | Persistir el efecto clínico del mensaje entrante | RPC de registro de C + §2.1 |
| B10 | Reconciliar `patient_adherence` con el dominio canónico | Acuerdo con C |

### Comando para B1

```bash
node node_modules/supabase/dist/supabase.js db push
```

No lo pude ejecutar yo: este entorno no tiene el token de acceso de Supabase (`supabase login`). Antes de correrlo:

- Verifica el estado con `supabase migration list --linked`; `0001` debe aparecer como aplicada.
- `0002` y `0003` usan `create function`, no `create or replace`: si un push parcial las dejó a medias, hay que limpiar antes en vez de reintentar.
- Después: `node node_modules/supabase/dist/supabase.js gen types typescript --linked > src/types/database.types.ts` y confirma que aparezcan las cinco funciones nuevas.

## C — Negocio (Rudy)

### Independiente — empezar por aquí

| # | Pendiente | Nota |
|---|---|---|
| C1 | **Levantar y hospedar el microservicio del modelo.** | Parte 2. Es lo único que separa a la app de tener predicción funcionando. |
| C2 | **Adaptador de `buildMlFeatureVector()` desde el DTO de Kuni.** | La función pura ya existe y está probada; falta el mapeo desde `getDashboardData()`. |
| C3 | **Procesamiento del mensaje entrante**: correlacionar por `reply_code` contra la interacción pendiente. | La lógica se puede escribir y probar en PGlite sin esperar a nadie. |
| C4 | **Paridad de `expire_due_interactions`** entre la función pura y la RPC ahora que ya está conectada al tick. | Se prueba en PGlite como las otras. |
| C5 | Recálculo por eventos externos (ingestión, expiración, cambios de plan). | |

### Bloqueado

| # | Pendiente | Espera a |
|---|---|---|
| C6 | Declarar las RPC como integradas | Que B las aplique (§2.1) |
| C7 | Complicaciones y fases reales en el vector | Migración RF28 de B |
| C8 | Adherencia por clase terapéutica | Clasificación de medicamentos de B |
| C9 | Reentrenar con adherencia conductual real | Datos del piloto (post-hackatón) |

---

# Parte 2 — El modelo predictivo

## 2.1 Qué entregó el equipo de IA

`KUNI5.zip` contiene un microservicio FastAPI listo para correr, con los modelos ya entrenados:

| Archivo | Rol |
|---|---|
| `app.py` | Servicio HTTP. Expone `POST /predecir-riesgo` y `GET /health` |
| `pipeline_completo.py` | Entrenamiento + `predecir_riesgo_ml()` + `FEATURE_COLS` |
| `modelo_wrapper.py` | `ModeloCalibrado` — necesario para deserializar el `.joblib` |
| `salidas/modelo_prediccion_futura.joblib` | **Modelo ya entrenado.** No hay que reentrenar nada |
| `salidas/modelo_riesgo_actual.joblib` | Modelo A — **no se usa**: el riesgo actual es de `evaluateRisk()` |

**Buena noticia: no hay que entrenar.** El `.joblib` viene entrenado, así que `pipeline_completo.py` solo se corre si se quiere reentrenar. Levantar el servicio son dos comandos.

**Regla de arquitectura que el propio equipo de IA impone** (§4 de su `README_ENDPOINT.md`), y que coincide con lo que Kuni ya había decidido:

```
evaluateRisk()  →  ÚNICA fuente de alertas y prioridad. No se toca.
Este modelo     →  Panel EXTRA, desactivable, "no validado clínicamente".
                    NUNCA dispara una alerta por sí solo.
```

## 2.2 El hallazgo grave: el cliente que teníamos no habría funcionado nunca

`domain-core/src/lib/ml/client.ts` se había escrito contra un **ejemplo de JSON** del documento de alineación, no contra el servicio. Comparando con `app.py`:

| | Cliente anterior | Servicio real |
|---|---|---|
| Envoltura | cuerpo plano | `{"data": {...}, "error": null}` |
| Campo de probabilidad | `probabilidad_empeoramiento_futuro` | `probabilidad_descompensacion` |
| Nivel | — | `nivel_predicho`: `bajo`/`moderado`/`alto` |
| Probabilidad nula | se trataba como "sin datos" | **caso legítimo de "techo de riesgo"** |
| Mensaje | — | `mensaje` explicando el techo |
| Autenticación | `Authorization: Bearer` | `X-API-Key` |

Con ese cliente, **el 100 % de las respuestas reales habría caído silenciosamente en "sin datos"** y el panel nunca habría mostrado nada. Peor: el "techo de riesgo" —cuando el paciente ya está en crisis y el servicio devuelve `probabilidad: null, nivel: "alto"`— se habría leído como ausencia de información, invirtiendo por completo su significado clínico.

**Ya está corregido** (§2.4).

## 2.3 Cómo levantar el servicio — 10 minutos

Esto lo hace **C**, en la máquina que vaya a quedar accesible durante la demo.

```bash
cd KUNI5
pip install fastapi uvicorn pandas scikit-learn joblib
uvicorn app:app --port 8000
```

Verificar que cargó el modelo (si dice `modelo_no_cargado`, falta la carpeta `salidas/`):

```bash
curl http://localhost:8000/health
```

Probar una predicción real:

```bash
curl -X POST http://localhost:8000/predecir-riesgo -H "Content-Type: application/json" -d '{"age_at_wx":58,"diabetes_dx":1,"hypertension_dx":1,"comorbido_dm_has":1,"fn_ta_systolic_mean":148,"fn_ta_diastolic_mean":94,"tendencia_sistolica":2.3,"tendencia_diastolica":0.8,"pa_empeorando":1,"in_glucose_mean":165,"tendencia_glucosa":4.1,"glucosa_empeorando":1,"adherencia_antidiabeticos":0.35,"adherencia_antihipertensivos":0.40,"num_complicaciones_dm":0,"tiene_complicacion_dm":0,"complicacion_grave_dm":0,"datos_suficientes":{"glucosa_ayuno":true,"glucosa_postprandial":false,"presion_arterial":true}}'
```

**Puntos donde esto se rompe en la demo, y cómo evitarlos:**

- El servicio corre en `localhost`. Si la app está desplegada, no lo alcanza. Exponerlo con `ngrok http 8000` (ya se usó ngrok para los webhooks) o desplegarlo en el mismo sitio que la app.
- `modelo_wrapper.py` **debe** estar junto a `app.py`: sin él `joblib.load` falla y el servicio arranca sin modelo, devolviendo 503.
- Si queda expuesto públicamente, definir `ML_API_KEY` antes de arrancar. Sin esa variable el endpoint queda abierto.
- Correrlo **sin** `--reload` en la demo: el autorecargador reinicia el proceso y con él se pierde el modelo en memoria durante unos segundos.

Luego, en `.env.local` de Kuni:

```
ML_ENDPOINT_URL=https://<host>/predecir-riesgo
ML_API_KEY=<la misma que en el servicio>
ML_TIMEOUT_MS=2000
```

## 2.4 Lo que ya dejé hecho

Todo verificado: **322 pruebas en la raíz**, **236 en `domain-core`** (incluidas las 63 de SQL), 48 comprobaciones de smoke, typecheck, ESLint y build de producción en verde.

### Cliente reescrito contra el servicio real — `domain-core/src/lib/ml/client.ts`

- Entiende el sobre `{data, error}` y también un cuerpo plano, por si el servicio queda detrás de un gateway.
- Manda la llave en `X-API-Key`.
- El resultado es una **unión discriminada** — `unavailable` / `available` / `ceiling` — precisamente para que nadie pueda confundir "no hay dato" con "riesgo máximo". Un objeto con nulos lo permitía; un tipo no.
- Un `error` no nulo no publica nada aunque venga con datos.
- Se mantiene la regla de oro: no lanza nunca, cae a `unavailable` ante red caída, timeout, 401, 503 o JSON inválido.
- Se conserva la política de Kuni de no publicar nada con las tres variables de suficiencia en `false`.
- **21 pruebas**, incluidas las tres del caso "techo de riesgo".

### Constructor del vector de 17 variables — `domain-core/src/lib/ml/features.ts` (nuevo)

Este era el "diccionario completo de 17 entradas" que `documentacionC.md` listaba como pendiente. Ahora existe, porque el paquete del equipo de IA lo define sin ambigüedad en `FEATURE_COLS`.

Función pura, reloj inyectable, **24 pruebas**. Reutiliza `trend.ts` (que ya implementaba la fórmula de regresión del equipo de IA) y `computeAdherence()`; no duplica ningún algoritmo.

Réplica exacta de `construir_features()`: umbral `pa_empeorando` en 1.0 mmHg/día, `glucosa_empeorando` en 2.0 mg/dL/día, ventana de 30 días, `complicacion_grave_dm` = E110/E111/E112, adherencia confirmada Y/(Y+N) en escala 0-1.

**Lo importante — no rellena huecos en silencio.** Cinco de las 17 variables dependen de datos que Kuni todavía no captura. Cada una se reporta en `gaps` con su motivo:

| Variable | Qué falta | De quién |
|---|---|---|
| `num_complicaciones_dm` | Migración RF28 | B3 |
| `tiene_complicacion_dm` | Migración RF28 | B3 |
| `complicacion_grave_dm` | Migración RF28 | B3 |
| `adherencia_antidiabeticos` | Clase terapéutica en `medications` | B4 |
| `adherencia_antihipertensivos` | Clase terapéutica en `medications` | B4 |

> **El cero es la trampa de este contrato.** El servicio exige `adherencia_* ∈ [0,1]` sin valor por defecto, y el entrenamiento rellenó los huecos con `.fillna(0)`. Pero 0 significa "no tomó ninguna dosis" — el peor valor clínico posible — no "no sabemos". Mandar 0 por ausencia empuja la predicción hacia arriba por algo que no ocurrió. El módulo reproduce ese 0 para ser fiel al entrenamiento, pero **siempre** deja constancia en `gaps`. Decidir si se publica una predicción con esas brechas es política de producto, y hay que decidirlo antes de la demo.
>
> Lo mismo con las complicaciones: un expediente **sin revisar** no es lo mismo que `E119` ("ninguna complicación"). El módulo los distingue.

### Configuración

`ML_ENDPOINT_URL`, `ML_API_KEY` y `ML_TIMEOUT_MS` en `serverEnv` y en `.env.example`. Todas solo de servidor: el navegador nunca habla con el modelo ni conoce la llave. Sin `ML_ENDPOINT_URL`, la inferencia queda deshabilitada y el tablero opera igual.

## 2.5 Lo que falta para verlo en pantalla — pasos para C

Estos tres pasos son los que **no** hice, en orden. El primero es de C; el tercero es de A.

### Paso 1 — Levantar y exponer el servicio (C)

Lo de §2.3. Hasta que `ML_ENDPOINT_URL` apunte a algo vivo, todo lo demás es teoría.

### Paso 2 — Adaptador desde el DTO de Kuni (C)

Escribir `src/lib/ml/patient-features.ts`, que traduce un paciente de `getDashboardData()` a `MlFeatureInput`:

```ts
buildMlFeatureVector({
  age: patient.age,
  diagnoses: patient.diagnoses,                    // condition_code, no etiquetas de UI
  fastingGlucose: mediciones kind='glucose' && context='fasting'  → {value, observedAt}
  postprandialGlucose: kind='glucose' && context='after_meal',
  systolic: kind='blood_pressure' → value = systolicMmHg,
  diastolic: kind='blood_pressure' → value = diastolicMmHg,
  antidiabeticAdherence: null,     // hasta B4
  antihypertensiveAdherence: null, // hasta B4
  complications: null,             // hasta B3
})
```

Cuidado con dos cosas:

- **Usar `condition_code` del DDL**, no las etiquetas en español de la interfaz. `buildMlFeatureVector` espera `diabetes_type_2`, no "Diabetes tipo 2".
- **Una llamada por paciente.** No hacer una petición por cada fila del censo al cargar el tablero: el propio equipo de IA lo advierte y el plan de integración también. Pedir la predicción solo del paciente seleccionado, o en un lote explícito bajo demanda.

Después, una función de servidor que llame a `requestMlPrediction(vector, { endpointUrl: serverEnv.ML_ENDPOINT_URL ?? null, apiKey: serverEnv.ML_API_KEY, timeoutMs: serverEnv.ML_TIMEOUT_MS })`. El cliente ya nunca lanza, así que no necesita `try/catch` alrededor.

### Paso 3 — Panel RF30 en la ficha (A)

Un panel **separado y desactivable**, nunca mezclado con la prioridad de `evaluateRisk()`:

| `status` | Qué mostrar |
|---|---|
| `unavailable` | **Nada.** No ocultar el panel con un mensaje de error ni poner 0 % |
| `available` | Porcentaje + `nivel_predicho` + versión del modelo + qué variables fueron suficientes |
| `ceiling` | El `message` del servicio y `nivel: alto`. **Nunca** "sin datos" ni 0 % |

Etiquetas obligatorias: "estimación experimental", "no validada clínicamente", versión del modelo y fecha de corte. Si `gaps` no está vacío, decir con qué datos faltantes se calculó.

## 2.6 Cosas del paquete del modelo que hay que resolver con ellos

No bloquean la integración, pero conviene tenerlas dichas antes de que un jurado pregunte:

1. **Su propia documentación se contradice.** `documentacion_tecnica.md` dice "Random Forest, AUC-ROC 0.887" y "no existe endpoint HTTP"; `reporte_metricas.txt` dice AUC-ROC **0.814** y `app.py` carga un `GradientBoosting` + calibración isotónica. La cifra a citar es **0.814**, que es la del reporte que acompaña al modelo entregado. `documentacion_tecnica.md` quedó desactualizado.
2. **La precisión del Modelo B es 0.33** con recall 0.68. De cada 3 pacientes que marca como "va a descompensar", 2 no lo hacen. Es un tamiz para priorizar seguimiento, no un diagnóstico — y así hay que presentarlo.
3. **La adherencia del entrenamiento no es la de Kuni.** Ellos usaron un proxy administrativo (recetas surtidas / consultas); Kuni mide confirmaciones del paciente por WhatsApp. Ellos mismos lo marcan como discrepancia de prioridad alta y aceptan que se alimente la de Kuni declarando la limitación. Es la segunda variable más importante del modelo, así que la limitación es real.
4. **Los límites de winsorización siguen sin número.** `trend.ts` usa un rango amplio por defecto y `buildMlFeatureVector` acepta `maxAbsSlope` para cuando lo confirmen.
5. **`estado_tratamiento_dm/has` y `dias_desde_ultimo_reporte`** aparecen en su tabla de contrato como "nuevos", pero **no están en `FEATURE_COLS`** ni en el modelo Pydantic del servicio. El servicio de hoy no los recibe. No construirlos hasta que confirmen si entran en una versión posterior.
6. **Sin validación prospectiva.** Todo el desempeño es retrospectivo sobre datos históricos del IMSS. Declararlo.

---

## Verificación de esta entrega

| Comprobación | Resultado |
|---|---|
| `tsc --noEmit` (raíz) | Aprobado |
| `eslint .` | Aprobado |
| Suite raíz | **322 pruebas en 31 archivos** |
| Suite `domain-core` | **236 pruebas en 11 archivos**, incluidas las 63 de integración SQL |
| `smoke-check.ts` | 48 comprobaciones |
| `next build` | Aprobado |

Las tres migraciones (`0001`, `0002`, `0003`) se aplican limpias y en orden sobre un PostgreSQL efímero (PGlite) y los 63 tests de las RPC pasan **con el renombre de `systolicMmHg` ya aplicado**. Eso es la mejor evidencia disponible de que el `db push` de B1 va a funcionar, sin haber tocado la base remota.

No se aplicaron migraciones remotas, no se envió ningún WhatsApp, no se contactó el modelo y no se leyeron credenciales.
