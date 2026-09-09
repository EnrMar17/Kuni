import type { Metadata } from "next";

import { DashboardView } from "@/components/dashboard/dashboard-view";

export const metadata: Metadata = {
  title: "Dashboard clínico",
  description: "Resumen de monitoreo remoto y triaje de pacientes.",
};

export default function DashboardPage() {
  return <DashboardView />;
}
