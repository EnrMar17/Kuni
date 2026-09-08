/**
 * Cliente HTTP hacia el microservicio predictivo del equipo de IA.
 *
 * Reescrito el 2026-09-08 contra el servicio REAL entregado (`app.py`,
 * `pipeline_completo.py`, `README_ENDPOINT.md`). La versión anterior se
 * había construido contra un ejemplo de JSON del documento de alineación y
 * **no habría parseado ni una sola respuesta real**: el servicio envuelve el
 * resultado en `{data, error}` y renombró el campo de probabilidad. Cada
 * llamada habría caído silenciosamente en "sin datos".
 *
 * Diferencias respecto del contrato anterior, todas confirmadas leyendo el
 * código del servicio:
 *
 * | Anterior (supuesto)                 | Real (`app.py`)                    |
 * |-------------------------------------|------------------------------------|
 * | cuerpo plano                        | `{"data": {...}, "error": null}`   |
 * | `probabilidad_empeoramiento_futuro` | `probabilidad_descompensacion`     |
 * | —                                   | `nivel_predicho` bajo/moderado/alto|
 * | probabilidad siempre presente       | `null` legítimo en "techo de riesgo"|
 * | —                                   | `mensaje` explicando ese techo     |
 * | `Authorization: Bearer`             | `X-API-Key`                        |
 *
 * EL "TECHO DE RIESGO" ES EL CASO DELICADO. Cuando el paciente ya está en la
 * peor categoría clínica posible (glucosa o presión en crisis, o una
 * complicación grave ya diagnosticada), el servicio responde
 * `nivel_predicho: "alto"` con un `mensaje` explicándolo. Es un resultado
 * **útil y grave**, no una ausencia de datos: leerlo como "sin información"
 * invertiría por completo su significado. Por eso el resultado de este
 * módulo es una unión discriminada y no un objeto con nulos: quien lo
 * consuma no puede confundir "no hay dato" con "riesgo máximo".
 *
 * Actualizado 2026-09-08 (modelo v7): en v4 este caso venía con
 * `probabilidad_descompensacion: null` — sin número, solo el mensaje. Desde
 * v7 el servicio calibra por separado el grupo "en techo" y SÍ manda un
 * número (ya no "¿llegará a este nivel?" —llegó—, sino "¿qué tan probable es
 * que siga empeorando más allá de este punto?"). Por eso el estado `ceiling`
 * se detecta por la presencia de `mensaje`, nunca por si la probabilidad
 * viene o no: ambas versiones del servicio deben seguir reconociéndose.
 *
 * REGLA DE ORO (principio no negociable, confirmado por ambos equipos): esta
 * función NUNCA lanza y NUNCA deja que una falla del modelo tumbe el
 * dashboard. Sin endpoint, con la red caída, con timeout o con una respuesta
 * de forma inesperada, devuelve `{ status: 'unavailable' }` y el tablero se
 * queda solo con `evaluateRisk()`. El modelo es un panel extra, jamás la
 * fuente de una alerta.
 */

/** Suficiencia de datos por variable. La calcula Kuni y el servicio la devuelve tal cual. */
export interface MlDataSufficiency {
  glucosaAyuno: boolean;
  glucosaPostprandial: boolean;
  presionArterial: boolean;
}

/** `nivel_predicho` del servicio. Es del MODELO: no es el riesgo actual de `evaluateRisk()`. */
export type MlPredictedLevel = 'bajo' | 'moderado' | 'alto';

const PREDICTED_LEVELS: readonly string[] = ['bajo', 'moderado', 'alto'];

export type MlPrediction =
  /** No hay dato publicable: sin endpoint, falla de red, timeout o respuesta inválida. */
  | { status: 'unavailable' }
  /** El modelo devolvió una probabilidad calibrada utilizable. */
  | {
      status: 'available';
      probability: number;
      level: MlPredictedLevel;
      modelVersion: string | null;
      sufficiency: MlDataSufficiency;
    }
  /**
   * Techo de riesgo: el paciente ya está en la peor categoría clínica para
   * alguna variable. `message` explica cuál variable lo provocó.
   *
   * `probability` es `null` en el modelo v4 (no calculaba nada útil en este
   * caso) y un número en v7+ (calibración separada para el grupo "en techo":
   * ahí la probabilidad ya no significa "¿llegará a este nivel?" —llegó—
   * sino "¿qué tan probable es que siga empeorando más allá de este punto?").
   * Ambos son legítimos: el estado `ceiling` se distingue por la presencia
   * de `message`, nunca por si la probabilidad viene o no.
   */
  | {
      status: 'ceiling';
      probability: number | null;
      level: MlPredictedLevel;
      modelVersion: string | null;
      sufficiency: MlDataSufficiency;
      message: string;
    };

/**
 * Vector de entrada — los 17 campos exactos de `FEATURE_COLS`, más
 * `datos_suficientes`, que el servicio no usa para predecir pero devuelve
 * en la respuesta. Lo construye `domain/ml-features.ts`.
 */
export interface MlFeatureVector {
  age_at_wx: number;
  diabetes_dx: 0 | 1;
  hypertension_dx: 0 | 1;
  comorbido_dm_has: 0 | 1;
  fn_ta_systolic_mean: number | null;
  fn_ta_diastolic_mean: number | null;
  tendencia_sistolica: number;
  tendencia_diastolica: number;
  pa_empeorando: 0 | 1;
  in_glucose_mean: number | null;
  tendencia_glucosa: number;
  glucosa_empeorando: 0 | 1;
  adherencia_antidiabeticos: number;
  adherencia_antihipertensivos: number;
  num_complicaciones_dm: number;
  tiene_complicacion_dm: 0 | 1;
  complicacion_grave_dm: 0 | 1;
  datos_suficientes: {
    glucosa_ayuno: boolean;
    glucosa_postprandial: boolean;
    presion_arterial: boolean;
  };
}

export interface MlClientConfig {
  /** null mientras no haya servicio desplegado — la llamada se salta por completo. */
  endpointUrl: string | null;
  /** Viaja en `X-API-Key` (es lo que lee `app.py`), no en `Authorization`. */
  apiKey?: string | null;
  timeoutMs?: number;
  /** Inyectable para pruebas, igual que el reloj en risk.ts. */
  fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 2000;

const UNAVAILABLE: MlPrediction = { status: 'unavailable' };

function parseDataSufficiency(value: unknown): MlDataSufficiency | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  const glucosaAyuno = obj.glucosa_ayuno;
  const glucosaPostprandial = obj.glucosa_postprandial;
  const presionArterial = obj.presion_arterial;
  if (
    typeof glucosaAyuno !== 'boolean' ||
    typeof glucosaPostprandial !== 'boolean' ||
    typeof presionArterial !== 'boolean'
  ) {
    return null;
  }
  return { glucosaAyuno, glucosaPostprandial, presionArterial };
}

/**
 * Valida defensivamente la respuesta completa del servicio antes de confiar
 * en ella. Acepta tanto el sobre `{data, error}` real como un cuerpo plano,
 * para no romperse si el servicio se despliega detrás de un gateway que lo
 * desenvuelve.
 */
export function parseMlResponse(json: unknown): MlPrediction {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return UNAVAILABLE;
  const envelope = json as Record<string, unknown>;

  // Un `error` no nulo es una falla declarada por el servicio: no se publica
  // nada aunque venga acompañado de datos parciales.
  if (envelope.error != null) return UNAVAILABLE;

  const payload =
    typeof envelope.data === 'object' && envelope.data !== null && !Array.isArray(envelope.data)
      ? (envelope.data as Record<string, unknown>)
      : envelope;

  const level = typeof payload.nivel_predicho === 'string' ? payload.nivel_predicho : null;
  if (level == null || !PREDICTED_LEVELS.includes(level)) return UNAVAILABLE;

  const sufficiency = parseDataSufficiency(payload.datos_suficientes);
  if (sufficiency == null) return UNAVAILABLE;

  // Política provisional de Kuni: sin ninguna variable suficiente no se
  // publica una estimación. Pendiente de cerrar elegibilidad parcial con IA.
  if (!sufficiency.glucosaAyuno && !sufficiency.glucosaPostprandial && !sufficiency.presionArterial) {
    return UNAVAILABLE;
  }

  const modelVersion =
    typeof payload.model_version === 'string' && payload.model_version.trim().length > 0
      ? payload.model_version.trim()
      : null;

  const rawProbability = payload.probabilidad_descompensacion;
  const message = typeof payload.mensaje === 'string' ? payload.mensaje.trim() : '';

  // Techo de riesgo: se distingue por la presencia de `mensaje`, NUNCA por si
  // la probabilidad viene o no. v4 manda probabilidad ausente en este caso;
  // v7+ manda una probabilidad real (calibrada aparte para "en techo") y
  // sigue mandando el mismo mensaje — ambas versiones son "ceiling".
  if (message.length > 0) {
    if (rawProbability === null || rawProbability === undefined) {
      return { status: 'ceiling', probability: null, level: level as MlPredictedLevel, modelVersion, sufficiency, message };
    }
    if (typeof rawProbability !== 'number' || !Number.isFinite(rawProbability) || rawProbability < 0 || rawProbability > 1) {
      // Mensaje de techo presente pero probabilidad en forma inesperada:
      // se conserva el aviso grave y se omite el número dudoso, en vez de
      // descartar el resultado completo.
      return { status: 'ceiling', probability: null, level: level as MlPredictedLevel, modelVersion, sufficiency, message };
    }
    return { status: 'ceiling', probability: rawProbability, level: level as MlPredictedLevel, modelVersion, sufficiency, message };
  }

  // Sin mensaje de techo: probabilidad ausente aquí ya no es un caso
  // legítimo del contrato — es una respuesta incompleta.
  if (typeof rawProbability !== 'number' || !Number.isFinite(rawProbability)) return UNAVAILABLE;
  // Cero es una probabilidad válida; fuera de [0,1] no es del contrato.
  if (rawProbability < 0 || rawProbability > 1) return UNAVAILABLE;

  return { status: 'available', probability: rawProbability, level: level as MlPredictedLevel, modelVersion, sufficiency };
}

/**
 * Llama al endpoint del modelo. Nunca lanza: cualquier problema (sin URL,
 * red, timeout, forma inesperada) resuelve a `{ status: 'unavailable' }`.
 */
export async function requestMlPrediction(
  features: MlFeatureVector,
  config: MlClientConfig,
): Promise<MlPrediction> {
  if (!config.endpointUrl) return UNAVAILABLE;

  const doFetch = config.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await doFetch(config.endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // El servicio puede quedar detrás de un túnel gratuito de ngrok
        // durante el hackatón (plan free): sin este header, ngrok responde
        // con una página HTML de advertencia en vez de reenviar la
        // petición, y esta función la trataría como una respuesta inválida
        // (UNAVAILABLE) sin que nadie note por qué. Un servidor real que no
        // sea ngrok simplemente ignora un header que no reconoce.
        'ngrok-skip-browser-warning': 'true',
        ...(config.apiKey ? { 'X-API-Key': config.apiKey } : {}),
      },
      body: JSON.stringify(features),
      signal: controller.signal,
    });

    if (!res.ok) return UNAVAILABLE;

    const json = await res.json();
    return parseMlResponse(json);
  } catch {
    // Red caída, timeout, JSON inválido, lo que sea: nunca tumbar el dashboard.
    return UNAVAILABLE;
  } finally {
    clearTimeout(timer);
  }
}

// =========================================================================
// TRAYECTORIA (predicción a 3 pasos de glucosa/PA) — vinculada al mismo
// vector de features que `requestMlPrediction()`, sirve el panel de
// "proyección" junto al de riesgo futuro. Igual que ese panel, es un
// apoyo informativo no validado clínicamente: nunca reemplaza una medición
// real ni alimenta `evaluateRisk()`.
// =========================================================================

/** Un paso proyectado de la trayectoria: valor esperado + rango (percentiles 10/90). */
export interface MlTrajectoryStep {
  step: number;
  expected: number;
  rangeMin: number;
  rangeMax: number;
}

export type MlTrajectory =
  /** Sin endpoint, red caída, timeout, o forma inesperada — igual regla de oro que MlPrediction. */
  | { status: 'unavailable' }
  | {
      status: 'available';
      modelVersion: string | null;
      glucose: MlTrajectoryStep[];
      systolicBp: MlTrajectoryStep[];
      diastolicBp: MlTrajectoryStep[];
    };

const UNAVAILABLE_TRAJECTORY: MlTrajectory = { status: 'unavailable' };

/**
 * El servicio expone la trayectoria como un endpoint HERMANO de
 * `/predecir-riesgo`, no como parte de esa respuesta (así lo entregó el
 * equipo de IA). `ML_ENDPOINT_URL` en Kuni apunta a `/predecir-riesgo`
 * completo; se deriva la URL hermana en vez de pedir una variable de
 * entorno nueva. Si la URL no termina en ese path exacto (configuración
 * atípica), se prefiere no adivinar: sin trayectoria, nunca una URL
 * inventada que apunte a cualquier otro lado.
 */
export function deriveTrajectoryEndpoint(riskEndpointUrl: string): string | null {
  const suffix = '/predecir-riesgo';
  if (!riskEndpointUrl.endsWith(suffix)) return null;
  return riskEndpointUrl.slice(0, -suffix.length) + '/predecir-trayectoria';
}

function parseTrajectorySteps(value: unknown): MlTrajectoryStep[] | null {
  if (!Array.isArray(value)) return null;
  const steps: MlTrajectoryStep[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) return null;
    const row = item as Record<string, unknown>;
    const step = row.paso;
    const expected = row.valor_esperado;
    const rangeMin = row.rango_min;
    const rangeMax = row.rango_max;
    if (
      typeof step !== 'number' || !Number.isFinite(step) ||
      typeof expected !== 'number' || !Number.isFinite(expected) ||
      typeof rangeMin !== 'number' || !Number.isFinite(rangeMin) ||
      typeof rangeMax !== 'number' || !Number.isFinite(rangeMax)
    ) {
      return null;
    }
    steps.push({ step, expected, rangeMin, rangeMax });
  }
  return steps;
}

export function parseMlTrajectoryResponse(json: unknown): MlTrajectory {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return UNAVAILABLE_TRAJECTORY;
  const envelope = json as Record<string, unknown>;
  if (envelope.error != null) return UNAVAILABLE_TRAJECTORY;

  const payload =
    typeof envelope.data === 'object' && envelope.data !== null && !Array.isArray(envelope.data)
      ? (envelope.data as Record<string, unknown>)
      : envelope;

  const glucose = parseTrajectorySteps(payload.glucosa);
  const systolicBp = parseTrajectorySteps(payload.pa_sistolica);
  const diastolicBp = parseTrajectorySteps(payload.pa_diastolica);
  // Las tres variables se proyectan siempre juntas (mismo vector de
  // entrada); una respuesta que solo trae alguna es una forma inesperada.
  if (glucose == null || systolicBp == null || diastolicBp == null) return UNAVAILABLE_TRAJECTORY;

  const modelVersion =
    typeof payload.model_version === 'string' && payload.model_version.trim().length > 0
      ? payload.model_version.trim()
      : null;

  return { status: 'available', modelVersion, glucose, systolicBp, diastolicBp };
}

/**
 * Llama al endpoint hermano de trayectoria. Nunca lanza — misma regla de oro
 * que `requestMlPrediction()`.
 */
export async function requestMlTrajectory(
  features: MlFeatureVector,
  config: MlClientConfig,
): Promise<MlTrajectory> {
  if (!config.endpointUrl) return UNAVAILABLE_TRAJECTORY;
  const trajectoryUrl = deriveTrajectoryEndpoint(config.endpointUrl);
  if (!trajectoryUrl) return UNAVAILABLE_TRAJECTORY;

  const doFetch = config.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await doFetch(trajectoryUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
        ...(config.apiKey ? { 'X-API-Key': config.apiKey } : {}),
      },
      body: JSON.stringify(features),
      signal: controller.signal,
    });

    if (!res.ok) return UNAVAILABLE_TRAJECTORY;

    const json = await res.json();
    return parseMlTrajectoryResponse(json);
  } catch {
    return UNAVAILABLE_TRAJECTORY;
  } finally {
    clearTimeout(timer);
  }
}
