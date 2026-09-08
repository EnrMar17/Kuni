function Bone({ className = "" }: { className?: string }) {
  return <div className={`skeleton-bone ${className}`} />;
}

export function ClinicalSkeleton({ view }: { view: "dashboard" | "patients" | "form" | "profile" | "appointments" | "alerts" | "statistics" }) {
  const form = view === "form";
  const split = ["dashboard", "profile", "appointments", "statistics"].includes(view);
  return <main id="contenido-principal" className="min-h-screen bg-[#e8ebf2] p-3 md:p-6 lg:p-8" aria-busy="true" aria-label="Cargando vista clínica">
    <span className="sr-only" role="status">Cargando datos…</span>
    <div className="mx-auto max-w-[1480px] rounded-[36px] bg-[#f7f8fc] p-4 md:p-8">
      <div aria-hidden="true">
        <div className="mb-8 flex flex-wrap items-center gap-5"><Bone className="size-12 !rounded-2xl" /><Bone className="h-14 min-w-40 flex-1 !rounded-full" /><Bone className="h-12 w-52 !rounded-full" /></div>
        <Bone className="mb-3 h-9 w-60" /><Bone className="mb-8 h-4 w-3/5" />
        {view === "dashboard" || view === "statistics" ? <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">{Array.from({length:4},(_,i)=><Bone key={i} className="h-32 !rounded-3xl" />)}</div> : null}
        <div className={split ? "grid gap-6 lg:grid-cols-[1.7fr_1fr]" : "grid gap-6"}>
          {Array.from({ length: form ? 3 : split ? 2 : 1 }, (_, card) => <section className="clinical-panel p-6" key={card}>
            <Bone className="mb-6 h-5 w-40" />
            <div className={form ? "grid gap-5 sm:grid-cols-2" : "grid gap-4"}>
              {Array.from({ length: form ? 4 : view === "alerts" ? 3 : 5 }, (_, row) => <div className="flex items-center gap-4" key={row}>{!form ? <Bone className="size-10 shrink-0 !rounded-full" /> : null}<div className="flex-1 min-w-0"><Bone className="mb-2 h-3 w-2/5" /><Bone className={form ? "h-11 w-full" : "h-4 w-4/5"} /></div></div>)}
            </div>
          </section>)}
        </div>
      </div>
    </div>
  </main>;
}
