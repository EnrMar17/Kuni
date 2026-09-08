# Paquete de integración — Modelo predictivo Kuni
Documento único para compartir con el equipo. Aquí está todo lo necesario
para conectar el modelo a la app.

---

## 1. Archivos que necesitas correr (en orden)

| # | Archivo | Qué hace | ¿Cuándo se corre? |
|---|---|---|---|
| 1 | `pipeline_completo.py` | Entrena ambos modelos desde el dataset crudo | Una vez, o cada vez que se reentrene |
| 2 | `modelo_wrapper.py` | Clase necesaria para cargar el modelo calibrado | Se importa automáticamente, no se corre solo |
| 3 | `app.py` | Levanta el servicio HTTP que expone el modelo | Cada vez que se necesite el servicio corriendo |

**Comandos:**
```bash
pip install fastapi uvicorn pandas scikit-learn joblib

# 1) Entrenar (genera la carpeta ./salidas con los modelos)
python pipeline_completo.py --input tu_dataset.csv --out ./salidas

# 2) Levantar el servicio
uvicorn app:app --reload --port 8000
```

## 2. El contrato — qué le mandan y qué reciben

### Ustedes (Kuni) envían un POST a:
```
POST http://<url-del-servicio>:8000/predecir-riesgo
Content-Type: application/json
X-API-Key: <si se configuró ML_API_KEY>
```

### Cuerpo del request (17 campos, exactamente estos nombres):
```json
{
  "age_at_wx": 58,
  "diabetes_dx": 1,
  "hypertension_dx": 1,
  "comorbido_dm_has": 1,
  "fn_ta_systolic_mean": 148,
  "fn_ta_diastolic_mean": 94,
  "tendencia_sistolica": 2.3,
  "tendencia_diastolica": 0.8,
  "pa_empeorando": 1,
  "in_glucose_mean": 165,
  "tendencia_glucosa": 4.1,
  "glucosa_empeorando": 1,
  "adherencia_antidiabeticos": 0.35,
  "adherencia_antihipertensivos": 0.40,
  "num_complicaciones_dm": 0,
  "tiene_complicacion_dm": 0,
  "complicacion_grave_dm": 0,
  "datos_suficientes": {"glucosa_ayuno": true, "glucosa_postprandial": false, "presion_arterial": true}
}
```

### Respuesta (dos formas posibles):

**Caso normal:**
```json
{
  "data": {
    "probabilidad_descompensacion": 0.388,
    "nivel_predicho": "moderado",
    "model_version": "prediccion_futura_v4_2026-09-08",
    "datos_suficientes": {...}
  },
  "error": null
}
```

**Caso de "techo de riesgo" (paciente ya en el peor escenario clínico posible):**
```json
{
  "data": {
    "probabilidad_descompensacion": null,
    "nivel_predicho": "alto",
    "model_version": "prediccion_futura_v4_2026-09-08",
    "datos_suficientes": {...},
    "mensaje": "Riesgo máximo (presión arterial en nivel de crisis)..."
  },
  "error": null
}
```

## 3. Documentos de contexto (para leer, no para correr)

| Documento | Para quién | Qué cubre |
|---|---|---|
| `respuestas_alineacion_kuni.md` | Todo el equipo | Historial de decisiones, aclaración de arquitectura (evaluateRisk vs. este modelo), respuestas a las preguntas de integración |
| `documentacion_tecnica.md` | Todo el equipo | Visión general del proyecto, contrato de features detallado, discrepancias conocidas |
| `reporte_metricas.txt` | Quien prepare la presentación | Métricas oficiales para citar (AUC-ROC, recall, precisión) |

## 4. Lo más importante — decisión de arquitectura que ya deben conocer

Este modelo NO debe reemplazar ni tocar evaluateRisk(). El plan técnico (kuni-plan-tecnico.md, RF20) ya decidió que el tablero en vivo del hackatón se basa únicamente en reglas explicables -- no muestra un porcentaje de descompensación. Este modelo debe integrarse como un panel experimental separado y desactivable, no como parte del flujo de alertas real:

```
evaluateRisk()  ->  UNICA fuente de alertas y prioridad de pacientes (no se toca)
Este modelo     ->  Panel EXTRA, con toggle activable/desactivable,
                     etiquetado como "no validado clinicamente",
                     NUNCA dispara una alerta por si solo
```

## 5. Manejo de fallas (ya diseñado, deben implementarlo así)

Si el servicio no responde (timeout, error 500, no disponible): el dashboard debe seguir funcionando con evaluateRisk() sin mostrar el dato de IA. El sistema nunca debe depender de este servicio para operar. El cliente HTTP del lado de Kuni debe tener manejo de error que caiga de vuelta silenciosamente.

## 6. Checklist antes de la demo

- [ ] Servicio corriendo y accesible desde donde correrá la app (/health responde "status": "ok")
- [ ] ML_API_KEY configurada si el servicio queda expuesto públicamente (nunca dejarlo abierto en producción/demo pública)
- [ ] Cliente HTTP de Kuni (lib/ml/client.ts) probado con al menos un caso real y un caso de timeout simulado
- [ ] Toggle de activar/desactivar el panel probado en ambos estados
- [ ] Todo el equipo sabe que este modelo es un extra, no parte del core evaluado
