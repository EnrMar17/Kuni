"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * QueryClient por sesión de navegador, no por request de servidor: se crea
 * una vez con useState (no con useMemo, que no garantiza estabilidad) y se
 * reutiliza en toda la vida de la pestaña. Evita recrear el caché en cada
 * render, que es justo lo que TanStack Query necesita para dar respuestas
 * "instantáneas" en navegaciones repetidas (datos ya en caché, sin roundtrip).
 */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Datos clínicos cambian por acción del bot/otros médicos; 30s de
        // margen evita refetch en cada click sin volverse obsoleto para la
        // demo. Cada vista puede sobreescribir esto si necesita algo más
        // fresco (p. ej. alertas) o más largo (p. ej. catálogos).
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: 1,
        refetchOnWindowFocus: true,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  // Client Components también se prerenderizan en servidor: aislar cada render.
  if (typeof window === "undefined") return makeQueryClient();
  // En el navegador: singleton para no perder el caché entre renders.
  // (No aplica en Server Components — este archivo es "use client".)
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(getQueryClient);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
