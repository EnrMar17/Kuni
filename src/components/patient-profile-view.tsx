"use client";

import Link from "next/link";

import { useOptionalClinicalSession } from "@/components/clinical-session-provider";
import { ClinicalSkeleton } from "@/components/clinical-skeleton";
import { PatientProfile } from "@/components/clinical-workspace";
import { PatientPredictionPanel, PatientPredictionSkeleton } from "@/components/patient-prediction-panel";
import { useDashboardData } from "@/lib/queries/use-dashboard-data";
import { usePatientPrediction } from "@/lib/queries/use-patient-prediction";

export function PatientProfileView({
  patientId,
  testMessageChannels,
}: {
  patientId: string;
  testMessageChannels: ("sms" | "whatsapp")[];
}) {
  const session = useOptionalClinicalSession();
  const dashboard = useDashboardData(session?.room?.id);
  const patient = dashboard.data?.patients.find((item) => item.id === patientId);
  const prediction = usePatientPrediction(
    session?.room?.id,
    patientId,
    patient ? dashboard.data?.generatedAt : undefined,
  );

  if (!session?.room) {
    return (
      <main id="contenido-principal" className="flex min-h-screen items-center justify-center bg-[#e8ebf2] p-6">
        <div className="clinical-panel max-w-md p-6 text-center">
          <p className="mb-4 text-sm text-slate-600">Selecciona un consultorio para abrir la ficha.</p>
          <Link className="clinical-button clinical-button-primary" href="/consultorios">Seleccionar consultorio</Link>
        </div>
      </main>
    );
  }

  if (dashboard.isPending) return <ClinicalSkeleton view="profile" />;
  if (dashboard.isError) {
    return (
      <main id="contenido-principal" className="flex min-h-screen items-center justify-center bg-[#e8ebf2] p-6">
        <div className="clinical-panel max-w-md p-6 text-center">
          <p className="mb-4 text-sm text-slate-600">{dashboard.error instanceof Error ? dashboard.error.message : "No se pudo cargar el paciente."}</p>
          <button className="clinical-button clinical-button-primary" onClick={() => dashboard.refetch()} type="button">Reintentar</button>
        </div>
      </main>
    );
  }
  if (!patient) {
    return (
      <main id="contenido-principal" className="flex min-h-screen items-center justify-center bg-[#e8ebf2] p-6">
        <div className="clinical-panel max-w-md p-6 text-center">
          <p className="mb-4 text-sm text-slate-600">No se encontró el paciente en este consultorio.</p>
          <Link className="clinical-button clinical-button-primary" href="/pacientes">Volver al censo</Link>
        </div>
      </main>
    );
  }

  const predictionPanel = prediction.isPending ? (
    <PatientPredictionSkeleton />
  ) : prediction.isError || !prediction.data ? (
    <section className="clinical-panel p-5 lg:col-span-3">
      <p className="text-sm text-slate-600">No se pudo cargar la predicción.</p>
      <button className="clinical-button mt-3" onClick={() => prediction.refetch()} type="button">Reintentar predicción</button>
    </section>
  ) : (
    <PatientPredictionPanel
      patient={patient}
      result={prediction.data}
      timezone={dashboard.data.timezone}
      isRefreshing={prediction.isFetching}
      onRefresh={() => { void prediction.refetch(); }}
    />
  );

  return (
    <PatientProfile
      canWrite={session.role !== "viewer"}
      testMessageChannels={testMessageChannels}
      context={{
        unitName: session?.unitName ?? "Unidad de salud",
        roomName: session?.room?.name ?? "Consultorio",
        doctorName: session?.room?.doctorName ?? "Personal clínico",
      }}
      data={dashboard.data}
      patient={patient}
      predictionPanel={predictionPanel}
    />
  );
}
