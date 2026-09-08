import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ClinicalDashboard } from "@/components/dashboard/clinical-dashboard";
import { getPageAuthContext } from "@/lib/auth/context";
import { getDashboardData } from "@/lib/queries/dashboard";

export const metadata: Metadata = {
  title: "Dashboard clínico",
  description: "Resumen de monitoreo remoto y triaje de pacientes.",
};

export default async function DashboardPage() {
  const context = await getPageAuthContext();
  const room = context.consultingRoom;

  if (!room) {
    redirect("/consultorios");
  }
  const data = await getDashboardData();

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#e8ebf2] p-3 text-slate-800 md:p-6 lg:p-8">
      <ClinicalDashboard
        key={room.id}
        room={{ name: room.name, doctor: { fullName: room.doctorName } }}
        unitName={context.unitName}
        data={data}
      />
    </main>
  );
}
