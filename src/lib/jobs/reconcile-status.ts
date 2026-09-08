import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyStatusPatchWithRetry } from "./apply-status";
import { readAllJobRows } from "./pagination";
import type { TwilioMessageStatus } from "@/lib/whatsapp/status";

export const KNOWN_TWILIO_STATUSES: ReadonlySet<string> = new Set(["queued", "sending", "sent", "delivered", "undelivered", "failed", "read"]);

/** Retry durable callbacks after the sender has had a chance to store its SID. */
export async function reconcileStatusEvents() {
  const admin = createAdminClient();
  const events = await readAllJobRows((from, to) => admin.from("webhook_events")
    .select("id, provider, external_message_id, normalized_payload, received_at", { count: "exact" })
    .eq("event_type", "status").in("processing_status", ["received", "failed"])
    .order("received_at").order("id").range(from, to));
  let processed = 0;
  let pending = 0;
  for (const event of events) {
    const payload = event.normalized_payload as Record<string, unknown> | null;
    const status = payload?.MessageStatus;
    if (!event.external_message_id || typeof status !== "string" || !KNOWN_TWILIO_STATUSES.has(status)) {
      throw new Error(`Callback durable inválido: ${event.id}`);
    }
    const outcome = await applyStatusPatchWithRetry(admin, event.external_message_id, {
      provider: event.provider, twilioStatus: status as TwilioMessageStatus, receivedAt: new Date(event.received_at),
      errorCode: typeof payload?.ErrorCode === "string" ? payload.ErrorCode : null,
      errorMessage: typeof payload?.ErrorMessage === "string" ? payload.ErrorMessage : null,
    });
    if (outcome === "error") throw new Error(`No se pudo reconciliar el callback ${event.id}`);
    if (outcome === "not_found") { pending += 1; continue; }
    const marked = await admin.from("webhook_events").update({ processing_status: "processed", processed_at: new Date().toISOString(), last_error: null })
      .eq("id", event.id).eq("provider", event.provider).in("processing_status", ["received", "failed"]);
    if (marked.error) throw marked.error;
    processed += 1;
  }
  return { processed, pending };
}
