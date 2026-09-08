import "server-only";
import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWhatsAppProvider } from "@/lib/whatsapp/provider";
import { processInboundEvent } from "@/lib/whatsapp/process-inbound";

export const runtime = "nodejs";
const WEBHOOK_PATH = "/api/webhooks/whatsapp";

function acknowledge(help?: string) {
  const escaped = help?.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return new NextResponse(`<Response>${escaped ? `<Message>${escaped}</Message>` : ""}</Response>`, {
    status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

/** Signature -> durable receipt -> atomic clinical effect. Retries use the original receipt. */
export async function POST(request: Request) {
  const params = Object.fromEntries(new URLSearchParams(await request.text()));
  const provider = await getWhatsAppProvider();
  if (!serverEnv.APP_PUBLIC_URL) return new NextResponse(null, { status: 500 });
  if (!provider.verifyWebhookSignature({ signatureHeader: request.headers.get("x-twilio-signature"),
    url: `${serverEnv.APP_PUBLIC_URL}${WEBHOOK_PATH}`, params })) {
    return new NextResponse("Firma invalida", { status: 403 });
  }
  if (!params.MessageSid || !params.From) return new NextResponse("Payload incompleto", { status: 400 });
  const admin = createAdminClient();
  try {
    const inserted = await admin.from("webhook_events").insert({
      provider: provider.dbProviderValue, event_key: params.MessageSid, event_type: "inbound",
      external_message_id: params.MessageSid, normalized_payload: { raw: params },
    });
    if (inserted.error && inserted.error.code !== "23505") throw inserted.error;
    const stored = await admin.from("webhook_events").select("*")
      .eq("provider", provider.dbProviderValue).eq("event_key", params.MessageSid).eq("event_type", "inbound").single();
    if (stored.error || !stored.data) throw stored.error ?? new Error("Inbound no persistido");
    const result = await processInboundEvent(admin, stored.data);
    return acknowledge(result.outcome === "help" ? result.reason : undefined);
  } catch (error) {
    console.error("[whatsapp/inbound] procesamiento pendiente:", error);
    return new NextResponse(null, { status: 500 });
  }
}
