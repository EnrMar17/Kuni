import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ClinicalDashboard } from "@/components/dashboard/clinical-dashboard";
import { getSelectedFixtureRoom } from "@/lib/auth/fixture-session";

export const metadata: Metadata = {
  title: "Dashboard clínico",
  description: "Resumen de monitoreo remoto y triaje de pacientes.",
};

export default async function DashboardPage() {
  const room = await getSelectedFixtureRoom();

  if (!room) {
    redirect("/consultorios");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#e8ebf2] p-3 text-slate-800 md:p-6 lg:p-8">
      <ClinicalDashboard room={room} />
    </main>
  );
}
