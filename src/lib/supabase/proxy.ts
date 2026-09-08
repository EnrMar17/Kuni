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
 * B8 — CSP con nonce único por request. Es la única forma de permitir los
 * scripts que el propio App Router de Next inyecta para hidratar RSC
 * (`self.__next_f.push(...)`) sin recurrir a `'unsafe-inline'` en
 * `script-src`: una CSP estática sin nonce bloqueaba esos scripts y rompía
 * la hidratación (`InvariantError: Expected a request ID...`), confirmado
 * en caliente antes de descartar ese diseño (ver bitácora 2026-09-08).
 *
 * El header se manda dos veces con el MISMO valor: en `request.headers`
 * (para que Next lo detecte al renderizar y marque sus propios `<script>`
 * con ese nonce) y en `response.headers` (lo que de verdad recibe el
 * navegador). Es el patrón documentado de Next.js para App Router; no
 * inventado aquí.
 *
 * `'strict-dynamic'` delega la confianza del script con nonce a lo que ese
 * script cargue después (los chunks de Next), así que no hace falta listar
 * hosts en `script-src`. `style-src` sigue con `'unsafe-inline'` porque
 * cuatro vistas usan el prop `style={{...}}` de React
 * (clinical-workspace.tsx, clinical-dashboard.tsx, statistics-view.tsx,
 * global-error.tsx); nonar cada estilo inline es una refactorización aparte,
 * fuera de alcance de este pendiente, y el riesgo de una inyección CSS es
 * muchísimo menor que uno de script. `connect-src` solo necesita el propio
 * origen y el proyecto Supabase (REST + Realtime WebSocket) — el navegador
 * nunca habla con Twilio ni con el servicio de ML, que son server-only.
 */
function buildContentSecurityPolicy(nonce: string): string {
  const isDev = process.env.NODE_ENV !== "production";
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(isDev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:"],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...supabaseConnectOrigins(), ...(isDev ? ["ws://localhost:*"] : [])],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
  };
  return Object.entries(directives)
    .map(([directive, sources]) => `${directive} ${sources.join(" ")}`)
    .join("; ");
}

/** https + wss del proyecto Supabase configurado, para que connect-src no dependa de un dominio fijo. */
function supabaseConnectOrigins(): string[] {
  try {
    const origin = new URL(serverEnv.NEXT_PUBLIC_SUPABASE_URL).origin;
    return [origin, origin.replace(/^https:/, "wss:")];
  } catch {
    return [];
  }
}

/**
 * Refresca el JWT/cookies de sesión en cada navegación, aplica la CSP con
 * nonce y hace un primer filtro de rutas privadas a nivel de red — rápido,
 * antes de que se renderice nada.
 *
 * Esto NO es la autorización real: según el plan, "el proxy no es toda la
 * autorización". Cada Server Action y Route Handler clínico debe volver a
 * validar sesión + membresía con `getAuthContext()` (src/lib/auth/context.ts).
 * Cambiar una cookie a mano nunca debe ampliar acceso.
 */
export async function updateSession(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildContentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

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
          response = NextResponse.next({ request: { headers: requestHeaders } });
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
    redirectResponse.headers.set("Content-Security-Policy", csp);
    // setAll puede haber renovado o eliminado cookies antes del redirect.
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    return redirectResponse;
  }

  response.headers.set("Content-Security-Policy", csp);
  return response;
}
