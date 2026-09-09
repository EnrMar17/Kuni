import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPageAuthContext } from "@/lib/auth/context";
import { getDashboardData } from "@/lib/queries/dashboard";
import { PatientReport } from "@/components/patient-report";
import { PatientReportActions } from "@/components/patient-report-actions";

export const metadata: Metadata = { title: "Reporte individual | Kuni", robots: { index: false, follow: false } };

export default async function PatientReportPage({ params }: { params: Promise<{ patientId: string }> }) {
  const context = await getPageAuthContext();
  if (context.role === "viewer" || !context.consultingRoom) notFound();
  const { patientId } = await params;
  const data = await getDashboardData();
  const patient = data.patients.find(item => item.id === patientId);
  if (!patient) notFound();
  return <main id="contenido-principal" className="patient-report-screen">
    <PatientReportActions patientId={patient.id} />
    <PatientReport patient={patient} generatedAt={data.generatedAt} timezone={data.timezone} context={{
      unitName: context.unitName, roomName: context.consultingRoom.name, doctorName: context.consultingRoom.doctorName,
    }} />
  </main>;
}
