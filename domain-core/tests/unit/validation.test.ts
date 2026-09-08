import { describe, expect, it } from 'vitest';
import { validateBloodPressureValue, validateGlucoseValue } from '../../src/lib/domain/validation';

describe('validateGlucoseValue', () => {
  it('acepta un valor de glucosa plausible', () => {
    expect(validateGlucoseValue(120)).toEqual({ valid: true });
  });

  it('rechaza un valor de glucosa imposible (demasiado alto)', () => {
    const result = validateGlucoseValue(9999);
    expect(result.valid).toBe(false);
  });

  it('rechaza un valor de glucosa imposible (negativo o cero)', () => {
    expect(validateGlucoseValue(0).valid).toBe(false);
    expect(validateGlucoseValue(-10).valid).toBe(false);
  });

  it('rechaza un valor no numérico (NaN)', () => {
    expect(validateGlucoseValue(Number('abc')).valid).toBe(false);
  });
});

describe('validateBloodPressureValue', () => {
  it('acepta una presión plausible con sistólica mayor que diastólica', () => {
    expect(validateBloodPressureValue(120, 80)).toEqual({ valid: true });
  });

  it('rechaza cuando la sistólica no es mayor que la diastólica (entrada ambigua)', () => {
    const result = validateBloodPressureValue(80, 120);
    expect(result.valid).toBe(false);
  });

  it('rechaza cuando sistólica y diastólica son iguales', () => {
    expect(validateBloodPressureValue(90, 90).valid).toBe(false);
  });

  it('rechaza valores fuera de rango de captura plausible', () => {
    expect(validateBloodPressureValue(400, 300).valid).toBe(false);
    expect(validateBloodPressureValue(10, 5).valid).toBe(false);
  });
});
