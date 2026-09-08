import "server-only";
import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env/server";
import { expireDueInteractions } from "@/lib/jobs/expire";
import { materializeDueInteractions } from "@/lib/jobs/materialize";
import { sendDueInteractions } from "@/lib/jobs/send";
import { reconcileStatusEvents } from "@/lib/jobs/reconcile-status";
import { reconcileInboundEvents } from "@/lib/jobs/reconcile-inbound";

export const runtime = "nodejs";
// Nunca cachear/prerenderizar un endpoint que muta datos y depende del reloj.
export const dynamic = "force-dynamic";

function isAuthorized(request: Request): boolean {
  if (!serverEnv.CRON_SECRET) return false; // sin secreto configurado, nunca autoriza
  const header = request.headers.get("authorization");
  return header === `Bearer ${serverEnv.CRON_SECRET}`;
}

/**
 * Disparador del Cron — sección 3 de kuni-plan-tecnico.md y
 * `docs/documentacionB.md` ("Qué falta de B" #3). Pensado para que
 * Supabase Cron (`pg_cron` + `pg_net`, o un cron externo) lo llame cada
 * pocos minutos con `Authorization: Bearer <CRON_SECRET>`.
 *
 * Reconcilia callbacks, vence, materializa, envía y vuelve a reconciliar.
 * Una entrega recibida previamente debe fijar su plazo antes de expirar;
 * un callback adelantado al guardado del SID puede resolverse tras enviar.
 * Las escrituras locales usan deduplicación/CAS. Eso no convierte al
 * proveedor externo en una transacción ni permite reenvíos ciegos de unknown.
 */
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return new NextResponse("No autorizado", { status: 401 });
  }

  try {
    const callbacksBefore = await reconcileStatusEvents();
    const inbound = await reconcileInboundEvents();
    const expire = await expireDueInteractions();
    const materialize = await materializeDueInteractions();
    const send = await sendDueInteractions();
    const callbacksAfter = await reconcileStatusEvents();
    return NextResponse.json({ callbacksBefore, inbound, expire, materialize, send, callbacksAfter });
  } catch (error) {
    console.error("[jobs/tick] error inesperado:", error);
    return new NextResponse(null, { status: 500 });
  }
}
