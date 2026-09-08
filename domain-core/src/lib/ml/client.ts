/**
 * Cliente HTTP hacia el modelo predictivo del equipo de IA — lib/ml/client.ts
 *
 * Contrato de salida ACTUALIZADO tras `respuestas_alineacion_kuni.md`
 * (respuesta a `alineacion-y-preguntas-equipo-ia.md`, pregunta 9). Resumen
 * de lo que cambió respecto a la primera versión de este archivo:
 *
 * - `evaluateRisk()` (de Kuni) queda como la ÚNICA fuente de verdad para
 *   alertas rojas / riesgo actual. El motor de reglas en Python del equipo
 *   de IA era una pieza interna de entrenamiento, nunca de producción — fue
 *   un malentendido de comunicación, no una decisión de arquitectura.
 * - Por eso el endpoint YA NO manda `nivel_riesgo_actual` ni `alerta_roja`.
 *   Este cliente ya no los expone: mostrar dos "niveles de riesgo" que
 *   podrían no coincidir es exactamente lo que ambos equipos querían
 *   evitar.
 * - `datos_suficientes` ahora es un objeto por variable (glucosa en ayuno,
 *   glucosa posprandial, presión arterial), no un solo booleano para todo
 *   el paciente — un paciente puede tener suficientes lecturas de presión
 *   pero no de glucosa.
 *
 * ⚠️ Nota de ambigüedad (no resuelta todavía, no bloquea escribir esto):
 * la respuesta no aclara explícitamente si `brecha_monitoreo_excedida` y
 * `alerta_naranja_predictiva` (que sí estaban en el contrato original)
 * siguen existiendo o se descartaron junto con `nivel_riesgo_actual` /
 * `alerta_roja` — el ejemplo de JSON que dieron solo trae 3 campos. Este
 * cliente se construyó contra ESE ejemplo literal (los 3 campos
 * confirmados) para no inventar campos que quizás ya no existen. Si el
 * equipo de IA confirma que esos dos campos siguen vivos, hay que
 * agregarlos de vuelta — queda anotado como pregunta pendiente en
 * `documentacion-persona-c.md`.
 *
 * REGLA DE ORO (sigue vigente, confirmada desde el inicio como principio
 * no negociable): esta función NUNCA lanza una excepción y NUNCA deja que
 * una falla del modelo tumbe el dashboard. Si no hay endpoint configurado,
 * si la llamada falla, hace timeout, o la respuesta no tiene la forma
 * esperada, devuelve un resultado "todo null" y el dashboard se queda
 * únicamente con `evaluateRisk()`.
 */

/** Suficiencia de datos por variable — CONFIRMADO por el equipo de IA (pregunta 2). */
export interface MlDataSufficiency {
  glucosaAyuno: boolean;
  glucosaPostprandial: boolean;
  presionArterial: boolean;
}

export interface MlPredictionResult {
  /** 0-1. Probabilidad de empeoramiento futuro (Modelo B, AUC-ROC 0.887). null si no se pudo obtener. */
  probabilidadEmpeoramientoFuturo: number | null;
  /** Formato confirmado: `{nombre_modelo}_v{numero}_{fecha_entrenamiento}`, ej. "prediccion_futura_v1_2026-09-08". */
  modelVersion: string | null;
  /** null si no se pudo obtener respuesta del modelo (no solo "no hay endpoint"). */
  datosSuficientes: MlDataSufficiency | null;
}

/**
 * Vector de entrada — provisional. El contrato completo lo arma
 * `domain/ml-features.ts` (todavía no construido). Aquí solo se tipa como
 * registro abierto para que `requestMlPrediction` sea utilizable/probable
 * desde ya sin acoplarse a un tipo que todavía puede cambiar.
 */
export type MlFeatureVector = Record<string, number | string | boolean | null>;

export interface MlClientConfig {
  /** null mientras el equipo de IA no comparta la URL real — la llamada se salta por completo. */
  endpointUrl: string | null;
  apiKey?: string | null;
  timeoutMs?: number;
  /** Inyectable para pruebas, igual que el reloj en risk.ts. Por defecto usa el `fetch` global. */
  fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 2000;

function emptyResult(): MlPredictionResult {
  return {
    probabilidadEmpeoramientoFuturo: null,
    modelVersion: null,
    datosSuficientes: null,
  };
}

function parseDataSufficiency(value: unknown): MlDataSufficiency | null {
  if (typeof value !== 'object' || value === null) return null;
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

/** Valida defensivamente la forma de la respuesta antes de confiar en ella. */
export function parseMlResponse(json: unknown): MlPredictionResult {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return emptyResult();
  const obj = json as Record<string, unknown>;

  const probabilidadEmpeoramientoFuturo =
    typeof obj.probabilidad_empeoramiento_futuro === 'number' &&
    obj.probabilidad_empeoramiento_futuro >= 0 &&
    obj.probabilidad_empeoramiento_futuro <= 1
      ? obj.probabilidad_empeoramiento_futuro
      : null;

  const modelVersion = typeof obj.model_version === 'string' && obj.model_version.trim().length > 0
    ? obj.model_version.trim()
    : null;

  const datosSuficientes = parseDataSufficiency(obj.datos_suficientes);

  if (probabilidadEmpeoramientoFuturo == null || datosSuficientes == null) return emptyResult();
  // Política provisional de Kuni: no publicar un porcentaje con todas las
  // variables insuficientes. Falta cerrar elegibilidad parcial con el equipo IA.
  if (!datosSuficientes.glucosaAyuno && !datosSuficientes.glucosaPostprandial
    && !datosSuficientes.presionArterial) return emptyResult();

  return {
    probabilidadEmpeoramientoFuturo,
    modelVersion,
    datosSuficientes,
  };
}

/**
 * Llama al endpoint del modelo predictivo. Nunca lanza: cualquier problema
 * (sin URL, red, timeout, forma de respuesta inesperada) resuelve a
 * `emptyResult()`.
 */
export async function requestMlPrediction(
  features: MlFeatureVector,
  config: MlClientConfig,
): Promise<MlPredictionResult> {
  if (!config.endpointUrl) {
    return emptyResult();
  }

  const doFetch = config.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await doFetch(config.endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify(features),
      signal: controller.signal,
    });

    if (!res.ok) {
      return emptyResult();
    }

    const json = await res.json();
    return parseMlResponse(json);
  } catch {
    // Red caída, timeout, JSON inválido, lo que sea: nunca tumbar el dashboard.
    return emptyResult();
  } finally {
    clearTimeout(timer);
  }
}
