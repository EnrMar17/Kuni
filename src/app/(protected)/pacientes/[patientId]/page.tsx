import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PatientProfile } from "@/components/clinical-workspace";
import { PatientPredictionPanel, PatientPredictionSkeleton } from "@/components/patient-prediction-panel";
import { getPageAuthContext } from "@/lib/auth/context";
import { getDashboardData } from "@/lib/queries/dashboard";

export default async function PatientPage({ params }: { params: Promise<{ patientId: string }> }) {
  const [{ patientId }, context, data] = await Promise.all([params, getPageAuthContext(), getDashboardData()]);
  const patient = data.patients.find((item) => item.id === patientId);
  if (!patient) notFound();
  return <PatientProfile canWrite={context.role !== "viewer"} context={{ unitName: context.unitName, roomName: context.consultingRoom?.name ?? "Consultorio", doctorName: context.consultingRoom?.doctorName ?? "Personal clínico" }} data={data} patient={patient} predictionPanel={<Suspense fallback={<PatientPredictionSkeleton />}><PatientPredictionPanel patient={patient} asOf={data.generatedAt} timezone={data.timezone} /></Suspense>} />;
}
