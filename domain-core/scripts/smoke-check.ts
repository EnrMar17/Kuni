import assert from 'node:assert/strict';
import { evaluateRisk } from '../src/lib/domain/risk';
import type { EvaluableMeasurement, PatientRiskInput, PendingTimeout } from '../src/lib/domain/risk';
import { aggregateAdherence, computeAdherence } from '../src/lib/domain/adherence';
import { parseIncomingMessage } from '../src/lib/whatsapp/parser';
import { validateBloodPressureValue, validateGlucoseValue } from '../src/lib/domain/validation';
import { computeMean, computeTrendSlope, evaluateTrend } from '../src/lib/domain/trend';
import { parseMlResponse, requestMlPrediction } from '../src/lib/ml/client';
import { countNonResponses, evaluateExpirations } from '../src/lib/jobs/expire';
import type { DueInteractionCandidate } from '../src/lib/jobs/expire';

const now = new Date('2026-09-08T12:00:00.000Z');
function basePatient(overrides: Partial<PatientRiskInput> = {}): PatientRiskInput {
  return {
    patientId: 'p1',
    urgentFlagActive: false,
    initialAssessment: null,
    lastExpectedRequestAt: '2026-09-08T07:00:00.000Z',
    monitoringRequirements: [{ variable: 'glucose', lastExpectedRequestAt: '2026-09-08T07:00:00.000Z' }],
    ...overrides,
  };
}

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

// --- risk.ts ---
await check('urgent flag -> high', () => {
  const r = evaluateRisk(basePatient({ urgentFlagActive: true }), [], [], [], now);
  assert.equal(r.level, 'high');
});

await check('critical threshold exceeded -> high', () => {
  const m: EvaluableMeasurement[] = [
    { variable: 'glucose', value: 320, observedAt: now.toISOString(), thresholds: { criticalMax: 250 } },
  ];
  const r = evaluateRisk(basePatient(), m, [], [], now);
  assert.equal(r.level, 'high');
});

await check('out-of-target -> medium', () => {
  const m: EvaluableMeasurement[] = [
    { variable: 'glucose', value: 180, observedAt: now.toISOString(), thresholds: { targetMin: 70, targetMax: 140, criticalMax: 250 } },
  ];
  const r = evaluateRisk(basePatient(), m, [], [], now);
  assert.equal(r.level, 'medium');
});

await check('3 pending timeouts in 7 days -> medium', () => {
  const t: PendingTimeout[] = [
    { occurredAt: '2026-09-02T09:00:00.000Z' },
    { occurredAt: '2026-09-03T09:00:00.000Z' },
    { occurredAt: '2026-09-05T09:00:00.000Z' },
  ];
  const r = evaluateRisk(basePatient(), [], [], t, now);
  assert.equal(r.level, 'medium');
});

await check('2 pending timeouts + normal measurement -> low', () => {
  const t: PendingTimeout[] = [
    { occurredAt: '2026-09-02T09:00:00.000Z' },
    { occurredAt: '2026-09-03T09:00:00.000Z' },
  ];
  const m: EvaluableMeasurement[] = [
    { variable: 'glucose', value: 100, observedAt: now.toISOString(), thresholds: { targetMin: 70, targetMax: 140 } },
  ];
  const r = evaluateRisk(basePatient(), m, [{ respondedAt: now.toISOString() }], t, now);
  assert.equal(r.level, 'low');
});

await check('no data, no thresholds -> unknown (never infer low)', () => {
  const r = evaluateRisk(basePatient({ lastExpectedRequestAt: null }), [], [], [], now);
  assert.equal(r.level, 'unknown');
});

await check('active initial assessment with higher priority wins', () => {
  const r = evaluateRisk(
    basePatient({ initialAssessment: { level: 'high', evaluatedAt: now.toISOString(), active: true } }),
    [],
    [{ respondedAt: now.toISOString() }],
    [],
    now,
  );
  assert.equal(r.level, 'high');
});

await check('inactive initial assessment does not affect result', () => {
  const m: EvaluableMeasurement[] = [
    { variable: 'glucose', value: 100, observedAt: now.toISOString(), thresholds: { targetMin: 70, targetMax: 140 } },
  ];
  const r = evaluateRisk(
    basePatient({ initialAssessment: { level: 'high', evaluatedAt: now.toISOString(), active: false } }),
    m,
    [{ respondedAt: now.toISOString() }],
    [],
    now,
  );
  assert.equal(r.level, 'low');
});

// --- adherence.ts ---
await check('empty cohort -> hasData=false, nulls', () => {
  const r = computeAdherence({ concluded: [] });
  assert.equal(r.hasData, false);
  assert.equal(r.confirmedAdherencePct, null);
});

await check('plan example: 1 yes / 9 unknown -> 100% confirmed, 10% coverage', () => {
  const concluded = [{ outcome: 'yes' as const }, ...Array.from({ length: 9 }, () => ({ outcome: 'unknown' as const }))];
  const r = computeAdherence({ concluded });
  assert.equal(r.confirmedAdherencePct, 100);
  assert.equal(r.responseCoveragePct, 10);
});

await check('aggregate sums numerators/denominators, does not average percentages', () => {
  const p1 = { concluded: [{ outcome: 'yes' as const }] };
  const p2 = { concluded: Array.from({ length: 9 }, () => ({ outcome: 'no' as const })) };
  const r = aggregateAdherence([p1, p2]);
  assert.equal(r.confirmedAdherencePct, 10);
});

// --- parser.ts ---
await check('parses SI with code', () => {
  const r = parseIncomingMessage('SI A7F3');
  assert.deepEqual(r, { kind: 'medication_confirm', taken: true, referenceCode: 'A7F3' });
});

await check('parses GLUCOSA with code', () => {
  const r = parseIncomingMessage('GLUCOSA B9K2 120');
  assert.deepEqual(r, { kind: 'measurement_report', variable: 'glucose', referenceCode: 'B9K2', valueMgDl: 120, context: 'unspecified' });
});

await check('parses PRESION with code', () => {
  const r = parseIncomingMessage('PRESION C6M4 120/80');
  assert.deepEqual(r, { kind: 'measurement_report', variable: 'blood_pressure', referenceCode: 'C6M4', systolicMmHg: 120, diastolicMmHg: 80 });
});

await check('unrecognized text does not throw and is tagged unrecognized', () => {
  const r = parseIncomingMessage('me duele la cabeza');
  assert.equal(r.kind, 'unrecognized');
});

await check('does not confuse "SIempre..." with a SI command', () => {
  const r = parseIncomingMessage('SIempre tomo mis pastillas');
  assert.equal(r.kind, 'unrecognized');
});

await check('does not confuse "NOta..." with a NO command', () => {
  const r = parseIncomingMessage('NOta médica pendiente');
  assert.equal(r.kind, 'unrecognized');
});

await check('rejects a too-short reference code instead of guessing', () => {
  const r = parseIncomingMessage('SI A');
  assert.equal(r.kind, 'unrecognized');
});

await check('parses spontaneous PRESION without code', () => {
  const r = parseIncomingMessage('PRESION 130/85');
  assert.deepEqual(r, {
    kind: 'measurement_report',
    variable: 'blood_pressure',
    referenceCode: null,
    systolicMmHg: 130,
    diastolicMmHg: 85,
  });
});

await check('recognizes postprandial context', () => {
  const r = parseIncomingMessage('GLUCOSA B9K2 160 POSPRANDIAL');
  assert.ok(r.kind === 'measurement_report' && r.variable === 'glucose');
  assert.equal(r.context, 'after_meal');
});

// --- risk.ts edge cases ---
await check('boundary: value exactly at criticalMax is NOT exceeded (still medium via target)', () => {
  const m: EvaluableMeasurement[] = [
    { variable: 'glucose', value: 250, observedAt: now.toISOString(), thresholds: { targetMin: 70, targetMax: 140, criticalMax: 250 } },
  ];
  const r = evaluateRisk(basePatient(), m, [], [], now);
  assert.equal(r.level, 'medium');
});

await check('one critical measurement among normal ones still triggers high', () => {
  const m: EvaluableMeasurement[] = [
    { variable: 'blood_pressure_systolic', value: 118, observedAt: now.toISOString(), thresholds: { targetMin: 90, targetMax: 130 } },
    { variable: 'glucose', value: 400, observedAt: now.toISOString(), thresholds: { criticalMax: 250 } },
  ];
  const r = evaluateRisk(basePatient(), m, [], [], now);
  assert.equal(r.level, 'high');
});

await check('an initial assessment with LOWER rank than computed never downgrades the result', () => {
  const m: EvaluableMeasurement[] = [
    { variable: 'glucose', value: 320, observedAt: now.toISOString(), thresholds: { criticalMax: 250 } },
  ];
  const r = evaluateRisk(
    basePatient({ initialAssessment: { level: 'low', evaluatedAt: now.toISOString(), active: true } }),
    m,
    [],
    [],
    now,
  );
  assert.equal(r.level, 'high');
});

await check('an "unknown" active initial assessment never outranks a real computed level', () => {
  const m: EvaluableMeasurement[] = [
    { variable: 'glucose', value: 180, observedAt: now.toISOString(), thresholds: { targetMin: 70, targetMax: 140 } },
  ];
  const r = evaluateRisk(
    basePatient({ initialAssessment: { level: 'unknown', evaluatedAt: now.toISOString(), active: true } }),
    m,
    [],
    [],
    now,
  );
  assert.equal(r.level, 'medium');
});

// --- adherence.ts rounding ---
await check('rounds to 1 decimal instead of truncating (1 of 3 -> 33.3%)', () => {
  const r = computeAdherence({ concluded: [{ outcome: 'yes' }, { outcome: 'no' }, { outcome: 'no' }] });
  assert.equal(r.confirmedAdherencePct, 33.3);
});

await check('aggregateAdherence sums technical exclusions across patients', () => {
  const p1 = { concluded: [{ outcome: 'yes' as const }], technicalExclusions: [{ reason: 'provider_failed' }] };
  const p2 = { concluded: [{ outcome: 'no' as const }], technicalExclusions: [{ reason: 'blocked_window' }, { reason: 'no_consent' }] };
  const r = aggregateAdherence([p1, p2]);
  assert.equal(r.technicalExclusionsCount, 3);
});

// --- validation.ts ---
await check('accepts a plausible glucose value', () => {
  assert.equal(validateGlucoseValue(120).valid, true);
});

await check('rejects an impossible glucose value', () => {
  assert.equal(validateGlucoseValue(9999).valid, false);
  assert.equal(validateGlucoseValue(0).valid, false);
});

await check('accepts plausible blood pressure with systolic > diastolic', () => {
  assert.equal(validateBloodPressureValue(120, 80).valid, true);
});

await check('rejects blood pressure where systolic is not greater than diastolic', () => {
  assert.equal(validateBloodPressureValue(80, 120).valid, false);
  assert.equal(validateBloodPressureValue(90, 90).valid, false);
});

// --- trend.ts ---
await check('computeTrendSlope: 0 with fewer than 3 readings (CONFIRMED min by AI team)', () => {
  assert.equal(computeTrendSlope([]), 0);
  assert.equal(computeTrendSlope([{ value: 120, observedAt: now.toISOString() }]), 0);
  assert.equal(
    computeTrendSlope([
      { value: 120, observedAt: '2026-09-01T00:00:00.000Z' },
      { value: 130, observedAt: '2026-09-02T00:00:00.000Z' },
    ]),
    0,
  );
});

await check('computeTrendSlope: detects a clean +2/day upward trend', () => {
  const readings = [
    { value: 100, observedAt: '2026-09-01T00:00:00.000Z' },
    { value: 102, observedAt: '2026-09-02T00:00:00.000Z' },
    { value: 104, observedAt: '2026-09-03T00:00:00.000Z' },
  ];
  assert.equal(Math.abs(computeTrendSlope(readings) - 2) < 1e-9, true);
});

await check('computeTrendSlope: winsorizes to the configured bound', () => {
  const readings = [
    { value: 100, observedAt: '2026-09-01T00:00:00.000Z' },
    { value: 500, observedAt: '2026-09-02T00:00:00.000Z' },
    { value: 900, observedAt: '2026-09-03T00:00:00.000Z' },
  ];
  assert.equal(computeTrendSlope(readings, 10), 10);
});

await check('computeMean: null with no readings, rounds to 1 decimal otherwise', () => {
  assert.equal(computeMean([]), null);
  const readings = [
    { value: 120, observedAt: '2026-09-01T00:00:00.000Z' },
    { value: 130, observedAt: '2026-09-02T00:00:00.000Z' },
    { value: 121, observedAt: '2026-09-03T00:00:00.000Z' },
  ];
  assert.equal(computeMean(readings), 123.7);
});

await check('evaluateTrend: insufficient data -> slope 0, sufficientForTrend false', () => {
  const r = evaluateTrend([{ value: 120, observedAt: now.toISOString() }], {}, now);
  assert.equal(r.sufficientForTrend, false);
  assert.equal(r.slope, 0);
});

// --- ml/client.ts (contrato simplificado tras respuestas_alineacion_kuni.md) ---
await check('requestMlPrediction: no endpointUrl -> all-null result, no network call', async () => {
  let called = false;
  const fetchImpl = (async () => {
    called = true;
    throw new Error('should not be called');
  }) as unknown as typeof fetch;
  const r = await requestMlPrediction({}, { endpointUrl: null, fetchImpl });
  assert.equal(called, false);
  assert.equal(r.probabilidadEmpeoramientoFuturo, null);
  assert.equal(r.datosSuficientes, null);
});

await check('requestMlPrediction: fetch throws -> all-null result, never throws', async () => {
  const fetchImpl = (async () => {
    throw new Error('network down');
  }) as unknown as typeof fetch;
  const r = await requestMlPrediction(
    {},
    { endpointUrl: 'https://modelo.example/predict', fetchImpl },
  );
  assert.equal(r.modelVersion, null);
});

await check('requestMlPrediction: valid response (new simplified contract) parses correctly', async () => {
  const body = {
    probabilidad_empeoramiento_futuro: 0.73,
    model_version: 'prediccion_futura_v1_2026-09-08',
    datos_suficientes: { glucosa_ayuno: true, glucosa_postprandial: false, presion_arterial: true },
  };
  const fetchImpl = (async () =>
    new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;
  const r = await requestMlPrediction(
    {},
    { endpointUrl: 'https://modelo.example/predict', fetchImpl },
  );
  assert.equal(r.probabilidadEmpeoramientoFuturo, 0.73);
  assert.equal(r.modelVersion, 'prediccion_futura_v1_2026-09-08');
  assert.deepEqual(r.datosSuficientes, { glucosaAyuno: true, glucosaPostprandial: false, presionArterial: true });
});

await check('parseMlResponse: no longer exposes nivel_riesgo_actual / alerta_roja even if sent', () => {
  const r = parseMlResponse({ nivel_riesgo_actual: 'alto', alerta_roja: true, probabilidad_empeoramiento_futuro: 0.5,
    datos_suficientes: { glucosa_ayuno: true, glucosa_postprandial: false, presion_arterial: true } });
  assert.equal('nivelRiesgoActual' in r, false);
  assert.equal('alertaRoja' in r, false);
  assert.equal(r.probabilidadEmpeoramientoFuturo, 0.5);
});

await check('parseMlResponse: never throws on malformed input', () => {
  assert.doesNotThrow(() => parseMlResponse(null));
  assert.doesNotThrow(() => parseMlResponse('texto plano'));
  assert.equal(parseMlResponse(null).probabilidadEmpeoramientoFuturo, null);
});

// --- jobs/expire.ts ---
function expireCandidate(overrides: Partial<DueInteractionCandidate> = {}): DueInteractionCandidate {
  return {
    interactionId: 'i1',
    kind: 'medication',
    expectsResponse: true,
    deliveryStatus: 'delivered',
    deliveredAt: '2026-09-08T09:00:00.000Z',
    hasConsent: true,
    respondedAt: null,
    timeoutAt: null,
    dueAt: '2026-09-08T10:00:00.000Z',
    ...overrides,
  };
}

await check('evaluateExpirations: delivered + expects response + past due + no response -> mark_timeout', () => {
  const [d] = evaluateExpirations([expireCandidate()], now);
  assert.equal(d.action, 'mark_timeout');
  assert.equal(d.countsAsNonResponse, true);
});

await check('evaluateExpirations: idempotent — does not double-count an already-timed-out interaction', () => {
  const [d] = evaluateExpirations([expireCandidate({ timeoutAt: '2026-09-08T10:05:00.000Z' })], now);
  assert.equal(d.action, 'skip');
  assert.equal(d.countsAsNonResponse, false);
});

await check('evaluateExpirations: informational reminders never count', () => {
  const [d] = evaluateExpirations(
    [expireCandidate({ kind: 'appointment', expectsResponse: false })],
    now,
  );
  assert.equal(d.countsAsNonResponse, false);
});

await check('evaluateExpirations: delivery failures never count as patient non-response', () => {
  const [d] = evaluateExpirations([expireCandidate({ deliveryStatus: 'failed' })], now);
  assert.equal(d.countsAsNonResponse, false);
});

await check('evaluateExpirations: consent revoked after delivery preserves follow-up', () => {
  const [d] = evaluateExpirations([expireCandidate({ hasConsent: false })], now);
  assert.equal(d.countsAsNonResponse, true);
});

await check('evaluateExpirations: not yet due -> skip', () => {
  const [d] = evaluateExpirations([expireCandidate({ dueAt: '2026-09-08T13:00:00.000Z' })], now);
  assert.equal(d.action, 'skip');
});

await check('countNonResponses: counts only mark_timeout decisions', () => {
  const decisions = evaluateExpirations(
    [
      expireCandidate({ interactionId: 'a' }),
      expireCandidate({ interactionId: 'b', expectsResponse: false, kind: 'nonresponse_summary' }),
      expireCandidate({ interactionId: 'c', deliveryStatus: 'failed' }),
      expireCandidate({ interactionId: 'd' }),
    ],
    now,
  );
  assert.equal(countNonResponses(decisions), 2);
});

console.log(`\n${passed} checks passed.`);
