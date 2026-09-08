import { describe, expect, it } from 'vitest';
import { parseInstant } from '../../src/lib/domain/time';

describe('instantes absolutos del dominio', () => {
  it.each(['2026-02-30T12:00:00Z', '2026-02-29T12:00:00Z', '2026-09-08T24:00:00Z',
    '2026-09-08T12:00:00', '2026-09-08', '2026-09-08T12:00:00+24:00', 'invalid'])(
    'rechaza fechas imposibles o sin zona (%s)', (value) => expect(parseInstant(value)).toBeNull(),
  );

  it('reconoce año bisiesto y distintas zonas del mismo instante', () => {
    expect(parseInstant('2024-02-29T12:00:00Z')).toBe(Date.parse('2024-02-29T12:00:00Z'));
    expect(parseInstant('2026-09-08T06:00:00-06:00')).toBe(parseInstant('2026-09-08T12:00:00Z'));
  });
});
