import { describe, expect, it } from 'vitest';
import { computeMean, computeTrendSlope, evaluateTrend, filterWindow } from '../../src/lib/domain/trend';

const now = new Date('2026-09-08T12:00:00.000Z');

describe('filterWindow', () => {
  it('descarta lecturas fuera de la ventana y ordena cronológicamente', () => {
    const readings = [
      { value: 3, observedAt: '2026-09-05T00:00:00.000Z' },
      { value: 1, observedAt: '2026-06-01T00:00:00.000Z' }, // fuera de ventana de 30 días
      { value: 2, observedAt: '2026-09-01T00:00:00.000Z' },
    ];
    const windowed = filterWindow(readings, 30, now);
    expect(windowed.map((r) => r.value)).toEqual([2, 3]);
  });
});

describe('computeMean', () => {
  it('devuelve null sin lecturas', () => {
    expect(computeMean([])).toBeNull();
  });

  it('promedia y redondea a 1 decimal', () => {
    const readings = [
      { value: 120, observedAt: '2026-09-01T00:00:00.000Z' },
      { value: 130, observedAt: '2026-09-02T00:00:00.000Z' },
      { value: 121, observedAt: '2026-09-03T00:00:00.000Z' },
    ];
    expect(computeMean(readings)).toBeCloseTo(123.7, 5);
  });
});

describe('computeTrendSlope', () => {
  it('devuelve 0 con menos de 3 lecturas (CONFIRMADO por el equipo de IA, pregunta 2)', () => {
    expect(computeTrendSlope([])).toBe(0);
    expect(computeTrendSlope([{ value: 120, observedAt: now.toISOString() }])).toBe(0);
    expect(
      computeTrendSlope([
        { value: 120, observedAt: '2026-09-01T00:00:00.000Z' },
        { value: 130, observedAt: '2026-09-02T00:00:00.000Z' },
      ]),
    ).toBe(0);
  });

  it('detecta una tendencia al alza clara (+2/día) con 3 o más lecturas', () => {
    const readings = [
      { value: 100, observedAt: '2026-09-01T00:00:00.000Z' },
      { value: 102, observedAt: '2026-09-02T00:00:00.000Z' },
      { value: 104, observedAt: '2026-09-03T00:00:00.000Z' },
      { value: 106, observedAt: '2026-09-04T00:00:00.000Z' },
    ];
    expect(computeTrendSlope(readings)).toBeCloseTo(2, 5);
  });

  it('detecta una tendencia a la baja', () => {
    const readings = [
      { value: 140, observedAt: '2026-09-01T00:00:00.000Z' },
      { value: 135, observedAt: '2026-09-02T00:00:00.000Z' },
      { value: 130, observedAt: '2026-09-03T00:00:00.000Z' },
    ];
    expect(computeTrendSlope(readings)).toBeCloseTo(-5, 5);
  });

  it('winsoriza a los límites configurados en vez de devolver un valor extremo', () => {
    const readings = [
      { value: 100, observedAt: '2026-09-01T00:00:00.000Z' },
      { value: 500, observedAt: '2026-09-02T00:00:00.000Z' }, // salto irreal en 1 día
      { value: 900, observedAt: '2026-09-03T00:00:00.000Z' }, // salto irreal, para llegar al mínimo de 3
    ];
    expect(computeTrendSlope(readings, 10)).toBe(10);
  });

  it('devuelve 0 si todas las lecturas caen en el mismo instante (sin dispersión en x)', () => {
    const readings = [
      { value: 100, observedAt: '2026-09-01T00:00:00.000Z' },
      { value: 200, observedAt: '2026-09-01T00:00:00.000Z' },
      { value: 300, observedAt: '2026-09-01T00:00:00.000Z' },
    ];
    expect(computeTrendSlope(readings)).toBe(0);
  });

  it('no le importa el orden de entrada (ordena internamente)', () => {
    const ordered = [
      { value: 100, observedAt: '2026-09-01T00:00:00.000Z' },
      { value: 102, observedAt: '2026-09-02T00:00:00.000Z' },
      { value: 104, observedAt: '2026-09-03T00:00:00.000Z' },
    ];
    const shuffled = [ordered[2], ordered[0], ordered[1]];
    expect(computeTrendSlope(shuffled)).toBeCloseTo(computeTrendSlope(ordered), 10);
  });
});

describe('evaluateTrend', () => {
  it('con 1 lectura: ni promedio ni tendencia son suficientes, pero el promedio sí se calcula', () => {
    const result = evaluateTrend([{ value: 120, observedAt: now.toISOString() }], {}, now);
    expect(result.sufficientForMean).toBe(false);
    expect(result.sufficientForTrend).toBe(false);
    expect(result.slope).toBe(0);
    expect(result.mean).toBe(120);
  });

  it('con 2 lecturas: promedio suficiente, tendencia todavía no (mínimos distintos, CONFIRMADO)', () => {
    const readings = [
      { value: 120, observedAt: '2026-09-07T00:00:00.000Z' },
      { value: 130, observedAt: '2026-09-08T00:00:00.000Z' },
    ];
    const result = evaluateTrend(readings, {}, now);
    expect(result.sufficientForMean).toBe(true);
    expect(result.sufficientForTrend).toBe(false);
    expect(result.slope).toBe(0);
  });

  it('combina promedio y pendiente sobre la ventana dada, con 3 lecturas ya es suficiente para tendencia', () => {
    const readings = [
      { value: 100, observedAt: '2026-08-08T00:00:00.000Z' },
      { value: 110, observedAt: '2026-09-05T00:00:00.000Z' },
      { value: 120, observedAt: '2026-09-06T00:00:00.000Z' },
      { value: 130, observedAt: '2026-09-07T00:00:00.000Z' },
    ];
    // La primera lectura (8 de agosto) cae fuera de la ventana de 30 días respecto a "now".
    const result = evaluateTrend(readings, { windowDays: 30 }, now);
    expect(result.count).toBe(3);
    expect(result.sufficientForMean).toBe(true);
    expect(result.sufficientForTrend).toBe(true);
    expect(result.slope).toBeCloseTo(10, 5);
  });

  it('tres lecturas del mismo instante no acreditan una tendencia estable', () => {
    const result = evaluateTrend([100, 200, 300].map((value) => ({ value, observedAt: now.toISOString() })), {}, now);
    expect(result.sufficientForMean).toBe(true);
    expect(result.sufficientForTrend).toBe(false);
    expect(result.slope).toBe(0);
  });

  it('usa instantes equivalentes con distinto offset para decidir dispersión temporal', () => {
    const result = evaluateTrend([
      { value: 100, observedAt: '2026-09-08T12:00:00Z' },
      { value: 110, observedAt: '2026-09-08T06:00:00-06:00' },
      { value: 120, observedAt: '2026-09-08T14:00:00+02:00' },
    ], {}, now);
    expect(result.sufficientForTrend).toBe(false);
  });

  it('excluye fechas futuras/invalidas y valores no finitos antes de contar suficiencia', () => {
    const result = evaluateTrend([
      { value: 120, observedAt: now.toISOString() },
      { value: 120, observedAt: 'invalid' },
      { value: 120, observedAt: '2026-09-09T00:00:00Z' },
      { value: NaN, observedAt: '2026-09-07T00:00:00Z' },
      { value: Infinity, observedAt: '2026-09-06T00:00:00Z' },
    ], {}, now);
    expect(result.count).toBe(1);
    expect(result.sufficientForMean).toBe(false);
    expect(result.sufficientForTrend).toBe(false);
  });

  it('incluye exactamente los extremos de la ventana de 30 días', () => {
    const cutoff = now.getTime() - 30 * 24 * 60 * 60 * 1000;
    const result = evaluateTrend([
      { value: 110, observedAt: new Date(cutoff - 1).toISOString() },
      { value: 120, observedAt: new Date(cutoff).toISOString() },
      { value: 130, observedAt: now.toISOString() },
    ], {}, now);
    expect(result.count).toBe(2);
    expect(result.mean).toBe(125);
  });
});
