import { describe, expect, it } from 'vitest';
import { aggregateAdherence, computeAdherence } from '../../src/lib/domain/adherence';

describe('computeAdherence', () => {
  it('devuelve null en todo cuando la cohorte está vacía ("sin datos")', () => {
    const result = computeAdherence({ concluded: [] });
    expect(result.hasData).toBe(false);
    expect(result.confirmedAdherencePct).toBeNull();
    expect(result.responseCoveragePct).toBeNull();
    expect(result.confirmedOverCohortPct).toBeNull();
  });

  it('reproduce el ejemplo del plan técnico: 1 sí, 0 no, 9 desconocidos → 100% confirmada, 10% cobertura', () => {
    const concluded = [
      { outcome: 'yes' as const },
      ...Array.from({ length: 9 }, () => ({ outcome: 'unknown' as const })),
    ];
    const result = computeAdherence({ concluded });
    expect(result.y).toBe(1);
    expect(result.n).toBe(0);
    expect(result.u).toBe(9);
    expect(result.confirmedAdherencePct).toBe(100);
    expect(result.responseCoveragePct).toBe(10);
    expect(result.confirmedOverCohortPct).toBe(10);
  });

  it('calcula adherencia confirmada solo sobre Y+N, sin contar los desconocidos', () => {
    const concluded = [
      { outcome: 'yes' as const },
      { outcome: 'yes' as const },
      { outcome: 'yes' as const },
      { outcome: 'no' as const },
      { outcome: 'unknown' as const },
    ];
    const result = computeAdherence({ concluded });
    // 3 sí, 1 no → 75% adherencia confirmada
    expect(result.confirmedAdherencePct).toBe(75);
    // (3+1)/5 = 80% cobertura
    expect(result.responseCoveragePct).toBe(80);
  });

  it('reporta las exclusiones técnicas sin que afecten el cálculo', () => {
    const result = computeAdherence({
      concluded: [{ outcome: 'yes' }],
      technicalExclusions: [{ reason: 'provider_failed' }, { reason: 'blocked_window' }],
    });
    expect(result.technicalExclusionsCount).toBe(2);
    expect(result.confirmedAdherencePct).toBe(100);
  });
});

describe('aggregateAdherence', () => {
  it('suma numeradores/denominadores de varios pacientes en vez de promediar porcentajes', () => {
    // Paciente 1: 1 de 1 (100%). Paciente 2: 0 de 1 (0%).
    // Un promedio ingenuo de porcentajes daría 50%; la suma correcta da 50%
    // también en este caso simétrico, así que probamos un caso asimétrico.
    const paciente1 = { concluded: [{ outcome: 'yes' as const }] }; // 1 solicitud, 100%
    const paciente2 = {
      concluded: Array.from({ length: 9 }, () => ({ outcome: 'no' as const })),
    }; // 9 solicitudes, 0%

    const result = aggregateAdherence([paciente1, paciente2]);
    // Promediar (100 + 0) / 2 = 50% sería incorrecto.
    // Suma correcta: 1 sí de 10 = 10%.
    expect(result.confirmedAdherencePct).toBe(10);
    expect(result.y).toBe(1);
    expect(result.n).toBe(9);
  });

  it('devuelve sin datos cuando ningún paciente tiene cohorte', () => {
    const result = aggregateAdherence([{ concluded: [] }, { concluded: [] }]);
    expect(result.hasData).toBe(false);
  });

  it('suma las exclusiones técnicas de todos los pacientes agregados', () => {
    const paciente1 = {
      concluded: [{ outcome: 'yes' as const }],
      technicalExclusions: [{ reason: 'provider_failed' }],
    };
    const paciente2 = {
      concluded: [{ outcome: 'no' as const }],
      technicalExclusions: [{ reason: 'blocked_window' }, { reason: 'no_consent' }],
    };
    const result = aggregateAdherence([paciente1, paciente2]);
    expect(result.technicalExclusionsCount).toBe(3);
  });
});

describe('computeAdherence — redondeo', () => {
  it('redondea a 1 decimal en vez de truncar (1 de 3 -> 33.3%)', () => {
    const result = computeAdherence({
      concluded: [{ outcome: 'yes' }, { outcome: 'no' }, { outcome: 'no' }],
    });
    expect(result.confirmedAdherencePct).toBe(33.3);
  });
});
