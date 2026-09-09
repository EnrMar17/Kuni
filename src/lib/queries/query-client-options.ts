import type { DefaultOptions } from "@tanstack/react-query";

/**
 * Opciones compartidas por todo QueryClient de la app (navegador y servidor,
 * este último solo para precargar/hidratar antes del primer paint). Vive
 * separado de `providers.tsx` para que código de servidor (Route Handlers,
 * Server Components que hidratan) pueda construir un QueryClient con las
 * mismas reglas sin importar un módulo "use client".
 *
 * Datos clínicos cambian por acción del bot/otros médicos; 30s de margen
 * permite servir el valor cacheado de inmediato y actualizarlo en segundo
 * plano. El caché inactivo vive 30 minutos para sobrevivir navegaciones
 * largas dentro de la misma pestaña, sin persistir PHI en almacenamiento web.
 * Cada query
 * puede sobreescribir esto si necesita algo más fresco (p. ej. alertas) o
 * más largo (p. ej. catálogos).
 */
export const queryClientDefaultOptions: DefaultOptions = {
  queries: {
    staleTime: 30_000,
    gcTime: 30 * 60_000,
    retry: 1,
    refetchOnWindowFocus: true,
  },
  mutations: {
    retry: 0,
  },
};
