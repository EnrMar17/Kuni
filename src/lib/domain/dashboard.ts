import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type { Database } from "../../types/database.types";
import { aggregateAdherence, computeAdherence, type AdherenceInput, type AdherenceResult } from "../../../domain-core/src/lib/domain/adherence";
import { evaluateRisk, type EvaluableMeasurement, type MeasurementThresholds } from "../../../domain-core/src/lib/domain/risk";
import type { GlucoseContext, RiskResult } from "../../../domain-core/src/contracts/dto";

export type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
type NonresponseRow = Database["public"]["Views"]["patient_nonresponse_counts"]["Row"];
type ConsentRow = Database["public"]["Views"]["patient_consent_status"]["Row"];
export type PrescriptionRow = Row<"prescriptions"> & {
  medications: Pick<Row<"medications">, "name" | "strength"> | null;
  prescription_schedules: Pick<Row<"prescription_schedules">, "local_time" | "weekdays">[];
};

export type DashboardMeasurement = {
  id: string; kind: string; context: string; observedAt: string; receivedAt: string;
  updatedAt?: string;
  monitoringPlanId: string | null;
  glucoseMgDl: number | null; systolicMmHg: number | null; diastolicMmHg: number | null;
  source: string; correctionReason: string | null;
  thresholds: { glucose: MeasurementThresholds | null; systolic: MeasurementThresholds | null; diastolic: MeasurementThresholds | null };
};
export type DashboardAppointment = {
  id: string; patientId: string; patientName: string; startsAt: string; reason: string | null; status: string; urgency: string;
};
export type DashboardAlert = {
  id: string; patientId: string; patientName: string; kind: string; severity: string; status: string; title: string; createdAt: string; updatedAt: string;
};
export type DashboardComplication = { id: string; code: string; diagnosedOn: string | null; notes: string | null; updatedAt: string };
export type DashboardPrescription = {
  id: string; medicationName: string; doseText: string; route: string | null; instructions: string | null;
  medicationId: string; version: number; updatedAt: string;
  startDate: string; endDate: string | null; schedules: { localTime: string; weekdays: number[] }[]; adherence: AdherenceResult;
};
export type DashboardInteraction = {
  id: string; kind: string; scheduledAt: string; deliveredAt: string | null; responseAt: string | null;
  timeoutAt: string | null; deliveryStatus: string; replyCode: string; medicationTaken: boolean | null; expectsResponse: boolean;
};
export type DashboardPatient = {
  id: string; fullName: string; clinicalRecord: string; curp: string | null; birthDate: string; age: number;
  sex: string; bloodType: string | null; whatsappE164: string; diagnoses: string[];
  /** `condition_code` crudo (DDL), sin etiquetas de UI — lo necesita el vector de features del modelo (RF29). */
  diagnosisCodes: string[];
  /**
   * Códigos vigentes de `patient_complications` (RF28). `null` = ninguna fila para
   * este paciente = expediente SIN REVISAR — nunca equivale a `["E119"]`
   * ("revisado, ninguna complicación"). Mismo criterio que `MlComplicationsCapture`
   * en `domain-core/src/lib/ml/features.ts`.
   */
  complicationCodes: string[] | null;
  consentGranted: boolean;
  initialRiskReason: string | null; risk: RiskResult; adherence: AdherenceResult;
  lastResponseAt: string | null;
  nonresponse: { historical: number; pending: number };
  measurements: DashboardMeasurement[]; latestGlucose: DashboardMeasurement | null; latestBloodPressure: DashboardMeasurement | null;
  prescriptions: DashboardPrescription[]; appointments: DashboardAppointment[]; alerts: DashboardAlert[]; interactions: DashboardInteraction[]; complications: DashboardComplication[];
};
export type DashboardData = {
  generatedAt: string; timezone: string; hasMorePatients: boolean; patients: DashboardPatient[];
  appointments: DashboardAppointment[]; alerts: DashboardAlert[];
  metrics: { activePatients: number; highRiskPatients: number; activeAlerts: number; criticalAlerts: number; meanFastingGlucoseMgDl: number | null; fastingGlucoseCount: number; adherence: AdherenceResult };
};
export type DashboardRows = {
  patients: Row<"patients">[]; diagnoses: Row<"patient_diagnoses">[]; plans: Row<"monitoring_plans">[];
  measurements: Row<"measurements">[]; interactions: Row<"bot_interactions">[]; responses: Row<"medication_responses">[];
  prescriptions: PrescriptionRow[]; appointments: Row<"appointments">[]; alerts: Row<"alerts">[];
  complications: Row<"patient_complications">[]; nonresponse: NonresponseRow[]; consent: ConsentRow[];
};

const DAY_MS = 86_400_000;
const technicalStates = new Set(["failed", "blocked_window", "blocked_template", "unknown"]);
const riskOrder = { high: 0, medium: 1, low: 2, unknown: 3 };
const diagnosisLabels: Record<string, string> = {
  diabetes_type_1: "Diabetes tipo 1", diabetes_type_2: "Diabetes tipo 2", diabetes_gestational: "Diabetes gestacional",
  diabetes_other: "Otra diabetes", hypertension: "Hipertensión", other: "Otro diagnóstico",
};

function isPast(iso: string | null, now: Date): boolean {
  return iso != null && Number.isFinite(Date.parse(iso)) && Date.parse(iso) <= now.getTime();
}

/** Build the canonical Y/N/U cohort; a missing reply is never a denied dose. */
export function toAdherenceInput(interactions: Row<"bot_interactions">[], responses: Row<"medication_responses">[], now: Date): AdherenceInput {
  const responseByInteraction = new Map(responses.filter((r) => isPast(r.reported_at, now)).map((r) => [r.interaction_id, r]));
  const input: AdherenceInput = { concluded: [], technicalExclusions: [] };
  for (const item of interactions) {
    if (item.kind !== "medication" || !isPast(item.scheduled_at, now) || Date.parse(item.scheduled_at) < now.getTime() - 30 * DAY_MS) continue;
    if (item.delivery_status === "cancelled") continue;
    if (item.delivery_status === "failed") {
      input.technicalExclusions!.push({ reason: item.failure_code ?? item.delivery_status });
      continue;
    }
    const response = responseByInteraction.get(item.id);
    // A validated inbound or a linked manual response establishes contact without fabricating delivered_at.
    if (response && (response.source === "manual" || response.source === "whatsapp")) {
      input.concluded.push({ outcome: response.taken ? "yes" : "no" });
    } else if (technicalStates.has(item.delivery_status)) {
      input.technicalExclusions!.push({ reason: item.failure_code ?? item.delivery_status });
    } else if (isPast(item.delivered_at, now) && isPast(item.response_deadline_at, now) && ["delivered", "read"].includes(item.delivery_status)) {
      input.concluded.push({ outcome: "unknown" });
    }
  }
  return input;
}

function activeOn(plan: Row<"monitoring_plans">, date: string): boolean {
  return plan.active && plan.start_date <= date && (plan.end_date == null || plan.end_date >= date);
}

/** Weekly local schedule, without equating consultation frequency with monitoring. */
export function lastExpectedAt(plan: Row<"monitoring_plans">, now: Date, timezone: string): string | null {
  const today = formatInTimeZone(now, timezone, "yyyy-MM-dd");
  if (!activeOn(plan, today)) return null;
  const localMidday = new Date(`${today}T12:00:00Z`);
  for (let offset = 0; offset <= 7; offset += 1) {
    const candidate = new Date(localMidday.getTime() - offset * DAY_MS);
    const date = candidate.toISOString().slice(0, 10);
    const weekday = candidate.getUTCDay() || 7;
    if (!activeOn(plan, date) || !plan.weekdays.includes(weekday)) continue;
    const instant = fromZonedTime(`${date}T${plan.local_time}`, timezone);
    if (instant.getTime() <= now.getTime()) return instant.toISOString();
  }
  return null;
}

function thresholds(plan: Row<"monitoring_plans"> | null, variable: "glucose" | "systolic" | "diastolic"): MeasurementThresholds | null {
  if (!plan) return null;
  const unit = variable === "glucose" ? "mg_dl" : "mm_hg";
  const result: MeasurementThresholds = {
    targetMin: plan[`${variable}_min_${unit}` as keyof typeof plan] as number | null,
    targetMax: plan[`${variable}_max_${unit}` as keyof typeof plan] as number | null,
    criticalMin: plan[`critical_${variable}_min_${unit}` as keyof typeof plan] as number | null,
    criticalMax: plan[`critical_${variable}_max_${unit}` as keyof typeof plan] as number | null,
  };
  return Object.values(result).some((value) => value != null) ? result : null;
}

function measurementPlan(measurement: Row<"measurements">, plans: Row<"monitoring_plans">[], now: Date, timezone: string): Row<"monitoring_plans"> | null {
  const today = formatInTimeZone(now, timezone, "yyyy-MM-dd");
  const observedDate = formatInTimeZone(measurement.measured_at, timezone, "yyyy-MM-dd");
  const matches = plans.filter((plan) => activeOn(plan, today) && activeOn(plan, observedDate) && plan.kind === measurement.kind
    && (plan.measurement_context ?? "unspecified") === (measurement.measurement_context ?? "unspecified")
    && (measurement.monitoring_plan_id == null || measurement.monitoring_plan_id === plan.id));
  // Never choose arbitrarily between multiple personalized threshold sets.
  return matches.length === 1 ? matches[0] : null;
}

function grouped<T extends { patient_id: string | null }>(items: T[]): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const item of items) {
    if (item.patient_id == null) continue;
    const bucket = result.get(item.patient_id) ?? [];
    bucket.push(item);
    result.set(item.patient_id, bucket);
  }
  return result;
}

/** Pure SQL-to-domain adapter, shared by real queries and deterministic tests. */
export function buildDashboardData(rows: DashboardRows, scope: { unitId: string; roomId: string; timezone: string }, now: Date, hasMorePatients = false): DashboardData {
  const { unitId, roomId, timezone } = scope;
  const scopedPatients = rows.patients.filter((p) => p.unit_id === unitId && p.consulting_room_id === roomId && p.active);
  const ids = new Set(scopedPatients.map((p) => p.id));
  const inScope = (row: { unit_id: string | null; patient_id: string | null }) => row.unit_id === unitId && row.patient_id != null && ids.has(row.patient_id);
  const names = new Map(scopedPatients.map((p) => [p.id, p.full_name]));
  const today = formatInTimeZone(now, timezone, "yyyy-MM-dd");
  const allInteractions = rows.interactions.filter(inScope);
  const allResponses = rows.responses.filter(inScope);
  const interactions = grouped(allInteractions);
  const responses = grouped(allResponses);
  const plans = grouped(rows.plans.filter(inScope));
  const diagnoses = grouped(rows.diagnoses.filter((r) => inScope(r) && r.active));
  const complications = grouped(rows.complications.filter((r) => inScope(r) && r.active));
  const measurements = grouped(rows.measurements.filter((r) => inScope(r) && r.voided_at == null && isPast(r.measured_at, now) && Date.parse(r.measured_at) >= now.getTime() - 90 * DAY_MS));
  const prescriptions = grouped(rows.prescriptions.filter((r) => inScope(r) && r.status === "active" && r.start_date <= today && (r.end_date == null || r.end_date >= today)));
  const counts = new Map(rows.nonresponse.filter(inScope).map((r) => [r.patient_id, r]));
  const consent = new Map(rows.consent.filter(inScope).map((r) => [r.patient_id, r.consent_granted === true]));
  const appointments: DashboardAppointment[] = rows.appointments.filter((r) => inScope(r) && r.consulting_room_id === roomId && r.status === "scheduled" && Date.parse(r.starts_at) >= now.getTime() && Date.parse(r.starts_at) <= now.getTime() + 90 * DAY_MS)
    .map((r) => ({ id: r.id, patientId: r.patient_id, patientName: names.get(r.patient_id)!, startsAt: r.starts_at, reason: r.reason, status: r.status, urgency: r.urgency }))
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const alerts: DashboardAlert[] = rows.alerts.filter((r) => inScope(r) && ["open", "acknowledged"].includes(r.status))
    .map((r) => ({ id: r.id, patientId: r.patient_id, patientName: names.get(r.patient_id)!, kind: r.kind, severity: r.severity, status: r.status, title: r.title, createdAt: r.created_at, updatedAt: r.updated_at }));
  const adherenceInputs: AdherenceInput[] = [];
  const patients: DashboardPatient[] = scopedPatients.map((patient) => {
    const patientInteractions = interactions.get(patient.id) ?? [];
    const patientResponses = responses.get(patient.id) ?? [];
    const patientPlans = plans.get(patient.id) ?? [];
    const input = toAdherenceInput(patientInteractions, patientResponses, now);
    adherenceInputs.push(input);
    const effectivePlanIds = new Map<string, string | null>();
    const patientMeasurements = (measurements.get(patient.id) ?? []).sort((a, b) => Date.parse(b.measured_at) - Date.parse(a.measured_at)).map((row): DashboardMeasurement => {
      const plan = measurementPlan(row, patientPlans, now, timezone);
      effectivePlanIds.set(row.id, plan?.id ?? row.monitoring_plan_id);
      return { id: row.id, kind: row.kind, context: row.measurement_context ?? "unspecified", observedAt: row.measured_at, receivedAt: row.created_at, updatedAt: row.updated_at,
        monitoringPlanId: row.monitoring_plan_id,
        glucoseMgDl: row.glucose_mg_dl, systolicMmHg: row.systolic_mm_hg, diastolicMmHg: row.diastolic_mm_hg, source: row.source, correctionReason: row.correction_reason,
        thresholds: { glucose: thresholds(plan, "glucose"), systolic: thresholds(plan, "systolic"), diastolic: thresholds(plan, "diastolic") } };
    });
    // A later reading for a different plan never erases an unresolved signal in this plan.
    // Manual readings use the uniquely resolved plan; ambiguous readings stay unassigned.
    const latest = new Map<string, DashboardMeasurement>();
    for (const measurement of patientMeasurements) {
      const key = `${effectivePlanIds.get(measurement.id) ?? "unassigned"}:${measurement.kind}:${measurement.context}`;
      if (!latest.has(key)) latest.set(key, measurement);
    }
    const evaluable: EvaluableMeasurement[] = [];
    for (const measurement of latest.values()) {
      const monitoringPlanId = effectivePlanIds.get(measurement.id) ?? null;
      if (measurement.kind === "glucose" && measurement.glucoseMgDl != null) {
        evaluable.push({ variable: "glucose", context: measurement.context as GlucoseContext, monitoringPlanId, value: measurement.glucoseMgDl, observedAt: measurement.observedAt, thresholds: measurement.thresholds.glucose });
      } else if (measurement.kind === "blood_pressure" && measurement.systolicMmHg != null && measurement.diastolicMmHg != null) {
        evaluable.push({ variable: "blood_pressure_systolic", monitoringPlanId, value: measurement.systolicMmHg, observedAt: measurement.observedAt, thresholds: measurement.thresholds.systolic });
        evaluable.push({ variable: "blood_pressure_diastolic", monitoringPlanId, value: measurement.diastolicMmHg, observedAt: measurement.observedAt, thresholds: measurement.thresholds.diastolic });
      }
    }
    const monitoringRequirements = patientPlans.flatMap((plan) => {
      const expected = lastExpectedAt(plan, now, timezone);
      if (!expected) return [];
      const variables: EvaluableMeasurement["variable"][] = plan.kind === "glucose" ? ["glucose"] : ["blood_pressure_systolic", "blood_pressure_diastolic"];
      return variables.map((variable) => ({ variable, monitoringPlanId: plan.id, context: (plan.kind === "glucose" ? plan.measurement_context ?? "unspecified" : "unspecified") as GlucoseContext, lastExpectedRequestAt: expected }));
    });
    const patientAlerts = alerts.filter((a) => a.patientId === patient.id);
    const level = ["high", "medium", "low", "unknown"].includes(patient.initial_risk) ? patient.initial_risk as RiskResult["level"] : "unknown";
    const risk = evaluateRisk({ patientId: patient.id, urgentFlagActive: patientAlerts.some((a) => a.kind === "urgent_followup"),
      initialAssessment: { level, reason: patient.initial_risk_reason, evaluatedAt: patient.updated_at, active: true },
      lastExpectedRequestAt: monitoringRequirements.map((r) => r.lastExpectedRequestAt).sort().at(-1) ?? null, monitoringRequirements }, evaluable,
      patientInteractions.filter((r) => isPast(r.response_at, now)).map((r) => ({ respondedAt: r.response_at! })),
      patientInteractions.filter((r) => r.timeout_at != null && r.response_at == null && ["delivered", "read"].includes(r.delivery_status)).map((r) => ({ occurredAt: r.timeout_at! })), now);
    const birth = patient.birth_date.split("-").map(Number);
    const current = today.split("-").map(Number);
    const age = current[0] - birth[0] - (current[1] < birth[1] || (current[1] === birth[1] && current[2] < birth[2]) ? 1 : 0);
    const responseById = new Map(patientResponses.filter((r) => isPast(r.reported_at, now)).map((r) => [r.interaction_id, r.taken]));
    const lastResponseAt = patientInteractions.filter((r) => r.expects_response && isPast(r.response_at, now) && Date.parse(r.response_at!) >= now.getTime() - 90 * DAY_MS)
      .map((r) => r.response_at!).sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
    return { id: patient.id, fullName: patient.full_name, clinicalRecord: patient.record_number ?? patient.affiliation_number ?? patient.curp ?? "Sin expediente",
      curp: patient.curp, birthDate: patient.birth_date, age, sex: patient.sex, bloodType: patient.blood_type, whatsappE164: patient.whatsapp_e164,
      diagnoses: (diagnoses.get(patient.id) ?? []).map((r) => r.description || diagnosisLabels[r.condition_code] || r.condition_code),
      diagnosisCodes: (diagnoses.get(patient.id) ?? []).map((r) => r.condition_code),
      // Sin `.get()` -> undefined -> null: "expediente sin revisar", nunca `[]` (eso confundiría con "revisado, sin nada que reportar").
      complicationCodes: complications.get(patient.id)?.map((r) => r.code) ?? null,
      consentGranted: consent.get(patient.id) ?? false, initialRiskReason: patient.initial_risk_reason, risk, adherence: computeAdherence(input),
      lastResponseAt,
      nonresponse: { historical: counts.get(patient.id)?.ever_timed_out ?? 0, pending: counts.get(patient.id)?.currently_unanswered ?? 0 },
      measurements: patientMeasurements, latestGlucose: patientMeasurements.find((m) => m.kind === "glucose") ?? null,
      latestBloodPressure: patientMeasurements.find((m) => m.kind === "blood_pressure") ?? null,
      prescriptions: (prescriptions.get(patient.id) ?? []).map((p) => ({ id: p.id, medicationId: p.medication_id, version: p.version, updatedAt: p.updated_at, medicationName: p.medications?.name ?? "Medicamento sin nombre disponible", doseText: p.dose_text,
        route: p.route, instructions: p.instructions, startDate: p.start_date, endDate: p.end_date,
        schedules: p.prescription_schedules.map((s) => ({ localTime: s.local_time, weekdays: s.weekdays })),
        adherence: computeAdherence(toAdherenceInput(patientInteractions.filter((i) => i.prescription_id === p.id), patientResponses, now)) })),
      appointments: appointments.filter((a) => a.patientId === patient.id), alerts: patientAlerts,
      complications: (rows.complications ?? []).filter((item) => inScope(item) && item.patient_id === patient.id && item.active)
        .map((item) => ({ id: item.id, code: item.code, diagnosedOn: item.diagnosed_on, notes: item.notes, updatedAt: item.updated_at })),
      interactions: [...patientInteractions].sort((a, b) => Date.parse(b.scheduled_at) - Date.parse(a.scheduled_at)).slice(0, 20).map((r) => ({ id: r.id, kind: r.kind,
        scheduledAt: r.scheduled_at, deliveredAt: r.delivered_at, responseAt: r.response_at, timeoutAt: r.timeout_at, deliveryStatus: r.delivery_status,
        replyCode: r.reply_code, medicationTaken: responseById.get(r.id) ?? null, expectsResponse: r.expects_response })) };
  }).sort((a, b) => riskOrder[a.risk.level] - riskOrder[b.risk.level] || a.fullName.localeCompare(b.fullName, "es"));
  const fasting = patients.flatMap((p) => p.measurements).filter((m) => m.kind === "glucose" && m.context === "fasting" && m.glucoseMgDl != null && Date.parse(m.observedAt) >= now.getTime() - 30 * DAY_MS);
  return { generatedAt: now.toISOString(), timezone, hasMorePatients, patients, appointments, alerts,
    metrics: { activePatients: patients.length, highRiskPatients: patients.filter((p) => p.risk.level === "high").length, activeAlerts: alerts.length,
      criticalAlerts: alerts.filter((a) => a.severity === "critical").length,
      meanFastingGlucoseMgDl: fasting.length > 0 ? Math.round(fasting.reduce((sum, m) => sum + m.glucoseMgDl!, 0) / fasting.length * 10) / 10 : null,
      fastingGlucoseCount: fasting.length,
      adherence: aggregateAdherence(adherenceInputs) } };
}
