import { describe, expect, it } from 'vitest';
import { evaluateRisk } from '../../src/lib/domain/risk';
import type {
  EvaluableMeasurement,
  PatientRiskInput,
  PendingTimeout,
  RespondedInteraction,
} from '../../src/lib/domain/risk';

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

describe('evaluateRisk', () => {
  it('marca alto riesgo si el médico activó la marca de urgencia, sin importar el resto', () => {
    const result = evaluateRisk(
      basePatient({ urgentFlagActive: true }),
      [],
      [],
      [],
      now,
    );
    expect(result.level).toBe('high');
    expect(result.reasons.join(' ')).toMatch(/urgencia/i);
  });

  it('marca alto riesgo si una medición excede el límite crítico personalizado', () => {
    const measurements: EvaluableMeasurement[] = [
      {
        variable: 'glucose',
        value: 320,
        observedAt: '2026-09-08T08:00:00.000Z',
        thresholds: { criticalMax: 250 },
      },
    ];
    const result = evaluateRisk(basePatient(), measurements, [], [], now);
    expect(result.level).toBe('high');
  });

  it('marca riesgo medio si una medición está fuera del rango objetivo (pero no crítico)', () => {
    const measurements: EvaluableMeasurement[] = [
      {
        variable: 'glucose',
        value: 180,
        observedAt: '2026-09-08T08:00:00.000Z',
        thresholds: { targetMin: 70, targetMax: 140, criticalMax: 250 },
      },
    ];
    const result = evaluateRisk(basePatient(), measurements, [], [], now);
    expect(result.level).toBe('medium');
  });

  it('marca riesgo medio con 3 o más no-respuestas pendientes en los últimos 7 días', () => {
    const timeouts: PendingTimeout[] = [
      { occurredAt: '2026-09-02T09:00:00.000Z' },
      { occurredAt: '2026-09-03T09:00:00.000Z' },
      { occurredAt: '2026-09-05T09:00:00.000Z' },
    ];
    const result = evaluateRisk(basePatient(), [], [], timeouts, now);
    expect(result.level).toBe('medium');
  });

  it('NO marca riesgo medio con solo 2 no-respuestas pendientes en 7 días', () => {
    const timeouts: PendingTimeout[] = [
      { occurredAt: '2026-09-02T09:00:00.000Z' },
      { occurredAt: '2026-09-03T09:00:00.000Z' },
    ];
    const measurements: EvaluableMeasurement[] = [
      {
        variable: 'glucose',
        value: 100,
        observedAt: '2026-09-08T08:00:00.000Z',
        thresholds: { targetMin: 70, targetMax: 140 },
      },
    ];
    const responses: RespondedInteraction[] = [{ respondedAt: '2026-09-08T08:00:00.000Z' }];
    const result = evaluateRisk(basePatient(), measurements, responses, timeouts, now);
    expect(result.level).toBe('low');
  });

  it('no infiere riesgo bajo cuando no hay datos ni rangos configurados: usa "unknown"', () => {
    const result = evaluateRisk(basePatient({ lastExpectedRequestAt: null }), [], [], [], now);
    expect(result.level).toBe('unknown');
  });

  it('ignora un timeout fuera de la ventana de 7 días', () => {
    const timeouts: PendingTimeout[] = [
      { occurredAt: '2026-08-01T09:00:00.000Z' },
      { occurredAt: '2026-08-02T09:00:00.000Z' },
      { occurredAt: '2026-08-03T09:00:00.000Z' },
    ];
    const result = evaluateRisk(basePatient({ lastExpectedRequestAt: null }), [], [], timeouts, now);
    expect(result.inputsUsed.pendingTimeoutsLast7Days).toBe(0);
    expect(result.level).toBe('unknown');
  });

  it('la valoración inicial vigente con prioridad mayor prevalece sobre el cálculo automático', () => {
    const result = evaluateRisk(
      basePatient({
        initialAssessment: {
          level: 'high',
          reason: 'Antecedente de hospitalización reciente',
          evaluatedAt: '2026-09-01T00:00:00.000Z',
          active: true,
        },
      }),
      [],
      [{ respondedAt: '2026-09-08T08:00:00.000Z' }],
      [],
      now,
    );
    expect(result.level).toBe('high');
    expect(result.inputsUsed.initialAssessmentLevel).toBe('high');
  });

  it('una valoración inicial ya no vigente no debe pesar en el resultado', () => {
    const measurements: EvaluableMeasurement[] = [
      {
        variable: 'glucose',
        value: 100,
        observedAt: '2026-09-08T08:00:00.000Z',
        thresholds: { targetMin: 70, targetMax: 140 },
      },
    ];
    const responses: RespondedInteraction[] = [{ respondedAt: '2026-09-08T08:00:00.000Z' }];
    const result = evaluateRisk(
      basePatient({
        initialAssessment: {
          level: 'high',
          evaluatedAt: '2026-01-01T00:00:00.000Z',
          active: false,
        },
      }),
      measurements,
      responses,
      [],
      now,
    );
    expect(result.level).toBe('low');
  });

  it('guarda la versión de reglas y los motivos en cada evaluación', () => {
    const result = evaluateRisk(basePatient({ urgentFlagActive: true }), [], [], [], now);
    expect(result.ruleVersion).toBeTruthy();
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.evaluatedAt).toBe(now.toISOString());
  });

  it('un valor exactamente en el límite crítico NO cuenta como excedido (frontera)', () => {
    const measurements: EvaluableMeasurement[] = [
      {
        variable: 'glucose',
        value: 250,
        observedAt: '2026-09-08T08:00:00.000Z',
        thresholds: { targetMin: 70, targetMax: 140, criticalMax: 250 },
      },
    ];
    const result = evaluateRisk(basePatient(), measurements, [], [], now);
    // 250 no es > 250, así que no es "crítico excedido", pero sí sigue fuera
    // del rango objetivo (targetMax 140) -> medium, no high.
    expect(result.level).toBe('medium');
  });

  it('una sola medición crítica entre varias normales sigue disparando alto riesgo', () => {
    const measurements: EvaluableMeasurement[] = [
      {
        variable: 'blood_pressure_systolic',
        value: 118,
        observedAt: '2026-09-08T08:00:00.000Z',
        thresholds: { targetMin: 90, targetMax: 130 },
      },
      {
        variable: 'glucose',
        value: 400,
        observedAt: '2026-09-08T09:00:00.000Z',
        thresholds: { criticalMax: 250 },
      },
    ];
    const result = evaluateRisk(basePatient(), measurements, [], [], now);
    expect(result.level).toBe('high');
  });

  it('una valoración inicial vigente con prioridad MENOR que el cálculo no baja el resultado', () => {
    const measurements: EvaluableMeasurement[] = [
      {
        variable: 'glucose',
        value: 320,
        observedAt: '2026-09-08T08:00:00.000Z',
        thresholds: { criticalMax: 250 },
      },
    ];
    const result = evaluateRisk(
      basePatient({
        initialAssessment: { level: 'low', evaluatedAt: now.toISOString(), active: true },
      }),
      measurements,
      [],
      [],
      now,
    );
    expect(result.level).toBe('high');
  });

  it('una valoración inicial "unknown" vigente nunca gana sobre un cálculo real', () => {
    const measurements: EvaluableMeasurement[] = [
      {
        variable: 'glucose',
        value: 180,
        observedAt: '2026-09-08T08:00:00.000Z',
        thresholds: { targetMin: 70, targetMax: 140 },
      },
    ];
    const result = evaluateRisk(
      basePatient({
        initialAssessment: { level: 'unknown', evaluatedAt: now.toISOString(), active: true },
      }),
      measurements,
      [],
      [],
      now,
    );
    expect(result.level).toBe('medium');
  });

  it('mediciones sin rango configurado (thresholds null) no se pueden juzgar fuera de objetivo', () => {
    const measurements: EvaluableMeasurement[] = [
      {
        variable: 'glucose',
        value: 500, // dato extremo, pero sin rango configurado no hay base para juzgarlo aquí
        observedAt: '2026-09-08T08:00:00.000Z',
        thresholds: null,
      },
    ];
    const responses: RespondedInteraction[] = [{ respondedAt: '2026-09-08T08:00:00.000Z' }];
    const result = evaluateRisk(basePatient(), measurements, responses, [], now);
    expect(result.level).toBe('unknown');
  });

  it.each([null, {}, { targetMin: null, targetMax: null }, { targetMin: NaN }, { criticalMax: 300 }])(
    'no infiere bajo sin un objetivo evaluable (%j)', (thresholds) => {
      const result = evaluateRisk(basePatient(), [{
        variable: 'glucose', value: 120, observedAt: now.toISOString(), thresholds,
      }], [], [], now);
      expect(result.level).toBe('unknown');
    },
  );

  it('una respuesta de medicamento no vuelve reciente una medición vieja', () => {
    const result = evaluateRisk(basePatient(), [{
      variable: 'glucose', value: 120, observedAt: '2026-09-01T08:00:00Z', thresholds: { targetMax: 140 },
    }], [{ respondedAt: now.toISOString() }], [], now);
    expect(result.level).toBe('unknown');
  });

  it('exige ambas variables del plan aunque una tenga lectura normal', () => {
    const result = evaluateRisk(basePatient({ monitoringRequirements: [
      { variable: 'glucose', lastExpectedRequestAt: '2026-09-08T07:00:00Z' },
      { variable: 'blood_pressure_systolic', lastExpectedRequestAt: '2026-09-08T07:00:00Z' },
    ] }), [{ variable: 'glucose', value: 120, observedAt: now.toISOString(), thresholds: { targetMax: 140 } }], [], [], now);
    expect(result.level).toBe('unknown');
  });

  it('no confunde glucosa en ayuno con el contexto después de comer', () => {
    const result = evaluateRisk(basePatient({ monitoringRequirements: [
      { variable: 'glucose', context: 'after_meal', lastExpectedRequestAt: '2026-09-08T07:00:00Z' },
    ] }), [{ variable: 'glucose', context: 'fasting', value: 120, observedAt: now.toISOString(), thresholds: { targetMax: 140 } }], [], [], now);
    expect(result.level).toBe('unknown');
  });

  it('una lectura de otro plan con igual variable/contexto no acredita un plan faltante', () => {
    const patient = basePatient({ monitoringRequirements: [
      { monitoringPlanId: 'plan-a', variable: 'glucose', context: 'fasting', lastExpectedRequestAt: '2026-09-08T07:00:00Z' },
      { monitoringPlanId: 'plan-b', variable: 'glucose', context: 'fasting', lastExpectedRequestAt: '2026-09-08T07:00:00Z' },
    ] });
    const reading: EvaluableMeasurement = { monitoringPlanId: 'plan-a', variable: 'glucose', context: 'fasting', value: 120,
      observedAt: now.toISOString(), thresholds: { targetMax: 140 } };
    expect(evaluateRisk(patient, [reading], [], [], now).level).toBe('unknown');
    expect(evaluateRisk(patient, [reading, { ...reading, monitoringPlanId: 'plan-b' }], [], [], now).level).toBe('low');
  });

  it('un reporte sin plan resuelto no acredita un requisito con ID de plan', () => {
    const patient = basePatient({ monitoringRequirements: [
      { monitoringPlanId: 'plan-a', variable: 'glucose', lastExpectedRequestAt: '2026-09-08T07:00:00Z' },
    ] });
    const reading: EvaluableMeasurement = { variable: 'glucose', value: 120,
      observedAt: now.toISOString(), thresholds: { targetMax: 140 } };
    expect(evaluateRisk(patient, [reading], [], [], now).level).toBe('unknown');
  });

  it('compara instantes con zonas distintas, no el orden lexicográfico del texto', () => {
    const result = evaluateRisk(basePatient({ monitoringRequirements: [
      { variable: 'glucose', lastExpectedRequestAt: '2026-09-08T09:00:00Z' },
    ] }), [{ variable: 'glucose', value: 120, observedAt: '2026-09-08T04:00:00-06:00', thresholds: { targetMax: 140 } }], [], [], now);
    expect(result.level).toBe('low');
  });

  it.each(['fecha inválida', '2026-09-09T00:00:00Z'])(
    'no usa mediciones inválidas o futuras (%s) para señales ni suficiencia', (observedAt) => {
      const result = evaluateRisk(basePatient(), [{ variable: 'glucose', value: 500, observedAt, thresholds: { targetMax: 140, criticalMax: 250 } }], [], [], now);
      expect(result.level).toBe('unknown');
      expect(result.inputsUsed.measurementsConsidered).toBe(0);
    },
  );

  it.each(['fecha inválida', '2026-09-09T00:00:00Z'])(
    'no infiere bajo con fecha de solicitud inválida o futura (%s)', (lastExpectedRequestAt) => {
      const result = evaluateRisk(basePatient({ monitoringRequirements: [{ variable: 'glucose', lastExpectedRequestAt }] }),
        [{ variable: 'glucose', value: 120, observedAt: now.toISOString(), thresholds: { targetMax: 140 } }], [], [], now);
      expect(result.level).toBe('unknown');
    },
  );

  it('una fecha global sin planes explícitos no acredita todas las variables', () => {
    const result = evaluateRisk(basePatient({ monitoringRequirements: undefined }),
      [{ variable: 'glucose', value: 120, observedAt: now.toISOString(), thresholds: { targetMax: 140 } }], [], [], now);
    expect(result.level).toBe('unknown');
  });

  it('una señal crítica prevalece aunque otra variable del plan esté incompleta', () => {
    const result = evaluateRisk(basePatient({ monitoringRequirements: [
      { variable: 'blood_pressure_systolic', lastExpectedRequestAt: now.toISOString() },
    ] }), [{ variable: 'glucose', value: 500, observedAt: now.toISOString(), thresholds: { criticalMax: 250 } }], [], [], now);
    expect(result.level).toBe('high');
  });

  it('preserva una valoración baja explícita y vigente, con su procedencia médica', () => {
    const result = evaluateRisk(basePatient({ initialAssessment: { level: 'low', active: true, evaluatedAt: now.toISOString() } }), [], [], [], now);
    expect(result.level).toBe('low');
    expect(result.reasons.join(' ')).toMatch(/Valoración inicial médica/);
  });

  it('no usa una valoración médica futura ni timeouts futuros o inválidos', () => {
    const result = evaluateRisk(basePatient({ initialAssessment: { level: 'high', active: true, evaluatedAt: '2026-09-09T12:00:00Z' } }), [], [], [
      { occurredAt: '2026-09-09T12:00:00Z' }, { occurredAt: 'invalid' },
    ], now);
    expect(result.level).toBe('unknown');
    expect(result.inputsUsed.pendingTimeoutsLast7Days).toBe(0);
    expect(result.inputsUsed.initialAssessmentLevel).toBeNull();
  });
});
