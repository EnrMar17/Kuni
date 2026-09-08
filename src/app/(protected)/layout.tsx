import type { ReactNode } from "react";

import { getPageAuthContext } from "@/lib/auth/context";

export default async function ProtectedLayout({ children }: Readonly<{ children: ReactNode }>) {
  await getPageAuthContext();

  return children;
}
