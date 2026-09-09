import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Next.js 16 renombró `middleware.ts` a `proxy.ts` (misma función, mismo
// contrato). Runtime por defecto: Node.js — puede usar el SDK completo de
// Supabase sin las limitaciones del runtime Edge.
export function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Corre en todo excepto:
     * - _next/static, _next/image (assets internos de Next)
     * - archivos estáticos comunes (imágenes, favicon)
     * - api/webhooks/* y api/jobs/* — esos se autentican con firma de
     *   Twilio / Bearer CRON_SECRET, no con cookies de usuario; redirigir
     *   esas requests a /login las rompería.
     * - api/health — healthcheck público para monitoreo; debe responder
     *   200 siempre, nunca un redirect a una página HTML.
     * - sw.js — archivo estático sin HTML ni sesión. El navegador lo vuelve
     *   a pedir en cada revisión de actualización, y pasarlo por el proxy
     *   costaría una validación de JWT contra Supabase cada vez, además de
     *   sellarlo con una CSP con nonce por request que no le aporta nada.
     *   Las cabeceras de seguridad de next.config.ts sí se le siguen
     *   aplicando.
     */
    "/((?!_next/static|_next/image|api/webhooks|api/jobs|api/health|sw\\.js|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
