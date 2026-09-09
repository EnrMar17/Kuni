"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

const tooltipStyle = { borderRadius: 10, border: "1px solid #cfe6f9", fontSize: 12, boxShadow: "0 8px 20px -8px rgb(10 68 112 / .25)" };

/**
 * Anillo con etiqueta central al estilo Tremor `DonutChart`, sobre nuestro
 * propio Recharts v3 (no el que trae @tremor/react, que es v2 — ver la nota
 * en statistics-view.tsx).
 */
export function DonutChart({
  data,
  colors,
  valueFormatter = (value: number) => String(value),
  centerLabel,
  centerCaption,
}: {
  data: { name: string; value: number }[];
  colors: string[];
  valueFormatter?: (value: number) => string;
  centerLabel?: React.ReactNode;
  centerCaption?: React.ReactNode;
}) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  return (
    <div className="flex h-full items-center gap-5">
      <div className="relative aspect-square h-full max-h-[190px] shrink-0">
        <ResponsiveContainer height="100%" width="100%">
          <PieChart>
            <Pie
              animationDuration={550}
              data={data}
              dataKey="value"
              endAngle={-270}
              innerRadius="68%"
              isAnimationActive
              nameKey="name"
              outerRadius="100%"
              paddingAngle={data.length > 1 ? 3 : 0}
              startAngle={90}
            >
              {data.map((item, i) => (
                <Cell fill={colors[i % colors.length]} key={item.name} stroke="#fff" strokeWidth={2} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} formatter={(value) => valueFormatter(Number(value))} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="font-mono-data text-xl font-extrabold text-slate-900">{centerLabel ?? total}</p>
            {centerCaption ? <p className="text-[10px] font-semibold text-slate-400">{centerCaption}</p> : null}
          </div>
        </div>
      </div>
      <ul className="flex min-w-0 flex-1 flex-col gap-2">
        {data.map((item, i) => (
          <li className="flex items-center justify-between gap-2 text-xs" key={item.name}>
            <span className="flex min-w-0 items-center gap-1.5 truncate font-semibold text-slate-600">
              <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: colors[i % colors.length] }} />
              <span className="truncate">{item.name}</span>
            </span>
            <span className="shrink-0 font-mono-data font-bold text-slate-900">{valueFormatter(item.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
