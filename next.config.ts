import type { NextConfig } from "next";

/**
 * Cabeceras de seguridad HTTP en todas las respuestas (OWASP A05 - Security
 * Misconfiguration). Next no las manda por defecto; sin esto, el navegador
 * usa los permisos más permisivos posibles.
 */
const securityHeaders = [
  // Bloquea que Kuni se cargue dentro de un <iframe> ajeno (clickjacking:
  // p. ej. un sitio malicioso superpone botones invisibles sobre el login).
  { key: "X-Frame-Options", value: "DENY" },
  // Evita que el navegador adivine el tipo de un archivo distinto al
  // declarado (mitiga ataques de MIME-sniffing).
  { key: "X-Content-Type-Options", value: "nosniff" },
  // No mandar la URL completa de origen a otros sitios al seguir un link
  // saliente (evita filtrar rutas con datos, p. ej. /pacientes/<id>).
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Kuni no necesita cámara/micrófono/geolocalización del navegador; se
  // desactivan explícitamente para reducir superficie si algún script de
  // terceros intentara pedirlos.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Fuerza HTTPS en el navegador durante 2 años, incluidos subdominios.
  // Inofensivo en desarrollo (localhost no aplica HSTS); importante una vez
  // desplegado, dado que Kuni maneja datos clínicos.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

/**
 * B8 — CSP diferido desde la revisión OWASP inicial "por el riesgo de romper
 * el build si se configura mal en el tiempo disponible" (ver
 * docs/bitacora-canal-b.md 2026-09-07).
 *
 * La CSP real (con nonce por request, la única forma de no romper la
 * hidratación de RSC de Next — ver `src/lib/supabase/proxy.ts`) vive en el
 * middleware, NO aquí: `next.config.ts` es estático y no puede generar un
 * nonce distinto por respuesta. Se probó primero una CSP estática sin nonce
 * y bloqueaba los scripts inline que el propio App Router inyecta para
 * hidratar — confirmado en caliente antes de descartarla (ver bitácora).
 *
 * Lo único que queda aquí es una CSP mínima para las tres rutas que el
 * matcher del proxy EXCLUYE a propósito (`api/webhooks/*`, `api/jobs/*`,
 * `api/health` — se autentican con firma de Twilio/Bearer, no con cookies,
 * así que nunca pasan por el middleware). Son JSON puro, sin HTML ni
 * scripts: `default-src 'none'` no les quita nada, solo cierra la puerta
 * por si alguna vez sirven algo renderizable por error.
 */
const apiOnlyContentSecurityPolicy = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      {
        source: "/api/:path((?:webhooks|jobs|health).*)",
        headers: [{ key: "Content-Security-Policy", value: apiOnlyContentSecurityPolicy }],
      },
    ];
  },
};

export default nextConfig;
