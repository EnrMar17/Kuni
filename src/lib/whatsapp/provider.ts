import "server-only";
import { serverEnv } from "@/lib/env/server";

/**
 * Interfaz del proveedor de WhatsApp — sección 6 de kuni-plan-tecnico.md.
 *
 * Deliberadamente NO expone "sendMedicationReminder" ni métodos por tipo de
 * interacción: quien llama (jobs/materialize.ts + jobs/send.ts, pendientes)
 * decide el contenido a partir de `bot_interactions` y arma el mensaje; este
 * módulo solo sabe hablar con el canal. Mantiene la responsabilidad de B
 * (transporte) separada de la de armar el contenido clínico.
 *
 * Dos formas de envío, porque son operaciones distintas en WhatsApp real:
 * - `sendTemplateMessage`: plantilla aprobada (Twilio Content API). Único
 *   modo válido para iniciar contacto fuera de la ventana de sesión de 24h.
 * - `sendFreeformMessage`: texto libre. Solo válido dentro de esa ventana,
 *   es decir, en respuesta a un mensaje reciente del paciente. Quien llama
 *   es responsable de esa decisión; el proveedor no la valida.
 *
 * `dbProviderValue` es el valor que se persiste en `bot_interactions.provider`
 * / `webhook_events.provider` (incluye SMSGate/SMS8 desde 0010/0011).
 */
export interface WhatsAppProvider {
  readonly dbProviderValue: "twilio" | "meta" | "demo" | "smsgate" | "sms8";
  /** SMS no está sujeto a la ventana/plantillas de WhatsApp. */
  readonly channel: "whatsapp" | "sms";

  sendTemplateMessage(input: SendTemplateMessageInput): Promise<WhatsAppSendResult>;

  sendFreeformMessage(input: SendFreeformMessageInput): Promise<WhatsAppSendResult>;

  /**
   * Valida `X-Twilio-Signature` (o el equivalente del proveedor) contra la
   * URL pública exacta y los parámetros exactos del POST. Debe fallar
   * cerrado: cualquier duda (firma ausente, URL distinta, proveedor no
   * soporta verificación) es `false`, nunca `true` por defecto.
   */
  verifyWebhookSignature(input: VerifyWebhookSignatureInput): boolean;
}

export interface SendTemplateMessageInput {
  /** E.164, ej. "+5215512345678". Sin el prefijo "whatsapp:" — lo agrega el adaptador. */
  toE164: string;
  /** Content SID de la plantilla aprobada (empieza con "HX..." en Twilio). */
  contentSid: string;
  /** Variables nombradas de la plantilla, todas como string (requisito de Twilio Content API). */
  contentVariables: Record<string, string>;
}

export interface SendFreeformMessageInput {
  toE164: string;
  body: string;
}

export interface VerifyWebhookSignatureInput {
  /** Valor crudo del header `X-Twilio-Signature`, o null si no vino. */
  signatureHeader: string | null;
  /** URL pública exacta configurada en el panel del proveedor (incluye query string si aplica). */
  url: string;
  /** Parámetros del cuerpo `application/x-www-form-urlencoded` del POST, como los mandó el proveedor. */
  params: Record<string, string>;
}

export interface WhatsAppSendResult {
  /** ID del mensaje asignado por el proveedor (ej. Twilio MessageSid). Único por proveedor. */
  providerMessageId: string;
  /**
   * Momento en que el proveedor aceptó la solicitud de envío (HTTP 2xx).
   * NO es entrega confirmada: `delivered_at` llega después por el callback
   * de estado, procesado por el webhook (pendiente), nunca aquí.
   */
  acceptedAt: Date;
}

/**
 * Código de error estable para mapear a `bot_interactions.failure_code` sin
 * acoplar el resto del sistema al shape de excepción de cada SDK.
 */
export type WhatsAppProviderErrorCode =
  | "invalid_recipient"
  | "unauthorized"
  | "rate_limited"
  | "template_rejected"
  | "provider_unavailable"
  | "unknown";

export class WhatsAppProviderError extends Error {
  readonly code: WhatsAppProviderErrorCode;
  /**
   * Si un reintento posterior tiene sentido. `false` para errores de datos
   * (número inválido, plantilla rechazada): reintentar no lo arregla y solo
   * infla `attempt_count`. La cola (RPC `claim_due_interactions`) ya evita
   * reintentos ciegos; esto es la señal de nivel de proveedor para esa cola.
   */
  readonly retriable: boolean;
  /** Detalle crudo del proveedor, para `failure_detail`. Nunca mostrado al paciente. */
  readonly providerDetail?: string;

  constructor(
    code: WhatsAppProviderErrorCode,
    message: string,
    options: { retriable: boolean; providerDetail?: string; cause?: unknown },
  ) {
    super(message, { cause: options.cause });
    this.name = "WhatsAppProviderError";
    this.code = code;
    this.retriable = options.retriable;
    this.providerDetail = options.providerDetail;
  }
}

/**
 * Proveedor simulado: no llama a ningún servicio externo. Es el default
 * (`WHATSAPP_PROVIDER=mock`) para que nada envíe mensajes reales por
 * accidente. Persiste como `provider='demo'`, el valor que ya usa el DDL
 * para distinguir datos simulados de los recibidos por canal real.
 */
class DemoWhatsAppProvider implements WhatsAppProvider {
  readonly dbProviderValue = "demo" as const;
  readonly channel = "whatsapp" as const;

  async sendTemplateMessage(input: SendTemplateMessageInput): Promise<WhatsAppSendResult> {
    return this.fakeAccept(input.toE164);
  }

  async sendFreeformMessage(input: SendFreeformMessageInput): Promise<WhatsAppSendResult> {
    return this.fakeAccept(input.toE164);
  }

  verifyWebhookSignature(): boolean {
    // El modo demo no recibe webhooks reales de Twilio/Meta. No hay un
    // "siempre válido" seguro que ofrecer aquí sin debilitar el path real
    // si alguien reutiliza esto por error; falla cerrado explícitamente.
    return false;
  }

  private fakeAccept(toE164: string): WhatsAppSendResult {
    const providerMessageId = `demo-${crypto.randomUUID()}`;
    console.info(`[whatsapp/demo] envío simulado a ${toE164} → ${providerMessageId}`);
    return { providerMessageId, acceptedAt: new Date() };
  }
}

let cachedProvider: WhatsAppProvider | null = null;

/**
 * Selecciona según `MESSAGE_PROVIDER`, con WHATSAPP_PROVIDER como fallback
 * compatible. Los adaptadores reales se importan dinámicamente.
 */
export async function getWhatsAppProvider(): Promise<WhatsAppProvider> {
  if (cachedProvider) return cachedProvider;

  const selectedProvider = serverEnv.MESSAGE_PROVIDER ?? serverEnv.WHATSAPP_PROVIDER;
  switch (selectedProvider) {
    case "mock":
      cachedProvider = new DemoWhatsAppProvider();
      return cachedProvider;
    case "twilio": {
      const { createTwilioWhatsAppProvider } = await import("./twilio");
      cachedProvider = createTwilioWhatsAppProvider();
      return cachedProvider;
    }
    case "meta":
      throw new Error(
        "WHATSAPP_PROVIDER=meta no tiene adaptador implementado todavía (alternativa del plan, sección 6).",
      );
    case "smsgate": {
      const { createSmsGateProvider } = await import("./smsgate");
      cachedProvider = createSmsGateProvider();
      return cachedProvider;
    }
    case "sms8": {
      const { createSms8Provider } = await import("./sms8");
      cachedProvider = createSms8Provider();
      return cachedProvider;
    }
  }
}
