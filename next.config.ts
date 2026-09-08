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

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
