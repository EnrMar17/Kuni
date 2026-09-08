import { beforeEach, describe, expect, it, vi } from "vitest";
import { WhatsAppProviderError } from "@/lib/whatsapp/provider";

const envState = vi.hoisted(() => ({
  SMS_GATEWAY_BASE_URL: "https://gateway.example.test/3rdparty/v1/",
  SMS_GATEWAY_TOKEN: "jwt-send-only",
  SMS_GATEWAY_USERNAME: undefined as string | undefined,
  SMS_GATEWAY_PASSWORD: undefined as string | undefined,
  SMS_GATEWAY_DEVICE_ID: "device-1",
  SMS_GATEWAY_SIM_NUMBER: 2,
  SMS_GATEWAY_TTL_SECONDS: 1800,
  SMS_GATEWAY_TIMEOUT_MS: 5000,
}));
vi.mock("@/lib/env/server", () => ({
  get serverEnv() {
    return { ...envState };
  },
}));

import { createSmsGateProvider } from "@/lib/whatsapp/smsgate";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  envState.SMS_GATEWAY_BASE_URL = "https://gateway.example.test/3rdparty/v1/";
  envState.SMS_GATEWAY_TOKEN = "jwt-send-only";
  envState.SMS_GATEWAY_USERNAME = undefined;
  envState.SMS_GATEWAY_PASSWORD = undefined;
  envState.SMS_GATEWAY_DEVICE_ID = "device-1";
  envState.SMS_GATEWAY_SIM_NUMBER = 2;
});

describe("adaptador SMSGate", () => {
  it("encola un SMS con JWT, E.164, dispositivo, SIM, TTL y reporte de entrega", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "sms-123", state: "Pending" }), { status: 202 }));
    const provider = createSmsGateProvider();

    const result = await provider.sendFreeformMessage({ toE164: "+525512345678", body: "Recordatorio Kuni" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://gateway.example.test/3rdparty/v1/messages",
      expect.objectContaining({
        method: "POST",
        headers: { Authorization: "Bearer jwt-send-only", "Content-Type": "application/json" },
        cache: "no-store",
      }),
    );
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(request.body as string)).toEqual({
      phoneNumbers: ["+525512345678"],
      textMessage: { text: "Recordatorio Kuni" },
      deviceId: "device-1",
      simNumber: 2,
      ttl: 1800,
      withDeliveryReport: true,
    });
    expect(result).toEqual({ providerMessageId: "sms-123", acceptedAt: expect.any(Date) });
  });

  it("admite Basic Auth cuando no se configuró JWT", async () => {
    envState.SMS_GATEWAY_TOKEN = "";
    envState.SMS_GATEWAY_USERNAME = "kuni";
    envState.SMS_GATEWAY_PASSWORD = "secreto";
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "sms-456" }), { status: 202 }));

    await createSmsGateProvider().sendFreeformMessage({ toE164: "+525512345678", body: "Hola" });

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(request.headers).toEqual(expect.objectContaining({
      Authorization: `Basic ${Buffer.from("kuni:secreto").toString("base64")}`,
    }));
  });

  it.each([
    [400, "invalid_recipient", false],
    [401, "unauthorized", false],
    [429, "rate_limited", true],
    [503, "provider_unavailable", true],
  ] as const)("mapea HTTP %s a %s", async (status, code, retriable) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "rechazado" }), { status }));
    const error = await createSmsGateProvider()
      .sendFreeformMessage({ toE164: "+525512345678", body: "Hola" })
      .catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(WhatsAppProviderError);
    expect(error).toMatchObject({ code, retriable, providerDetail: `smsgate:http_${status}` });
  });

  it("falla si una respuesta exitosa no incluye id durable", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 202 }));
    await expect(createSmsGateProvider().sendFreeformMessage({ toE164: "+525512345678", body: "Hola" }))
      .rejects.toMatchObject({ code: "unknown", retriable: true });
  });

  it("falla cerrado para firmas del webhook de WhatsApp", () => {
    expect(createSmsGateProvider().verifyWebhookSignature({ signatureHeader: "x", url: "https://x", params: {} }))
      .toBe(false);
  });
});
