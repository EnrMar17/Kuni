import "server-only";
import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env/server";
import { expireDueInteractions } from "@/lib/jobs/expire";
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
 * Vence primero, materializa después y envía al final, en la misma
 * invocación. El orden importa: el silencio del paciente debe convertirse en
 * alerta ANTES de que salgan los mensajes nuevos del mismo tick, y una
 * ocurrencia que acaba de nacer puede salir sin esperar al siguiente tick.
 * Los tres pasos son idempotentes por su cuenta (`timeout_at is null` /
 * dedup por clave / `claim_due_interactions` con `skip locked`), así que
 * llamadas superpuestas o reintentos del cron no duplican nada.
 */
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return new NextResponse("No autorizado", { status: 401 });
  }

  try {
    const expire = await expireDueInteractions();
    const materialize = await materializeDueInteractions();
    const send = await sendDueInteractions();
    return NextResponse.json({ expire, materialize, send });
  } catch (error) {
    console.error("[jobs/tick] error inesperado:", error);
    return new NextResponse(null, { status: 500 });
  }
}
