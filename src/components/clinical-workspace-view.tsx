"use client";

import { ClinicalWorkspace } from "@/components/clinical-workspace";
import { useOptionalClinicalSession } from "@/components/clinical-session-provider";
import type { ClinicalTopBarContext } from "@/components/clinical-header";
import { ClinicalSkeleton } from "@/components/clinical-skeleton";
import type { PatientEditData } from "@/contracts/patient-registration";
import type { MedicationOption } from "@/contracts/clinical";
import { useDashboardData } from "@/lib/queries/use-dashboard-data";
import { useMedicationCatalog, usePatientRegistration } from "@/lib/queries/use-patient-registration-data";

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
  context: contextOverride,
  patientEdit,
  patientId,
  medications,
}: {
  mode: WorkspaceViewMode;
  context?: ClinicalTopBarContext;
  patientEdit?: PatientEditData;
  patientId?: string;
  medications?: MedicationOption[];
}) {
  const session = useOptionalClinicalSession();
  const context = contextOverride ?? {
    unitName: session?.unitName ?? "Unidad de salud",
    roomName: session?.room?.name ?? "Consultorio",
    doctorName: session?.room?.doctorName ?? "Personal clínico",
  };
  const { data, isPending, isError, error, refetch } = useDashboardData(session?.room?.id);
  const needsMedicationCatalog = mode === "new-patient" && !patientId && medications === undefined;
  const medicationQuery = useMedicationCatalog(session?.room?.id, needsMedicationCatalog);
  const needsPatientRegistration = mode === "new-patient" && Boolean(patientId) && patientEdit === undefined;
  const registrationQuery = usePatientRegistration(session?.room?.id, patientId, needsPatientRegistration);
  const auxiliaryPending = (needsMedicationCatalog && medicationQuery.isPending)
    || (needsPatientRegistration && registrationQuery.isPending);
  const auxiliaryError = needsMedicationCatalog && medicationQuery.isError
    ? medicationQuery.error
    : needsPatientRegistration && registrationQuery.isError
      ? registrationQuery.error
      : null;

  if (isPending || auxiliaryPending) return <ClinicalSkeleton view={SKELETON_VIEW[mode]} />;
  if (isError || auxiliaryError) {
    return (
      <main id="contenido-principal" className="flex min-h-screen items-center justify-center bg-[#e8ebf2] p-6 text-slate-800">
        <div className="clinical-panel max-w-md p-6 text-center">
          <p className="mb-4 text-sm text-slate-600">{auxiliaryError instanceof Error ? auxiliaryError.message : error instanceof Error ? error.message : "No se pudo cargar la información clínica."}</p>
          <button type="button" className="clinical-button clinical-button-primary" onClick={() => {
            if (isError) void refetch();
            if (needsMedicationCatalog && medicationQuery.isError) void medicationQuery.refetch();
            if (needsPatientRegistration && registrationQuery.isError) void registrationQuery.refetch();
          }}>
            Reintentar
          </button>
        </div>
      </main>
    );
  }

  return <ClinicalWorkspace
    data={data}
    mode={mode}
    context={context}
    patientEdit={patientEdit ?? registrationQuery.data}
    medications={medications ?? medicationQuery.data}
  />;
}
