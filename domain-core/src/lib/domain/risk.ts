/**
 * Prioridad actual por reglas operativas del prototipo, no predicción clínica.
 * Función pura con reloj inyectable. Quien consulta los datos aporta mediciones
 * válidas/no anuladas, sus rangos personalizados y los planes que siguen vigentes.
 * No se definen aquí límites clínicos ni caducidad universal de señales.
 */
import type { GlucoseContext, MeasurementThresholds, RiskLevel, RiskResult } from '../../contracts/dto';
import { parseInstant } from './time';
export type { MeasurementThresholds } from '../../contracts/dto';

export const RISK_RULE_VERSION = 'risk-rules-v2-hackathon-2026-09';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_PENDING_TIMEOUTS_FOR_MEDIUM = 3;
const LEVEL_RANK: Record<RiskLevel, number> = { unknown: 0, low: 1, medium: 2, high: 3 };

export interface EvaluableMeasurement {
  variable: 'glucose' | 'blood_pressure_systolic' | 'blood_pressure_diastolic';
  value: number;
  observedAt: string;
  /** El contexto de glucosa no se infiere a partir del valor; ausencia = unspecified. */
  context?: GlucoseContext;
  /** Plan explícito o resuelto sin ambigüedad por el adaptador de persistencia. */
  monitoringPlanId?: string | null;
  thresholds: MeasurementThresholds | null;
}

export interface PendingTimeout {
  occurredAt: string;
}

/** Las respuestas permiten registrar actividad, pero no sustituyen una medición. */
export interface RespondedInteraction {
  respondedAt: string;
}

export interface InitialAssessment {
  level: RiskLevel;
  reason?: string | null;
  evaluatedAt: string;
  active: boolean;
}

export interface MonitoringRequirement {
  variable: EvaluableMeasurement['variable'];
  context?: GlucoseContext;
  /** Si se especifica, otra pauta de la misma variable/contexto no acredita este plan. */
  monitoringPlanId?: string;
  /** Última solicitud esperada del plan, calculada con su horario/zona. */
  lastExpectedRequestAt: string;
}

export interface PatientRiskInput {
  patientId: string;
  urgentFlagActive: boolean;
  initialAssessment: InitialAssessment | null;
  /** Sin una lista explícita no se puede acreditar suficiencia para prioridad baja. */
  monitoringRequirements?: MonitoringRequirement[];
  /** @deprecated Una fecha global no acredita cobertura de todas las variables. */
  lastExpectedRequestAt?: string | null;
}

function validPastInstant(iso: string, nowMs: number): number | null {
  const value = parseInstant(iso);
  return value != null && value <= nowMs ? value : null;
}

function hasBound(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function exceedsCritical(measurement: EvaluableMeasurement): boolean {
  const { criticalMin, criticalMax } = measurement.thresholds ?? {};
  return (hasBound(criticalMin) && measurement.value < criticalMin)
    || (hasBound(criticalMax) && measurement.value > criticalMax);
}

function isOutOfTarget(measurement: EvaluableMeasurement): boolean {
  const { targetMin, targetMax } = measurement.thresholds ?? {};
  return (hasBound(targetMin) && measurement.value < targetMin)
    || (hasBound(targetMax) && measurement.value > targetMax);
}

function hasUsableTarget(measurement: EvaluableMeasurement): boolean {
  const thresholds = measurement.thresholds;
  if (!thresholds) return false;
  // Un límite opcional es válido; uno presente pero no finito no lo es.
  if (Object.values(thresholds).some((value) => value != null && !hasBound(value))) return false;
  const { targetMin, targetMax, criticalMin, criticalMax } = thresholds;
  if (!hasBound(targetMin) && !hasBound(targetMax)) return false;
  if (hasBound(targetMin) && hasBound(targetMax) && targetMin > targetMax) return false;
  return !(hasBound(criticalMin) && hasBound(criticalMax) && criticalMin > criticalMax);
}

function hasRecentCoverage(
  requirements: MonitoringRequirement[] | undefined,
  measurements: EvaluableMeasurement[],
  nowMs: number,
): boolean {
  return requirements != null && requirements.length > 0 && requirements.every((requirement) => {
    const expectedAt = validPastInstant(requirement.lastExpectedRequestAt, nowMs);
    if (expectedAt == null) return false;
    return measurements.some((measurement) =>
      measurement.variable === requirement.variable
      && (requirement.monitoringPlanId == null || measurement.monitoringPlanId === requirement.monitoringPlanId)
      && (measurement.variable !== 'glucose'
        || (measurement.context ?? 'unspecified') === (requirement.context ?? 'unspecified'))
      && Date.parse(measurement.observedAt) >= expectedAt
      && hasUsableTarget(measurement));
  });
}

export function evaluateRisk(
  patient: PatientRiskInput,
  validMeasurements: EvaluableMeasurement[],
  _responses: RespondedInteraction[],
  timeouts: PendingTimeout[],
  now: Date = new Date(),
): RiskResult {
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) throw new RangeError('El reloj de evaluación debe ser una fecha válida.');
  const reasons: string[] = [];
  const measurements = validMeasurements.filter((measurement) =>
    Number.isFinite(measurement.value) && validPastInstant(measurement.observedAt, nowMs) != null);
  const pendingTimeoutsLast7Days = timeouts.filter((timeout) => {
    const occurredAt = validPastInstant(timeout.occurredAt, nowMs);
    return occurredAt != null && nowMs - occurredAt <= SEVEN_DAYS_MS;
  }).length;

  let computed: RiskLevel;
  if (patient.urgentFlagActive) {
    computed = 'high';
    reasons.push('Marca de urgencia activa registrada por el médico.');
  } else if (measurements.some(exceedsCritical)) {
    computed = 'high';
    reasons.push('Medición fuera del límite crítico personalizado del paciente.');
  } else if (measurements.some(isOutOfTarget)) {
    computed = 'medium';
    reasons.push('Medición fuera del rango objetivo personalizado del paciente.');
  } else if (pendingTimeoutsLast7Days >= MIN_PENDING_TIMEOUTS_FOR_MEDIUM) {
    computed = 'medium';
    reasons.push(pendingTimeoutsLast7Days + ' no-respuestas pendientes en los últimos 7 días (regla operativa, no criterio médico validado).');
  } else if (hasRecentCoverage(patient.monitoringRequirements, measurements, nowMs)) {
    computed = 'low';
    reasons.push('Sin señales activas y con mediciones recientes evaluables para cada variable y contexto del plan.');
  } else {
    computed = 'unknown';
    reasons.push('Datos insuficientes: faltan planes, rangos objetivo o mediciones recientes para alguna variable o contexto esperado.');
  }

  // La falta de otra variable nunca degrada una señal activa ni la valoración médica.
  const initial = patient.initialAssessment;
  const initialIsCurrent = initial?.active === true && validPastInstant(initial.evaluatedAt, nowMs) != null;
  let finalLevel = computed;
  if (initialIsCurrent && LEVEL_RANK[initial.level] > LEVEL_RANK[computed]) {
    finalLevel = initial.level;
    reasons.push('Valoración inicial médica vigente ("' + initial.level + '") tiene mayor prioridad que el cálculo automático.');
  }

  return {
    level: finalLevel,
    ruleVersion: RISK_RULE_VERSION,
    reasons,
    evaluatedAt: now.toISOString(),
    inputsUsed: {
      measurementsConsidered: measurements.length,
      pendingTimeoutsLast7Days,
      urgentFlagActive: patient.urgentFlagActive,
      initialAssessmentLevel: initialIsCurrent ? initial.level : null,
    },
  };
}
