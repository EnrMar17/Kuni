import "server-only";
import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWhatsAppProvider } from "@/lib/whatsapp/provider";
import { phoneLookupCandidates } from "@/lib/whatsapp/phone";
import { parseIncomingMessage, type ParsedMessage } from "../../../../../domain-core/src/lib/whatsapp/parser";

export const runtime = "nodejs";

const WEBHOOK_PATH = "/api/webhooks/whatsapp";

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

/**
 * Webhook entrante de WhatsApp (mensajes del paciente) — sección "Envío y
 * correlación" de kuni-plan-tecnico.md y `docs/documentacionB.md`.
 *
 * Alcance de ESTA entrega, a propósito acotado: valida firma, deduplica por
 * `MessageSid` en `webhook_events`, resuelve el paciente por
 * `whatsapp_e164` y guarda el mensaje ya interpretado (`parseIncomingMessage`
 * de C) junto al crudo. NO escribe el efecto clínico (medición, confirmación
 * de toma, `response_at` de la interacción) — eso exige correlacionar contra
 * `bot_interactions` pendientes y las RPC de registro que C todavía no
 * expone (ver "Qué falta de B" #4/#5 en documentacionB.md). El evento queda
 * durable en `processing_status='received'` para que ese trabajo lo procese
 * después sin perder el mensaje original ni reinterpretarlo con otra
 * versión del parser.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const params = Object.fromEntries(new URLSearchParams(rawBody));

  const provider = await getWhatsAppProvider();
  if (!serverEnv.APP_PUBLIC_URL) {
    console.error("[whatsapp/inbound] APP_PUBLIC_URL no configurado; no se puede validar la firma.");
    return new NextResponse(null, { status: 500 });
  }
  const url = `${serverEnv.APP_PUBLIC_URL}${WEBHOOK_PATH}`;
  const signatureHeader = request.headers.get("x-twilio-signature");
  if (!provider.verifyWebhookSignature({ signatureHeader, url, params })) {
    return new NextResponse("Firma inválida", { status: 403 });
  }

  const messageSid = params.MessageSid;
  const from = params.From;
  if (!messageSid || !from) {
    return new NextResponse("Payload de mensaje entrante incompleto", { status: 400 });
  }

  // El body puede venir vacío en mensajes de solo botón/plantilla interactiva.
  const rawText = params.Body ?? params.ButtonPayload ?? "";
  // Los móviles de México llegan como `+521XXXXXXXXXX` aunque el paciente
  // esté capturado como `+52XXXXXXXXXX` (o al revés): se busca por todas
  // las variantes equivalentes en vez de exigir que el dato ya venga en
  // la forma "correcta". Ver `lib/whatsapp/phone.ts`.
  const phoneCandidates = phoneLookupCandidates(from);

  const admin = createAdminClient();
  const { error: insertEventError } = await admin.from("webhook_events").insert({
    provider: provider.dbProviderValue,
    event_key: messageSid,
    event_type: "inbound",
    external_message_id: messageSid,
    normalized_payload: { raw: params },
  });

  if (insertEventError) {
    if (isUniqueViolation(insertEventError)) {
      // Twilio reintentó el mismo webhook (falta de ACK a tiempo, etc.): ya
      // lo tenemos guardado, no se reinterpreta ni se duplica.
      return new NextResponse(null, { status: 200 });
    }
    console.error("[whatsapp/inbound] error persistiendo webhook_events:", insertEventError);
    return new NextResponse(null, { status: 500 });
  }

  const { data: matches, error: patientError } = await admin
    .from("patients")
    .select("id, unit_id")
    .in("whatsapp_e164", phoneCandidates)
    .eq("active", true)
    .limit(2);

  if (patientError) {
    console.error("[whatsapp/inbound] error resolviendo paciente:", patientError);
    return new NextResponse(null, { status: 500 });
  }

  if (matches && matches.length > 1) {
    // Dos pacientes activos capturados con variantes distintas del mismo
    // número: atribuir el mensaje a cualquiera de los dos sería inventar
    // a quién pertenece un dato clínico. Se deja constancia y se ACK.
    await admin
      .from("webhook_events")
      .update({ processing_status: "ignored", last_error: "Varios pacientes activos comparten este número; se requiere corregir el dato antes de procesar.", processed_at: new Date().toISOString() })
      .eq("provider", provider.dbProviderValue)
      .eq("event_key", messageSid);
    console.error("[whatsapp/inbound] número ambiguo entre varios pacientes activos.");
    return new NextResponse(null, { status: 200 });
  }

  const patient = matches?.[0];

  if (!patient) {
    // Remitente no es un paciente registrado (número equivocado, prueba de
    // Sandbox de otra persona, etc.). Se deja constancia y se ACK igual: no
    // hay nada que reintentar y no se debe seguir procesando un mensaje sin
    // dueño clínico.
    await admin
      .from("webhook_events")
      .update({ processing_status: "ignored", last_error: "Remitente no es un paciente activo registrado.", processed_at: new Date().toISOString() })
      .eq("provider", provider.dbProviderValue)
      .eq("event_key", messageSid);
    return new NextResponse(null, { status: 200 });
  }

  const parsed: ParsedMessage = parseIncomingMessage(rawText);

  const { error: updateError } = await admin
    .from("webhook_events")
    .update({
      unit_id: patient.unit_id,
      // ParsedMessage es solo datos (sin funciones/undefined): el
      // round-trip por JSON es una conversión segura al tipo `Json` de
      // Supabase, no una serialización con pérdida.
      normalized_payload: JSON.parse(JSON.stringify({ raw: params, parsed, patientId: patient.id })),
    })
    .eq("provider", provider.dbProviderValue)
    .eq("event_key", messageSid);

  if (updateError) {
    console.error("[whatsapp/inbound] error guardando el mensaje interpretado:", updateError);
    return new NextResponse(null, { status: 500 });
  }

  // Registra la ventana de sesión de WhatsApp (24h desde el último mensaje
  // del paciente): `jobs/send.ts` la usa para decidir si puede mandar texto
  // libre en vez de exigir una plantilla aprobada. No bloquea la respuesta
  // si falla — es bookkeeping de transporte, no el efecto clínico del
  // mensaje, que ya quedó guardado arriba.
  const { error: messagingStateError } = await admin
    .from("patient_messaging_state")
    .upsert({ patient_id: patient.id, unit_id: patient.unit_id, last_inbound_at: new Date().toISOString() });
  if (messagingStateError) {
    console.error("[whatsapp/inbound] error actualizando patient_messaging_state:", messagingStateError);
  }

  // `processing_status` se queda en 'received' (default de la tabla):
  // guardamos el mensaje ya interpretado, pero el efecto clínico
  // (correlacionar con la interacción pendiente, escribir la medición o la
  // confirmación de toma) es trabajo pendiente, no algo que este webhook
  // deba inventar sin las RPC de C.
  return new NextResponse(null, { status: 200 });
}
