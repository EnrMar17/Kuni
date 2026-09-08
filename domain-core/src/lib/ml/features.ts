/**
 * Constructor del vector de 17 variables que consume el modelo predictivo
 * — RF29. Es el "diccionario completo" que `documentacionC.md` listaba como
 * pendiente; ahora existe, porque el paquete entregado por el equipo de IA
 * (`pipeline_completo.py`, `FEATURE_COLS`) lo define sin ambigüedad.
 *
 * Nombres, tipos y orden salen de `FEATURE_COLS` y del modelo Pydantic
 * `VectorPaciente` de `app.py`. No se inventa ninguno ni se renombra: el
 * servicio valida la forma y rechaza lo que no reconoce.
 *
 * Función PURA, igual que risk.ts / adherence.ts / trend.ts: reloj
 * inyectable, sin red ni base de datos. Quien la llama (una consulta del
 * lado servidor de Kuni) arma las lecturas; aquí solo se derivan variables.
 *
 * ── LO QUE ESTE MÓDULO NO PUEDE SABER TODAVÍA ──────────────────────────
 * Cinco de las diecisiete variables dependen de datos que el esquema de
 * Kuni aún no captura. En vez de rellenarlas en silencio, cada una se
 * reporta en `gaps`, con el mismo criterio que el resto del dominio: un
 * dato ausente se declara, nunca se disfraza de dato observado.
 *
 *   - `num_complicaciones_dm`, `tiene_complicacion_dm`,
 *     `complicacion_grave_dm` → necesitan la migración RF28
 *     (`patient_complications`), que todavía no existe.
 *   - `adherencia_antidiabeticos`, `adherencia_antihipertensivos` →
 *     necesitan clasificar cada medicamento por clase terapéutica.
 *     `medications` no tiene esa columna.
 *
 * ⚠️ EL CERO ES LA TRAMPA DE ESTE CONTRATO. El servicio exige
 * `adherencia_* ∈ [0,1]` sin default, y su entrenamiento rellenó los
 * huecos con `.fillna(0)`. Pero 0 significa "no tomó ninguna dosis", que
 * es el peor valor clínico posible — no "no sabemos". Mandar 0 por
 * ausencia empuja la predicción hacia arriba por una razón que no ocurrió.
 * Este módulo usa `unknownAdherenceValue` (por defecto 0, para reproducir
 * el entrenamiento) pero SIEMPRE deja la constancia en `gaps` para que la
 * capa que muestre el resultado pueda advertirlo o abstenerse. Decidir si
 * se publica una predicción con esas brechas es política de producto, no
 * de esta función.
 */

import { evaluateTrend, type Reading, type TrendResult } from '../domain/trend';
import type { AdherenceResult } from '../domain/adherence';
import type { MlFeatureVector } from './client';

/** Umbrales de "empeorando" — literales de `construir_features()` en `pipeline_completo.py`. */
const SYSTOLIC_WORSENING_SLOPE = 1.0; // mmHg/día
const GLUCOSE_WORSENING_SLOPE = 2.0; // mg/dL/día

/** Ventana de cálculo de medias y tendencias, confirmada por el equipo de IA. */
const WINDOW_DAYS = 30;

/**
 * Catálogo RF28 del prototipo. `E119` es captura explícita de "ninguna
 * complicación": cuenta como revisión hecha, nunca como una complicación
 * más, y no se suma junto a las demás.
 */
const COMPLICATION_CODES = ['E110', 'E111', 'E112', 'E113', 'E114', 'E115', 'E116', 'E117', 'E118'] as const;
/** `complicacion_grave_dm` = max(e110, e111, e112) en `construir_features()`. */
const SEVERE_COMPLICATION_CODES = ['E110', 'E111', 'E112'] as const;
export const NO_COMPLICATIONS_CODE = 'E119';

/** Códigos de diagnóstico del DDL (`patient_diagnoses.condition_code`). */
const DIABETES_CODES = ['diabetes_type_1', 'diabetes_type_2', 'diabetes_gestational', 'diabetes_other'];
const HYPERTENSION_CODES = ['hypertension'];

/** Una variable que se envió con un valor de relleno porque Kuni no la captura todavía. */
export interface MlFeatureGap {
  /** Nombre exacto de la variable en el contrato del servicio. */
  feature: keyof MlFeatureVector;
  /** Por qué no hay dato real. */
  reason: string;
  /** Valor que se envió en su lugar. */
  sentValue: number;
}

export interface MlComplicationsCapture {
  /**
   * Códigos vigentes capturados por el médico (RF28). Incluir `E119` si el
   * médico registró explícitamente "ninguna complicación".
   */
  codes: string[];
}

export interface MlFeatureInput {
  /** Edad actual en años. */
  age: number;
  /** `condition_code` de los diagnósticos ACTIVOS del paciente. */
  diagnoses: string[];
  /** Glucosa en ayuno (`measurement_context = 'fasting'`). */
  fastingGlucose: Reading[];
  /**
   * Glucosa posprandial (`after_meal`). El modelo no recibe esta serie: se
   * usa solo para `datos_suficientes.glucosa_postprandial`.
   */
  postprandialGlucose?: Reading[];
  systolic: Reading[];
  diastolic: Reading[];
  /** Cohorte Y/N/U de tomas de antidiabéticos. `null` si no se puede separar por clase. */
  antidiabeticAdherence?: AdherenceResult | null;
  /** Cohorte Y/N/U de tomas de antihipertensivos. `null` si no se puede separar por clase. */
  antihypertensiveAdherence?: AdherenceResult | null;
  /** Captura RF28. `null` mientras la migración no exista o el expediente no tenga revisión. */
  complications?: MlComplicationsCapture | null;
}

export interface MlFeatureOptions {
  now?: Date;
  /**
   * Valor enviado cuando no se puede calcular una adherencia. 0 reproduce el
   * `.fillna(0)` del entrenamiento; siempre queda registrado en `gaps`.
   */
  unknownAdherenceValue?: number;
  /** Límite absoluto de winsorización por variable, cuando IA confirme los reales. */
  maxAbsSlope?: number;
}

export interface MlFeatureBuild {
  vector: MlFeatureVector;
  /** Variables enviadas con relleno. Vacío = las 17 salen de datos observados. */
  gaps: MlFeatureGap[];
  /** Resultados intermedios, para auditar de dónde salió cada número. */
  trends: {
    fastingGlucose: TrendResult;
    postprandialGlucose: TrendResult;
    systolic: TrendResult;
    diastolic: TrendResult;
  };
}

function binary(value: boolean): 0 | 1 {
  return value ? 1 : 0;
}

/** Adherencia confirmada Y/(Y+N) en escala 0-1 — la métrica acordada para RF29. */
function confirmedAdherenceRatio(result: AdherenceResult | null | undefined): number | null {
  if (!result || result.confirmedAdherencePct == null) return null;
  const ratio = result.confirmedAdherencePct / 100;
  if (!Number.isFinite(ratio)) return null;
  return Math.min(1, Math.max(0, ratio));
}

function distinctActiveComplications(codes: string[]): string[] {
  const normalized = new Set(codes.map((code) => code.trim().toUpperCase()));
  // E119 declara ausencia: no convive con complicaciones reales ni se cuenta.
  return COMPLICATION_CODES.filter((code) => normalized.has(code));
}

export function buildMlFeatureVector(input: MlFeatureInput, options: MlFeatureOptions = {}): MlFeatureBuild {
  const now = options.now ?? new Date();
  if (!Number.isFinite(now.getTime())) {
    throw new Error('El reloj de referencia no es un instante válido.');
  }

  const windowOptions = { windowDays: WINDOW_DAYS, maxAbsSlope: options.maxAbsSlope };
  const fasting = evaluateTrend(input.fastingGlucose, windowOptions, now);
  const postprandial = evaluateTrend(input.postprandialGlucose ?? [], windowOptions, now);
  const systolic = evaluateTrend(input.systolic, windowOptions, now);
  const diastolic = evaluateTrend(input.diastolic, windowOptions, now);

  const gaps: MlFeatureGap[] = [];
  const unknownAdherence = options.unknownAdherenceValue ?? 0;

  const diagnoses = new Set(input.diagnoses);
  const diabetes = binary(DIABETES_CODES.some((code) => diagnoses.has(code)));
  const hypertension = binary(HYPERTENSION_CODES.some((code) => diagnoses.has(code)));

  const antidiabetic = confirmedAdherenceRatio(input.antidiabeticAdherence);
  if (antidiabetic == null) {
    gaps.push({
      feature: 'adherencia_antidiabeticos',
      reason:
        'Sin cohorte de tomas de antidiabéticos: `medications` no clasifica el medicamento por clase terapéutica. Cero significa "no tomó", no "sin dato".',
      sentValue: unknownAdherence,
    });
  }

  const antihypertensive = confirmedAdherenceRatio(input.antihypertensiveAdherence);
  if (antihypertensive == null) {
    gaps.push({
      feature: 'adherencia_antihipertensivos',
      reason:
        'Sin cohorte de tomas de antihipertensivos: `medications` no clasifica el medicamento por clase terapéutica. Cero significa "no tomó", no "sin dato".',
      sentValue: unknownAdherence,
    });
  }

  let numComplications = 0;
  let severeComplication: 0 | 1 = 0;
  if (input.complications == null) {
    const reason =
      'El expediente no tiene revisión de complicaciones: falta la migración RF28 (`patient_complications`). Un expediente sin revisar NO equivale a E119 ("ninguna complicación").';
    for (const feature of ['num_complicaciones_dm', 'tiene_complicacion_dm', 'complicacion_grave_dm'] as const) {
      gaps.push({ feature, reason, sentValue: 0 });
    }
  } else {
    const active = distinctActiveComplications(input.complications.codes);
    numComplications = active.length;
    severeComplication = binary(active.some((code) => SEVERE_COMPLICATION_CODES.includes(code as never)));
  }

  const vector: MlFeatureVector = {
    age_at_wx: Math.max(0, Math.trunc(input.age)),
    diabetes_dx: diabetes,
    hypertension_dx: hypertension,
    comorbido_dm_has: binary(diabetes === 1 && hypertension === 1),
    // Sin lecturas suficientes se manda null: el servicio lo acepta como
    // opcional y lo convierte en el mismo -1 que usó el entrenamiento.
    // Un promedio de una sola lectura no es un promedio.
    fn_ta_systolic_mean: systolic.sufficientForMean ? systolic.mean : null,
    fn_ta_diastolic_mean: diastolic.sufficientForMean ? diastolic.mean : null,
    tendencia_sistolica: systolic.slope,
    tendencia_diastolica: diastolic.slope,
    pa_empeorando: binary(systolic.slope > SYSTOLIC_WORSENING_SLOPE),
    in_glucose_mean: fasting.sufficientForMean ? fasting.mean : null,
    tendencia_glucosa: fasting.slope,
    glucosa_empeorando: binary(fasting.slope > GLUCOSE_WORSENING_SLOPE),
    adherencia_antidiabeticos: antidiabetic ?? unknownAdherence,
    adherencia_antihipertensivos: antihypertensive ?? unknownAdherence,
    num_complicaciones_dm: numComplications,
    tiene_complicacion_dm: binary(numComplications > 0),
    complicacion_grave_dm: severeComplication,
    datos_suficientes: {
      glucosa_ayuno: fasting.sufficientForMean,
      glucosa_postprandial: postprandial.sufficientForMean,
      // La presión necesita ambos componentes: una sistólica sola no basta.
      presion_arterial: systolic.sufficientForMean && diastolic.sufficientForMean,
    },
  };

  return { vector, gaps, trends: { fastingGlucose: fasting, postprandialGlucose: postprandial, systolic, diastolic } };
}
