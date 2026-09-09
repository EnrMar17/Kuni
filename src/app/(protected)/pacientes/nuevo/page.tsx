import { ClinicalWorkspaceView } from "@/components/clinical-workspace-view";
import { getPageAuthContext } from "@/lib/auth/context";
import { listActiveMedications } from "@/lib/queries/patient-registration";

export default async function NewPatientPage() {
  const [context, medications] = await Promise.all([getPageAuthContext(), listActiveMedications()]);
  return <ClinicalWorkspaceView context={{ unitName: context.unitName, roomName: context.consultingRoom?.name ?? "Consultorio", doctorName: context.consultingRoom?.doctorName ?? "Personal clínico" }} mode="new-patient" medications={medications} />;
}
