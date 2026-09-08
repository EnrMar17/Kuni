import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from }) }));
import { reconcileStatusEvents } from "@/lib/jobs/reconcile-status";

function chain(data: unknown, error: unknown = null) {
  const result = { data, error, count: Array.isArray(data) ? data.length : null };
  const value = { select: vi.fn(() => value), eq: vi.fn(() => value), in: vi.fn(() => value), order: vi.fn(() => value),
    range: vi.fn(() => value), update: vi.fn(() => value), maybeSingle: vi.fn(async () => result),
    then: (resolve: (r: typeof result) => unknown) => Promise.resolve(result).then(resolve) };
  return value;
}
const event = { id: "event-1", provider: "twilio", external_message_id: "SM1", received_at: "2026-09-08T10:00:00Z",
  normalized_payload: { MessageStatus: "delivered" } };
beforeEach(() => mocks.from.mockReset());

describe("reconciliación durable de callbacks", () => {
  it("callback antes del SID queda pendiente; después del SID aplica la fecha original", async () => {
    mocks.from.mockReturnValueOnce(chain([event])).mockReturnValueOnce(chain(null));
    expect(await reconcileStatusEvents()).toEqual({ processed: 0, pending: 1 });
    const find = chain({ id: "i-1", unit_id: "u-1", patient_id: "p-1", delivery_status: "accepted", expects_response: true, delivered_at: null, response_deadline_at: null });
    const update = chain([{ id: "i-1" }]);
    mocks.from.mockReturnValueOnce(chain([event])).mockReturnValueOnce(find).mockReturnValueOnce(chain({ bot_response_timeout_minutes: 45 }))
      .mockReturnValueOnce(update).mockReturnValueOnce(chain(null));
    expect(await reconcileStatusEvents()).toEqual({ processed: 1, pending: 0 });
    expect(find.eq).toHaveBeenCalledWith("provider", "twilio");
    expect(update.update).toHaveBeenCalledWith(expect.objectContaining({ delivered_at: "2026-09-08T10:00:00.000Z", response_deadline_at: "2026-09-08T10:45:00.000Z" }));
  });

  it("un error SQL no se presenta como callback procesado", async () => {
    mocks.from.mockReturnValueOnce(chain([event])).mockReturnValueOnce(chain(null, new Error("offline")));
    await expect(reconcileStatusEvents()).rejects.toThrow("reconciliar");
    expect(mocks.from).toHaveBeenCalledTimes(2);
  });

  it("read ya guardado no retrocede al reconciliar delivered", async () => {
    const mark = chain(null);
    mocks.from.mockReturnValueOnce(chain([event])).mockReturnValueOnce(chain({ id: "i-1", unit_id: "u-1", patient_id: "p-1",
      delivery_status: "read", expects_response: true, delivered_at: "2026-09-08T10:00:00Z", response_deadline_at: "2026-09-08T11:00:00Z" })).mockReturnValueOnce(mark);
    expect(await reconcileStatusEvents()).toEqual({ processed: 1, pending: 0 });
    expect(mark.update).toHaveBeenCalledWith(expect.objectContaining({ processing_status: "processed" }));
    expect(mocks.from).toHaveBeenCalledTimes(3);
  });
});
