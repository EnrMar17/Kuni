import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { processInboundEvent } from "@/lib/whatsapp/process-inbound";
import { readAllJobRows } from "./pagination";

/** A durable BAJA is reprocessed before sending the outbound queue. */
export async function reconcileInboundEvents() {
  const admin = createAdminClient();
  const events = await readAllJobRows((from, to) => admin.from("webhook_events")
    .select("*", { count: "exact" }).eq("event_type", "inbound")
    .in("processing_status", ["received", "failed"])
    .order("received_at").order("id").range(from, to));
  let processed = 0;
  for (const event of events) {
    await processInboundEvent(admin, event);
    processed += 1;
  }
  return { processed };
}
