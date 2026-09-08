import "server-only";
import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env/server";
import { materializeDueInteractions } from "@/lib/jobs/materialize";
import { sendDueInteractions } from "@/lib/jobs/send";

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
 * Materializa primero, envía después, en la misma invocación: así una
 * ocurrencia que acaba de nacer puede salir en el mismo tick sin esperar al
 * siguiente. Ambos pasos son idempotentes por su cuenta (dedup por clave /
 * `claim_due_interactions` con `skip locked`), así que llamadas
 * superpuestas o reintentos del cron no duplican envíos.
 */
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return new NextResponse("No autorizado", { status: 401 });
  }

  try {
    const materialize = await materializeDueInteractions();
    const send = await sendDueInteractions();
    return NextResponse.json({ materialize, send });
  } catch (error) {
    console.error("[jobs/tick] error inesperado:", error);
    return new NextResponse(null, { status: 500 });
  }
}
