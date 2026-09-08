import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Vencimiento de interacciones — sección "No-respuestas" del plan y
 * `docs/documentacionC.md` ("Qué falta de C" #3).
 *
 * Envoltorio delgado sobre `expire_due_interactions()`, la RPC que ya vive
 * en `0001_kuni.sql`. La RPC es la persistencia CANÓNICA del timeout: en una
 * sola sentencia marca `timeout_at` de las interacciones entregadas cuyo
 * `response_deadline_at` ya pasó sin respuesta, y crea la alerta
 * `no_response` correspondiente, deduplicada por `no_response:<id>`.
 *
 * Aquí no se replica ninguno de esos criterios. `domain-core/src/lib/jobs/
 * expire.ts` (la función pura de C) sirve para probar y previsualizar la
 * regla, no para ejecutarla: duplicar la condición en TypeScript abriría la
 * puerta a que las dos versiones se separen, que es exactamente lo que C
 * advierte al pedir "paridad de la función pura frente a la RPC real".
 *
 * Por qué corre ANTES de materializar y enviar en cada tick: la alerta de
 * no-respuesta debe existir antes de que salgan los mensajes nuevos del
 * mismo tick, para que el médico vea el silencio previo y no una bandeja
 * que parece al día. Es idempotente —solo toca filas con `timeout_at is
 * null`— así que un tick repetido o dos ticks superpuestos no duplican
 * vencimientos ni alertas.
 */

export interface ExpireResult {
  /** Interacciones que vencieron en esta ejecución (0 es el caso normal). */
  expired: number;
}

export async function expireDueInteractions(): Promise<ExpireResult> {
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("expire_due_interactions");
  if (error) throw error;

  return { expired: typeof data === "number" ? data : 0 };
}
