"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function PredictionRefreshButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(() => router.refresh())}
      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-extrabold text-slate-700 shadow-sm transition hover:border-sky-300 hover:text-sky-800 disabled:cursor-wait disabled:opacity-60"
    >
      <svg aria-hidden="true" className={`size-4 ${isPending ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20 11a8 8 0 1 0-2.34 5.66M20 4v7h-7" />
      </svg>
      {isPending ? "Actualizando…" : "Actualizar predicción"}
    </button>
  );
}
