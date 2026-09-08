/**
 * Validación de plausibilidad de datos de captura (glucosa/presión).
 *
 * OJO: estos NO son límites clínicos de riesgo (esos viven en risk.ts y son
 * personalizados por paciente vía MeasurementThresholds). Esto es solo
 * protección de captura: rechazar números imposibles o ambiguos antes de
 * guardarlos, sin inferir nada clínico. Ver kuni-plan-tecnico.md sección 3
 * ("Límites: glucosa con unidad/contexto; presión con ambos valores y
 * sistólica mayor que diastólica; números imposibles/entrada ambigua
 * rechazada para revisión").
 */

export interface ValidationOk {
  valid: true;
}

export interface ValidationError {
  valid: false;
  reason: string;
}

export type ValidationResult = ValidationOk | ValidationError;

// Rangos de plausibilidad de captura, no de riesgo clínico.
const GLUCOSE_MIN_PLAUSIBLE = 20;
const GLUCOSE_MAX_PLAUSIBLE = 700;
const SYSTOLIC_MIN_PLAUSIBLE = 60;
const SYSTOLIC_MAX_PLAUSIBLE = 260;
const DIASTOLIC_MIN_PLAUSIBLE = 30;
const DIASTOLIC_MAX_PLAUSIBLE = 180;

export function validateGlucoseValue(mgDl: number): ValidationResult {
  if (!Number.isFinite(mgDl)) {
    return { valid: false, reason: 'Valor de glucosa no numérico.' };
  }
  if (mgDl < GLUCOSE_MIN_PLAUSIBLE || mgDl > GLUCOSE_MAX_PLAUSIBLE) {
    return {
      valid: false,
      reason: `Glucosa fuera de rango de captura plausible (${GLUCOSE_MIN_PLAUSIBLE}-${GLUCOSE_MAX_PLAUSIBLE} mg/dL). Requiere revisión manual.`,
    };
  }
  return { valid: true };
}

export function validateBloodPressureValue(
  systolic: number,
  diastolic: number,
): ValidationResult {
  if (!Number.isFinite(systolic) || !Number.isFinite(diastolic)) {
    return { valid: false, reason: 'Valores de presión no numéricos.' };
  }
  if (
    systolic < SYSTOLIC_MIN_PLAUSIBLE ||
    systolic > SYSTOLIC_MAX_PLAUSIBLE ||
    diastolic < DIASTOLIC_MIN_PLAUSIBLE ||
    diastolic > DIASTOLIC_MAX_PLAUSIBLE
  ) {
    return {
      valid: false,
      reason: 'Presión fuera de rango de captura plausible. Requiere revisión manual.',
    };
  }
  if (systolic <= diastolic) {
    return {
      valid: false,
      reason: 'La sistólica debe ser mayor que la diastólica. Entrada ambigua.',
    };
  }
  return { valid: true };
}
