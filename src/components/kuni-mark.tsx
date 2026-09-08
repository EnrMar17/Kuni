export function KuniMark({ inverted = false }: { inverted?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-3 font-extrabold tracking-tight ${inverted ? "text-white" : "text-slate-900"}`}>
      <span className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-md shadow-indigo-950/20">
        <svg aria-hidden="true" className="size-6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" viewBox="0 0 24 24">
          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
          <path d="M12 9v4M10 11h4" />
        </svg>
      </span>
      <span className="text-xl">Kuni</span>
    </span>
  );
}
