import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { getFixtureSession } from "@/lib/auth/fixture-session";

export default async function ProtectedLayout({ children }: Readonly<{ children: ReactNode }>) {
  if (!(await getFixtureSession())) {
    redirect("/login");
  }

  return children;
}
