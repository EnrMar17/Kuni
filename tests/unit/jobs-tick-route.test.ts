import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  expireDueInteractions: vi.fn(),
  materializeDueInteractions: vi.fn(),
  sendDueInteractions: vi.fn(),
}));
vi.mock("@/lib/env/server", () => ({ serverEnv: { CRON_SECRET: "un-secreto-de-mas-de-16-caracteres" } }));
vi.mock("@/lib/jobs/expire", () => ({ expireDueInteractions: mocks.expireDueInteractions }));
vi.mock("@/lib/jobs/materialize", () => ({ materializeDueInteractions: mocks.materializeDueInteractions }));
vi.mock("@/lib/jobs/send", () => ({ sendDueInteractions: mocks.sendDueInteractions }));

import { POST } from "@/app/api/jobs/tick/route";

function request(bearer: string | null) {
  const headers = new Headers();
  if (bearer !== null) headers.set("authorization", bearer);
  return new Request("https://kuni.example.com/api/jobs/tick", { method: "POST", headers });
}

beforeEach(() => {
  mocks.expireDueInteractions.mockReset().mockResolvedValue({ expired: 0 });
  mocks.materializeDueInteractions.mockReset().mockResolvedValue({ candidates: 1, created: 1 });
  mocks.sendDueInteractions.mockReset().mockResolvedValue({ claimed: 1, sent: 1, failed: 0 });
});

describe("POST /api/jobs/tick", () => {
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
    expect(order).toEqual(["expire", "materialize", "send"]);
    expect(await res.json()).toEqual({
      expire: { expired: 2 },
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

  it("un error inesperado en cualquiera de los jobs → 500, no revienta sin responder", async () => {
    mocks.sendDueInteractions.mockRejectedValue(new Error("boom"));
    const res = await POST(request("Bearer un-secreto-de-mas-de-16-caracteres"));
    expect(res.status).toBe(500);
  });
});
