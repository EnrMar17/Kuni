"use client";

import Link from "next/link";
import { useEffect } from "react";

type RouteErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

/** Shared fallback for protected route segments. Do not expose error details. */
export function RouteError({ error, reset }: RouteErrorProps) {
  useEffect(() => {
    console.error("[kuni] protected route error", error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#e8ebf2] p-3 text-slate-800 md:p-6 lg:p-8">
      <section aria-live="assertive" className="rounded-3xl border border-slate-200/70 bg-white p-6 shadow-sm" role="alert">
        <h1 className="text-xl font-bold text-slate-900">No se pudieron cargar los datos del consultorio</h1>
        <p className="mt-3 text-sm text-slate-500">Intenta nuevamente o revisa la selección de consultorio.</p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button className="clinical-button clinical-button-primary" onClick={reset} type="button">Reintentar</button>
          <Link className="clinical-button" href="/consultorios">Cambiar consultorio</Link>
        </div>
      </section>
    </main>
  );
}
