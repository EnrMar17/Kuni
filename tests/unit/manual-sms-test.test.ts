import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  sendFreeformMessage: vi.fn(),
  provider: {
    dbProviderValue: "sms8" as "sms8" | "twilio" | "demo",
    channel: "sms" as "sms" | "whatsapp",
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: mocks.rpc }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mocks.from }),
}));
vi.mock("@/lib/whatsapp/provider", () => {
  class WhatsAppProviderError extends Error {
    constructor(
      readonly code: string,
      message: string,
      readonly options: { retriable: boolean; providerDetail?: string },
    ) {
      super(message);
    }
    get retriable() { return this.options.retriable; }
    get providerDetail() { return this.options.providerDetail; }
  }
  const provider = async () => ({
    ...mocks.provider,
    sendFreeformMessage: mocks.sendFreeformMessage,
  });
  return {
    WhatsAppProviderError,
    getWhatsAppProvider: provider,
    getTwilioWhatsAppProvider: provider,
  };
});

import { MANUAL_SMS_TEST_BODY } from "@/contracts/messaging";
import { sendManualMessageTest } from "@/lib/jobs/manual-sms-test";
import { WhatsAppProviderError } from "@/lib/whatsapp/provider";

const input = {
  patientId: "22222222-2222-4222-8222-222222222222",
  requestId: "33333333-3333-4333-8333-333333333333",
  unitId: "44444444-4444-4444-8444-444444444444",
  roomId: "55555555-5555-4555-8555-555555555555",
  channel: "sms" as const,
};
const interactionId = "66666666-6666-4666-8666-666666666666";
const claimedAt = "2026-09-08T14:00:00.000Z";

function updateChain(result = { data: [{ id: interactionId }], error: null as unknown }) {
  const chain = {
    update: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    is: vi.fn(() => chain),
    select: vi.fn(async () => result),
  };
  return chain;
}

function rpcPayload(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      data: {
        interaction: {
          id: interactionId,
          created: true,
          deliveryStatus: "sending",
          claimedAt,
          phoneE164: "+525512345678",
          ...overrides,
        },
      },
      error: null,
    },
    error: null,
  };
}

beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.from.mockReset();
  mocks.sendFreeformMessage.mockReset();
  mocks.provider.dbProviderValue = "sms8";
  mocks.provider.channel = "sms";
});

describe("sendManualMessageTest", () => {
  it("envía el texto fijo por SMS8 y registra accepted", async () => {
    const update = updateChain();
    mocks.rpc.mockResolvedValue(rpcPayload());
    mocks.from.mockReturnValue(update);
    mocks.sendFreeformMessage.mockResolvedValue({
      providerMessageId: "sms8-123",
      acceptedAt: new Date(claimedAt),
    });

    await expect(sendManualMessageTest(input)).resolves.toEqual({ status: "accepted" });
    expect(mocks.rpc).toHaveBeenCalledWith("request_manual_message_test", {
      p_patient_id: input.patientId,
      p_unit_id: input.unitId,
      p_room_id: input.roomId,
      p_request_id: input.requestId,
      p_provider: "sms8",
      p_channel: "sms",
    });
    expect(mocks.sendFreeformMessage).toHaveBeenCalledWith({
      toE164: "+525512345678",
      body: MANUAL_SMS_TEST_BODY,
    });
    expect(update.update).toHaveBeenCalledWith(expect.objectContaining({
      delivery_status: "accepted",
      provider_message_id: "sms8-123",
    }));
  });

  it("no duplica el envío cuando la misma solicitud ya existe", async () => {
    mocks.rpc.mockResolvedValue(rpcPayload({ created: false, deliveryStatus: "accepted", claimedAt: undefined, phoneE164: undefined }));

    await expect(sendManualMessageTest(input)).resolves.toEqual({ status: "already_requested" });
    expect(mocks.sendFreeformMessage).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("rechaza el botón cuando el proveedor configurado no es SMS", async () => {
    mocks.provider.dbProviderValue = "demo";
    mocks.provider.channel = "whatsapp";

    await expect(sendManualMessageTest(input)).rejects.toMatchObject({ code: "VALIDATION" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("envía WhatsApp libre cuando Twilio y la ventana fueron validados", async () => {
    const update = updateChain();
    mocks.provider.dbProviderValue = "twilio";
    mocks.provider.channel = "whatsapp";
    mocks.rpc.mockResolvedValue(rpcPayload());
    mocks.from.mockReturnValue(update);
    mocks.sendFreeformMessage.mockResolvedValue({
      providerMessageId: "SM123",
      acceptedAt: new Date(claimedAt),
    });

    await expect(sendManualMessageTest({ ...input, channel: "whatsapp" })).resolves.toEqual({ status: "accepted" });
    expect(mocks.rpc).toHaveBeenCalledWith("request_manual_message_test", expect.objectContaining({
      p_provider: "twilio",
      p_channel: "whatsapp",
    }));
    expect(mocks.sendFreeformMessage).toHaveBeenCalledWith(expect.objectContaining({
      toE164: "+525512345678",
      body: expect.stringContaining("prueba de WhatsApp"),
    }));
  });

  it("explica cómo abrir la ventana cuando WhatsApp lleva más de 24 horas cerrado", async () => {
    mocks.provider.dbProviderValue = "twilio";
    mocks.provider.channel = "whatsapp";
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "WHATSAPP_WINDOW_CLOSED" } });

    await expect(sendManualMessageTest({ ...input, channel: "whatsapp" })).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("envía primero un mensaje al Sandbox"),
    });
    expect(mocks.sendFreeformMessage).not.toHaveBeenCalled();
  });

  it("traduce el límite de frecuencia a un conflicto entendible", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "MANUAL_MESSAGE_RATE_LIMIT" } });

    await expect(sendManualMessageTest(input)).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("30 segundos"),
    });
    expect(mocks.sendFreeformMessage).not.toHaveBeenCalled();
  });

  it("marca unknown ante un fallo reintentable sin afirmar que no se envió", async () => {
    const update = updateChain();
    mocks.rpc.mockResolvedValue(rpcPayload());
    mocks.from.mockReturnValue(update);
    mocks.sendFreeformMessage.mockRejectedValue(new WhatsAppProviderError(
      "provider_unavailable",
      "timeout",
      { retriable: true },
    ));

    await expect(sendManualMessageTest(input)).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    expect(update.update).toHaveBeenCalledWith(expect.objectContaining({
      delivery_status: "unknown",
      failure_code: "provider_unavailable",
    }));
  });
});
