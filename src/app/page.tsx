import { redirect } from "next/navigation";

import { getPageAuthContext } from "@/lib/auth/context";

export default async function Home() {
  const context = await getPageAuthContext();
  redirect(context.consultingRoom ? "/dashboard" : "/consultorios");
}
