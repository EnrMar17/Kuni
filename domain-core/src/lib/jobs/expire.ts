/**
 * Criterios de vencimiento de interacciones sin respuesta — jobs/expire.ts
 *
 * Refleja las reglas de no-respuesta de kuni-plan-tecnico.md sobre candidatos
 * leídos para pruebas o previsualización. La RPC expire_due_interactions
 * persiste timeout y alerta de forma atómica y devuelve un conteo, no candidatos.
 * claim_due_interactions solo reclama mensajes por enviar.
 *
 * Función PURA a propósito: recibe candidatos ya extraídos de la base de
 * datos (B se encarga de la extracción real vía Supabase/Twilio) y un
 * reloj inyectable, y devuelve decisiones sin tocar red/DB — igual patrón
 * que risk.ts/adherence.ts/trend.ts, para poder probarla con datos en
 * memoria.
 *
 * Reglas operativas:
 * - Solo cuentan solicitudes con `expects_response=true`, entregadas,
 *   vencidas y sin contestación válida.
 * - `timeout_at` se registra una sola vez por interacción (idempotente).
 * - NO incrementan el contador: recordatorios informativos de cita, avisos
 *   de resumen, fallos de entrega y bloqueo por ventana/plantilla.
 * - Consentimiento controla el envío; una revocación posterior no borra el
 *   seguimiento histórico de una solicitud ya entregada.
 */

import type { DeliveryStatus, InteractionKind } from '../../contracts/dto';
import { parseInstant } from '../domain/time';
export type { DeliveryStatus, InteractionKind } from '../../contracts/dto';

/**
 * Tipos de interacción relevantes para decidir si "espera respuesta" por
 * naturaleza. `expectsResponse` sigue siendo el campo de control real (lo
 * decide B al crear la interacción) — `kind` es solo para trazabilidad en
 * la razón devuelta.
 */
export interface DueInteractionCandidate {
  interactionId: string;
  kind: InteractionKind;
  expectsResponse: boolean;
  deliveryStatus: DeliveryStatus;
  /** @deprecated No interviene en expiración; validar consentimiento antes del envío. */
  hasConsent?: boolean;
  /** Evidencia de entrega. Un estado delivered/read sin esta fecha no acredita entrega. */
  deliveredAt: string | null;
  /** ISO — null si el paciente todavía no responde de forma válida. */
  respondedAt: string | null;
  /** ISO — no-null si esta interacción YA fue marcada como vencida antes (evita doble conteo). */
  timeoutAt: string | null;
  /** ISO — momento en el que se considera vencida si no hay respuesta. */
  dueAt: string | null;
}

export interface ExpireDecision {
  interactionId: string;
  action: 'mark_timeout' | 'skip';
  reason: string;
  /** true solo cuando esta interacción debe sumar al contador de no-respuestas (sección 3.2/3.3). */
  countsAsNonResponse: boolean;
}

function decide(candidate: DueInteractionCandidate, now: Date): ExpireDecision {
  const { interactionId } = candidate;

  if (candidate.timeoutAt != null) {
    return {
      interactionId,
      action: 'skip',
      reason: 'timeout_at ya estaba registrado — no se marca dos veces la misma interacción.',
      countsAsNonResponse: false,
    };
  }

  if (!candidate.expectsResponse) {
    return {
      interactionId,
      action: 'skip',
      reason: `"${candidate.kind}" no espera respuesta (recordatorio informativo / aviso de resumen) — no cuenta como no-respuesta.`,
      countsAsNonResponse: false,
    };
  }

  if (candidate.respondedAt != null) {
    return {
      interactionId,
      action: 'skip',
      reason: 'ya tiene una respuesta válida vinculada.',
      countsAsNonResponse: false,
    };
  }

  if (candidate.deliveryStatus !== 'delivered' && candidate.deliveryStatus !== 'read') {
    return {
      interactionId,
      action: 'skip',
      reason: `estado de entrega "${candidate.deliveryStatus}" — un fallo de entrega no es no-respuesta del paciente.`,
      countsAsNonResponse: false,
    };
  }

  const deliveredAt = candidate.deliveredAt == null ? null : parseInstant(candidate.deliveredAt);
  const dueAt = candidate.dueAt == null ? null : parseInstant(candidate.dueAt);
  if (deliveredAt == null || dueAt == null
    || !Number.isFinite(now.getTime()) || dueAt < deliveredAt) {
    return {
      interactionId,
      action: 'skip',
      reason: 'falta evidencia de entrega o una fecha de vencimiento válida posterior a la entrega.',
      countsAsNonResponse: false,
    };
  }

  if (dueAt > now.getTime()) {
    return {
      interactionId,
      action: 'skip',
      reason: 'todavía no llega su fecha de vencimiento.',
      countsAsNonResponse: false,
    };
  }

  return {
    interactionId,
    action: 'mark_timeout',
    reason: 'entregada, esperaba respuesta, venció el plazo sin contestación válida.',
    countsAsNonResponse: true,
  };
}

/**
 * Evalúa un lote de candidatos "vencidos" (ya extraídos por B de la base de
 * datos) y decide cuáles deben marcarse como timeout real. El job que corre
 * cada tick (de B) persiste vencimiento y alerta de forma atómica mediante
 * `expire_due_interactions`. Esta función pura refleja sus criterios para
 * pruebas y previsualización; no es otra escritura que compita con la RPC.
 * `claim_due_interactions` queda reservado a la cola de ENVÍO.
 */
export function evaluateExpirations(
  candidates: DueInteractionCandidate[],
  now: Date = new Date(),
): ExpireDecision[] {
  return candidates.map((c) => decide(c, now));
}

/** Azúcar sobre evaluateExpirations: cuenta cuántas de las decisiones son no-respuesta real. */
export function countNonResponses(decisions: ExpireDecision[]): number {
  return decisions.filter((d) => d.countsAsNonResponse).length;
}
