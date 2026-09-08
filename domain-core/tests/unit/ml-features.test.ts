import { describe, expect, it } from 'vitest';
import { buildMlFeatureVector, type MlFeatureInput } from '../../src/lib/ml/features';
import type { AdherenceResult } from '../../src/lib/domain/adherence';
import type { Reading } from '../../src/lib/domain/trend';

const NOW = new Date('2026-09-08T12:00:00Z');

/** n lecturas separadas un día, empezando `daysAgo` días antes de NOW. */
function series(values: number[], daysAgo = 10): Reading[] {
  return values.map((value, index) => ({
    value,
    observedAt: new Date(NOW.getTime() - (daysAgo - index) * 24 * 60 * 60 * 1000).toISOString(),
  }));
}

function adherence(pct: number | null): AdherenceResult {
  return {
    y: 0,
    n: 0,
    u: 0,
    confirmedAdherencePct: pct,
    responseCoveragePct: null,
    confirmedOverCohortPct: null,
    technicalExclusionsCount: 0,
    hasData: pct != null,
  };
}

function input(overrides: Partial<MlFeatureInput> = {}): MlFeatureInput {
  return {
    age: 58,
    diagnoses: ['diabetes_type_2', 'hypertension'],
    fastingGlucose: series([150, 160, 170]),
    postprandialGlucose: series([200, 210, 220]),
    systolic: series([140, 145, 150]),
    diastolic: series([90, 92, 94]),
    antidiabeticAdherence: adherence(35),
    antihypertensiveAdherence: adherence(40),
    complications: { codes: ['E110', 'E113'] },
    ...overrides,
  };
}

describe('buildMlFeatureVector — forma del contrato', () => {
  it('produce exactamente las 17 variables de FEATURE_COLS más datos_suficientes', () => {
    const { vector } = buildMlFeatureVector(input(), { now: NOW });
    expect(Object.keys(vector).sort()).toEqual(
      [
        'adherencia_antidiabeticos',
        'adherencia_antihipertensivos',
        'age_at_wx',
        'comorbido_dm_has',
        'complicacion_grave_dm',
        'datos_suficientes',
        'diabetes_dx',
        'fn_ta_diastolic_mean',
        'fn_ta_systolic_mean',
        'glucosa_empeorando',
        'hypertension_dx',
        'in_glucose_mean',
        'num_complicaciones_dm',
        'pa_empeorando',
        'tendencia_diastolica',
        'tendencia_glucosa',
        'tendencia_sistolica',
        'tiene_complicacion_dm',
      ].sort(),
    );
  });

  it('sin brechas cuando los 17 salen de datos observados', () => {
    const { gaps } = buildMlFeatureVector(input(), { now: NOW });
    expect(gaps).toEqual([]);
  });
});

describe('buildMlFeatureVector — diagnósticos', () => {
  it('cualquier código de diabetes del DDL activa diabetes_dx', () => {
    for (const code of ['diabetes_type_1', 'diabetes_type_2', 'diabetes_gestational', 'diabetes_other']) {
      const { vector } = buildMlFeatureVector(input({ diagnoses: [code] }), { now: NOW });
      expect(vector.diabetes_dx).toBe(1);
      expect(vector.hypertension_dx).toBe(0);
      expect(vector.comorbido_dm_has).toBe(0);
    }
  });

  it('comorbido_dm_has solo con ambas condiciones', () => {
    expect(buildMlFeatureVector(input({ diagnoses: ['diabetes_type_2', 'hypertension'] }), { now: NOW }).vector.comorbido_dm_has).toBe(1);
    expect(buildMlFeatureVector(input({ diagnoses: ['hypertension'] }), { now: NOW }).vector.comorbido_dm_has).toBe(0);
  });

  it('un diagnóstico "other" no se cuenta como diabetes ni como hipertensión', () => {
    const { vector } = buildMlFeatureVector(input({ diagnoses: ['other'] }), { now: NOW });
    expect(vector.diabetes_dx).toBe(0);
    expect(vector.hypertension_dx).toBe(0);
  });
});

describe('buildMlFeatureVector — promedios y suficiencia', () => {
  it('una sola lectura no es un promedio: se manda null y la suficiencia queda en false', () => {
    const { vector } = buildMlFeatureVector(
      input({ fastingGlucose: series([180], 2), systolic: series([150], 2), diastolic: series([95], 2) }),
      { now: NOW },
    );
    expect(vector.in_glucose_mean).toBeNull();
    expect(vector.fn_ta_systolic_mean).toBeNull();
    expect(vector.datos_suficientes.glucosa_ayuno).toBe(false);
    expect(vector.datos_suficientes.presion_arterial).toBe(false);
  });

  it('la presión exige ambos componentes: una sistólica sola no acredita suficiencia', () => {
    const { vector } = buildMlFeatureVector(input({ diastolic: series([90], 2) }), { now: NOW });
    expect(vector.datos_suficientes.presion_arterial).toBe(false);
  });

  it('lecturas fuera de la ventana de 30 días no cuentan', () => {
    const viejas = series([150, 160, 170], 200);
    const { vector } = buildMlFeatureVector(input({ fastingGlucose: viejas }), { now: NOW });
    expect(vector.in_glucose_mean).toBeNull();
    expect(vector.tendencia_glucosa).toBe(0);
    expect(vector.datos_suficientes.glucosa_ayuno).toBe(false);
  });

  it('la glucosa posprandial solo alimenta suficiencia, nunca in_glucose_mean', () => {
    const { vector } = buildMlFeatureVector(
      input({ fastingGlucose: [], postprandialGlucose: series([200, 210, 220]) }),
      { now: NOW },
    );
    expect(vector.in_glucose_mean).toBeNull();
    expect(vector.datos_suficientes.glucosa_ayuno).toBe(false);
    expect(vector.datos_suficientes.glucosa_postprandial).toBe(true);
  });
});

describe('buildMlFeatureVector — banderas de empeoramiento', () => {
  it('pa_empeorando usa el umbral 1.0 mmHg/día de construir_features()', () => {
    // +5 mmHg/día: claramente por encima del umbral.
    const subiendo = buildMlFeatureVector(input({ systolic: series([130, 135, 140]) }), { now: NOW });
    expect(subiendo.vector.tendencia_sistolica).toBeCloseTo(5, 5);
    expect(subiendo.vector.pa_empeorando).toBe(1);

    // Estable: pendiente 0, no empeora.
    const estable = buildMlFeatureVector(input({ systolic: series([140, 140, 140]) }), { now: NOW });
    expect(estable.vector.tendencia_sistolica).toBe(0);
    expect(estable.vector.pa_empeorando).toBe(0);
  });

  it('glucosa_empeorando usa el umbral 2.0 mg/dL/día', () => {
    const leve = buildMlFeatureVector(input({ fastingGlucose: series([150, 151, 152]) }), { now: NOW });
    expect(leve.vector.tendencia_glucosa).toBeCloseTo(1, 5);
    expect(leve.vector.glucosa_empeorando).toBe(0);

    const fuerte = buildMlFeatureVector(input({ fastingGlucose: series([150, 160, 170]) }), { now: NOW });
    expect(fuerte.vector.glucosa_empeorando).toBe(1);
  });

  it('sin lecturas suficientes la pendiente es 0 y no se declara empeoramiento', () => {
    const { vector } = buildMlFeatureVector(input({ systolic: [], fastingGlucose: [] }), { now: NOW });
    expect(vector.tendencia_sistolica).toBe(0);
    expect(vector.pa_empeorando).toBe(0);
    expect(vector.glucosa_empeorando).toBe(0);
  });
});

describe('buildMlFeatureVector — adherencia en escala 0-1', () => {
  it('convierte el porcentaje de computeAdherence a la escala del modelo', () => {
    const { vector } = buildMlFeatureVector(input({ antidiabeticAdherence: adherence(35) }), { now: NOW });
    expect(vector.adherencia_antidiabeticos).toBeCloseTo(0.35, 5);
  });

  it('denominador cero ("sin datos") NO es adherencia cero: se declara como brecha', () => {
    const { vector, gaps } = buildMlFeatureVector(input({ antidiabeticAdherence: adherence(null) }), { now: NOW });
    expect(vector.adherencia_antidiabeticos).toBe(0);
    expect(gaps.map((gap) => gap.feature)).toContain('adherencia_antidiabeticos');
    expect(gaps.find((gap) => gap.feature === 'adherencia_antidiabeticos')?.reason).toMatch(/no tomó|sin dato/i);
  });

  it('sin cohorte por clase terapéutica se declaran ambas brechas', () => {
    const { gaps } = buildMlFeatureVector(
      input({ antidiabeticAdherence: null, antihypertensiveAdherence: null }),
      { now: NOW },
    );
    expect(gaps.map((gap) => gap.feature)).toEqual(
      expect.arrayContaining(['adherencia_antidiabeticos', 'adherencia_antihipertensivos']),
    );
  });

  it('el valor de relleno es configurable, por si se decide no reproducir el fillna(0)', () => {
    const { vector } = buildMlFeatureVector(input({ antidiabeticAdherence: null }), { now: NOW, unknownAdherenceValue: 0.5 });
    expect(vector.adherencia_antidiabeticos).toBe(0.5);
  });
});

describe('buildMlFeatureVector — complicaciones RF28', () => {
  it('cuenta códigos vigentes distintos y detecta grave con E110/E111/E112', () => {
    const { vector, gaps } = buildMlFeatureVector(input({ complications: { codes: ['E110', 'E113', 'E113'] } }), { now: NOW });
    expect(vector.num_complicaciones_dm).toBe(2);
    expect(vector.tiene_complicacion_dm).toBe(1);
    expect(vector.complicacion_grave_dm).toBe(1);
    expect(gaps).toEqual([]);
  });

  it('complicaciones no graves no activan complicacion_grave_dm', () => {
    const { vector } = buildMlFeatureVector(input({ complications: { codes: ['E115', 'E117'] } }), { now: NOW });
    expect(vector.num_complicaciones_dm).toBe(2);
    expect(vector.complicacion_grave_dm).toBe(0);
  });

  it('E119 es captura explícita de "ninguna": cuenta como revisión, no como complicación', () => {
    const { vector, gaps } = buildMlFeatureVector(input({ complications: { codes: ['E119'] } }), { now: NOW });
    expect(vector.num_complicaciones_dm).toBe(0);
    expect(vector.tiene_complicacion_dm).toBe(0);
    // Hubo revisión médica: no es una brecha.
    expect(gaps).toEqual([]);
  });

  it('un expediente SIN revisión no equivale a E119: se envía 0 pero se declara la brecha', () => {
    const { vector, gaps } = buildMlFeatureVector(input({ complications: null }), { now: NOW });
    expect(vector.num_complicaciones_dm).toBe(0);
    expect(vector.tiene_complicacion_dm).toBe(0);
    expect(vector.complicacion_grave_dm).toBe(0);
    expect(gaps.map((gap) => gap.feature)).toEqual(
      expect.arrayContaining(['num_complicaciones_dm', 'tiene_complicacion_dm', 'complicacion_grave_dm']),
    );
    expect(gaps.find((gap) => gap.feature === 'num_complicaciones_dm')?.reason).toMatch(/RF28/);
  });

  it('un código fuera del catálogo del prototipo se ignora, no se cuenta a ciegas', () => {
    const { vector } = buildMlFeatureVector(input({ complications: { codes: ['E999', 'I10'] } }), { now: NOW });
    expect(vector.num_complicaciones_dm).toBe(0);
  });
});

describe('buildMlFeatureVector — bordes', () => {
  it('la edad viaja como entero no negativo', () => {
    expect(buildMlFeatureVector(input({ age: 58.7 }), { now: NOW }).vector.age_at_wx).toBe(58);
    expect(buildMlFeatureVector(input({ age: -3 }), { now: NOW }).vector.age_at_wx).toBe(0);
  });

  it('un reloj inválido falla explícito en vez de producir un vector de NaN', () => {
    expect(() => buildMlFeatureVector(input(), { now: new Date('no soy fecha') })).toThrow();
  });

  it('un paciente sin ninguna lectura produce un vector válido, con toda la suficiencia en false', () => {
    const { vector } = buildMlFeatureVector(
      input({ fastingGlucose: [], postprandialGlucose: [], systolic: [], diastolic: [] }),
      { now: NOW },
    );
    expect(vector.datos_suficientes).toEqual({ glucosa_ayuno: false, glucosa_postprandial: false, presion_arterial: false });
    expect(vector.in_glucose_mean).toBeNull();
  });
});
