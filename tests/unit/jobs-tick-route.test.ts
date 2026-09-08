import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  expireDueInteractions: vi.fn(),
  materializeDueInteractions: vi.fn(),
  sendDueInteractions: vi.fn(),
  reconcileStatusEvents: vi.fn(),
  reconcileInboundEvents: vi.fn(),
  refreshPatientDerivatives: vi.fn(),
}));
vi.mock("@/lib/env/server", () => ({ serverEnv: { CRON_SECRET: "un-secreto-de-mas-de-16-caracteres" } }));
vi.mock("@/lib/jobs/expire", () => ({ expireDueInteractions: mocks.expireDueInteractions }));
vi.mock("@/lib/jobs/materialize", () => ({ materializeDueInteractions: mocks.materializeDueInteractions }));
vi.mock("@/lib/jobs/send", () => ({ sendDueInteractions: mocks.sendDueInteractions }));
vi.mock("@/lib/jobs/reconcile-status", () => ({ reconcileStatusEvents: mocks.reconcileStatusEvents }));
vi.mock("@/lib/jobs/reconcile-inbound", () => ({ reconcileInboundEvents: mocks.reconcileInboundEvents }));
vi.mock("@/lib/jobs/refresh-derivatives", () => ({ refreshPatientDerivatives: mocks.refreshPatientDerivatives }));

import { POST } from "@/app/api/jobs/tick/route";

function request(bearer: string | null) {
  const headers = new Headers();
  if (bearer !== null) headers.set("authorization", bearer);
  return new Request("https://kuni.example.com/api/jobs/tick", { method: "POST", headers });
}

beforeEach(() => {
  mocks.refreshPatientDerivatives.mockReset().mockResolvedValue({ checked: 0, refreshed: 0 });
  mocks.reconcileInboundEvents.mockReset().mockResolvedValue({ processed: 0 });
  mocks.reconcileStatusEvents.mockReset().mockResolvedValue({ processed: 0, pending: 0 });
  mocks.expireDueInteractions.mockReset().mockResolvedValue({ expired: 0 });
  mocks.materializeDueInteractions.mockReset().mockResolvedValue({ candidates: 1, created: 1 });
  mocks.sendDueInteractions.mockReset().mockResolvedValue({ claimed: 1, sent: 1, failed: 0 });
});

describe("POST /api/jobs/tick", () => {
  it("si inbound falla, no vence, materializa ni envia", async () => {
    mocks.reconcileInboundEvents.mockRejectedValue(new Error("inbound pendiente"));
    expect((await POST(request("Bearer un-secreto-de-mas-de-16-caracteres"))).status).toBe(500);
    expect(mocks.expireDueInteractions).not.toHaveBeenCalled();
    expect(mocks.materializeDueInteractions).not.toHaveBeenCalled();
    expect(mocks.sendDueInteractions).not.toHaveBeenCalled();
  });
  it("sin header Authorization → 401, nunca corre los jobs", async () => {
    const res = await POST(request(null));
    expect(res.status).toBe(401);
    expect(mocks.expireDueInteractions).not.toHaveBeenCalled();
    expect(mocks.materializeDueInteractions).not.toHaveBeenCalled();
  });

  it("con Bearer incorrecto → 401", async () => {
    const res = await POST(request("Bearer token-equivocado"));
    expect(res.status).toBe(401);
    expect(mocks.materializeDueInteractions).not.toHaveBeenCalled();
  });

  it("con el Bearer correcto → 200, corre expire, LUEGO materialize y LUEGO send, y devuelve los tres resultados", async () => {
    const order: string[] = [];
    mocks.refreshPatientDerivatives.mockImplementation(async () => {
      order.push("derivatives"); return { checked: 1, refreshed: 1 };
    });
    mocks.reconcileInboundEvents.mockImplementation(async () => { order.push("inbound"); return { processed: 0 }; });
    mocks.reconcileStatusEvents.mockImplementation(async () => {
      order.push("callbacks");
      return { processed: 0, pending: 0 };
    });
    mocks.expireDueInteractions.mockImplementation(async () => {
      order.push("expire");
      return { expired: 2 };
    });
    mocks.materializeDueInteractions.mockImplementation(async () => {
      order.push("materialize");
      return { candidates: 1, created: 1 };
    });
    mocks.sendDueInteractions.mockImplementation(async () => {
      order.push("send");
      return { claimed: 1, sent: 1, failed: 0 };
    });

    const res = await POST(request("Bearer un-secreto-de-mas-de-16-caracteres"));

    expect(res.status).toBe(200);
    // El silencio se convierte en alerta antes de que salgan los mensajes nuevos.
    expect(order).toEqual(["callbacks", "inbound", "expire", "derivatives", "materialize", "send", "callbacks"]);
    expect(await res.json()).toEqual({
      callbacksBefore: { processed: 0, pending: 0 }, callbacksAfter: { processed: 0, pending: 0 },
      inbound: { processed: 0 },
      expire: { expired: 2 },
      derivatives: { checked: 1, refreshed: 1 },
      materialize: { candidates: 1, created: 1 },
      send: { claimed: 1, sent: 1, failed: 0 },
    });
  });

  it("si el vencimiento falla, no se materializa ni se envía: 500", async () => {
    mocks.expireDueInteractions.mockRejectedValue(new Error("rpc caida"));
    const res = await POST(request("Bearer un-secreto-de-mas-de-16-caracteres"));
    expect(res.status).toBe(500);
    expect(mocks.materializeDueInteractions).not.toHaveBeenCalled();
    expect(mocks.sendDueInteractions).not.toHaveBeenCalled();
  });

  it("si falla el recalculo, no materializa ni envia y permite reintentar", async () => {
    mocks.refreshPatientDerivatives.mockRejectedValue(new Error("derivados pendientes"));
    expect((await POST(request("Bearer un-secreto-de-mas-de-16-caracteres"))).status).toBe(500);
    expect(mocks.materializeDueInteractions).not.toHaveBeenCalled();
    expect(mocks.sendDueInteractions).not.toHaveBeenCalled();
  });

  it("un error inesperado en cualquiera de los jobs → 500, no revienta sin responder", async () => {
    mocks.sendDueInteractions.mockRejectedValue(new Error("boom"));
    const res = await POST(request("Bearer un-secreto-de-mas-de-16-caracteres"));
    expect(res.status).toBe(500);
  });
});
