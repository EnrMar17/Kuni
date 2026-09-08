"""
MICROSERVICIO DE PREDICCIÓN — Modelo B (Kuni)
=========================================================
Expone predecir_riesgo_ml() como un endpoint HTTP para que el equipo de
la app (Next.js/TypeScript) le haga fetch, sin necesidad de correr Python
directamente.

CÓMO CORRERLO LOCALMENTE:
    pip install fastapi uvicorn pandas scikit-learn joblib
    uvicorn app:app --reload --port 8000

CÓMO PROBARLO (con el servidor corriendo):
    curl -X POST http://localhost:8000/predecir-riesgo \
        -H "Content-Type: application/json" \
        -d '{...}'   (ver ejemplo completo en README_ENDPOINT.md)

VARIABLES DE ENTORNO:
    ML_API_KEY : si se define, el endpoint exige el header
                 "X-API-Key: <valor>" en cada request. Si no se define,
                 el endpoint queda abierto (solo para desarrollo local).
"""
import os
import joblib
from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel, Field
from typing import Optional, Dict

from pipeline_completo import predecir_riesgo_ml, FEATURE_COLS
from modelo_wrapper import ModeloCalibrado  # necesario para deserializar el modelo

MODEL_VERSION = "prediccion_futura_v4_2026-09-08"
API_KEY = os.environ.get("ML_API_KEY")  # None si no está configurada

app = FastAPI(
    title="Kuni — Servicio de Predicción (Modelo B)",
    description="Predice la probabilidad de descompensación futura de un paciente.",
    version=MODEL_VERSION,
)

# --- Carga del modelo UNA SOLA VEZ al iniciar el servicio (no en cada request) ---
try:
    modelo_b = joblib.load("./salidas/modelo_prediccion_futura.joblib")
except FileNotFoundError:
    modelo_b = None
    print("⚠️  ADVERTENCIA: no se encontró el modelo entrenado en ./salidas/. "
          "Corre pipeline_completo.py primero.")


# =========================================================
# CONTRATO DE ENTRADA (debe coincidir EXACTO con FEATURE_COLS)
# =========================================================
class VectorPaciente(BaseModel):
    age_at_wx: int
    diabetes_dx: int = Field(..., ge=0, le=1)
    hypertension_dx: int = Field(..., ge=0, le=1)
    comorbido_dm_has: int = Field(..., ge=0, le=1)
    fn_ta_systolic_mean: Optional[float] = None
    fn_ta_diastolic_mean: Optional[float] = None
    tendencia_sistolica: float = 0.0
    tendencia_diastolica: float = 0.0
    pa_empeorando: int = Field(0, ge=0, le=1)
    in_glucose_mean: Optional[float] = None
    tendencia_glucosa: float = 0.0
    glucosa_empeorando: int = Field(0, ge=0, le=1)
    adherencia_antidiabeticos: float = Field(..., ge=0, le=1)
    adherencia_antihipertensivos: float = Field(..., ge=0, le=1)
    num_complicaciones_dm: int = 0
    tiene_complicacion_dm: int = Field(0, ge=0, le=1)
    complicacion_grave_dm: int = Field(0, ge=0, le=1)
    datos_suficientes: Optional[Dict[str, bool]] = None


# =========================================================
# ENDPOINT PRINCIPAL
# =========================================================
@app.post("/predecir-riesgo")
def predecir_riesgo(paciente: VectorPaciente, x_api_key: Optional[str] = Header(None)):
    if API_KEY and x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail={"code": "UNAUTHENTICATED", "message": "API key inválida o ausente"})

    if modelo_b is None:
        raise HTTPException(status_code=503, detail={"code": "PROVIDER_UNAVAILABLE", "message": "Modelo no cargado"})

    datos = paciente.model_dump()
    datos_suficientes = datos.pop('datos_suficientes', None)

    try:
        resultado = predecir_riesgo_ml(
            datos, modelo_b,
            model_version=MODEL_VERSION,
            datos_suficientes=datos_suficientes,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail={"code": "VALIDATION", "message": str(e)})

    return {"data": resultado, "error": None}


# =========================================================
# HEALTH CHECK — para que Kuni verifique disponibilidad
# =========================================================
@app.get("/health")
def health():
    return {
        "status": "ok" if modelo_b is not None else "modelo_no_cargado",
        "model_version": MODEL_VERSION,
    }
