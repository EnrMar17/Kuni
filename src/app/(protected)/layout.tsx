import type { ReactNode } from "react";

import { ClinicalSessionProvider } from "@/components/clinical-session-provider";
import { getPageAuthContext } from "@/lib/auth/context";

export default async function ProtectedLayout({ children }: Readonly<{ children: ReactNode }>) {
  const context = await getPageAuthContext();

  return (
    <ClinicalSessionProvider
      session={{
        unitName: context.unitName,
        role: context.role,
        room: context.consultingRoom
          ? {
              id: context.consultingRoom.id,
              name: context.consultingRoom.name,
              doctorName: context.consultingRoom.doctorName,
            }
          : null,
      }}
    >
      {children}
    </ClinicalSessionProvider>
  );
}
