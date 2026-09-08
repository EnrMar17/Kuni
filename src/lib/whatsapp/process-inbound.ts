import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { phoneLookupCandidates } from "./phone";
import { parseIncomingMessage } from "../../../domain-core/src/lib/whatsapp/parser";
import type { Database, Json } from "@/types/database.types";

export type InboundEvent = Database["public"]["Tables"]["webhook_events"]["Row"];
export type InboundOutcome = { outcome: string; reason?: string; duplicate: boolean };

/** Use the durable original, never the payload of a later duplicate request. */
export async function processInboundEvent(admin: ReturnType<typeof createAdminClient>, event: InboundEvent): Promise<InboundOutcome> {
  const payload = event.normalized_payload as { raw?: Record<string, string> } | null;
  const raw = payload?.raw;
  if (!raw?.From) throw new Error(`Inbound sin remitente durable: ${event.id}`);
  const parsed = parseIncomingMessage(raw.Body?.trim() ? raw.Body : raw.ButtonPayload ?? "");
  const { data, error } = await admin.rpc("process_inbound_event", {
    p_event_id: event.id, p_phone_candidates: phoneLookupCandidates(raw.From), p_parsed: parsed as unknown as Json,
  });
  if (error) throw error;
  if (!data || typeof data !== "object" || Array.isArray(data) || typeof data.outcome !== "string") {
    throw new Error("Respuesta invalida de process_inbound_event");
  }
  return data as unknown as InboundOutcome;
}
