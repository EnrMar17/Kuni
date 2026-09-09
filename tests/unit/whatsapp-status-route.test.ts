import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  // Igual que los adaptadores reales (demo y Twilio): sin header, siempre false.
  verifyWebhookSignature: vi.fn((input: { signatureHeader: string | null }) => input.signatureHeader !== null),
  from: vi.fn(),
}));

vi.mock("@/lib/env/server", () => ({ serverEnv: { APP_PUBLIC_URL: "https://kuni.example.com" } }));
vi.mock("@/lib/whatsapp/provider", () => ({
  getTwilioWhatsAppProvider: async () => ({
    dbProviderValue: "twilio",
    verifyWebhookSignature: mocks.verifyWebhookSignature,
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from }) }));

import { POST } from "@/app/api/webhooks/whatsapp/status/route";

// Chain "thenable": encadena insert/select/update/eq indefinidamente y
// resuelve con `result` tanto si el test hace `await chain` directo (insert,
// update().eq()) como si llama `.maybeSingle()` explícito (select).
function makeChain(result: { data?: unknown; error?: unknown } = { data: null, error: null }) {
  const chain = {
    insert: vi.fn(() => chain),
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
  return new Request("https://kuni.example.com/api/webhooks/whatsapp/status", {
    method: "POST",
    headers,
    body,
  });
}

beforeEach(() => {
  mocks.verifyWebhookSignature.mockClear();
  mocks.verifyWebhookSignature.mockImplementation((input: { signatureHeader: string | null }) => input.signatureHeader !== null);
  mocks.from.mockReset();
});

describe("POST /api/webhooks/whatsapp/status — firma y payload", () => {
  it("firma inválida → 403, nunca toca la base", async () => {
    mocks.verifyWebhookSignature.mockReturnValue(false);
    const res = await POST(request(twilioForm({ MessageSid: "SM1", MessageStatus: "delivered" })));
    expect(res.status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("sin header de firma → 403, nunca toca la base", async () => {
    const res = await POST(request(twilioForm({ MessageSid: "SM1", MessageStatus: "delivered" }), null));
    expect(res.status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("MessageStatus desconocido/ausente → 400, nunca toca la base", async () => {
    const res = await POST(request(twilioForm({ MessageSid: "SM1", MessageStatus: "algo-raro" })));
    expect(res.status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});

describe("POST /api/webhooks/whatsapp/status — deduplicación", () => {
  it("un (sid,status) repetido (violación de unicidad) → ack 200 sin reprocesar", async () => {
    queueFrom({ webhook_events: [makeChain({ error: { code: "23505" } }), makeChain({ data: { processing_status: "processed", received_at: "2026-09-08T12:00:00Z" }, error: null })] });
    const res = await POST(request(twilioForm({ MessageSid: "SM1", MessageStatus: "delivered" })));
    expect(res.status).toBe(200);
    expect(mocks.from).toHaveBeenCalledTimes(2);
  });
});

describe("POST /api/webhooks/whatsapp/status — sin bot_interaction correspondiente", () => {
  it("SID aún desconocido → queda pendiente para reconciliación y se ACK 200", async () => {
    const markIgnored = makeChain({ error: null });
    queueFrom({
      webhook_events: [makeChain({ error: null }), markIgnored],
      bot_interactions: [makeChain({ data: null, error: null })],
    });
    const res = await POST(request(twilioForm({ MessageSid: "SM-desconocido", MessageStatus: "delivered" })));
    expect(res.status).toBe(200);
    expect(markIgnored.update).not.toHaveBeenCalled();
  });
});

describe("POST /api/webhooks/whatsapp/status — progresión aplicada", () => {
  it("reintenta un duplicado pendiente conservando la fecha de primera recepción", async () => {
    const update = makeChain({ data: [{ id: "interaction-1" }], error: null });
    queueFrom({
      webhook_events: [makeChain({ error: { code: "23505" } }), makeChain({ data: { processing_status: "received", received_at: "2026-09-08T10:00:00.000Z" }, error: null }), makeChain({ error: null })],
      bot_interactions: [makeChain({ data: { id: "interaction-1", unit_id: "unit-1", patient_id: "p-1", delivery_status: "accepted", expects_response: true, delivered_at: null, response_deadline_at: null }, error: null }), update],
      patients: [makeChain({ data: { bot_response_timeout_minutes: 60 }, error: null })],
    });
    expect((await POST(request(twilioForm({ MessageSid: "SM1", MessageStatus: "delivered" })))).status).toBe(200);
    expect(update.update).toHaveBeenCalledWith(expect.objectContaining({ delivered_at: "2026-09-08T10:00:00.000Z", response_deadline_at: "2026-09-08T11:00:00.000Z" }));
  });
  it("delivered con expects_response=true: consulta el timeout del paciente y aplica el patch", async () => {
    const updateInteraction = makeChain({ data: [{ id: "interaction-1" }], error: null });
    const markProcessed = makeChain({ error: null });
    queueFrom({
      webhook_events: [makeChain({ error: null }), markProcessed],
      bot_interactions: [
        makeChain({
          data: {
            id: "interaction-1",
            unit_id: "unit-1",
            patient_id: "patient-1",
            delivery_status: "accepted",
            expects_response: true,
            delivered_at: null,
            response_deadline_at: null,
          },
          error: null,
        }),
        updateInteraction,
      ],
      patients: [makeChain({ data: { bot_response_timeout_minutes: 45 }, error: null })],
    });

    const res = await POST(request(twilioForm({ MessageSid: "SM-ok", MessageStatus: "delivered" })));

    expect(res.status).toBe(200);
    expect(updateInteraction.update).toHaveBeenCalledWith(
      expect.objectContaining({ delivery_status: "delivered", delivered_at: expect.any(String), response_deadline_at: expect.any(String) }),
    );
    expect(markProcessed.update).toHaveBeenCalledWith(
      expect.objectContaining({ processing_status: "processed" }),
    );
  });

  it("evento sin patch (fuera de orden) no llama a update de bot_interactions, pero sí marca el evento procesado", async () => {
    const markProcessed = makeChain({ error: null });
    queueFrom({
      webhook_events: [makeChain({ error: null }), markProcessed],
      bot_interactions: [
        makeChain({
          data: {
            id: "interaction-1",
            unit_id: "unit-1",
            patient_id: "patient-1",
            delivery_status: "delivered",
            expects_response: true,
            delivered_at: "2026-09-08T11:00:00.000Z",
            response_deadline_at: "2026-09-08T12:00:00.000Z",
          },
          error: null,
        }),
      ],
    });

    const res = await POST(request(twilioForm({ MessageSid: "SM-tarde", MessageStatus: "sent" })));

    expect(res.status).toBe(200);
    // Solo se llamó a .from("bot_interactions") para el select, nunca para update.
    expect(mocks.from).toHaveBeenCalledTimes(3);
    expect(markProcessed.update).toHaveBeenCalledWith(
      expect.objectContaining({ processing_status: "processed" }),
    );
  });

  it("delivery_status ya 'read' no vuelve a pedir el timeout del paciente (delivered_at ya está fijo)", async () => {
    const markProcessed = makeChain({ error: null });
    queueFrom({
      webhook_events: [makeChain({ error: null }), markProcessed],
      bot_interactions: [
        makeChain({
          data: {
            id: "interaction-1",
            unit_id: "unit-1",
            patient_id: "patient-1",
            delivery_status: "read",
            expects_response: true,
            delivered_at: "2026-09-08T11:00:00.000Z",
            response_deadline_at: "2026-09-08T12:00:00.000Z",
          },
          error: null,
        }),
      ],
    });

    const res = await POST(request(twilioForm({ MessageSid: "SM-read", MessageStatus: "delivered" })));

    expect(res.status).toBe(200);
    expect(mocks.from).not.toHaveBeenCalledWith("patients");
  });
});

describe("POST /api/webhooks/whatsapp/status — concurrencia optimista", () => {
  it("si el update no afecta filas (otro callback ganó la carrera), relee y recalcula en vez de perder el progreso", async () => {
    // Reproduce lo visto en vivo: este request leyó 'accepted', pero para
    // cuando intenta escribir, otro callback (ej. 'read') ya avanzó la fila
    // a 'read'. El .eq("delivery_status", "accepted") del update hace que
    // ese update no toque ninguna fila (result vacío) — el código debe
    // releer el estado fresco ('read') y, con eso, no hacer nada (un 'sent'
    // nunca debe pisar un 'read' ya confirmado), no escribir a ciegas.
    const staleUpdateAttempt = makeChain({ data: [], error: null }); // 0 filas afectadas
    const markProcessed = makeChain({ error: null });
    queueFrom({
      webhook_events: [makeChain({ error: null }), markProcessed],
      bot_interactions: [
        makeChain({
          data: {
            id: "interaction-1",
            unit_id: "unit-1",
            patient_id: "patient-1",
            delivery_status: "accepted", // lo que este request leyó primero
            expects_response: true,
            delivered_at: null,
            response_deadline_at: null,
          },
          error: null,
        }),
        staleUpdateAttempt, // el intento de update es su propio "from" en la cola
        makeChain({
          data: {
            id: "interaction-1",
            unit_id: "unit-1",
            patient_id: "patient-1",
            delivery_status: "read", // estado fresco tras releer
            expects_response: true,
            delivered_at: "2026-09-08T12:00:00.000Z",
            response_deadline_at: "2026-09-08T13:00:00.000Z",
          },
          error: null,
        }),
      ],
      patients: [makeChain({ data: { bot_response_timeout_minutes: 60 }, error: null })],
    });

    const res = await POST(request(twilioForm({ MessageSid: "SM-race", MessageStatus: "sent" })));

    expect(res.status).toBe(200);
    expect(markProcessed.update).toHaveBeenCalledWith(
      expect.objectContaining({ processing_status: "processed" }),
    );
  });
});
