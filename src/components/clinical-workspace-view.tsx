"use client";

import { ClinicalWorkspace } from "@/components/clinical-workspace";
import type { ClinicalTopBarContext } from "@/components/clinical-header";
import { ClinicalSkeleton } from "@/components/clinical-skeleton";
import type { PatientEditData } from "@/contracts/patient-registration";
import type { MedicationOption } from "@/contracts/clinical";
import { useDashboardData } from "@/lib/queries/use-dashboard-data";

type WorkspaceViewMode = "patients" | "new-patient" | "appointments" | "alerts" | "statistics";

const SKELETON_VIEW: Record<WorkspaceViewMode, "patients" | "form" | "appointments" | "alerts" | "statistics"> = {
  patients: "patients",
  "new-patient": "form",
  appointments: "appointments",
  alerts: "alerts",
  statistics: "statistics",
};

/**
 * Envoltorio "use client" delgado para censo, alta/edición de paciente,
 * citas, alertas y estadísticas: todas son el mismo `ClinicalWorkspace` con
 * distinto `mode` (`ClinicalHeader` — con sus contadores de alertas y citas —
 * también depende de `data` en cada una), y comparten el mismo
 * `dashboardQueryKey` que el dashboard: cambiar de tab entre ellas reutiliza
 * el caché en vez de repetir el fetch. No cambia ninguna regla de negocio ni
 * presentación de `ClinicalWorkspace`.
 */
export function ClinicalWorkspaceView({
  mode,
  context,
  patientEdit,
  medications,
}: {
  mode: WorkspaceViewMode;
  context: ClinicalTopBarContext;
  patientEdit?: PatientEditData;
  medications?: MedicationOption[];
}) {
  const { data, isPending, isError, error, refetch } = useDashboardData();

  if (isPending) return <ClinicalSkeleton view={SKELETON_VIEW[mode]} />;
  if (isError) {
    return (
      <main id="contenido-principal" className="flex min-h-screen items-center justify-center bg-[#e8ebf2] p-6 text-slate-800">
        <div className="clinical-panel max-w-md p-6 text-center">
          <p className="mb-4 text-sm text-slate-600">{error instanceof Error ? error.message : "No se pudo cargar la información clínica."}</p>
          <button type="button" className="clinical-button clinical-button-primary" onClick={() => refetch()}>
            Reintentar
          </button>
        </div>
      </main>
    );
  }

  return <ClinicalWorkspace data={data} mode={mode} context={context} patientEdit={patientEdit} medications={medications} />;
}
