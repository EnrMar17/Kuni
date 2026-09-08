import { describe, expect, it } from 'vitest';
import {
  countNonResponses,
  evaluateExpirations,
  type DueInteractionCandidate,
} from '../../src/lib/jobs/expire';

const now = new Date('2026-09-08T12:00:00.000Z');

function candidate(overrides: Partial<DueInteractionCandidate> = {}): DueInteractionCandidate {
  return {
    interactionId: 'i1',
    kind: 'medication_confirm',
    expectsResponse: true,
    deliveryStatus: 'delivered',
    hasConsent: true,
    respondedAt: null,
    timeoutAt: null,
    dueAt: '2026-09-08T10:00:00.000Z', // ya venció respecto a "now"
    ...overrides,
  };
}

describe('evaluateExpirations', () => {
  it('marca timeout: entregada, esperaba respuesta, vencida, sin respuesta', () => {
    const [decision] = evaluateExpirations([candidate()], now);
    expect(decision.action).toBe('mark_timeout');
    expect(decision.countsAsNonResponse).toBe(true);
  });

  it('no cuenta dos veces una interacción con timeout_at ya registrado (idempotencia)', () => {
    const [decision] = evaluateExpirations(
      [candidate({ timeoutAt: '2026-09-08T10:05:00.000Z' })],
      now,
    );
    expect(decision.action).toBe('skip');
    expect(decision.countsAsNonResponse).toBe(false);
  });

  it('no cuenta un recordatorio informativo de cita (expectsResponse=false)', () => {
    const [decision] = evaluateExpirations(
      [candidate({ kind: 'appointment_reminder', expectsResponse: false })],
      now,
    );
    expect(decision.action).toBe('skip');
    expect(decision.countsAsNonResponse).toBe(false);
  });

  it('no cuenta un aviso de resumen (expectsResponse=false)', () => {
    const [decision] = evaluateExpirations(
      [candidate({ kind: 'summary_notice', expectsResponse: false })],
      now,
    );
    expect(decision.countsAsNonResponse).toBe(false);
  });

  it('no cuenta si ya hay una respuesta válida vinculada', () => {
    const [decision] = evaluateExpirations(
      [candidate({ respondedAt: '2026-09-08T09:00:00.000Z' })],
      now,
    );
    expect(decision.action).toBe('skip');
    expect(decision.countsAsNonResponse).toBe(false);
  });

  it.each(['failed', 'blocked_window', 'unknown'] as const)(
    'no cuenta un fallo de entrega (%s) como no-respuesta del paciente',
    (deliveryStatus) => {
      const [decision] = evaluateExpirations([candidate({ deliveryStatus })], now);
      expect(decision.action).toBe('skip');
      expect(decision.countsAsNonResponse).toBe(false);
    },
  );

  it('no cuenta si el paciente no tenía consentimiento vigente', () => {
    const [decision] = evaluateExpirations([candidate({ hasConsent: false })], now);
    expect(decision.action).toBe('skip');
    expect(decision.countsAsNonResponse).toBe(false);
  });

  it('no marca timeout si todavía no llega la fecha de vencimiento', () => {
    const [decision] = evaluateExpirations(
      [candidate({ dueAt: '2026-09-08T13:00:00.000Z' })], // después de "now"
      now,
    );
    expect(decision.action).toBe('skip');
    expect(decision.countsAsNonResponse).toBe(false);
  });

  it('respuesta tardía resuelve el pendiente sin borrar que ya venció (via respondedAt + timeoutAt distintos escenarios)', () => {
    // Escenario 1: venció y no ha respondido -> cuenta.
    const vencida = evaluateExpirations([candidate({ timeoutAt: null, respondedAt: null })], now);
    expect(vencida[0].countsAsNonResponse).toBe(true);

    // Escenario 2: después, llega la respuesta tardía y el timeout_at ya quedó registrado
    // en la BD (histórico no se borra) — el job no debe volver a marcarla.
    const yaVencidaConRespuestaTardia = evaluateExpirations(
      [candidate({ timeoutAt: '2026-09-08T10:00:00.000Z', respondedAt: '2026-09-08T11:00:00.000Z' })],
      now,
    );
    expect(yaVencidaConRespuestaTardia[0].action).toBe('skip');
    expect(yaVencidaConRespuestaTardia[0].countsAsNonResponse).toBe(false);
  });
});

describe('countNonResponses', () => {
  it('cuenta solo las decisiones mark_timeout', () => {
    const decisions = evaluateExpirations(
      [
        candidate({ interactionId: 'a' }),
        candidate({ interactionId: 'b', expectsResponse: false, kind: 'summary_notice' }),
        candidate({ interactionId: 'c', deliveryStatus: 'failed' }),
        candidate({ interactionId: 'd' }),
      ],
      now,
    );
    expect(countNonResponses(decisions)).toBe(2);
  });
});
