import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ provider: "mock" as "mock" | "twilio" | "meta" }));
vi.mock("@/lib/env/server", () => ({
  get serverEnv() {
    return { WHATSAPP_PROVIDER: state.provider };
  },
}));

const twilioFactory = vi.hoisted(() => vi.fn(() => ({
  dbProviderValue: "twilio" as const,
  sendTemplateMessage: vi.fn(),
  sendFreeformMessage: vi.fn(),
  verifyWebhookSignature: vi.fn(),
})));
vi.mock("@/lib/whatsapp/twilio", () => ({ createTwilioWhatsAppProvider: twilioFactory }));

import { WhatsAppProviderError } from "@/lib/whatsapp/provider";

// `getWhatsAppProvider()` memoiza el adaptador elegido a nivel de módulo (a
// propósito: no queremos reconstruir el cliente de Twilio en cada llamada).
// Eso significa que, entre casos que cambian WHATSAPP_PROVIDER, el módulo
// debe reimportarse fresco — de ahí `resetModules()` + import dinámico en
// cada test en vez de un único `import` estático arriba.
async function loadProviderModule() {
  vi.resetModules();
  return import("@/lib/whatsapp/provider");
}

beforeEach(() => {
  state.provider = "mock";
  twilioFactory.mockClear();
});

describe("proveedor de WhatsApp — selección", () => {
  it("por default (mock) nunca llama al adaptador de Twilio y persiste como 'demo'", async () => {
    const { getWhatsAppProvider } = await loadProviderModule();
    const provider = await getWhatsAppProvider();
    expect(provider.dbProviderValue).toBe("demo");
    expect(twilioFactory).not.toHaveBeenCalled();
  });

  it("el envío simulado no lanza y devuelve un id de mensaje sintético", async () => {
    const { getWhatsAppProvider } = await loadProviderModule();
    const provider = await getWhatsAppProvider();
    const result = await provider.sendTemplateMessage({
      toE164: "+5215512345678",
      contentSid: "HXfake",
      contentVariables: { "1": "Paciente" },
    });
    expect(result.providerMessageId).toMatch(/^demo-/);
    expect(result.acceptedAt).toBeInstanceOf(Date);
  });

  it("el modo demo falla cerrado en verificación de firma (nunca recibe webhooks reales)", async () => {
    const { getWhatsAppProvider } = await loadProviderModule();
    const provider = await getWhatsAppProvider();
    expect(
      provider.verifyWebhookSignature({ signatureHeader: "algo", url: "https://x", params: {} }),
    ).toBe(false);
    expect(
      provider.verifyWebhookSignature({ signatureHeader: null, url: "https://x", params: {} }),
    ).toBe(false);
  });
});

describe("proveedor de WhatsApp — WHATSAPP_PROVIDER=twilio", () => {
  it("delega en el adaptador real vía import dinámico", async () => {
    state.provider = "twilio";
    const { getWhatsAppProvider } = await loadProviderModule();
    const provider = await getWhatsAppProvider();
    expect(provider.dbProviderValue).toBe("twilio");
    expect(twilioFactory).toHaveBeenCalledTimes(1);
  });
});

describe("proveedor de WhatsApp — WHATSAPP_PROVIDER=meta", () => {
  it("no está implementado: falla explícito en vez de degradar a otro adaptador en silencio", async () => {
    state.provider = "meta";
    const { getWhatsAppProvider } = await loadProviderModule();
    await expect(getWhatsAppProvider()).rejects.toThrow(/meta/i);
  });
});

describe("WhatsAppProviderError", () => {
  it("conserva code/retriable/detail para que el llamador decida sin conocer el SDK de origen", () => {
    const error = new WhatsAppProviderError("rate_limited", "Demasiadas solicitudes", {
      retriable: true,
      providerDetail: "twilio:20429",
    });
    expect(error.code).toBe("rate_limited");
    expect(error.retriable).toBe(true);
    expect(error.providerDetail).toBe("twilio:20429");
    expect(error).toBeInstanceOf(Error);
  });
});
