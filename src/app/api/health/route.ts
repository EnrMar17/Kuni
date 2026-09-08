import { NextResponse } from "next/server";

export const runtime = "nodejs";
// Un healthcheck cacheado o prerenderizado deja de ser un healthcheck.
export const dynamic = "force-dynamic";

/**
 * Healthcheck público — sección 3 del README ("Estructura del repositorio").
 *
 * `src/proxy.ts` ya excluye `api/health` de la protección por cookies
 * justamente para que un monitor de uptime reciba 200 y no un redirect a
 * `/login` (ver `docs/bitacora-canal-b.md`, revisión OWASP A01); hasta ahora
 * la ruta no existía y esa exclusión devolvía 404.
 *
 * A propósito NO consulta Supabase ni el proveedor de WhatsApp: responde si
 * el proceso de Next está vivo y sirviendo. Un healthcheck que depende de
 * terceros convierte una caída de ellos en "la app está caída", y además
 * expondría a cualquiera un ping gratis contra la base. La salud de esas
 * dependencias corresponde a la observabilidad de jobs, todavía pendiente.
 */
export function GET() {
  return NextResponse.json(
    { status: "ok", timestamp: new Date().toISOString() },
    { headers: { "cache-control": "no-store" } },
  );
}
