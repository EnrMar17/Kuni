import "server-only";
import { serverEnv } from "@/lib/env/server";
import {
  WhatsAppProviderError,
  type SendFreeformMessageInput,
  type WhatsAppProvider,
  type WhatsAppProviderErrorCode,
  type WhatsAppSendResult,
} from "./provider";

type SmsGateResponse = { id?: unknown };

/**
 * Adaptador de salida para capcom6/android-sms-gateway (SMSGate).
 * El nombre de la interfaz se conserva para no romper el transporte actual;
 * `channel="sms"` permite que el job omita únicamente las reglas exclusivas
 * de WhatsApp (ventana de 24 h y Content SID).
 */
class SmsGateProvider implements WhatsAppProvider {
  readonly dbProviderValue = "smsgate" as const;
  readonly channel = "sms" as const;

  constructor(
    private readonly baseUrl: string,
    private readonly authorization: string,
    private readonly options: {
      deviceId?: string;
      simNumber?: number;
      ttl: number;
      timeoutMs: number;
    },
  ) {}

  async sendTemplateMessage(): Promise<WhatsAppSendResult> {
    throw new WhatsAppProviderError(
      "template_rejected",
      "SMSGate envía SMS de texto y no acepta plantillas de WhatsApp.",
      { retriable: false, providerDetail: "smsgate:unsupported_template" },
    );
  }

  async sendFreeformMessage(input: SendFreeformMessageInput): Promise<WhatsAppSendResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/messages`, {
        method: "POST",
        headers: {
          Authorization: this.authorization,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          phoneNumbers: [input.toE164],
          textMessage: { text: input.body },
          ...(this.options.deviceId ? { deviceId: this.options.deviceId } : {}),
          ...(this.options.simNumber ? { simNumber: this.options.simNumber } : {}),
          ttl: this.options.ttl,
          withDeliveryReport: true,
        }),
        cache: "no-store",
        signal: controller.signal,
      });
    } catch (error) {
      throw toSmsGateError(error);
    } finally {
      clearTimeout(timeout);
    }

    const raw = await response.text();
    let payload: SmsGateResponse = {};
    if (raw) {
      try {
        payload = JSON.parse(raw) as SmsGateResponse;
      } catch {
        if (response.ok) {
          throw new WhatsAppProviderError("unknown", "SMSGate devolvió JSON inválido.", {
            retriable: true,
            providerDetail: `smsgate:http_${response.status}`,
          });
        }
      }
    }

    if (!response.ok) throw toSmsGateHttpError(response.status);
    if (typeof payload.id !== "string" || !payload.id) {
      throw new WhatsAppProviderError("unknown", "SMSGate aceptó el envío sin devolver un id.", {
        retriable: true,
        providerDetail: `smsgate:http_${response.status}`,
      });
    }
    return { providerMessageId: payload.id, acceptedAt: new Date() };
  }

  verifyWebhookSignature(): boolean {
    // Los webhooks SMS usan HMAC sobre cuerpo crudo + timestamp y tienen una
    // ruta separada pendiente; jamás aceptar la firma Twilio por esta vía.
    return false;
  }
}

function toSmsGateHttpError(status: number): WhatsAppProviderError {
  let code: WhatsAppProviderErrorCode = "unknown";
  let retriable = false;
  if (status === 400 || status === 422) code = "invalid_recipient";
  else if (status === 401 || status === 403) code = "unauthorized";
  else if (status === 429) { code = "rate_limited"; retriable = true; }
  else if (status >= 500) { code = "provider_unavailable"; retriable = true; }
  return new WhatsAppProviderError(code, `SMSGate rechazó el envío (HTTP ${status}).`, {
    retriable,
    // No persistir el cuerpo de error: algunos gateways repiten destinatario
    // o contenido, y failure_detail no debe convertirse en otro almacén de PHI.
    providerDetail: `smsgate:http_${status}`,
  });
}

function toSmsGateError(error: unknown): WhatsAppProviderError {
  const aborted = error instanceof Error && error.name === "AbortError";
  return new WhatsAppProviderError(
    "provider_unavailable",
    aborted ? "SMSGate excedió el tiempo de espera." : "No se pudo conectar con SMSGate.",
    { retriable: true, providerDetail: aborted ? "smsgate:timeout" : "smsgate:network", cause: error },
  );
}

export function createSmsGateProvider(): WhatsAppProvider {
  const {
    SMS_GATEWAY_BASE_URL,
    SMS_GATEWAY_TOKEN,
    SMS_GATEWAY_USERNAME,
    SMS_GATEWAY_PASSWORD,
    SMS_GATEWAY_DEVICE_ID,
    SMS_GATEWAY_SIM_NUMBER,
    SMS_GATEWAY_TTL_SECONDS,
    SMS_GATEWAY_TIMEOUT_MS,
  } = serverEnv;
  if (!SMS_GATEWAY_BASE_URL) throw new Error("Falta SMS_GATEWAY_BASE_URL pese a MESSAGE_PROVIDER=smsgate.");
  const authorization = SMS_GATEWAY_TOKEN
    ? `Bearer ${SMS_GATEWAY_TOKEN}`
    : SMS_GATEWAY_USERNAME && SMS_GATEWAY_PASSWORD
      ? `Basic ${Buffer.from(`${SMS_GATEWAY_USERNAME}:${SMS_GATEWAY_PASSWORD}`, "utf8").toString("base64")}`
      : null;
  if (!authorization) throw new Error("Faltan credenciales de SMSGate pese a MESSAGE_PROVIDER=smsgate.");
  return new SmsGateProvider(SMS_GATEWAY_BASE_URL.replace(/\/+$/, ""), authorization, {
    deviceId: SMS_GATEWAY_DEVICE_ID,
    simNumber: SMS_GATEWAY_SIM_NUMBER,
    ttl: SMS_GATEWAY_TTL_SECONDS,
    timeoutMs: SMS_GATEWAY_TIMEOUT_MS,
  });
}
