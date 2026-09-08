# `ml-service` — instrucciones para B (para no romper lo que ya funciona)

## Contexto

C1 (levantar el microservicio de predicción, RF30) ya quedó resuelto y probado: responde correcto, exige `X-API-Key`, y el panel RF30 de la ficha de paciente ya lo consume (`domain-core/src/lib/ml/client.ts` → `src/lib/ml/predict-patient.ts` → `src/components/patient-prediction-panel.tsx`).

Se probó desde la laptop de Pau (C) con `uvicorn` + un túnel de `ngrok`, pero eso depende de que esa laptop siga prendida. Como `next dev` ya corre en tu máquina (junto con el túnel de `ngrok` de los webhooks de WhatsApp), lo más simple es correr también el `ml-service` ahí, para que todo dependa de una sola máquina que de todos modos va a estar encendida.

**No hay que tocar nada del código del servicio** (`app.py`, `pipeline_completo.py`, `modelo_wrapper.py`, `salidas/`) — ya está probado y funcionando tal cual quedó en el repo.

## 1. Trae el código

```powershell
git pull origin develop
```

(`ml-service/` ya está mezclado en la raíz del repo, con el modelo entrenado incluido en `ml-service/salidas/modelo_prediccion_futura.joblib`.)

## 2. Prepara el entorno Python (una sola vez)

```powershell
cd ml-service
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Si PowerShell bloquea el script de activación por política de ejecución:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned
```

## 3. Genera tu propia API key

No reutilices la que se usó en las pruebas de Pau — genera una tuya:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Cópiala, la vas a usar dos veces: para arrancar el servicio (paso 4) y en tu `.env.local` (paso 6).

## 4. Levanta el servicio

En su propia ventana de terminal, déjalo corriendo (sin `--reload`: el autorecargador reinicia el proceso y pierde el modelo cargado en memoria por unos segundos cada vez que detecta un cambio):

```powershell
$env:ML_API_KEY = "<tu-llave-del-paso-3>"
uvicorn app:app --port 8000
```

Verifica en otra ventana:

```powershell
curl.exe http://localhost:8000/health
```

Debe responder `{"status":"ok","model_version":"prediccion_futura_v4_2026-09-08"}`. Si dice `modelo_no_cargado`, revisa que exista `ml-service/salidas/modelo_prediccion_futura.joblib` (viene en el repo; no debería faltar tras el `git pull`).

## 5. Expón el puerto 8000 con ngrok, junto con tu túnel existente

Las cuentas gratuitas de ngrok normalmente solo permiten **una sesión de agente simultánea** — si corres un segundo `ngrok http` aparte del que ya tienes para los webhooks, es probable que te dé `ERR_NGROK_108`. La solución es un solo agente con **dos túneles** definidos en su archivo de configuración (ubícalo con `ngrok config check`, suele estar en `%USERPROFILE%\AppData\Local\ngrok\ngrok.yml`):

```yaml
version: "3"
agent:
  authtoken: <tu-authtoken-de-ngrok>
tunnels:
  webhook:
    proto: http
    addr: 3000      # el puerto donde ya corre next dev — el que ya usas hoy
  mlservice:
    proto: http
    addr: 8000
```

Y en vez de tu comando actual de `ngrok http <puerto>`, corre:

```powershell
ngrok start --all
```

Esto te da **dos** URLs de "Forwarding" en la misma ventana: la del webhook (no cambia nada de lo que ya tenías) y una nueva para el modelo. Copia la del túnel `mlservice`.

## 6. Actualiza tu `.env.local`

En tu máquina (donde corre `next dev`), agrega o reemplaza:

```
ML_ENDPOINT_URL=https://<tu-url-nueva-de-mlservice>/predecir-riesgo
ML_API_KEY=<la-misma-llave-del-paso-3>
ML_TIMEOUT_MS=2000
```

Reinicia `next dev` — las variables de entorno solo se leen al arrancar.

## 7. Verifica en la app

Abre la ficha de un paciente con datos suficientes (glucosa/presión registradas). El panel **"RF30 · estimación adicional"** debería mostrar nivel (bajo/moderado/alto) y probabilidad, en vez de "Servicio no disponible".

## Qué tener en cuenta para la demo

- Con `ngrok` gratis, la URL cambia cada vez que reinicias el túnel — si eso pasa, repite el paso 6. Un dominio fijo de ngrok (gratis, 1 por cuenta, se configura en el dashboard de ngrok) evita este problema si les da tiempo de configurarlo.
- Las peticiones al modelo mandan el header `ngrok-skip-browser-warning` para saltar la página de advertencia del plan gratuito — ya está en el cliente (`domain-core/src/lib/ml/client.ts`), no hay que hacer nada extra por eso.
- El modelo es un panel adicional, nunca la fuente de una alerta — si el endpoint se cae o el túnel muere, el panel simplemente vuelve a "Servicio no disponible" sin romper el resto de la app.
