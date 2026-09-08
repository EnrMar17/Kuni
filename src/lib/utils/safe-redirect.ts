/**
 * Valida que un destino de redirect (p. ej. el query param `redirectTo` que
 * pone src/lib/supabase/proxy.ts) sea una ruta interna y relativa — nunca
 * una URL externa.
 *
 * OWASP A01 / open redirect: sin esto, un link como
 * `/login?redirectTo=https://sitio-falso.com` o `/login?redirectTo=//evil.com`
 * podría usarse para mandar a alguien recién autenticado a un sitio de
 * phishing que se ve "parte del flujo de Kuni". SIEMPRE usar esta función
 * antes de redirigir con un valor que venga de la URL/usuario.
 */
export function safeRedirectPath(
  candidate: string | null | undefined,
  fallback = "/dashboard"
): string {
  if (!candidate) return fallback;
  // Debe empezar con exactamente un "/": "//host" y "/\host" son formas de
  // codificar una URL absoluta que el navegador sigue interpretando como
  // protocol-relative (se resuelve contra el host actual, no el nuestro).
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.startsWith("/\\")) {
    return fallback;
  }
  // Cualquier esquema embebido (data:, javascript:, https:) tampoco es una
  // ruta relativa válida.
  if (/^\/[a-z][a-z0-9+.-]*:/i.test(candidate)) {
    return fallback;
  }
  return candidate;
}
