import { describe, expect, it } from "vitest";
import { computeStatusPatch, type BotInteractionStatusState, type StatusCallbackEvent } from "@/lib/whatsapp/status";

function state(overrides: Partial<BotInteractionStatusState> = {}): BotInteractionStatusState {
  return {
    deliveryStatus: "sending",
    expectsResponse: true,
    deliveredAt: null,
    responseDeadlineAt: null,
    botResponseTimeoutMinutes: 60,
    ...overrides,
  };
}

function event(overrides: Partial<StatusCallbackEvent> = {}): StatusCallbackEvent {
  return {
    twilioStatus: "sent",
    errorCode: null,
    errorMessage: null,
    receivedAt: new Date("2026-09-08T12:00:00.000Z"),
    ...overrides,
  };
}

describe("computeStatusPatch — progresión normal", () => {
  it("sending → sent se traduce a 'accepted' y fija accepted_at", () => {
    const patch = computeStatusPatch(state({ deliveryStatus: "sending" }), event({ twilioStatus: "sent" }));
    expect(patch).toEqual({ delivery_status: "accepted", accepted_at: "2026-09-08T12:00:00.000Z" });
  });

  it("accepted → delivered fija delivered_at y calcula response_deadline_at con el timeout del paciente", () => {
    const patch = computeStatusPatch(
      state({ deliveryStatus: "accepted", expectsResponse: true, botResponseTimeoutMinutes: 60 }),
      event({ twilioStatus: "delivered", receivedAt: new Date("2026-09-08T12:00:00.000Z") }),
    );
    expect(patch).toEqual({
      delivery_status: "delivered",
      delivered_at: "2026-09-08T12:00:00.000Z",
      response_deadline_at: "2026-09-08T13:00:00.000Z",
    });
  });

  it("delivered sin expects_response no calcula response_deadline_at (avisos informativos)", () => {
    const patch = computeStatusPatch(
      state({ deliveryStatus: "accepted", expectsResponse: false }),
      event({ twilioStatus: "delivered" }),
    );
    expect(patch).toEqual({ delivery_status: "delivered", delivered_at: "2026-09-08T12:00:00.000Z" });
  });

  it("delivered → read fija read_at sin tocar delivered_at ni recalcular el plazo", () => {
    const patch = computeStatusPatch(
      state({
        deliveryStatus: "delivered",
        deliveredAt: "2026-09-08T11:00:00.000Z",
        responseDeadlineAt: "2026-09-08T12:00:00.000Z",
      }),
      event({ twilioStatus: "read", receivedAt: new Date("2026-09-08T12:30:00.000Z") }),
    );
    expect(patch).toEqual({ delivery_status: "read", read_at: "2026-09-08T12:30:00.000Z" });
  });
});

describe("computeStatusPatch — desorden y terminales", () => {
  it("un 'queued' que llega después de 'accepted' no retrocede el estado", () => {
    const patch = computeStatusPatch(state({ deliveryStatus: "accepted" }), event({ twilioStatus: "queued" }));
    expect(patch).toBeNull();
  });

  it("un 'sent' tardío después de 'delivered' no retrocede a 'accepted'", () => {
    const patch = computeStatusPatch(
      state({ deliveryStatus: "delivered", deliveredAt: "2026-09-08T11:00:00.000Z" }),
      event({ twilioStatus: "sent" }),
    );
    expect(patch).toBeNull();
  });

  it("un 'failed' fuera de orden después de 'delivered' NO borra la entrega ya confirmada", () => {
    const patch = computeStatusPatch(
      state({ deliveryStatus: "delivered", deliveredAt: "2026-09-08T11:00:00.000Z" }),
      event({ twilioStatus: "failed", errorCode: "63003" }),
    );
    expect(patch).toBeNull();
  });

  it("una vez 'read', ningún callback posterior cambia nada (terminal de facto)", () => {
    const patch = computeStatusPatch(state({ deliveryStatus: "read" }), event({ twilioStatus: "delivered" }));
    expect(patch).toBeNull();
  });

  it("una vez 'failed', un 'delivered' tardío no lo revive", () => {
    const patch = computeStatusPatch(state({ deliveryStatus: "failed" }), event({ twilioStatus: "delivered" }));
    expect(patch).toBeNull();
  });

  it("'undelivered' se traduce a 'failed' con el código/detalle de Twilio", () => {
    const patch = computeStatusPatch(
      state({ deliveryStatus: "accepted" }),
      event({ twilioStatus: "undelivered", errorCode: "63024", errorMessage: "Untemplated message" }),
    );
    expect(patch).toEqual({ delivery_status: "failed", failure_code: "63024", failure_detail: "Untemplated message" });
  });

  it("'failed' directo desde 'queued' (nunca llegó a enviarse) se registra sin tocar delivered_at", () => {
    const patch = computeStatusPatch(state({ deliveryStatus: "queued" }), event({ twilioStatus: "failed", errorCode: "30003" }));
    expect(patch).toEqual({ delivery_status: "failed", failure_code: "30003", failure_detail: null });
  });
});
