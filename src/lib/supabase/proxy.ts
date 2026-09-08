import "server-only";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database.types";
import { serverEnv } from "@/lib/env/server";

// Login debe poder mostrar también errores de membresía de una sesión válida.
function isPublicPath(pathname: string): boolean {
  return pathname === "/" || pathname === "/login";
}

/**
 * Refresca el JWT/cookies de sesión en cada navegación y hace un primer
 * filtro de rutas privadas a nivel de red — rápido, antes de que se
 * renderice nada.
 *
 * Esto NO es la autorización real: según el plan, "el proxy no es toda la
 * autorización". Cada Server Action y Route Handler clínico debe volver a
 * validar sesión + membresía con `getAuthContext()` (src/lib/auth/context.ts).
 * Cambiar una cookie a mano nunca debe ampliar acceso.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          const previousCookies = response.cookies.getAll();
          response = NextResponse.next({ request });
          previousCookies.forEach((cookie) => response.cookies.set(cookie));
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // No quitar esta llamada: valida el JWT y, si hace falta, renueva el token
  // (escribiendo las cookies nuevas vía setAll de arriba). Sin esto las
  // sesiones expiran de forma impredecible.
  let isAuthenticated = false;
  try {
    const { data, error } = await supabase.auth.getClaims();
    isAuthenticated = !error && Boolean(data?.claims?.sub);
  } catch {
    // Login puede mostrar el error de conexión y permite volver a intentarlo.
  }

  const { pathname } = request.nextUrl;

  if (!isAuthenticated && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Login y selección vuelven a validar este destino mediante
    // postLoginRedirect antes de usarlo; el query param puede ser manipulado.
    url.search = "";
    url.searchParams.set("redirectTo", `${pathname}${request.nextUrl.search}`);
    const redirectResponse = NextResponse.redirect(url);
    // setAll puede haber renovado o eliminado cookies antes del redirect.
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    return redirectResponse;
  }

  return response;
}
