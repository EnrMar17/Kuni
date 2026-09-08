import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyWebhookSignature: vi.fn((input: { signatureHeader: string | null }) => input.signatureHeader !== null),
  from: vi.fn(),
}));

vi.mock("@/lib/env/server", () => ({ serverEnv: { APP_PUBLIC_URL: "https://kuni.example.com" } }));
vi.mock("@/lib/whatsapp/provider", () => ({
  getWhatsAppProvider: async () => ({
    dbProviderValue: "twilio",
    verifyWebhookSignature: mocks.verifyWebhookSignature,
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from }) }));

import { POST } from "@/app/api/webhooks/whatsapp/route";

function makeChain(result: { data?: unknown; error?: unknown } = { data: null, error: null }) {
  const chain = {
    insert: vi.fn(() => chain),
    upsert: vi.fn(() => chain),
    select: vi.fn(() => chain),
    update: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: <TResult1 = typeof result>(
      onfulfilled?: ((value: typeof result) => TResult1 | PromiseLike<TResult1>) | null,
    ) => Promise.resolve(result).then(onfulfilled),
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

function twilioForm(fields: Record<string, string>) {
  return new URLSearchParams(fields).toString();
}

function request(body: string, signature: string | null = "sig") {
  const headers = new Headers();
  if (signature !== null) headers.set("x-twilio-signature", signature);
  return new Request("https://kuni.example.com/api/webhooks/whatsapp", { method: "POST", headers, body });
}

beforeEach(() => {
  mocks.verifyWebhookSignature.mockClear();
  mocks.verifyWebhookSignature.mockImplementation((input: { signatureHeader: string | null }) => input.signatureHeader !== null);
  mocks.from.mockReset();
});

describe("POST /api/webhooks/whatsapp — firma y payload", () => {
  it("firma inválida → 403, nunca toca la base", async () => {
    mocks.verifyWebhookSignature.mockReturnValue(false);
    const res = await POST(request(twilioForm({ MessageSid: "SM1", From: "whatsapp:+5215512345678", Body: "SI A7F3" })));
    expect(res.status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("sin MessageSid o From → 400, nunca toca la base", async () => {
    const res = await POST(request(twilioForm({ Body: "SI A7F3" })));
    expect(res.status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});

describe("POST /api/webhooks/whatsapp — deduplicación", () => {
  it("MessageSid repetido (violación de unicidad) → ack 200 sin reprocesar", async () => {
    queueFrom({ webhook_events: [makeChain({ error: { code: "23505" } })] });
    const res = await POST(request(twilioForm({ MessageSid: "SM1", From: "whatsapp:+5215512345678", Body: "SI A7F3" })));
    expect(res.status).toBe(200);
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/webhooks/whatsapp — remitente no registrado", () => {
  it("teléfono sin paciente activo → se marca 'ignored' y se ACK 200", async () => {
    const markIgnored = makeChain({ error: null });
    queueFrom({
      webhook_events: [makeChain({ error: null }), markIgnored],
      patients: [makeChain({ data: null, error: null })],
    });
    const res = await POST(request(twilioForm({ MessageSid: "SM-desconocido", From: "whatsapp:+5219999999999", Body: "hola" })));
    expect(res.status).toBe(200);
    expect(markIgnored.update).toHaveBeenCalledWith(
      expect.objectContaining({ processing_status: "ignored" }),
    );
  });
});

describe("POST /api/webhooks/whatsapp — paciente resuelto", () => {
  it("guarda el mensaje ya interpretado (parseIncomingMessage) junto al crudo, sin marcar 'processed'", async () => {
    const persistParsed = makeChain({ error: null });
    queueFrom({
      webhook_events: [makeChain({ error: null }), persistParsed],
      patients: [makeChain({ data: { id: "patient-1", unit_id: "unit-1" }, error: null })],
      patient_messaging_state: [makeChain({ error: null })],
    });

    const res = await POST(
      request(twilioForm({ MessageSid: "SM-ok", From: "whatsapp:+5215512345678", Body: "SI A7F3" })),
    );

    expect(res.status).toBe(200);
    expect(persistParsed.update).toHaveBeenCalledWith(
      expect.objectContaining({
        unit_id: "unit-1",
        normalized_payload: expect.objectContaining({
          patientId: "patient-1",
          parsed: { kind: "medication_confirm", taken: true, referenceCode: "A7F3" },
        }),
      }),
    );
    // Nunca se marca 'processed': el efecto clínico sigue pendiente de C.
    expect(persistParsed.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ processing_status: "processed" }),
    );
  });

  it("un mensaje irreconocible también se guarda (kind:'unrecognized'), no se descarta", async () => {
    const persistParsed = makeChain({ error: null });
    queueFrom({
      webhook_events: [makeChain({ error: null }), persistParsed],
      patients: [makeChain({ data: { id: "patient-1", unit_id: "unit-1" }, error: null })],
      patient_messaging_state: [makeChain({ error: null })],
    });

    const res = await POST(
      request(twilioForm({ MessageSid: "SM-raro", From: "whatsapp:+5215512345678", Body: "no sé qué escribir" })),
    );

    expect(res.status).toBe(200);
    expect(persistParsed.update).toHaveBeenCalledWith(
      expect.objectContaining({
        normalized_payload: expect.objectContaining({ parsed: expect.objectContaining({ kind: "unrecognized" }) }),
      }),
    );
  });
});
