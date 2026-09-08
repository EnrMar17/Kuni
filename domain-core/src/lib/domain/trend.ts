/**
 * Tendencia (pendiente) y promedio de una serie de lecturas — domain/trend.ts
 *
 * Implementa EXACTAMENTE la fórmula que compartió el equipo de modelado en
 * `documentacion_tecnica.md` (sección 3), para que las mismas variables que
 * alimentan el dashboard (`fn_ta_systolic_mean`, `tendencia_sistolica`, etc.)
 * se calculen igual del lado de Kuni que del lado con el que entrenaron el
 * modelo:
 *
 *   Para cada variable (ej. sistólica):
 *     1. Tomar todas las lecturas dentro de la ventana (30 días)
 *     2. x = días transcurridos desde la primera lectura de la ventana
 *     3. y = valor de cada lectura
 *     4. pendiente = regresión_lineal(x, y).coeficiente
 *     5. Recortar (winsorizar) la pendiente a un rango razonable
 *     Con menos de 2 lecturas -> pendiente = 0
 *
 * Función PURA a propósito (mismo criterio que risk.ts/adherence.ts): sin
 * red/DB adentro, reloj inyectable, para poder probarla con datos en
 * memoria.
 *
 * ⚠️ Los límites de winsorización (`minSlope`/`maxSlope`) NO vienen
 * especificados con números concretos en la respuesta del equipo de IA
 * ("recortar a un rango razonable, evitar valores imposibles con pocas
 * lecturas") — sigue abierto. Mientras no tengamos ese número, se usa un
 * rango por defecto deliberadamente amplio (`DEFAULT_WINSORIZE_BOUND`) que
 * documenta la intención sin inventar un límite clínico.
 * `domain/ml-features.ts` deberá pasar límites reales por variable en
 * cuanto el equipo de IA los confirme.
 *
 * Mínimos de lecturas — CONFIRMADOS por el equipo de IA
 * (`respuestas_alineacion_kuni.md`, pregunta 2): 2 lecturas mínimas para
 * confiar en el promedio, 3 para confiar en la tendencia. Son valores
 * provisionales del equipo de modelado, no un estándar clínico citado.
 */

export interface Reading {
  value: number;
  observedAt: string; // ISO
}

export interface TrendWindowOptions {
  /** Tamaño de la ventana de cálculo en días. Por defecto 30, según el contrato del equipo de IA. */
  windowDays?: number;
  /** Límite absoluto de la pendiente tras winsorizar (unidad/día). Ver nota de arriba. */
  maxAbsSlope?: number;
}

export interface TrendResult {
  /** Número de lecturas consideradas dentro de la ventana. */
  count: number;
  /** true si count >= 2 (CONFIRMADO por el equipo de IA — mínimo para confiar en el promedio). */
  sufficientForMean: boolean;
  /** true si count >= 3 (CONFIRMADO por el equipo de IA — mínimo para confiar en la tendencia). */
  sufficientForTrend: boolean;
  /** Promedio simple de los valores en la ventana. null si no hay lecturas. */
  mean: number | null;
  /** Pendiente ya winsorizada, en unidad/día. 0 si count < 3. */
  slope: number;
  /** Pendiente cruda (sin winsorizar), solo para depuración/auditoría. */
  rawSlope: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_WINDOW_DAYS = 30;
/** CONFIRMADO por el equipo de IA (pregunta 2): 2 lecturas mínimas para el promedio. */
const MIN_READINGS_FOR_MEAN = 2;
/** CONFIRMADO por el equipo de IA (pregunta 2): 3 lecturas mínimas para la tendencia. */
const MIN_READINGS_FOR_SLOPE = 3;
/** Rango por defecto, amplio a propósito — ver nota de winsorización arriba. */
const DEFAULT_WINSORIZE_BOUND = 1000;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Filtra y ordena cronológicamente las lecturas dentro de la ventana [now - windowDays, now]. */
export function filterWindow(readings: Reading[], windowDays: number, now: Date): Reading[] {
  const cutoff = now.getTime() - windowDays * MS_PER_DAY;
  return readings
    .filter((r) => {
      const t = new Date(r.observedAt).getTime();
      return t >= cutoff && t <= now.getTime();
    })
    .sort((a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime());
}

export function computeMean(readings: Reading[]): number | null {
  if (readings.length === 0) return null;
  const sum = readings.reduce((s, r) => s + r.value, 0);
  return round1(sum / readings.length);
}

function winsorize(value: number, maxAbs: number): number {
  if (value > maxAbs) return maxAbs;
  if (value < -maxAbs) return -maxAbs;
  return value;
}

/**
 * Pendiente de regresión lineal simple (mínimos cuadrados) de `value` contra
 * "días desde la primera lectura de la ventana". Devuelve 0 con menos de 2
 * lecturas, o si todas las lecturas cayeron el mismo día (sin dispersión en
 * x, la pendiente no es calculable de forma confiable).
 */
export function computeTrendSlope(readings: Reading[], maxAbsSlope: number = DEFAULT_WINSORIZE_BOUND): number {
  if (readings.length < MIN_READINGS_FOR_SLOPE) return 0;

  const sorted = [...readings].sort(
    (a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime(),
  );
  const firstMs = new Date(sorted[0].observedAt).getTime();
  const points = sorted.map((r) => ({
    x: (new Date(r.observedAt).getTime() - firstMs) / MS_PER_DAY,
    y: r.value,
  }));

  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumXX = points.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumXX - sumX * sumX;

  if (denom === 0) return 0; // todas las lecturas en el mismo instante x -> sin tendencia calculable

  const rawSlope = (n * sumXY - sumX * sumY) / denom;
  return winsorize(rawSlope, maxAbsSlope);
}

/**
 * Calcula promedio y tendencia de una variable en una sola llamada, aplicando
 * la ventana de tiempo y devolviendo también la pendiente cruda (sin
 * winsorizar) para auditoría.
 */
export function evaluateTrend(
  readings: Reading[],
  options: TrendWindowOptions = {},
  now: Date = new Date(),
): TrendResult {
  const windowDays = options.windowDays ?? DEFAULT_WINDOW_DAYS;
  const maxAbsSlope = options.maxAbsSlope ?? DEFAULT_WINSORIZE_BOUND;

  const windowed = filterWindow(readings, windowDays, now);
  const sufficientForMean = windowed.length >= MIN_READINGS_FOR_MEAN;
  const sufficientForTrend = windowed.length >= MIN_READINGS_FOR_SLOPE;

  let rawSlope = 0;
  if (sufficientForTrend) {
    const firstMs = new Date(windowed[0].observedAt).getTime();
    const points = windowed.map((r) => ({
      x: (new Date(r.observedAt).getTime() - firstMs) / MS_PER_DAY,
      y: r.value,
    }));
    const n = points.length;
    const sumX = points.reduce((s, p) => s + p.x, 0);
    const sumY = points.reduce((s, p) => s + p.y, 0);
    const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
    const sumXX = points.reduce((s, p) => s + p.x * p.x, 0);
    const denom = n * sumXX - sumX * sumX;
    rawSlope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
  }

  return {
    count: windowed.length,
    sufficientForMean,
    sufficientForTrend,
    mean: computeMean(windowed),
    slope: winsorize(rawSlope, maxAbsSlope),
    rawSlope,
  };
}
