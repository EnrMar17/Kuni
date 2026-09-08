import "server-only";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database.types";
import { serverEnv } from "@/lib/env/server";

// Rutas que no requieren sesión. Todo lo demás bajo `(protected)` sí.
// "/" es el placeholder de scaffold (sin datos clínicos); cuando A construya
// las vistas reales, lo normal es que redirija a /login o /dashboard y esta
// lista se reduzca solo a "/login". OJO: "/" usa match exacto — con
// startsWith("/") cualquier ruta "empieza con /" y la protección quedaría
// anulada por completo.
function isPublicPath(pathname: string): boolean {
  return pathname === "/" || pathname.startsWith("/login");
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
          response = NextResponse.next({ request });
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
  const { data } = await supabase.auth.getClaims();
  const isAuthenticated = Boolean(data?.claims);

  const { pathname } = request.nextUrl;

  if (!isAuthenticated && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // `pathname` sale de request.nextUrl (siempre relativo, nunca una URL
    // externa completa), así que ESTE redirect es seguro. Pero cuando A
    // construya /login y lea este query param para volver a mandar al
    // usuario tras autenticarse, DEBE pasarlo por
    // `safeRedirectPath()` (src/lib/utils/safe-redirect.ts) antes de
    // redirigir — un link a `/login?redirectTo=https://evil.com` es un
    // open redirect (OWASP A01) si se usa el valor sin validar.
    url.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(url);
  }

  if (isAuthenticated && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return response;
}
