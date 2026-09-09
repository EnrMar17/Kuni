import type { Metadata } from "next";
import Image from "next/image";
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
    <main
      id="contenido-principal"
      className="login-shell relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-10"
    >
      <div aria-hidden="true" className="splash-glow splash-glow-a" />
      <div aria-hidden="true" className="splash-glow splash-glow-b" />
      <section className="login-card relative z-10 w-full max-w-[460px] rounded-[28px] border border-white/70 bg-white/95 px-6 py-9 shadow-2xl shadow-[#0a4470]/12 backdrop-blur-sm sm:px-9 sm:py-11">
        <Image alt="Kuni" className="mx-auto h-auto w-12" height={530} src="/brand/kuni-mark.png" width={640} />
        <h1 className="mt-5 text-3xl font-extrabold tracking-tight text-[#001d39]">Bienvenido de nuevo</h1>
        <p className="mt-1.5 text-sm font-medium text-slate-500">Accede al centro de monitoreo remoto.</p>
        <LoginForm redirectTo={redirectTo} initialError={initialError} />
        {params.error === "salida-fallida" ? <form action={logout} className="mt-4"><button className="clinical-button" type="submit">Reintentar cierre de sesión</button></form> : null}
      </section>
    </main>
  );
}
