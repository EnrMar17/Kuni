/**
 * Motor de riesgo de descompensación — evaluateRisk()
 *
 * Implementa la sección 3 ("Riesgo para la demo") de kuni-plan-tecnico.md.
 * Es una función PURA a propósito: sin llamadas a red/DB adentro, para
 * poder probarla con objetos en memoria y un reloj inyectable (`now`).
 *
 * IMPORTANTE — declarar esto al jurado: las reglas de "≥3 no-respuestas en
 * 7 días" y "medición fuera de objetivo" son reglas OPERATIVAS propuestas
 * para el prototipo, no criterios médicos validados. No se agregan pesos,
 * entrenamiento, probabilidades ni recomendaciones automáticas de dosis.
 */

import type { RiskLevel, RiskResult } from '../../contracts/dto';

export const RISK_RULE_VERSION = 'risk-rules-v1-hackathon-2026-09';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_PENDING_TIMEOUTS_FOR_MEDIUM = 3;

/** Orden de severidad para poder tomar "la mayor prioridad". unknown es la más baja. */
const LEVEL_RANK: Record<RiskLevel, number> = {
  unknown: 0,
  low: 1,
  medium: 2,
  high: 3,
};

export interface MeasurementThresholds {
  targetMin?: number | null;
  targetMax?: number | null;
  criticalMin?: number | null;
  criticalMax?: number | null;
}

/** Una medición ya validada (glucosa o un componente de presión) lista para evaluar riesgo. */
export interface EvaluableMeasurement {
  variable: 'glucose' | 'blood_pressure_systolic' | 'blood_pressure_diastolic';
  value: number;
  observedAt: string; // ISO
  /** null si el médico no configuró rangos para esta variable/contexto todavía (RF12). */
  thresholds: MeasurementThresholds | null;
}

/** Una no-respuesta que sigue pendiente (vencida, sin contestación válida). */
export interface PendingTimeout {
  occurredAt: string; // ISO — timeout_at
}

/** Una interacción (medición o toma) que sí recibió respuesta, usada para juzgar "reciente". */
export interface RespondedInteraction {
  respondedAt: string; // ISO
}

export interface InitialAssessment {
  level: RiskLevel;
  reason?: string | null;
  evaluatedAt: string; // ISO
  /** false si el médico ya revisó/actualizó la valoración y ya no debe pesar. */
  active: boolean;
}

export interface PatientRiskInput {
  patientId: string;
  urgentFlagActive: boolean;
  initialAssessment: InitialAssessment | null;
  /**
   * Referencia de "reciente" según el plan de monitoreo del paciente: la
   * fecha/hora de la última solicitud de medición esperada. Si es null, no
   * hay plan de monitoreo activo y no se puede afirmar que la información
   * esté al día.
   */
  lastExpectedRequestAt: string | null;
}

function isWithinLast7Days(iso: string, now: Date): boolean {
  const t = new Date(iso).getTime();
  return now.getTime() - t <= SEVEN_DAYS_MS && t <= now.getTime();
}

function exceedsCritical(m: EvaluableMeasurement): boolean {
  if (!m.thresholds) return false;
  const { criticalMin, criticalMax } = m.thresholds;
  if (criticalMin != null && m.value < criticalMin) return true;
  if (criticalMax != null && m.value > criticalMax) return true;
  return false;
}

function isOutOfTarget(m: EvaluableMeasurement): boolean {
  if (!m.thresholds) return false; // sin rango configurado, no se puede juzgar
  const { targetMin, targetMax } = m.thresholds;
  if (targetMin == null && targetMax == null) return false;
  if (targetMin != null && m.value < targetMin) return true;
  if (targetMax != null && m.value > targetMax) return true;
  return false;
}

function higherLevel(a: RiskLevel, b: RiskLevel): RiskLevel {
  return LEVEL_RANK[a] >= LEVEL_RANK[b] ? a : b;
}

/**
 * Evalúa el nivel de riesgo de un paciente según las reglas operativas del
 * prototipo. Ver `RISK_RULE_VERSION` — si cambian las reglas, subir la
 * versión para no mezclar evaluaciones antiguas con nuevas en el histórico.
 */
export function evaluateRisk(
  patient: PatientRiskInput,
  validMeasurements: EvaluableMeasurement[],
  responses: RespondedInteraction[],
  timeouts: PendingTimeout[],
  now: Date = new Date(),
): RiskResult {
  const reasons: string[] = [];

  const pendingTimeoutsLast7Days = timeouts.filter((t) =>
    isWithinLast7Days(t.occurredAt, now),
  ).length;

  const hasThresholdedMeasurements = validMeasurements.some(
    (m) => m.thresholds != null,
  );
  const hasAnyMeasurement = validMeasurements.length > 0;

  const hasCriticalExceeded = validMeasurements.some(exceedsCritical);
  const hasOutOfTarget = validMeasurements.some(isOutOfTarget);

  // "Reciente" depende del plan de monitoreo del paciente, no de un plazo fijo.
  const hasRecentInfo =
    patient.lastExpectedRequestAt != null &&
    (responses.some((r) => r.respondedAt >= patient.lastExpectedRequestAt!) ||
      validMeasurements.some((m) => m.observedAt >= patient.lastExpectedRequestAt!));

  let computed: RiskLevel;

  if (patient.urgentFlagActive) {
    computed = 'high';
    reasons.push('Marca de urgencia activa registrada por el médico.');
  } else if (hasCriticalExceeded) {
    computed = 'high';
    reasons.push('Medición fuera del límite crítico personalizado del paciente.');
  } else if (hasOutOfTarget) {
    computed = 'medium';
    reasons.push('Medición fuera del rango objetivo personalizado del paciente.');
  } else if (pendingTimeoutsLast7Days >= MIN_PENDING_TIMEOUTS_FOR_MEDIUM) {
    computed = 'medium';
    reasons.push(
      `${pendingTimeoutsLast7Days} no-respuestas pendientes en los últimos 7 días (regla operativa, no criterio médico validado).`,
    );
  } else if (!hasThresholdedMeasurements && !hasAnyMeasurement) {
    computed = 'unknown';
    reasons.push('Sin mediciones ni rangos configurados: datos insuficientes para evaluar.');
  } else if (hasRecentInfo) {
    computed = 'low';
    reasons.push('Sin señales activas y con información reciente suficiente.');
  } else {
    computed = 'unknown';
    reasons.push(
      'Sin señales activas, pero no hay información reciente suficiente según el plan de monitoreo.',
    );
  }

  // Conservar la valoración inicial médica y tomar la mayor prioridad
  // mientras siga vigente (nunca inferir "bajo" por defecto si el médico
  // marcó algo más alto y sigue activo).
  let finalLevel = computed;
  if (patient.initialAssessment?.active) {
    const initialLevel = patient.initialAssessment.level;
    if (LEVEL_RANK[initialLevel] > LEVEL_RANK[computed]) {
      finalLevel = initialLevel;
      reasons.push(
        `Valoración inicial médica vigente ("${initialLevel}") tiene mayor prioridad que el cálculo automático.`,
      );
    } else {
      finalLevel = higherLevel(computed, initialLevel);
    }
  }

  return {
    level: finalLevel,
    ruleVersion: RISK_RULE_VERSION,
    reasons,
    evaluatedAt: now.toISOString(),
    inputsUsed: {
      measurementsConsidered: validMeasurements.length,
      pendingTimeoutsLast7Days,
      urgentFlagActive: patient.urgentFlagActive,
      initialAssessmentLevel: patient.initialAssessment?.level ?? null,
    },
  };
}
