import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { KuniMark } from "@/components/kuni-mark";
import { LoginForm } from "@/components/login-form";
import { getFixtureSession } from "@/lib/auth/fixture-session";

export const metadata: Metadata = {
  title: "Iniciar sesión",
  description: "Acceso al centro de monitoreo remoto Kuni.",
};

export default async function LoginPage() {
  if (await getFixtureSession()) {
    redirect("/consultorios");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#e8ebf2] p-3 text-slate-800 md:p-6 lg:p-8">
      <div className="dashboard-shadow-floating grid w-full max-w-[1180px] overflow-hidden rounded-[36px] border border-slate-200/70 bg-[#f7f8fc] lg:min-h-[720px] lg:grid-cols-[0.92fr_1.08fr]">
        <section className="relative hidden overflow-hidden bg-[#001d39] p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
          <div aria-hidden="true" className="absolute -left-28 -top-28 size-80 rounded-full bg-indigo-500/20 blur-3xl" />
          <div aria-hidden="true" className="absolute -bottom-28 -right-24 size-96 rounded-full bg-sky-400/15 blur-3xl" />
          <div className="relative">
            <KuniMark inverted />
            <p className="mt-16 max-w-sm text-xs font-bold uppercase tracking-[0.22em] text-indigo-300">
              Monitoreo remoto de pacientes
            </p>
            <h1 className="mt-5 max-w-md text-4xl font-extrabold leading-[1.12] tracking-tight xl:text-5xl">
              Decisiones clínicas con el contexto correcto.
            </h1>
            <p className="mt-6 max-w-md text-sm leading-7 text-slate-300">
              Reúne señales, adherencia y alertas de pacientes crónicos en un solo espacio de seguimiento.
            </p>
          </div>

          <div className="relative">
            <div className="grid grid-cols-3 gap-3">
              <article className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-sm">
                <p className="font-mono-data text-2xl font-bold">24/7</p>
                <p className="mt-1 text-[10px] font-medium leading-4 text-slate-300">Seguimiento automatizado</p>
              </article>
              <article className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-sm">
                <p className="font-mono-data text-2xl font-bold text-emerald-300">84%</p>
                <p className="mt-1 text-[10px] font-medium leading-4 text-slate-300">Respuesta al bot</p>
              </article>
              <article className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-sm">
                <p className="font-mono-data text-2xl font-bold text-rose-300">14</p>
                <p className="mt-1 text-[10px] font-medium leading-4 text-slate-300">Casos prioritarios</p>
              </article>
            </div>
            <p className="mt-6 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">
              SSM Michoacán · Entorno de demostración
            </p>
          </div>
        </section>

        <section className="flex items-center justify-center p-6 sm:p-10 lg:p-14">
          <div className="w-full max-w-md">
            <div className="mb-10 flex items-center justify-between lg:hidden">
              <KuniMark />
              <span className="rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-600">
                Acceso clínico
              </span>
            </div>
            <div className="hidden lg:block">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600">Acceso clínico seguro</p>
            </div>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">Bienvenido de nuevo</h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              Ingresa con las credenciales asignadas a tu unidad de salud.
            </p>
            <LoginForm />
            <div className="mt-8 flex items-center justify-center gap-2 text-[10px] font-medium text-slate-400">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              Sesión protegida · Datos clínicos ficticios
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
