import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database.types";
import { serverEnv } from "@/lib/env/server";

/**
 * Cliente de Supabase para Server Components, Server Actions y Route
 * Handlers. Lleva las cookies de sesión de ESA request, así que RLS aplica
 * como el usuario autenticado real (nunca omite Row Level Security).
 *
 * IMPORTANTE (documentado también por Supabase): crear uno nuevo por
 * request, nunca guardarlo en una variable de módulo. Compartirlo entre
 * requests mezclaría sesiones de usuarios distintos.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Se está llamando desde un Server Component, que no puede
            // escribir cookies. No es un error: src/proxy.ts refresca la
            // sesión en cada navegación y deja las cookies al día.
          }
        },
      },
    }
  );
}
