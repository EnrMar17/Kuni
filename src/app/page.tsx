import { redirect } from "next/navigation";

import { SplashScreen } from "@/components/splash-screen";
import { AppError } from "@/contracts/errors";
import { getAuthContext } from "@/lib/auth/context";

export default async function Home() {
  const context = await tryGetAuthContext();
  //if (context) redirect(context.consultingRoom ? "/dashboard" : "/consultorios");
  return <SplashScreen />;
}

/**
 * A diferencia de getPageAuthContext (que redirige a /login con un motivo de
 * error para rutas protegidas), aquí un visitante sin sesión es el caso
 * normal: mostramos la bienvenida en vez de mandarlo directo a /login con un
 * mensaje de "tu sesión venció" que no aplicaría a una primera visita.
 */
async function tryGetAuthContext() {
  try {
    return await getAuthContext();
  } catch (error) {
    if (error instanceof AppError) return null;
    throw error;
  }
}
