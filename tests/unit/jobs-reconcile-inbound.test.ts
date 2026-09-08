import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn(), process: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from }) }));
vi.mock("@/lib/whatsapp/process-inbound", () => ({ processInboundEvent: mocks.process }));
import { reconcileInboundEvents } from "@/lib/jobs/reconcile-inbound";

beforeEach(() => { mocks.from.mockReset(); mocks.process.mockReset().mockResolvedValue({ outcome: "recorded" }); });
function pages(rows: { id: string }[]) {
  const chain = {
    select: vi.fn(() => chain), eq: vi.fn(() => chain), in: vi.fn(() => chain), order: vi.fn(() => chain),
    range: vi.fn(async (from: number, to: number) => ({ data: rows.slice(from, to + 1), count: rows.length, error: null })),
  };
  mocks.from.mockReturnValue(chain);
  return chain;
}
it("processes all pages of durable inbound events in receipt order", async () => {
  const rows = Array.from({ length: 501 }, (_, i) => ({ id: String(i) }));
  const chain = pages(rows);
  expect(await reconcileInboundEvents()).toEqual({ processed: 501 });
  expect(chain.eq).toHaveBeenCalledWith("event_type", "inbound");
  expect(chain.in).toHaveBeenCalledWith("processing_status", ["received", "failed"]);
  expect(chain.order.mock.calls).toEqual([["received_at"], ["id"], ["received_at"], ["id"]]);
  expect(mocks.process.mock.calls.map(call => call[1].id)).toEqual(rows.map(row => row.id));
});
it("propagates an atomic failure so tick cannot proceed to outbound sending", async () => {
  pages([{ id: "1" }]);
  mocks.process.mockRejectedValue(new Error("RPC unavailable"));
  await expect(reconcileInboundEvents()).rejects.toThrow("RPC unavailable");
});
