import { redirect } from "next/navigation";

import { getFixtureSession } from "@/lib/auth/fixture-session";

export default async function Home() {
  const session = await getFixtureSession();

  redirect(session ? "/consultorios" : "/login");
}
