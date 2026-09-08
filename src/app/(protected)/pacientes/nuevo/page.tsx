import { ClinicalWorkspace } from "@/components/clinical-workspace";
import { getPageAuthContext } from "@/lib/auth/context";
import { getDashboardData } from "@/lib/queries/dashboard";
import { listActiveMedications } from "@/lib/queries/patient-registration";

export default async function NewPatientPage() {
  const [context, data, medications] = await Promise.all([getPageAuthContext(), getDashboardData(), listActiveMedications()]);
  return <ClinicalWorkspace context={{ unitName: context.unitName, roomName: context.consultingRoom?.name ?? "Consultorio", doctorName: context.consultingRoom?.doctorName ?? "Personal clínico" }} data={data} mode="new-patient" medications={medications} />;
}
