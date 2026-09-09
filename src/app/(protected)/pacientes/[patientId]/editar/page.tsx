import { notFound } from "next/navigation";
import { ClinicalWorkspaceView } from "@/components/clinical-workspace-view";
import { getPageAuthContext } from "@/lib/auth/context";
import { getPatientRegistration } from "@/lib/queries/patient-registration";

export default async function EditPatientPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params;
  const context = await getPageAuthContext();
  const initial = await getPatientRegistration(patientId);
  if (!initial) notFound();
  return <ClinicalWorkspaceView mode="new-patient" patientEdit={initial}
    context={{ unitName: context.unitName, roomName: context.consultingRoom?.name ?? "Consultorio",
      doctorName: context.consultingRoom?.doctorName ?? "Personal clinico" }} />;
}
