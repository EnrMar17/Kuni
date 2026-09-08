import { ClinicalWorkspace } from "@/components/clinical-workspace";
import { getPageAuthContext } from "@/lib/auth/context";
import { getDashboardData } from "@/lib/queries/dashboard";

export default async function AppointmentsPage() {
  const [context, data] = await Promise.all([getPageAuthContext(), getDashboardData()]);
  return <ClinicalWorkspace context={{ unitName: context.unitName, roomName: context.consultingRoom?.name ?? "Consultorio", doctorName: context.consultingRoom?.doctorName ?? "Personal clínico" }} data={data} mode="appointments" />;
}
