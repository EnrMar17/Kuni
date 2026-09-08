import { beforeEach, describe, expect, it, vi } from "vitest";
import { WhatsAppProviderError } from "@/lib/whatsapp/provider";

const mocks = vi.hoisted(() => {
  const messagesCreate = vi.fn();
  const validateRequest = vi.fn();
  const twilioFn = Object.assign(vi.fn(() => ({ messages: { create: messagesCreate } })), {
    validateRequest,
  });
  return { messagesCreate, validateRequest, twilioFn };
});
vi.mock("twilio", () => ({ default: mocks.twilioFn }));

const envState = vi.hoisted(() => ({
  TWILIO_ACCOUNT_SID: "ACxxxx",
  TWILIO_AUTH_TOKEN: "auth-token",
  TWILIO_WHATSAPP_FROM: "+14155238886",
}));
vi.mock("@/lib/env/server", () => ({
  get serverEnv() {
    return { ...envState };
  },
}));

import { createTwilioWhatsAppProvider } from "@/lib/whatsapp/twilio";

beforeEach(() => {
  mocks.messagesCreate.mockReset();
  mocks.validateRequest.mockReset();
  mocks.twilioFn.mockClear();
  envState.TWILIO_ACCOUNT_SID = "ACxxxx";
  envState.TWILIO_AUTH_TOKEN = "auth-token";
  envState.TWILIO_WHATSAPP_FROM = "+14155238886";
});

describe("adaptador de Twilio — envío", () => {
  it("sendTemplateMessage manda to/from con prefijo whatsapp: y variables serializadas", async () => {
    mocks.messagesCreate.mockResolvedValue({ sid: "SMabc123" });
    const provider = createTwilioWhatsAppProvider();

    const result = await provider.sendTemplateMessage({
      toE164: "+5215512345678",
      contentSid: "HXfake",
      contentVariables: { "1": "José", "2": "10:00" },
    });

    expect(mocks.messagesCreate).toHaveBeenCalledWith({
      to: "whatsapp:+5215512345678",
      from: "whatsapp:+14155238886",
      contentSid: "HXfake",
      contentVariables: JSON.stringify({ "1": "José", "2": "10:00" }),
    });
    expect(result).toEqual({ providerMessageId: "SMabc123", acceptedAt: expect.any(Date) });
  });

  it("sendFreeformMessage manda body en vez de contentSid", async () => {
    mocks.messagesCreate.mockResolvedValue({ sid: "SMdef456" });
    const provider = createTwilioWhatsAppProvider();

    await provider.sendFreeformMessage({ toE164: "+5215512345678", body: "Hola" });

    expect(mocks.messagesCreate).toHaveBeenCalledWith({
      to: "whatsapp:+5215512345678",
      from: "whatsapp:+14155238886",
      body: "Hola",
    });
  });

  it("normaliza TWILIO_WHATSAPP_FROM aunque ya traiga el prefijo whatsapp: (no lo duplica)", async () => {
    envState.TWILIO_WHATSAPP_FROM = "whatsapp:+14155238886";
    mocks.messagesCreate.mockResolvedValue({ sid: "SMghi789" });
    const provider = createTwilioWhatsAppProvider();

    await provider.sendFreeformMessage({ toE164: "+5215512345678", body: "Hola" });

    expect(mocks.messagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ from: "whatsapp:+14155238886" }),
    );
  });

  it("lanza si falta alguna credencial pese a WHATSAPP_PROVIDER=twilio (defensa en profundidad)", () => {
    // @ts-expect-error -- forzar el caso "falta credencial" que serverEnvSchema debería impedir en producción.
    envState.TWILIO_ACCOUNT_SID = undefined;
    expect(() => createTwilioWhatsAppProvider()).toThrow(/Credenciales de Twilio incompletas/);
  });
});

describe("adaptador de Twilio — mapeo de errores", () => {
  const cases: Array<{
    name: string;
    rejection: { status?: number; code?: number; message?: string };
    expectedCode: string;
    expectedRetriable: boolean;
  }> = [
    { name: "429 → rate_limited, reintentable", rejection: { status: 429, code: 20429 }, expectedCode: "rate_limited", expectedRetriable: true },
    { name: "5xx → provider_unavailable, reintentable", rejection: { status: 503, message: "down" }, expectedCode: "provider_unavailable", expectedRetriable: true },
    { name: "plantilla rechazada (63016) → template_rejected, no reintentable", rejection: { status: 400, code: 63016 }, expectedCode: "template_rejected", expectedRetriable: false },
    { name: "número inválido (21211) → invalid_recipient, no reintentable", rejection: { status: 400, code: 21211 }, expectedCode: "invalid_recipient", expectedRetriable: false },
    { name: "403 → unauthorized, no reintentable", rejection: { status: 403 }, expectedCode: "unauthorized", expectedRetriable: false },
    { name: "sin status/code reconocido → unknown, no reintentable", rejection: { message: "???" }, expectedCode: "unknown", expectedRetriable: false },
  ];

  for (const { name, rejection, expectedCode, expectedRetriable } of cases) {
    it(name, async () => {
      mocks.messagesCreate.mockRejectedValue(rejection);
      const provider = createTwilioWhatsAppProvider();

      const failure = await provider
        .sendFreeformMessage({ toE164: "+5215512345678", body: "x" })
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(WhatsAppProviderError);
      const error = failure as InstanceType<typeof WhatsAppProviderError>;
      expect(error.code).toBe(expectedCode);
      expect(error.retriable).toBe(expectedRetriable);
    });
  }
});

describe("adaptador de Twilio — verificación de firma", () => {
  it("sin header de firma, nunca llama al validador y responde false", () => {
    const provider = createTwilioWhatsAppProvider();
    const result = provider.verifyWebhookSignature({ signatureHeader: null, url: "https://x", params: {} });
    expect(result).toBe(false);
    expect(mocks.validateRequest).not.toHaveBeenCalled();
  });

  it("con header presente, delega en twilio.validateRequest con la URL y params exactos", () => {
    mocks.validateRequest.mockReturnValue(true);
    const provider = createTwilioWhatsAppProvider();

    const result = provider.verifyWebhookSignature({
      signatureHeader: "sig123",
      url: "https://kuni.example.com/api/webhooks/whatsapp",
      params: { From: "whatsapp:+5215512345678", Body: "SI A7F3" },
    });

    expect(result).toBe(true);
    expect(mocks.validateRequest).toHaveBeenCalledWith(
      "auth-token",
      "sig123",
      "https://kuni.example.com/api/webhooks/whatsapp",
      { From: "whatsapp:+5215512345678", Body: "SI A7F3" },
    );
  });

  it("si el validador lanza, falla cerrado (false), nunca deja pasar por accidente", () => {
    mocks.validateRequest.mockImplementation(() => {
      throw new Error("payload malformado");
    });
    const provider = createTwilioWhatsAppProvider();

    const result = provider.verifyWebhookSignature({
      signatureHeader: "sig123",
      url: "https://x",
      params: {},
    });

    expect(result).toBe(false);
  });
});
