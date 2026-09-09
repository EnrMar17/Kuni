import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(), from: vi.fn(), rpc: vi.fn(),
}));
vi.mock("@/lib/env/server", () => ({ serverEnv: { APP_PUBLIC_URL: "https://kuni.example.com" } }));
vi.mock("@/lib/whatsapp/provider", () => ({
  getTwilioWhatsAppProvider: async () => ({ dbProviderValue: "twilio", verifyWebhookSignature: mocks.verify }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from, rpc: mocks.rpc }) }));
import { POST } from "@/app/api/webhooks/whatsapp/route";

function request(fields: Record<string, string> = {}) {
  return new Request("https://kuni.example.com/api/webhooks/whatsapp", {
    method: "POST", headers: { "x-twilio-signature": "signature" },
    body: new URLSearchParams({ MessageSid: "SM-original", From: "whatsapp:+5214431234567", Body: "SI ABCD1234", ...fields }),
  });
}
const stored = () => ({
  id: "event-1", provider: "twilio", event_key: "SM-original", event_type: "inbound",
  received_at: "2026-09-08T12:00:00Z", processing_status: "received",
  normalized_payload: { raw: { From: "whatsapp:+5214431234567", Body: "SI ABCD1234" } },
});
function setup(options: { insertError?: unknown; selectError?: unknown; event?: unknown } = {}) {
  const chain = {
    insert: vi.fn().mockResolvedValue({ error: options.insertError ?? null }),
    select: vi.fn(() => chain), eq: vi.fn(() => chain),
    single: vi.fn().mockResolvedValue({ data: options.event ?? stored(), error: options.selectError ?? null }),
  };
  mocks.from.mockReturnValue(chain);
  return chain;
}
beforeEach(() => {
  mocks.verify.mockReset().mockReturnValue(true);
  mocks.from.mockReset();
  mocks.rpc.mockReset().mockResolvedValue({ data: { outcome: "recorded", duplicate: false }, error: null });
  setup();
});
describe("durable inbound webhook", () => {
  it("rejects an invalid signature before database access", async () => {
    mocks.verify.mockReturnValue(false);
    expect((await POST(request())).status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("requires sender and message id", async () => {
    expect((await POST(request({ From: "" }))).status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("persists the signed payload and invokes the atomic RPC with Mexico variants", async () => {
    const chain = setup();
    const result = await POST(request());
    expect(result.status).toBe(200);
    expect(await result.text()).toBe("<Response></Response>");
    expect(result.headers.get("content-type")).toContain("text/xml");
    expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({ event_type: "inbound", event_key: "SM-original" }));
    expect(mocks.rpc).toHaveBeenCalledWith("process_inbound_event", {
      p_event_id: "event-1", p_phone_candidates: ["+5214431234567", "+524431234567"],
      p_parsed: { kind: "medication_confirm", taken: true, referenceCode: "ABCD1234" },
    });
  });
  it("retries a duplicate using the durable original, not changed request contents", async () => {
    setup({ insertError: { code: "23505" } });
    expect((await POST(request({ Body: "NO ABCD1234", From: "whatsapp:+12345678901" }))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("process_inbound_event", expect.objectContaining({
      p_phone_candidates: ["+5214431234567", "+524431234567"],
      p_parsed: expect.objectContaining({ taken: true }),
    }));
  });
  it("returns 500 when the RPC fails; the next duplicate invokes it again", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "database unavailable" } });
    expect((await POST(request())).status).toBe(500);
    setup({ insertError: { code: "23505" } });
    expect((await POST(request())).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });
  it("does not acknowledge a failed initial insert or read", async () => {
    setup({ insertError: { code: "08000" } });
    expect((await POST(request())).status).toBe(500);
    setup({ selectError: { code: "08000" } });
    expect((await POST(request())).status).toBe(500);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("processes BAJA and uses ButtonPayload when Body is empty", async () => {
    const event = stored();
    event.normalized_payload.raw = { From: "whatsapp:+5214431234567", Body: "" };
    Object.assign(event.normalized_payload.raw, { ButtonPayload: "BAJA" });
    setup({ event });
    await POST(request());
    expect(mocks.rpc).toHaveBeenCalledWith("process_inbound_event", expect.objectContaining({ p_parsed: { kind: "opt_out" } }));
  });
  it("returns escaped TwiML help without directly calling a send API", async () => {
    mocks.rpc.mockResolvedValue({ data: { outcome: "help", reason: "Usa <codigo> & revisa", duplicate: false }, error: null });
    const result = await POST(request());
    expect(await result.text()).toBe("<Response><Message>Usa &lt;codigo&gt; &amp; revisa</Message></Response>");
  });
  it("does not silently acknowledge a missing durable sender or invalid RPC result", async () => {
    setup({ event: { ...stored(), normalized_payload: {} } });
    expect((await POST(request())).status).toBe(500);
    setup();
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    expect((await POST(request())).status).toBe(500);
  });
});
