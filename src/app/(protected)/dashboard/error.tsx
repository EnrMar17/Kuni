"use client";

import Link from "next/link";

export default function DashboardError({ reset }: { reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#e8ebf2] p-3 text-slate-800 md:p-6 lg:p-8">
      <section role="alert" className="rounded-3xl border border-slate-200/70 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">No se pudieron cargar los datos del consultorio</h1>
        <p className="mt-3 text-sm text-slate-500">Intenta nuevamente o revisa la selección de consultorio.</p>
        <div className="mt-5 flex items-center gap-3">
          <button onClick={reset} type="button" className="rounded-full bg-[#001d39] px-4 py-2 text-sm font-semibold text-white">Reintentar</button>
          <Link href="/consultorios" className="text-sm font-semibold text-indigo-600">Cambiar consultorio</Link>
        </div>
      </section>
    </main>
  );
}
