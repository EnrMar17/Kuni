"use client";

import { ClinicalDashboard, type Room } from "@/components/dashboard/clinical-dashboard";
import { ClinicalSkeleton } from "@/components/clinical-skeleton";
import { useDashboardData } from "@/lib/queries/use-dashboard-data";

/**
 * Envoltorio "use client" delgado: mueve la fuente de `data` de un prop de
 * Server Component a `useDashboardData()` (mismo `DashboardData`, mismo
 * `ClinicalDashboard`) para que esta ruta comparta caché con censo, citas,
 * alertas y estadísticas. No toca ninguna regla de negocio ni presentación.
 */
export function DashboardView({ roomId, room, unitName }: { roomId: string; room: Room; unitName: string }) {
  const { data, isPending, isError, error, refetch } = useDashboardData();

  if (isPending) return <ClinicalSkeleton view="dashboard" />;
  if (isError) {
    return (
      <main id="contenido-principal" className="flex min-h-screen items-center justify-center bg-[#e8ebf2] p-6 text-slate-800">
        <div className="clinical-panel max-w-md p-6 text-center">
          <p className="mb-4 text-sm text-slate-600">{error instanceof Error ? error.message : "No se pudo cargar el dashboard."}</p>
          <button type="button" className="clinical-button clinical-button-primary" onClick={() => refetch()}>
            Reintentar
          </button>
        </div>
      </main>
    );
  }

  return (
    <main id="contenido-principal" className="flex min-h-screen items-center justify-center bg-[#e8ebf2] p-3 text-slate-800 md:p-6 lg:p-8">
      <ClinicalDashboard key={roomId} room={room} unitName={unitName} data={data} />
    </main>
  );
}
