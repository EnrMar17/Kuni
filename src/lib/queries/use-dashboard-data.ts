"use client";

import { useQuery } from "@tanstack/react-query";

import type { DashboardData } from "@/lib/domain/dashboard";
import { dashboardQueryKey } from "@/lib/queries/dashboard-keys";

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
 * dispara el fetch y las demás reutilizan el caché mientras siga fresco
 * (ver `queryClientDefaultOptions`). No decide layout ni reglas clínicas —
 * eso lo siguen haciendo los componentes que ya existían.
 */
export function useDashboardData() {
  return useQuery({
    queryKey: dashboardQueryKey,
    queryFn: fetchDashboardData,
  });
}
