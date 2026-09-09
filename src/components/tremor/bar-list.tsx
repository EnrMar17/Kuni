/**
 * Lista de barras rankeadas al estilo Tremor `BarList` — sin ejes, sin
 * cuadrícula, solo etiqueta + barra proporcional + valor. Mejor que un
 * BarChart de Recharts para categorías simples (menos ruido visual).
 */
export function BarList({
  data,
  color = "#0a4470",
  valueFormatter = (value: number) => String(value),
}: {
  data: { name: string; value: number; fill?: string }[];
  color?: string;
  valueFormatter?: (value: number) => string;
}) {
  const max = Math.max(...data.map((item) => item.value), 1);
  return (
    <div className="flex h-full flex-col justify-center gap-2.5">
      {data.map((item) => (
        <div className="flex items-center gap-3" key={item.name}>
          <span className="w-[38%] shrink-0 truncate text-xs font-semibold text-slate-600" title={item.name}>
            {item.name}
          </span>
          <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full transition-[width] duration-700 ease-out"
              style={{ width: `${(item.value / max) * 100}%`, background: item.fill ?? color }}
            />
          </div>
          <span className="w-8 shrink-0 text-right font-mono-data text-xs font-bold text-slate-900">
            {valueFormatter(item.value)}
          </span>
        </div>
      ))}
    </div>
  );
}
