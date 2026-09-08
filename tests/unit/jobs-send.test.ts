import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  revalidateSend: vi.fn(),
  sendFreeformMessage: vi.fn(),
  sendTemplateMessage: vi.fn(),
  // B5: cada test configura los Content SID que necesite; vacío por default,
  // igual que un despliegue sin plantillas aprobadas todavía.
  serverEnv: {
    WHATSAPP_PROVIDER: "mock" as const,
    TWILIO_MEDICATION_CONTENT_SID: undefined as string | undefined,
    TWILIO_MEASUREMENT_GLUCOSE_CONTENT_SID: undefined as string | undefined,
    TWILIO_MEASUREMENT_BP_CONTENT_SID: undefined as string | undefined,
    TWILIO_APPOINTMENT_CONTENT_SID: undefined as string | undefined,
    TWILIO_NONRESPONSE_CONTENT_SID: undefined as string | undefined,
  },
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from, rpc: mocks.rpc }) }));
vi.mock("@/lib/env/server", () => ({ serverEnv: mocks.serverEnv }));
vi.mock("@/lib/jobs/revalidate-send", () => ({ revalidateSend: mocks.revalidateSend }));
vi.mock("@/lib/whatsapp/provider", async () => {
  const actual = await vi.importActual<typeof import("@/lib/whatsapp/provider")>("@/lib/whatsapp/provider");
  return {
    ...actual,
    getWhatsAppProvider: async () => ({
      dbProviderValue: "demo",
      sendFreeformMessage: mocks.sendFreeformMessage,
      sendTemplateMessage: mocks.sendTemplateMessage,
    }),
  };
});

import { sendDueInteractions } from "@/lib/jobs/send";
import { WhatsAppProviderError } from "@/lib/whatsapp/provider";

function makeChain(result: { data?: unknown; error?: unknown } = { data: null, error: null }) {
  const response = { data: [{ id: "bi-1" }], ...result };
  const chain = {
    select: vi.fn(() => chain),
    update: vi.fn(() => chain),
    in: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    is: vi.fn(() => chain),
    maybeSingle: vi.fn(() => chain),
    then: <TResult1 = typeof result>(
      onfulfilled?: ((value: typeof result) => TResult1 | PromiseLike<TResult1>) | null,
    ) => Promise.resolve(response).then(onfulfilled),
  };
  return chain;
}

function queueFrom(queues: Record<string, ReturnType<typeof makeChain>[]>) {
  mocks.from.mockImplementation((table: string) => {
    const next = queues[table]?.shift();
    if (!next) throw new Error(`Llamada inesperada a .from("${table}") sin chain en cola`);
    return next;
  });
}

const medicationInteraction = {
  id: "bi-1",
  patient_id: "patient-1",
  kind: "medication",
  reply_code: "A7F3",
  payload_snapshot: { doseText: "1 tableta", medicationName: "Metformina" },
};

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-09-08T14:00:00Z"));
  mocks.from.mockReset();
  mocks.rpc.mockReset();
  mocks.revalidateSend.mockReset();
  // Unit boundary: revalidation has its own tests against scoped reads.
  mocks.revalidateSend.mockImplementation(async (_admin, interaction) => {
    const patients = await mocks.from("patients");
    const session = await mocks.from("patient_messaging_state");
    return { interaction: { ...interaction, unit_id: "unit-1", claimed_at: "2026-09-08T14:00:00Z" },
      phoneE164: patients.data[0]?.whatsapp_e164 ?? null,
      lastInboundAt: session.data[0]?.last_inbound_at ?? null };
  });
  mocks.sendFreeformMessage.mockReset();
  mocks.sendTemplateMessage.mockReset();
  mocks.serverEnv.TWILIO_MEDICATION_CONTENT_SID = undefined;
  mocks.serverEnv.TWILIO_MEASUREMENT_GLUCOSE_CONTENT_SID = undefined;
  mocks.serverEnv.TWILIO_MEASUREMENT_BP_CONTENT_SID = undefined;
  mocks.serverEnv.TWILIO_APPOINTMENT_CONTENT_SID = undefined;
  mocks.serverEnv.TWILIO_NONRESPONSE_CONTENT_SID = undefined;
});
afterEach(() => vi.restoreAllMocks());

describe("sendDueInteractions", () => {
  it("no envía si la revalidación detectó una cancelación", async () => {
    mocks.rpc.mockResolvedValue({ data: [medicationInteraction], error: null });
    mocks.revalidateSend.mockResolvedValue(null);
    expect(await sendDueInteractions()).toEqual({ claimed: 1, sent: 0, failed: 1 });
    expect(mocks.sendFreeformMessage).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("no convierte un error SQL posterior a aceptación en fallo del proveedor", async () => {
    mocks.rpc.mockResolvedValue({ data: [medicationInteraction], error: null });
    mocks.revalidateSend.mockResolvedValue({ interaction: medicationInteraction, phoneE164: "+525512345678", lastInboundAt: "2026-09-08T13:00:00Z" });
    const update = makeChain({ error: new Error("db offline") });
    queueFrom({ bot_interactions: [update] });
    mocks.sendFreeformMessage.mockResolvedValue({ providerMessageId: "sid", acceptedAt: new Date() });
    await expect(sendDueInteractions()).rejects.toThrow("db offline");
    expect(update.update).toHaveBeenCalledTimes(1);
    expect(update.update).toHaveBeenCalledWith(expect.objectContaining({ delivery_status: "accepted" }));
  });

  it("no rebaja read a accepted si otro escritor ya guardó el mismo SID", async () => {
    mocks.rpc.mockResolvedValue({ data: [medicationInteraction], error: null });
    mocks.revalidateSend.mockResolvedValue({ interaction: { ...medicationInteraction, unit_id: "unit-1", claimed_at: "claim" }, phoneE164: "+525512345678", lastInboundAt: "2026-09-08T13:00:00Z" });
    const update = makeChain({ data: [], error: null });
    queueFrom({ bot_interactions: [update, makeChain({ data: { provider_message_id: "sid", delivery_status: "read" }, error: null })] });
    mocks.sendFreeformMessage.mockResolvedValue({ providerMessageId: "sid", acceptedAt: new Date() });
    expect((await sendDueInteractions()).sent).toBe(1);
    expect(update.eq).toHaveBeenCalledWith("delivery_status", "sending");
    expect(update.eq).toHaveBeenCalledWith("claimed_at", "claim");
  });

  it.each(["2026-09-09T13:00:00Z", "2026-09-07T14:00:00Z", "invalid"])("no abre ventana con inbound futuro, vencido o inválido: %s", async (lastInboundAt) => {
    mocks.rpc.mockResolvedValue({ data: [medicationInteraction], error: null });
    mocks.revalidateSend.mockResolvedValue({ interaction: medicationInteraction, phoneE164: "+525512345678", lastInboundAt });
    queueFrom({ bot_interactions: [makeChain({ error: null })] });
    expect((await sendDueInteractions()).failed).toBe(1);
    expect(mocks.sendFreeformMessage).not.toHaveBeenCalled();
  });
  it("sin interacciones reclamadas, no hace ninguna otra consulta ni envío", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    const result = await sendDueInteractions();
    expect(result).toEqual({ claimed: 0, sent: 0, failed: 0 });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.sendFreeformMessage).not.toHaveBeenCalled();
  });

  it("con sesión reciente (<24h), manda texto libre y marca 'accepted'", async () => {
    mocks.rpc.mockResolvedValue({ data: [medicationInteraction], error: null });
    const updateChain = makeChain({ error: null });
    queueFrom({
      patients: [makeChain({ data: [{ id: "patient-1", whatsapp_e164: "+5215512345678" }], error: null })],
      patient_messaging_state: [
        makeChain({ data: [{ patient_id: "patient-1", last_inbound_at: "2026-09-08T10:00:00.000Z" }], error: null }),
      ],
      bot_interactions: [updateChain],
    });
    mocks.sendFreeformMessage.mockResolvedValue({ providerMessageId: "demo-1", acceptedAt: new Date("2026-09-08T14:00:00.000Z") });

    const result = await sendDueInteractions();

    expect(result).toEqual({ claimed: 1, sent: 1, failed: 0 });
    expect(mocks.sendFreeformMessage).toHaveBeenCalledWith({
      toE164: "+5215512345678",
      body: expect.stringContaining("SI A7F3"),
    });
    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ delivery_status: "accepted", provider_message_id: "demo-1" }),
    );
  });

  it("sin sesión reciente y sin plantilla configurada, marca 'failed' sin llamar al proveedor", async () => {
    mocks.rpc.mockResolvedValue({ data: [medicationInteraction], error: null });
    const updateChain = makeChain({ error: null });
    queueFrom({
      patients: [makeChain({ data: [{ id: "patient-1", whatsapp_e164: "+5215512345678" }], error: null })],
      patient_messaging_state: [makeChain({ data: [], error: null })], // nunca escribió
      bot_interactions: [updateChain],
    });

    const result = await sendDueInteractions();

    expect(result).toEqual({ claimed: 1, sent: 0, failed: 1 });
    expect(mocks.sendFreeformMessage).not.toHaveBeenCalled();
    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ delivery_status: "failed", failure_code: "template_not_configured" }),
    );
  });

  it("B5: sin sesión reciente PERO con plantilla configurada, manda por Content SID y marca 'accepted'", async () => {
    mocks.serverEnv.TWILIO_MEDICATION_CONTENT_SID = "HXmedication123";
    mocks.rpc.mockResolvedValue({ data: [medicationInteraction], error: null });
    const updateChain = makeChain({ error: null });
    queueFrom({
      patients: [makeChain({ data: [{ id: "patient-1", whatsapp_e164: "+5215512345678" }], error: null })],
      patient_messaging_state: [makeChain({ data: [], error: null })], // nunca escribió: sin ventana de sesión
      bot_interactions: [updateChain],
    });
    mocks.sendTemplateMessage.mockResolvedValue({ providerMessageId: "demo-tpl-1", acceptedAt: new Date("2026-09-08T14:00:00.000Z") });

    const result = await sendDueInteractions();

    expect(result).toEqual({ claimed: 1, sent: 1, failed: 0 });
    expect(mocks.sendFreeformMessage).not.toHaveBeenCalled();
    expect(mocks.sendTemplateMessage).toHaveBeenCalledWith({
      toE164: "+5215512345678",
      contentSid: "HXmedication123",
      contentVariables: { "1": "Metformina — 1 tableta", "2": "A7F3" },
    });
    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ delivery_status: "accepted", provider_message_id: "demo-tpl-1" }),
    );
  });

  it("B5: mediciones de glucosa y presión usan Content SID distintos", async () => {
    mocks.serverEnv.TWILIO_MEASUREMENT_GLUCOSE_CONTENT_SID = "HXglucose123";
    const glucoseInteraction = {
      id: "bi-glucose",
      patient_id: "patient-1",
      kind: "measurement",
      reply_code: "G1G1",
      payload_snapshot: { variable: "glucose" },
    };
    mocks.rpc.mockResolvedValue({ data: [glucoseInteraction], error: null });
    queueFrom({
      patients: [makeChain({ data: [{ id: "patient-1", whatsapp_e164: "+5215512345678" }], error: null })],
      patient_messaging_state: [makeChain({ data: [], error: null })],
      bot_interactions: [makeChain({ error: null })],
    });
    mocks.sendTemplateMessage.mockResolvedValue({ providerMessageId: "demo-tpl-2", acceptedAt: new Date("2026-09-08T14:00:00.000Z") });

    const result = await sendDueInteractions();

    expect(result).toEqual({ claimed: 1, sent: 1, failed: 0 });
    expect(mocks.sendTemplateMessage).toHaveBeenCalledWith({
      toE164: "+5215512345678",
      contentSid: "HXglucose123",
      contentVariables: { "1": "G1G1" },
    });
  });

  it("B5: presión arterial sin su propio Content SID configurado (aunque glucosa sí lo tenga) sigue fallando explícito", async () => {
    mocks.serverEnv.TWILIO_MEASUREMENT_GLUCOSE_CONTENT_SID = "HXglucose123"; // configurado, pero no aplica a blood_pressure
    const bpInteraction = {
      id: "bi-bp",
      patient_id: "patient-1",
      kind: "measurement",
      reply_code: "B2B2",
      payload_snapshot: { variable: "blood_pressure" },
    };
    mocks.rpc.mockResolvedValue({ data: [bpInteraction], error: null });
    const updateChain = makeChain({ error: null });
    queueFrom({
      patients: [makeChain({ data: [{ id: "patient-1", whatsapp_e164: "+5215512345678" }], error: null })],
      patient_messaging_state: [makeChain({ data: [], error: null })],
      bot_interactions: [updateChain],
    });

    const result = await sendDueInteractions();

    expect(result).toEqual({ claimed: 1, sent: 0, failed: 1 });
    expect(mocks.sendTemplateMessage).not.toHaveBeenCalled();
    expect(updateChain.update).toHaveBeenCalledWith(expect.objectContaining({ failure_code: "template_not_configured" }));
  });

  it("una sesión de hace más de 24h ya no cuenta como reciente", async () => {
    mocks.rpc.mockResolvedValue({ data: [medicationInteraction], error: null });
    const updateChain = makeChain({ error: null });
    queueFrom({
      patients: [makeChain({ data: [{ id: "patient-1", whatsapp_e164: "+5215512345678" }], error: null })],
      patient_messaging_state: [
        makeChain({ data: [{ patient_id: "patient-1", last_inbound_at: "2026-09-06T10:00:00.000Z" }], error: null }),
      ],
      bot_interactions: [updateChain],
    });

    const result = await sendDueInteractions();

    expect(result.failed).toBe(1);
    expect(mocks.sendFreeformMessage).not.toHaveBeenCalled();
  });

  it("paciente ya no existe → 'patient_not_found', nunca intenta enviar", async () => {
    mocks.rpc.mockResolvedValue({ data: [medicationInteraction], error: null });
    const updateChain = makeChain({ error: null });
    queueFrom({
      patients: [makeChain({ data: [], error: null })],
      patient_messaging_state: [makeChain({ data: [], error: null })],
      bot_interactions: [updateChain],
    });

    const result = await sendDueInteractions();

    expect(result.failed).toBe(1);
    expect(updateChain.update).toHaveBeenCalledWith(expect.objectContaining({ failure_code: "patient_not_found" }));
  });

  it("un error reintentable del proveedor (rate limit) marca 'unknown', no 'failed'", async () => {
    mocks.rpc.mockResolvedValue({ data: [medicationInteraction], error: null });
    const updateChain = makeChain({ error: null });
    queueFrom({
      patients: [makeChain({ data: [{ id: "patient-1", whatsapp_e164: "+5215512345678" }], error: null })],
      patient_messaging_state: [
        makeChain({ data: [{ patient_id: "patient-1", last_inbound_at: "2026-09-08T10:00:00.000Z" }], error: null }),
      ],
      bot_interactions: [updateChain],
    });
    mocks.sendFreeformMessage.mockRejectedValue(
      new WhatsAppProviderError("rate_limited", "Demasiadas solicitudes", { retriable: true }),
    );

    const result = await sendDueInteractions();

    expect(result.failed).toBe(1);
    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ delivery_status: "unknown", failure_code: "rate_limited" }),
    );
  });

  it("B7: recordatorio de cita (informativo) se manda con sesión reciente", async () => {
    const appointmentInteraction = {
      id: "bi-appt",
      patient_id: "patient-1",
      kind: "appointment",
      reply_code: "Z9K1", // sin uso: expects_response=false, pero la RPC siempre asigna uno
      payload_snapshot: { startsAtLocal: "2026-09-09 08:00", roomName: "Consultorio 3" },
    };
    mocks.rpc.mockResolvedValue({ data: [appointmentInteraction], error: null });
    const updateChain = makeChain({ error: null });
    queueFrom({
      patients: [makeChain({ data: [{ id: "patient-1", whatsapp_e164: "+5215512345678" }], error: null })],
      patient_messaging_state: [
        makeChain({ data: [{ patient_id: "patient-1", last_inbound_at: "2026-09-08T10:00:00.000Z" }], error: null }),
      ],
      bot_interactions: [updateChain],
    });
    mocks.sendFreeformMessage.mockResolvedValue({ providerMessageId: "demo-2", acceptedAt: new Date("2026-09-08T14:00:00.000Z") });

    const result = await sendDueInteractions();

    expect(result).toEqual({ claimed: 1, sent: 1, failed: 0 });
    expect(mocks.sendFreeformMessage).toHaveBeenCalledWith({
      toE164: "+5215512345678",
      body: expect.stringContaining("Consultorio 3"),
    });
  });

  it("B7: check-in de no-respuesta se manda con sesión reciente, tono amable sin código de respuesta", async () => {
    const summaryInteraction = {
      id: "bi-summary",
      patient_id: "patient-1",
      kind: "nonresponse_summary",
      reply_code: "M4P2",
      payload_snapshot: { anchorInteractionId: "bi-3" },
    };
    mocks.rpc.mockResolvedValue({ data: [summaryInteraction], error: null });
    const updateChain = makeChain({ error: null });
    queueFrom({
      patients: [makeChain({ data: [{ id: "patient-1", whatsapp_e164: "+5215512345678" }], error: null })],
      patient_messaging_state: [
        makeChain({ data: [{ patient_id: "patient-1", last_inbound_at: "2026-09-08T10:00:00.000Z" }], error: null }),
      ],
      bot_interactions: [updateChain],
    });
    mocks.sendFreeformMessage.mockResolvedValue({ providerMessageId: "demo-3", acceptedAt: new Date("2026-09-08T14:00:00.000Z") });

    const result = await sendDueInteractions();

    expect(result).toEqual({ claimed: 1, sent: 1, failed: 0 });
    const sentBody = mocks.sendFreeformMessage.mock.calls[0][0].body as string;
    expect(sentBody).not.toMatch(/\bSI\b|\bNO\b|GLUCOSA|PRESION/);
  });

  it("un error no reintentable (número inválido) marca 'failed' directo", async () => {
    mocks.rpc.mockResolvedValue({ data: [medicationInteraction], error: null });
    const updateChain = makeChain({ error: null });
    queueFrom({
      patients: [makeChain({ data: [{ id: "patient-1", whatsapp_e164: "+5215512345678" }], error: null })],
      patient_messaging_state: [
        makeChain({ data: [{ patient_id: "patient-1", last_inbound_at: "2026-09-08T10:00:00.000Z" }], error: null }),
      ],
      bot_interactions: [updateChain],
    });
    mocks.sendFreeformMessage.mockRejectedValue(
      new WhatsAppProviderError("invalid_recipient", "Número inválido", { retriable: false }),
    );

    const result = await sendDueInteractions();

    expect(result.failed).toBe(1);
    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ delivery_status: "failed", failure_code: "invalid_recipient" }),
    );
  });
});
