"use client";

import { useQuery } from "@tanstack/react-query";

import { useOptionalClinicalSession } from "@/components/clinical-session-provider";
import type { DashboardData } from "@/lib/domain/dashboard";
import { dashboardQueryKeyForRoom } from "@/lib/queries/dashboard-keys";

async function fetchDashboardData(): Promise<DashboardData> {
  const response = await fetch("/api/dashboard", { headers: { Accept: "application/json" } });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(body?.message ?? "No se pudo cargar la información clínica.");
  }
  return response.json() as Promise<DashboardData>;
}

/**
 * Fuente de datos única para dashboard, censo, citas, alertas y estadísticas
 * (mismo `dashboardQueryKey`): la primera vista que se visite en la sesión
 * dispara el fetch y las demás reutilizan el caché. Volver a montar una vista
 * (en especial la tabla del censo) no provoca otra consulta solo por entrar;
 * las invalidaciones de mutaciones y el foco de ventana siguen refrescando
 * los datos cuando corresponde. No decide layout ni reglas clínicas — eso lo
 * siguen haciendo los componentes que ya existían.
 */
export function useDashboardData(roomIdOverride?: string) {
  const session = useOptionalClinicalSession();
  const roomId = roomIdOverride ?? session?.room?.id ?? "sin-consultorio";
  return useQuery({
    queryKey: dashboardQueryKeyForRoom(roomId),
    queryFn: fetchDashboardData,
    enabled: roomId !== "sin-consultorio",
    refetchOnMount: false,
  });
}
