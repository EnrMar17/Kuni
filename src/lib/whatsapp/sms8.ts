import "server-only";
import { serverEnv } from "@/lib/env/server";
import {
  WhatsAppProviderError,
  type SendFreeformMessageInput,
  type WhatsAppProvider,
  type WhatsAppProviderErrorCode,
  type WhatsAppSendResult,
} from "./provider";

type Sms8Response = {
  success?: unknown;
  data?: {
    messages?: Array<{ ID?: unknown; groupID?: unknown }>;
  } | null;
};

/**
 * Adaptador de salida para SMS8.io. En iPhone, "aceptado" sólo significa
 * que SMS8 puso el mensaje en la cola del dispositivo: iOS todavía muestra
 * el compositor y el operador debe elegir la SIM y pulsar Enviar.
 */
class Sms8Provider implements WhatsAppProvider {
  readonly dbProviderValue = "sms8" as const;
  readonly channel = "sms" as const;

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly options: { device?: string; timeoutMs: number },
  ) {}

  async sendTemplateMessage(): Promise<WhatsAppSendResult> {
    throw new WhatsAppProviderError(
      "template_rejected",
      "SMS8 envía SMS de texto y no acepta plantillas de WhatsApp.",
      { retriable: false, providerDetail: "sms8:unsupported_template" },
    );
  }

  async sendFreeformMessage(input: SendFreeformMessageInput): Promise<WhatsAppSendResult> {
    const form = new URLSearchParams({
      key: this.apiKey,
      number: input.toE164,
      message: input.body,
      type: "sms",
    });
    if (this.options.device) {
      form.set("devices", this.options.device);
      form.set("option", "0");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/send.php`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
        cache: "no-store",
        signal: controller.signal,
      });
    } catch (error) {
      throw toSms8NetworkError(error);
    } finally {
      clearTimeout(timeout);
    }

    const raw = await response.text();
    let payload: Sms8Response = {};
    if (raw) {
      try {
        payload = JSON.parse(raw) as Sms8Response;
      } catch {
        if (response.ok) {
          throw new WhatsAppProviderError("unknown", "SMS8 devolvió JSON inválido.", {
            retriable: true,
            providerDetail: `sms8:http_${response.status}`,
          });
        }
      }
    }

    if (!response.ok) throw toSms8HttpError(response.status);
    if (payload.success !== true) {
      throw new WhatsAppProviderError("unknown", "SMS8 rechazó el envío.", {
        retriable: false,
        providerDetail: `sms8:http_${response.status}:rejected`,
      });
    }

    const message = payload.data?.messages?.[0];
    const durableId = normalizeId(message?.ID) ?? normalizeId(message?.groupID);
    if (!durableId) {
      throw new WhatsAppProviderError("unknown", "SMS8 aceptó el envío sin devolver un id.", {
        retriable: true,
        providerDetail: `sms8:http_${response.status}:missing_id`,
      });
    }

    return { providerMessageId: durableId, acceptedAt: new Date() };
  }

  verifyWebhookSignature(): boolean {
    // Esta integración es sólo de salida. Nunca aceptar una firma de webhook
    // de WhatsApp por la ruta de SMS8.
    return false;
  }
}

function normalizeId(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function toSms8HttpError(status: number): WhatsAppProviderError {
  let code: WhatsAppProviderErrorCode = "unknown";
  let retriable = false;
  if (status === 400 || status === 422) code = "invalid_recipient";
  else if (status === 401 || status === 403) code = "unauthorized";
  else if (status === 402) code = "provider_unavailable";
  else if (status === 429) { code = "rate_limited"; retriable = true; }
  else if (status >= 500) { code = "provider_unavailable"; retriable = true; }
  return new WhatsAppProviderError(code, `SMS8 rechazó el envío (HTTP ${status}).`, {
    retriable,
    // No persistir la respuesta: puede repetir número o contenido clínico.
    providerDetail: `sms8:http_${status}`,
  });
}

function toSms8NetworkError(error: unknown): WhatsAppProviderError {
  const aborted = error instanceof Error && error.name === "AbortError";
  return new WhatsAppProviderError(
    "provider_unavailable",
    aborted ? "SMS8 excedió el tiempo de espera." : "No se pudo conectar con SMS8.",
    { retriable: true, providerDetail: aborted ? "sms8:timeout" : "sms8:network", cause: error },
  );
}

export function createSms8Provider(): WhatsAppProvider {
  const { SMS8_BASE_URL, SMS8_API_KEY, SMS8_DEVICE, SMS8_TIMEOUT_MS } = serverEnv;
  if (!SMS8_API_KEY) throw new Error("Falta SMS8_API_KEY pese a MESSAGE_PROVIDER=sms8.");
  return new Sms8Provider(SMS8_BASE_URL.replace(/\/+$/, ""), SMS8_API_KEY, {
    device: SMS8_DEVICE || undefined,
    timeoutMs: SMS8_TIMEOUT_MS,
  });
}
