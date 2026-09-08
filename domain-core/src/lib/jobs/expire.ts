/**
 * Criterios de vencimiento de interacciones sin respuesta — jobs/expire.ts
 *
 * Implementa la sección 3.2 ("Reglas de no-respuesta") de
 * `persona-c-tareas.md` / `kuni-plan-tecnico.md`. Esta pieza es la lógica de
 * NEGOCIO que decide, para cada interacción "vencida" que B ya identificó
 * con sus funciones SQL (`claim_due_interactions` / `expire_due_interactions`,
 * ver sección 5 de `persona-c-tareas.md`), si esa interacción realmente
 * cuenta como no-respuesta o debe ignorarse.
 *
 * Función PURA a propósito: recibe candidatos ya extraídos de la base de
 * datos (B se encarga de la extracción real vía Supabase/Twilio) y un
 * reloj inyectable, y devuelve decisiones sin tocar red/DB — igual patrón
 * que risk.ts/adherence.ts/trend.ts, para poder probarla con datos en
 * memoria.
 *
 * Reglas clave (verbatim de la sección 3.2):
 * - Solo cuentan solicitudes con `expects_response=true`, entregadas,
 *   vencidas y sin contestación válida.
 * - `timeout_at` se registra una sola vez por interacción (idempotente).
 * - NO incrementan el contador: recordatorios informativos de cita, avisos
 *   de resumen, fallos de entrega, falta de consentimiento, bloqueo por
 *   ventana/plantilla.
 */

export type DeliveryStatus = 'delivered' | 'failed' | 'blocked_window' | 'unknown';

/**
 * Tipos de interacción relevantes para decidir si "espera respuesta" por
 * naturaleza. `expectsResponse` sigue siendo el campo de control real (lo
 * decide B al crear la interacción) — `kind` es solo para trazabilidad en
 * la razón devuelta.
 */
export type InteractionKind =
  | 'medication_confirm'
  | 'measurement_request'
  | 'appointment_reminder'
  | 'summary_notice';

export interface DueInteractionCandidate {
  interactionId: string;
  kind: InteractionKind;
  expectsResponse: boolean;
  deliveryStatus: DeliveryStatus;
  hasConsent: boolean;
  /** ISO — null si el paciente todavía no responde de forma válida. */
  respondedAt: string | null;
  /** ISO — no-null si esta interacción YA fue marcada como vencida antes (evita doble conteo). */
  timeoutAt: string | null;
  /** ISO — momento en el que se considera vencida si no hay respuesta. */
  dueAt: string;
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

  if (candidate.deliveryStatus !== 'delivered') {
    return {
      interactionId,
      action: 'skip',
      reason: `estado de entrega "${candidate.deliveryStatus}" — un fallo de entrega no es no-respuesta del paciente.`,
      countsAsNonResponse: false,
    };
  }

  if (!candidate.hasConsent) {
    return {
      interactionId,
      action: 'skip',
      reason: 'sin consentimiento vigente — no debió haberse enviado, no cuenta como no-respuesta.',
      countsAsNonResponse: false,
    };
  }

  if (new Date(candidate.dueAt).getTime() > now.getTime()) {
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
 * cada tick (de B) debe: 1) llamar `claim_due_interactions`, 2) mapear cada
 * fila al `DueInteractionCandidate` de aquí, 3) llamar `evaluateExpirations`,
 * 4) persistir `timeout_at` solo para las decisiones `mark_timeout`.
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
