import "server-only";
import twilio from "twilio";
import { serverEnv } from "@/lib/env/server";
import {
  WhatsAppProviderError,
  type SendFreeformMessageInput,
  type SendTemplateMessageInput,
  type VerifyWebhookSignatureInput,
  type WhatsAppProvider,
  type WhatsAppProviderErrorCode,
  type WhatsAppSendResult,
} from "./provider";

/**
 * Adaptador real de Twilio — sección 6 y "Configuración Twilio" de
 * kuni-plan-tecnico.md. Usa el SDK oficial ya presente en `package.json`
 * para el envío (`client.messages.create`) y para la validación de firma
 * (`twilio.validateRequest`), en vez de reimplementar HMAC a mano.
 *
 * Nunca se importa directamente: pasa por `getWhatsAppProvider()` en
 * `provider.ts`, que ya validó que `WHATSAPP_PROVIDER=twilio` trae las
 * credenciales requeridas (`serverEnv` lanza al arrancar si faltan).
 */
class TwilioWhatsAppProvider implements WhatsAppProvider {
  readonly dbProviderValue = "twilio" as const;

  private readonly client: ReturnType<typeof twilio>;
  private readonly authToken: string;
  private readonly fromE164: string;

  constructor(accountSid: string, authToken: string, fromRaw: string) {
    this.client = twilio(accountSid, authToken);
    this.authToken = authToken;
    // El env admite el valor con o sin "whatsapp:" (ver server.ts); se
    // normaliza aquí una sola vez para no repetir el strip en cada envío.
    this.fromE164 = fromRaw.replace(/^whatsapp:/, "");
  }

  async sendTemplateMessage(input: SendTemplateMessageInput): Promise<WhatsAppSendResult> {
    return this.send({
      to: toWhatsAppAddress(input.toE164),
      from: toWhatsAppAddress(this.fromE164),
      contentSid: input.contentSid,
      contentVariables: JSON.stringify(input.contentVariables),
    });
  }

  async sendFreeformMessage(input: SendFreeformMessageInput): Promise<WhatsAppSendResult> {
    return this.send({
      to: toWhatsAppAddress(input.toE164),
      from: toWhatsAppAddress(this.fromE164),
      body: input.body,
    });
  }

  private async send(
    params: Parameters<TwilioWhatsAppProvider["client"]["messages"]["create"]>[0],
  ): Promise<WhatsAppSendResult> {
    try {
      const message = await this.client.messages.create(params);
      return { providerMessageId: message.sid, acceptedAt: new Date() };
    } catch (error) {
      throw toProviderError(error);
    }
  }

  verifyWebhookSignature(input: VerifyWebhookSignatureInput): boolean {
    if (!input.signatureHeader) return false;
    try {
      return twilio.validateRequest(this.authToken, input.signatureHeader, input.url, input.params);
    } catch {
      // Fallar cerrado ante cualquier excepción del validador (payload
      // malformado, etc.): nunca tratar un error de verificación como firma
      // válida.
      return false;
    }
  }
}

function toWhatsAppAddress(e164: string): string {
  return e164.startsWith("whatsapp:") ? e164 : `whatsapp:${e164}`;
}

/**
 * Traduce la excepción del SDK de Twilio (`RestException` con `status`/`code`
 * numéricos de Twilio) a `WhatsAppProviderError`, para que el resto del
 * sistema (futuro `jobs/send.ts`) decida `failure_code`/reintento sin
 * conocer la forma de las excepciones de Twilio.
 *
 * Referencia de códigos: https://www.twilio.com/docs/api/errors
 */
function toProviderError(error: unknown): WhatsAppProviderError {
  const restError = error as { status?: number; code?: number; message?: string } | null;
  const status = restError?.status;
  const twilioCode = restError?.code;
  const message = restError?.message ?? "Error desconocido del proveedor Twilio.";

  let code: WhatsAppProviderErrorCode = "unknown";
  let retriable = false;

  if (status === 429 || twilioCode === 20429) {
    code = "rate_limited";
    retriable = true;
  } else if (status !== undefined && status >= 500) {
    code = "provider_unavailable";
    retriable = true;
  } else if (twilioCode === 63016 || twilioCode === 63018 || twilioCode === 63024 || twilioCode === 63025) {
    // Plantilla no aprobada/rechazada, o fuera de la ventana de sesión sin plantilla.
    code = "template_rejected";
    retriable = false;
  } else if (twilioCode === 21211 || twilioCode === 21614 || twilioCode === 63003) {
    // Número inválido / no puede recibir WhatsApp / no unido al Sandbox.
    code = "invalid_recipient";
    retriable = false;
  } else if (status === 401 || status === 403) {
    code = "unauthorized";
    retriable = false;
  }

  return new WhatsAppProviderError(code, message, {
    retriable,
    providerDetail: twilioCode !== undefined ? `twilio:${twilioCode}` : undefined,
    cause: error,
  });
}

export function createTwilioWhatsAppProvider(): WhatsAppProvider {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM } = serverEnv;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_FROM) {
    // Defensa en profundidad: `serverEnvSchema` ya exige esto cuando
    // WHATSAPP_PROVIDER=twilio, así que llegar aquí sin ellos es un bug de
    // ese esquema, no una configuración de usuario esperable.
    throw new Error("Credenciales de Twilio incompletas pese a WHATSAPP_PROVIDER=twilio.");
  }
  return new TwilioWhatsAppProvider(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM);
}
