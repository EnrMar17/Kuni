import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import { logout } from "@/actions/auth";
import { AppError } from "@/contracts/errors";
import { getAuthContext } from "@/lib/auth/context";
import { loginErrors, postLoginRedirect } from "@/lib/auth/navigation";

export const metadata: Metadata = {
  title: "Iniciar sesión",
  description: "Acceso al centro de monitoreo remoto Kuni.",
};

export default async function LoginPage({ searchParams }: {
  searchParams: Promise<{ error?: string; redirectTo?: string }>;
}) {
  const params = await searchParams;
  const redirectTo = postLoginRedirect(typeof params.redirectTo === "string" ? params.redirectTo : null);
  let initialError = typeof params.error === "string" && Object.hasOwn(loginErrors, params.error)
    ? loginErrors[params.error] : null;
  let destination: string | null = null;
  try {
    const context = await getAuthContext();
    if (!initialError) {
      destination = context.consultingRoom ? redirectTo : `/consultorios?redirectTo=${encodeURIComponent(redirectTo)}`;
    }
  } catch (error) {
    if (error instanceof AppError && error.code === "FORBIDDEN") {
      initialError = error.message;
    } else if (!(error instanceof AppError && error.code === "UNAUTHENTICATED")) {
      initialError = loginErrors.conexion;
    }
  }
  if (destination) redirect(destination);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#e8ebf2] px-5 py-10">
      <section className="login-card w-full max-w-[460px] rounded-[28px] border border-white bg-white px-6 py-9 sm:px-9 sm:py-11">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Bienvenido de nuevo</h1>
        <LoginForm redirectTo={redirectTo} initialError={initialError} />
        {params.error === "salida-fallida" ? <form action={logout} className="mt-4"><button className="clinical-button" type="submit">Reintentar cierre de sesión</button></form> : null}
      </section>
    </main>
  );
}
