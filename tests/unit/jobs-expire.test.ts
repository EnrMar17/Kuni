import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: mocks.rpc }) }));

import { expireDueInteractions } from "@/lib/jobs/expire";

beforeEach(() => {
  mocks.rpc.mockReset();
});

describe("expireDueInteractions", () => {
  it("llama a la RPC canónica `expire_due_interactions`, sin replicar el criterio en TypeScript", async () => {
    mocks.rpc.mockResolvedValue({ data: 3, error: null });

    const result = await expireDueInteractions();

    expect(mocks.rpc).toHaveBeenCalledWith("expire_due_interactions");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ expired: 3 });
  });

  it("cero vencidas es el caso normal, no un error", async () => {
    mocks.rpc.mockResolvedValue({ data: 0, error: null });
    await expect(expireDueInteractions()).resolves.toEqual({ expired: 0 });
  });

  it("una respuesta sin número no se convierte en NaN ni en un conteo inventado", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    await expect(expireDueInteractions()).resolves.toEqual({ expired: 0 });
  });

  it("un error de la RPC se propaga: el tick debe fallar visible, no reportar 0 vencidas", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "permission denied" } });
    await expect(expireDueInteractions()).rejects.toMatchObject({ message: "permission denied" });
  });
});
