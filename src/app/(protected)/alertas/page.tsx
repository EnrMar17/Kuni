import { ClinicalWorkspaceView } from "@/components/clinical-workspace-view";
import { getPageAuthContext } from "@/lib/auth/context";

export default async function AlertsPage() {
  const context = await getPageAuthContext();
  return <ClinicalWorkspaceView context={{ unitName: context.unitName, roomName: context.consultingRoom?.name ?? "Consultorio", doctorName: context.consultingRoom?.doctorName ?? "Personal clínico" }} mode="alerts" />;
}
