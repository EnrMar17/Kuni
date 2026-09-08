/**
 * Lógica pura del callback de estado de WhatsApp (`StatusCallback` de
 * Twilio) — sección "Entrega" de kuni-plan-tecnico.md.
 *
 * Deliberadamente sin I/O: la Route Handler (`api/webhooks/whatsapp/status`)
 * hace la consulta/patch a Supabase; este módulo solo decide QUÉ patch
 * aplicar, para poder probar la progresión de estados sin base de datos.
 *
 * Reglas del plan que esto implementa:
 * - "Aceptado por la API no significa entregado."
 * - "Los callbacks pueden llegar desordenados: conservar progresión y no
 *   sobrescribir un resultado final con un evento anterior."
 * - "Un read tardío no debe regresar una respuesta a pendiente."
 * - response_deadline_at nace de la ENTREGA confirmada, no del envío.
 */

export type DeliveryStatus =
  | "queued"
  | "sending"
  | "accepted"
  | "delivered"
  | "read"
  | "failed"
  | "cancelled"
  | "blocked_window"
  | "blocked_template"
  | "unknown";

/**
 * Valor crudo de `MessageStatus` que manda Twilio en el callback. No
 * incluye 'sending'/'blocked_*'/'cancelled'/'unknown': esos los pone la
 * propia app antes de enviar o en el worker de envío (jobs/send.ts,
 * pendiente), nunca llegan por este webhook.
 */
export type TwilioMessageStatus = "queued" | "sending" | "sent" | "delivered" | "undelivered" | "failed" | "read";

const TWILIO_STATUS_TO_DELIVERY_STATUS: Record<TwilioMessageStatus, DeliveryStatus> = {
  queued: "queued",
  sending: "sending",
  // Twilio confirma que lo mandó al proveedor de WhatsApp; todavía no es entrega.
  sent: "accepted",
  delivered: "delivered",
  read: "read",
  // El DDL no distingue 'undelivered' de 'failed'; ambos son fallo terminal de entrega.
  undelivered: "failed",
  failed: "failed",
};

// Progresión esperada de un envío que sí llega a buen puerto. Los terminales
// (failed/cancelled/blocked_*/unknown) no tienen rango: una vez alcanzados,
// ningún evento posterior los mueve (ver isTerminal).
const PROGRESSION_RANK: Partial<Record<DeliveryStatus, number>> = {
  queued: 0,
  sending: 1,
  accepted: 2,
  delivered: 3,
  read: 4,
};

const TERMINAL_STATUSES: ReadonlySet<DeliveryStatus> = new Set([
  "failed",
  "cancelled",
  "blocked_window",
  "blocked_template",
  "unknown",
]);

export interface BotInteractionStatusState {
  deliveryStatus: DeliveryStatus;
  expectsResponse: boolean;
  /** null si esta interacción todavía no tiene entrega confirmada. */
  deliveredAt: string | null;
  /** null si `expects_response` es true pero el plazo aún no se calculó. */
  responseDeadlineAt: string | null;
  /** Minutos configurados en el paciente (`bot_response_timeout_minutes`). Solo importa si `deliveredAt` es null. */
  botResponseTimeoutMinutes: number;
}

export interface StatusCallbackEvent {
  twilioStatus: TwilioMessageStatus;
  errorCode: string | null;
  errorMessage: string | null;
  /** Reloj del servidor al recibir el callback — Twilio no manda su propio timestamp del evento. */
  receivedAt: Date;
}

export interface BotInteractionPatch {
  delivery_status: DeliveryStatus;
  accepted_at?: string;
  delivered_at?: string;
  read_at?: string;
  response_deadline_at?: string;
  failure_code?: string | null;
  failure_detail?: string | null;
}

function isTerminal(status: DeliveryStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

/**
 * Decide el patch a aplicar a `bot_interactions`, o `null` si el evento no
 * debe cambiar nada (fuera de orden, o la interacción ya está en un estado
 * terminal que un callback posterior no puede reabrir).
 */
export function computeStatusPatch(
  current: BotInteractionStatusState,
  event: StatusCallbackEvent,
): BotInteractionPatch | null {
  const mapped = TWILIO_STATUS_TO_DELIVERY_STATUS[event.twilioStatus];

  // Una vez que el envío terminó bien (delivered/read) o mal (failed y
  // afines), ningún callback posterior lo mueve. Cubre explícitamente el
  // caso "delivered ya confirmado, luego llega un 'failed' fuera de orden"
  // y "ya está failed, llega un 'sent' reintentado tarde".
  if (isTerminal(current.deliveryStatus) || current.deliveryStatus === "read") {
    return null;
  }

  const currentRank = PROGRESSION_RANK[current.deliveryStatus] ?? 0;
  const deliveredRank = PROGRESSION_RANK.delivered as number;

  if (mapped === "failed") {
    // Una entrega ya confirmada no puede "fallar" retroactivamente por un
    // callback fuera de orden — la entrega real precede a cualquier error
    // de transporte tardío que Twilio reporte después.
    if (currentRank >= deliveredRank) return null;
    return {
      delivery_status: "failed",
      failure_code: event.errorCode,
      failure_detail: event.errorMessage,
    };
  }

  const newRank = PROGRESSION_RANK[mapped];
  if (newRank === undefined || newRank < currentRank) {
    // Fuera de orden hacia atrás (ej. 'sending' llega después de 'delivered'
    // por reintento de red de Twilio): no retrocede el estado.
    return null;
  }

  const patch: BotInteractionPatch = { delivery_status: mapped };

  if (mapped === "accepted" && !current.deliveredAt) {
    patch.accepted_at = event.receivedAt.toISOString();
  }

  if (mapped === "delivered" || mapped === "read") {
    // Primera entrega confirmada: fija delivered_at UNA vez (no se mueve en
    // eventos futuros) y, si la interacción espera respuesta, calcula el
    // plazo a partir de ESTE instante — nunca del envío ni de la solicitud.
    if (!current.deliveredAt) {
      patch.delivered_at = event.receivedAt.toISOString();
      if (current.expectsResponse && !current.responseDeadlineAt) {
        patch.response_deadline_at = addMinutes(
          event.receivedAt,
          current.botResponseTimeoutMinutes,
        ).toISOString();
      }
    }
  }

  if (mapped === "read") {
    patch.read_at = event.receivedAt.toISOString();
  }

  return patch;
}
