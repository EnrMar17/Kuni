import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => mocks }));
import { refreshPatientDerivatives } from "@/lib/jobs/refresh-derivatives";

beforeEach(() => { mocks.from.mockReset(); mocks.rpc.mockReset().mockResolvedValue({ data: false, error: null }); });
function pages(rows: { id: string; unit_id: string }[]) {
  const chain = {
    select: vi.fn(() => chain), eq: vi.fn(() => chain), order: vi.fn(() => chain),
    range: vi.fn(async (from: number, to: number) => ({ data: rows.slice(from, to + 1), count: rows.length, error: null })),
  };
  mocks.from.mockReturnValue(chain);
  return chain;
}
it("checks every page with each patient's own unit and counts only changed snapshots", async () => {
  const rows = Array.from({ length: 501 }, (_, i) => ({ id: String(i), unit_id: `unit-${i % 2}` }));
  const chain = pages(rows);
  mocks.rpc.mockResolvedValueOnce({ data: true, error: null });
  expect(await refreshPatientDerivatives()).toEqual({ checked: 501, refreshed: 1 });
  expect(chain.eq).toHaveBeenCalledWith("active", true);
  expect(chain.range).toHaveBeenCalledTimes(2);
  expect(mocks.rpc.mock.calls).toEqual(rows.map(p => ["refresh_patient_derivatives", { p_unit_id: p.unit_id, p_patient_id: p.id }]));
});
it("does not call the RPC for an empty census", async () => {
  pages([]);
  expect(await refreshPatientDerivatives()).toEqual({ checked: 0, refreshed: 0 });
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("propagates failure rather than counting an unconfirmed refresh", async () => {
  pages([{ id: "patient", unit_id: "unit" }]);
  mocks.rpc.mockResolvedValue({ data: null, error: new Error("RPC failed") });
  await expect(refreshPatientDerivatives()).rejects.toThrow("RPC failed");
});
it("rejects malformed RPC responses", async () => {
  pages([{ id: "patient", unit_id: "unit" }]);
  mocks.rpc.mockResolvedValue({ data: null, error: null });
  await expect(refreshPatientDerivatives()).rejects.toThrow("Respuesta invalida");
});
