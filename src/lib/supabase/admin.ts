import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { serverEnv } from "@/lib/env/server";

let adminClient: ReturnType<typeof createSupabaseClient<Database>> | undefined;

/**
 * Cliente administrativo: usa `SUPABASE_SECRET_KEY` y OMITE Row Level
 * Security por completo. Reservado a jobs (`jobs/*.ts`) y webhooks YA
 * verificados (firma de Twilio, Bearer CRON_SECRET) — nunca a código que
 * atienda directamente una request de un médico autenticado.
 *
 * No comparte instancia ni cookies con el cliente SSR (server.ts): son
 * identidades distintas a propósito. Las escrituras hechas con este cliente
 * quedan con actor "sistema" en la auditoría, no atribuidas a un médico
 * (ver sección 5 del plan técnico, "Preservar el actor de auditoría").
 *
 * Singleton seguro (a diferencia de server.ts): no lleva cookies ni sesión
 * de usuario, así que reutilizar la instancia entre invocaciones del mismo
 * proceso serverless es válido y evita recrear el cliente en cada llamada.
 */
export function createAdminClient() {
  adminClient ??= createSupabaseClient<Database>(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SECRET_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  return adminClient;
}
