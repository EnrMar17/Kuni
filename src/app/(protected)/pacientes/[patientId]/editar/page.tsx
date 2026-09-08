import { notFound } from "next/navigation";
import { ClinicalWorkspace } from "@/components/clinical-workspace";
import { getPageAuthContext } from "@/lib/auth/context";
import { getDashboardData } from "@/lib/queries/dashboard";
import { getPatientRegistration } from "@/lib/queries/patient-registration";

export default async function EditPatientPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params;
  const context = await getPageAuthContext();
  const initial = await getPatientRegistration(patientId);
  if (!initial) notFound();
  const data = await getDashboardData();
  return <ClinicalWorkspace data={data} mode="new-patient" patientEdit={initial}
    context={{ unitName: context.unitName, roomName: context.consultingRoom?.name ?? "Consultorio",
      doctorName: context.consultingRoom?.doctorName ?? "Personal clinico" }} />;
}
