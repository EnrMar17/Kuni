import "server-only";
import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTwilioWhatsAppProvider } from "@/lib/whatsapp/provider";
import type { TwilioMessageStatus } from "@/lib/whatsapp/status";
import { applyStatusPatchWithRetry } from "@/lib/jobs/apply-status";
import { KNOWN_TWILIO_STATUSES } from "@/lib/jobs/reconcile-status";

// El SDK de Twilio (validación de firma) necesita Node; Edge no sirve aquí.
export const runtime = "nodejs";

const WEBHOOK_PATH = "/api/webhooks/whatsapp/status";

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

/**
 * `StatusCallback` de Twilio — callback de entrega de `bot_interactions`.
 * Sección "Entrega" de kuni-plan-tecnico.md y `docs/documentacionB.md`
 * ("Pendiente para B"): valida firma, deduplica por (proveedor, sid+status)
 * en `webhook_events`, y aplica la progresión de `computeStatusPatch()`
 * (status.ts) sin dejar que un callback desordenado pise un resultado ya
 * confirmado.
 *
 * Siempre responde 200 salvo firma inválida (403) o payload sin forma
 * reconocible (400) — un 5xx le dice a Twilio "reintenta", así que solo se
 * usa para fallas realmente transitorias (ver los catch de abajo).
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const params = Object.fromEntries(new URLSearchParams(rawBody));

    const provider = await getTwilioWhatsAppProvider();
  if (!serverEnv.APP_PUBLIC_URL) {
    console.error("[whatsapp/status] APP_PUBLIC_URL no configurado; no se puede validar la firma.");
    return new NextResponse(null, { status: 500 });
  }
  const url = `${serverEnv.APP_PUBLIC_URL}${WEBHOOK_PATH}`;
  const signatureHeader = request.headers.get("x-twilio-signature");
  if (!provider.verifyWebhookSignature({ signatureHeader, url, params })) {
    return new NextResponse("Firma inválida", { status: 403 });
  }

  const messageSid = params.MessageSid;
  const rawStatus = params.MessageStatus;
  if (!messageSid || !rawStatus || !KNOWN_TWILIO_STATUSES.has(rawStatus)) {
    return new NextResponse("Payload de callback incompleto o irreconocible", { status: 400 });
  }
  const twilioStatus = rawStatus as TwilioMessageStatus;
  const errorCode = params.ErrorCode ?? null;
  const errorMessage = params.ErrorMessage ?? null;

  const admin = createAdminClient();
  let receivedAt = new Date();
  // Dedup: el mismo (MessageSid, MessageStatus) no debe aplicarse dos veces
  // si Twilio reintenta la entrega del webhook (falta de ACK a tiempo, etc.).
  const eventKey = `${messageSid}:${twilioStatus}`;
  const { error: insertEventError } = await admin.from("webhook_events").insert({
    provider: provider.dbProviderValue,
    event_key: eventKey,
    event_type: "status",
    external_message_id: messageSid,
    normalized_payload: params,
    received_at: receivedAt.toISOString(),
  });

  if (insertEventError) {
    if (isUniqueViolation(insertEventError)) {
      const existing = await admin.from("webhook_events").select("processing_status, received_at")
        .eq("provider", provider.dbProviderValue).eq("event_key", eventKey).maybeSingle();
      if (existing.error || !existing.data) return new NextResponse(null, { status: 500 });
      if (["processed", "ignored"].includes(existing.data.processing_status)) return new NextResponse(null, { status: 200 });
      receivedAt = new Date(existing.data.received_at);
    } else {
      console.error("[whatsapp/status] error persistiendo webhook_events:", insertEventError);
      return new NextResponse(null, { status: 500 });
    }
  }

  const markEvent = (fields: { processing_status: string; last_error?: string | null }) =>
    admin
      .from("webhook_events")
      .update({ ...fields, processed_at: new Date().toISOString() })
      .eq("provider", provider.dbProviderValue)
      .eq("event_key", eventKey);

  const outcome = await applyStatusPatchWithRetry(admin, messageSid, { twilioStatus, errorCode, errorMessage, receivedAt, provider: provider.dbProviderValue });

  if (outcome === "not_found") {
    // Puede adelantarse al guardado del SID por el emisor. Mantener pendiente
    // para el tick; no atribuir el callback a otra interacción por heurística.
    return new NextResponse(null, { status: 200 });
  }
  if (outcome === "error") {
    return new NextResponse(null, { status: 500 });
  }

  const marked = await markEvent({ processing_status: "processed", last_error: null });
  if (marked.error) return new NextResponse(null, { status: 500 });
  return new NextResponse(null, { status: 200 });
}
