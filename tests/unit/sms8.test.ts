import { beforeEach, describe, expect, it, vi } from "vitest";
import { WhatsAppProviderError } from "@/lib/whatsapp/provider";

const envState = vi.hoisted(() => ({
  SMS8_BASE_URL: "https://app.sms8.io/services/",
  SMS8_API_KEY: "sk_demo",
  SMS8_DEVICE: "7|1" as string | undefined,
  SMS8_TIMEOUT_MS: 5000,
}));
vi.mock("@/lib/env/server", () => ({
  get serverEnv() {
    return { ...envState };
  },
}));

import { createSms8Provider } from "@/lib/whatsapp/sms8";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  envState.SMS8_BASE_URL = "https://app.sms8.io/services/";
  envState.SMS8_API_KEY = "sk_demo";
  envState.SMS8_DEVICE = "7|1";
});

describe("adaptador SMS8", () => {
  it("encola un SMS form-urlencoded en el dispositivo configurado", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: { messages: [{ ID: 321, groupID: "grupo-1", status: "Pending" }] },
    }), { status: 200 }));

    const result = await createSms8Provider().sendFreeformMessage({
      toE164: "+525512345678",
      body: "Prueba Kuni",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://app.sms8.io/services/send.php",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        cache: "no-store",
      }),
    );
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(Object.fromEntries((request.body as URLSearchParams).entries())).toEqual({
      key: "sk_demo",
      number: "+525512345678",
      message: "Prueba Kuni",
      type: "sms",
      devices: "7|1",
      option: "0",
    });
    expect(result).toEqual({ providerMessageId: "321", acceptedAt: expect.any(Date) });
  });

  it("deja que SMS8 elija el único dispositivo cuando SMS8_DEVICE está vacío", async () => {
    envState.SMS8_DEVICE = undefined;
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: { messages: [{ ID: "msg-1" }] },
    }), { status: 200 }));

    await createSms8Provider().sendFreeformMessage({ toE164: "+525512345678", body: "Hola" });
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const fields = Object.fromEntries((request.body as URLSearchParams).entries());
    expect(fields).not.toHaveProperty("devices");
    expect(fields).not.toHaveProperty("option");
  });

  it.each([
    [400, "invalid_recipient", false],
    [401, "unauthorized", false],
    [429, "rate_limited", true],
    [503, "provider_unavailable", true],
  ] as const)("mapea HTTP %s a %s", async (status, code, retriable) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: false }), { status }));
    const error = await createSms8Provider()
      .sendFreeformMessage({ toE164: "+525512345678", body: "Hola" })
      .catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(WhatsAppProviderError);
    expect(error).toMatchObject({ code, retriable, providerDetail: `sms8:http_${status}` });
  });

  it("falla si SMS8 responde success=false aunque el HTTP sea 200", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: false }), { status: 200 }));
    await expect(createSms8Provider().sendFreeformMessage({ toE164: "+525512345678", body: "Hola" }))
      .rejects.toMatchObject({ code: "unknown", retriable: false, providerDetail: "sms8:http_200:rejected" });
  });

  it("falla cerrado para firmas del webhook de WhatsApp", () => {
    expect(createSms8Provider().verifyWebhookSignature({ signatureHeader: "x", url: "https://x", params: {} }))
      .toBe(false);
  });
});
