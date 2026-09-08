import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";
import { clientEnv } from "@/lib/env/client";

let browserClient: ReturnType<typeof createBrowserClient<Database>> | undefined;

/**
 * Cliente de Supabase para Client Components. Solo usa la clave publicable
 * (segura para el navegador); la identidad real la determina el JWT de la
 * sesión, no este cliente.
 *
 * Singleton por pestaña: crear el cliente una sola vez es más rápido que
 * reinstanciarlo en cada render (evita recrear el SDK y sus listeners de
 * auth), y aquí es seguro porque no lleva estado de una request de servidor.
 */
export function createClient() {
  browserClient ??= createBrowserClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
  return browserClient;
}
