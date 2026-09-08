import { describe, expect, it } from "vitest";
import { buildDashboardData, lastExpectedAt, toAdherenceInput, type DashboardRows, type Row } from "../../src/lib/domain/dashboard";

const now = new Date("2026-09-08T18:00:00.000Z");
const scope = { unitId: "unit-a", roomId: "room-a", timezone: "America/Mexico_City" };
const patient = (overrides: Partial<Row<"patients">> = {}): Row<"patients"> => ({
  id: "patient-a", unit_id: "unit-a", consulting_room_id: "room-a", full_name: "Paciente de prueba", birth_date: "1980-09-09",
  sex: "unknown", curp: null, record_number: "EXP-1", affiliation_number: null, whatsapp_e164: "+525500001111", blood_type: null,
  initial_risk: "unknown", initial_risk_reason: null, followup_interval_days: null, bot_response_timeout_minutes: 60,
  risk_rule_config: {}, active: true, attributed_doctor_id: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", ...overrides,
});
const interaction = (overrides: Partial<Row<"bot_interactions">> = {}): Row<"bot_interactions"> => ({
  id: "interaction-a", unit_id: "unit-a", patient_id: "patient-a", kind: "medication", prescription_id: "rx-a", monitoring_plan_id: null,
  appointment_id: null, deduplication_key: "demo", reply_code: "CODE1234", scheduled_at: "2026-09-08T12:00:00Z", expects_response: true,
  provider: "demo", provider_message_id: null, delivery_status: "delivered", attempt_count: 1, claimed_at: null, accepted_at: null,
  delivered_at: "2026-09-08T12:01:00Z", read_at: null, response_deadline_at: "2026-09-08T13:01:00Z", response_at: null,
  timeout_at: "2026-09-08T13:01:00Z", failure_code: null, failure_detail: null, payload_snapshot: {},
  created_at: "2026-09-08T12:00:00Z", updated_at: "2026-09-08T12:00:00Z", ...overrides,
});
const response = (overrides: Partial<Row<"medication_responses">> = {}): Row<"medication_responses"> => ({
  id: "response-a", unit_id: "unit-a", patient_id: "patient-a", interaction_id: "interaction-a", taken: true,
  reported_at: "2026-09-08T12:30:00Z", source: "whatsapp", notes: null, correction_reason: null, attributed_doctor_id: null,
  created_at: "2026-09-08T12:30:00Z", updated_at: "2026-09-08T12:30:00Z", ...overrides,
});
const plan = (overrides: Partial<Row<"monitoring_plans">> = {}): Row<"monitoring_plans"> => ({
  id: "plan-a", unit_id: "unit-a", patient_id: "patient-a", kind: "glucose", local_time: "08:00:00", weekdays: [1, 2, 3, 4, 5, 6, 7],
  start_date: "2026-01-01", end_date: null, measurement_context: "fasting", glucose_min_mg_dl: 80, glucose_max_mg_dl: 150,
  systolic_min_mm_hg: null, systolic_max_mm_hg: null, diastolic_min_mm_hg: null, diastolic_max_mm_hg: null,
  critical_glucose_min_mg_dl: null, critical_glucose_max_mg_dl: 250, critical_systolic_min_mm_hg: null, critical_systolic_max_mm_hg: null,
  critical_diastolic_min_mm_hg: null, critical_diastolic_max_mm_hg: null, instructions: null, active: true, attributed_doctor_id: "doctor-a",
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", ...overrides,
});
const measurement = (overrides: Partial<Row<"measurements">> = {}): Row<"measurements"> => ({
  id: "reading-a", unit_id: "unit-a", patient_id: "patient-a", interaction_id: null, monitoring_plan_id: "plan-a", kind: "glucose",
  measured_at: "2026-09-08T15:00:00Z", glucose_mg_dl: 110, systolic_mm_hg: null, diastolic_mm_hg: null, measurement_context: "fasting",
  source: "manual", notes: null, correction_reason: null, voided_at: null, attributed_doctor_id: "doctor-a",
  created_at: "2026-09-08T15:05:00Z", updated_at: "2026-09-08T15:05:00Z", ...overrides,
});
const complication = (overrides: Partial<Row<"patient_complications">> = {}): Row<"patient_complications"> => ({
  id: "complication-a", unit_id: "unit-a", patient_id: "patient-a", code: "E110", diagnosed_on: "2026-01-01",
  active: true, correction_reason: null, notes: null, attributed_doctor_id: "doctor-a",
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", ...overrides,
});
const rows = (overrides: Partial<DashboardRows> = {}): DashboardRows => ({
  patients: [patient()], diagnoses: [], plans: [], measurements: [], interactions: [], responses: [], prescriptions: [],
  appointments: [], alerts: [], nonresponse: [], consent: [], complications: [], ...overrides,
});

describe("dashboard SQL adapters", () => {
  it("keeps an empty clinical record unknown with null metrics and no fabricated readings", () => {
    const data = buildDashboardData(rows(), scope, now);
    expect(data.patients[0]).toMatchObject({ age: 45, latestGlucose: null, latestBloodPressure: null, risk: { level: "unknown" }, adherence: { confirmedAdherencePct: null, responseCoveragePct: null } });
    expect(data.metrics.meanFastingGlucoseMgDl).toBeNull();
  });

  it("uses the latest valid reading for current risk and retains the older critical reading as history", () => {
    const data = buildDashboardData(rows({ plans: [plan()], measurements: [measurement({ id: "old", glucose_mg_dl: 300, measured_at: "2026-09-07T15:00:00Z" }), measurement()] }), scope, now);
    expect(data.patients[0].risk.level).toBe("low");
    expect(data.patients[0].measurements).toHaveLength(2);
    expect(data.patients[0].latestGlucose?.id).toBe("reading-a");
  });

  it("keeps a critical signal from another active plan with the same variable and context", () => {
    const data = buildDashboardData(rows({
      plans: [plan({ glucose_max_mg_dl: 250, critical_glucose_max_mg_dl: 300 }), plan({ id: "plan-b", glucose_max_mg_dl: 140, critical_glucose_max_mg_dl: 150 })],
      measurements: [measurement({ id: "plan-b-reading", monitoring_plan_id: "plan-b", glucose_mg_dl: 200, measured_at: "2026-09-08T15:00:00Z" }), measurement({ measured_at: "2026-09-08T15:10:00Z", glucose_mg_dl: 100 })],
    }), scope, now);
    expect(data.patients[0].risk).toMatchObject({ level: "high", inputsUsed: { measurementsConsidered: 2 } });
    expect(data.patients[0].latestGlucose?.monitoringPlanId).toBe("plan-a");
  });

  it("requires a recent measurement for each active plan even when variables and contexts coincide", () => {
    const data = buildDashboardData(rows({ plans: [plan(), plan({ id: "plan-b" })], measurements: [measurement()] }), scope, now);
    expect(data.patients[0].risk.level).toBe("unknown");
  });

  it("reports a descriptive mean from one actual fasting measurement and exposes its sample count", () => {
    const data = buildDashboardData(rows({ measurements: [measurement(), measurement({ id: "after-meal", measurement_context: "after_meal", glucose_mg_dl: 200 })] }), scope, now);
    expect(data.metrics).toMatchObject({ meanFastingGlucoseMgDl: 110, fastingGlucoseCount: 1 });
  });

  it("never evaluates a reading against an arbitrary or absent threshold set", () => {
    const data = buildDashboardData(rows({ plans: [plan(), plan({ id: "plan-b", glucose_max_mg_dl: 200 })], measurements: [measurement({ monitoring_plan_id: null })] }), scope, now);
    expect(data.patients[0].latestGlucose?.thresholds.glucose).toBeNull();
    expect(data.patients[0].risk.level).toBe("unknown");
  });

  it("excludes other units, other rooms, future and voided measurements", () => {
    const data = buildDashboardData(rows({ patients: [patient(), patient({ id: "other", unit_id: "unit-b" }), patient({ id: "other-room", consulting_room_id: "room-b" })], plans: [plan()], measurements: [measurement({ id: "future", measured_at: "2026-09-09T12:00:00Z", glucose_mg_dl: 300 }), measurement({ id: "void", voided_at: now.toISOString(), glucose_mg_dl: 300 }), measurement({ id: "foreign", unit_id: "unit-b", glucose_mg_dl: 300 }), measurement()] }), scope, now);
    expect(data.patients).toHaveLength(1);
    expect(data.patients[0].measurements).toHaveLength(1);
    expect(data.patients[0].risk.level).toBe("low");
  });

  it("uses timezone and weekday to determine monitoring recency without a running worker", () => {
    expect(lastExpectedAt(plan(), now, scope.timezone)).toBe("2026-09-08T14:00:00.000Z");
    expect(lastExpectedAt(plan({ weekdays: [1] }), now, scope.timezone)).toBe("2026-09-07T14:00:00.000Z");
    expect(lastExpectedAt(plan({ weekdays: [2] }), new Date("2026-09-08T12:00:00Z"), scope.timezone)).toBe("2026-09-01T14:00:00.000Z");
    expect(lastExpectedAt(plan({ start_date: "2026-09-09" }), now, scope.timezone)).toBeNull();
    const data = buildDashboardData(rows({ plans: [plan()], measurements: [measurement({ measured_at: "2026-09-07T15:00:00Z" })] }), scope, now);
    expect(data.patients[0].risk.level).toBe("unknown");
  });

  it("retains explicitly recorded initial medical priority and historical timeout counts", () => {
    const data = buildDashboardData(rows({ patients: [patient({ initial_risk: "high", initial_risk_reason: "Valoración médica registrada" })], nonresponse: [{ unit_id: "unit-a", patient_id: "patient-a", ever_timed_out: 20, currently_unanswered: 2, last_timeout_at: now.toISOString() }] }), scope, now);
    expect(data.patients[0].risk.level).toBe("high");
    expect(data.patients[0].nonresponse).toEqual({ historical: 20, pending: 2 });
  });

  it("distinguishes an unreviewed complications record (null) from a reviewed one with no active codes", () => {
    const unreviewed = buildDashboardData(rows(), scope, now);
    expect(unreviewed.patients[0].complicationCodes).toBeNull();

    const reviewedNone = buildDashboardData(rows({ complications: [complication({ code: "E119" })] }), scope, now);
    expect(reviewedNone.patients[0].complicationCodes).toEqual(["E119"]);
  });

  it("reports only active complication codes and ignores resolved/foreign ones", () => {
    const data = buildDashboardData(rows({ complications: [
      complication({ code: "E110" }),
      complication({ id: "resolved", code: "E113", active: false }),
      complication({ id: "foreign", patient_id: "other-patient", code: "E112" }),
    ] }), scope, now);
    expect(data.patients[0].complicationCodes).toEqual(["E110"]);
  });

  it("keeps Y/N/U separate, excludes future/cancelled/technical/non-medication interactions", () => {
    const input = toAdherenceInput([interaction(), interaction({ id: "future", scheduled_at: "2026-09-09T12:00:00Z" }), interaction({ id: "cancelled", delivery_status: "cancelled" }), interaction({ id: "failure", delivery_status: "failed", delivered_at: null }), interaction({ id: "appointment", kind: "appointment" }), interaction({ id: "yes" })], [response({ interaction_id: "yes" })], now);
    expect(input.concluded).toEqual([{ outcome: "unknown" }, { outcome: "yes" }]);
    expect(input.technicalExclusions).toHaveLength(1);
  });

  it("accepts manual and validated inbound responses as contact without fabricating delivery", () => {
    const undelivered = interaction({ delivered_at: null, delivery_status: "accepted", timeout_at: null });
    expect(toAdherenceInput([undelivered], [response({ source: "manual", taken: false })], now).concluded).toEqual([{ outcome: "no" }]);
    expect(toAdherenceInput([undelivered], [response()], now).concluded).toEqual([{ outcome: "yes" }]);
    expect(undelivered.delivered_at).toBeNull();
    expect(toAdherenceInput([{ ...undelivered, delivery_status: "failed" }], [response()], now).concluded).toEqual([]);
  });

  it("aggregates dose counts rather than averaging percentages of patients", () => {
    const secondInteractions = Array.from({ length: 9 }, (_, index) => interaction({ id: `b-${index}`, patient_id: "patient-b" }));
    const secondResponses = secondInteractions.map((i) => response({ id: `response-${i.id}`, interaction_id: i.id, patient_id: "patient-b", taken: false }));
    const data = buildDashboardData(rows({ patients: [patient(), patient({ id: "patient-b" })], interactions: [interaction(), ...secondInteractions], responses: [response(), ...secondResponses] }), scope, now);
    expect(data.metrics.adherence).toMatchObject({ y: 1, n: 9, u: 0, confirmedAdherencePct: 10, responseCoveragePct: 100 });
  });

  it("finds the latest valid response before limiting interaction history, including a late reply to an older request", () => {
    const recent = Array.from({ length: 21 }, (_, index) => interaction({ id: `recent-${index}`, response_at: "2026-09-08T13:00:00Z" }));
    const data = buildDashboardData(rows({ interactions: [
      ...recent,
      interaction({ id: "old-request-late-reply", scheduled_at: "2026-01-01T12:00:00Z", response_at: "2026-09-08T17:00:00Z" }),
      interaction({ id: "future-reply", response_at: "2026-09-09T17:00:00Z" }),
      interaction({ id: "informative", kind: "appointment", expects_response: false, response_at: "2026-09-08T17:50:00Z" }),
    ] }), scope, now);
    expect(data.patients[0].interactions).toHaveLength(20);
    expect(data.patients[0].interactions.some((i) => i.id === "old-request-late-reply")).toBe(false);
    expect(data.patients[0].lastResponseAt).toBe("2026-09-08T17:00:00Z");
    expect(data.patients[0].interactions[0].expectsResponse).toBe(true);
    const informative = buildDashboardData(rows({ interactions: [interaction({ kind: "appointment", expects_response: false, response_at: null })] }), scope, now);
    expect(informative.patients[0].interactions[0].expectsResponse).toBe(false);
  });
});
