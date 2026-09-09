import { ClinicalWorkspaceView } from "@/components/clinical-workspace-view";

export default async function EditPatientPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params;
  return <ClinicalWorkspaceView mode="new-patient" patientId={patientId} />;
}
