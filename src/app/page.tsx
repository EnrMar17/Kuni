export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-zinc-50 p-16 text-center font-sans dark:bg-black">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Kuni
      </h1>
      <p className="max-w-md text-zinc-600 dark:text-zinc-400">
        Scaffold inicial. Las vistas reales viven en{" "}
        <code className="rounded bg-black/[.06] px-1.5 py-0.5 font-mono text-[0.9em] dark:bg-white/[.08]">
          src/app/(auth)
        </code>{" "}
        y{" "}
        <code className="rounded bg-black/[.06] px-1.5 py-0.5 font-mono text-[0.9em] dark:bg-white/[.08]">
          src/app/(protected)
        </code>
        .
      </p>
    </div>
  );
}
