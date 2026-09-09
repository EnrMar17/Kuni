import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DashboardView } from "@/components/dashboard/dashboard-view";
import { getPageAuthContext } from "@/lib/auth/context";

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

  return (
    <DashboardView
      roomId={room.id}
      room={{ name: room.name, doctor: { fullName: room.doctorName } }}
      unitName={context.unitName}
    />
  );
}
