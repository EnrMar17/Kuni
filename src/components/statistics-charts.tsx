"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DashboardData } from "@/lib/domain/dashboard";
import { riskLabels } from "@/components/dashboard/presentation";
import { BarList } from "@/components/tremor/bar-list";
import { DonutChart } from "@/components/tremor/donut-chart";
import { statisticsSeries } from "./statistics-data";
import "./statistics-charts.css";

/* Rampa navy → sky → slate — misma paleta que `riskClass` en clinical-workspace.tsx.
   Nada de rosa/ámbar/verde: cualquier color en una gráfica de esta vista sale de aquí. */
const palette = ["#001d39", "#0a4470", "#1c7fb0", "#51c2ff", "#94a3b8"];
const tooltipStyle = { borderRadius: 10, border: "1px solid #cfe6f9", fontSize: 12, boxShadow: "0 8px 20px -8px rgb(10 68 112 / .25)" };

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
    </svg>
  );
}

function Plot({ title, detail, empty, children, rows }: { title: string; detail: string; empty?: boolean; children: ReactNode; rows: (string | number | null)[][] }) {
  return <section className="statistics-plot" aria-label={title}>
    <h2>{title}</h2><p>{detail}</p>
    <div className="statistics-canvas">
      {empty ? (
        <div className="statistics-empty">
          <span aria-hidden="true" className="statistics-empty-icon">▤</span>
          <p>Sin datos disponibles</p>
        </div>
      ) : children}
    </div>
    <details className="statistics-values-toggle">
      <summary>
        Ver valores
        <ChevronIcon className="statistics-plot-chevron" />
      </summary>
      <div className="statistics-values">
        <table>
          <caption className="sr-only">{title}</caption>
          <tbody>
            {rows.map((row, i) => <tr key={i}>{row.map((cell, j) => j === 0 ? <th scope="row" key={j}>{cell}</th> : <td key={j}>{cell ?? "Sin datos"}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
    </details>
  </section>;
}

export function StatisticsCharts({ data }: { data: DashboardData }) {
  const [view, setView] = useState("all");
  const series = useMemo(() => statisticsSeries(data), [data]);
  const risk = (["high", "medium", "low", "unknown"] as const).map((level, i) => ({ name: riskLabels[level], value: data.patients.filter(p => p.risk.level === level).length, fill: ["#001d39", "#1c7fb0", "#51c2ff", "#94a3b8"][i] }));
  const a = data.metrics.adherence;
  const responses = [{ name: "Confirmadas", value: a.y }, { name: "Negadas", value: a.n }, { name: "Desconocidas", value: a.u }];
  const responseColors = ["#0a4470", "#1c7fb0", "#94a3b8"];
  const list = (title: string, detail: string, values: { name: string; value: number; fill?: string }[]) => (
    <Plot key={title} detail={detail} empty={!values.some(v => v.value > 0)} rows={values.map(v => [v.name, v.value])} title={title}>
      <BarList data={values} />
    </Plot>
  );
  return <div className="statistics-visuals">
    <div className="statistics-view-switch" role="group" aria-label="Contenido de las gráficas">{[["all", "Resumen"], ["profile", "Perfil clínico"], ["monitoring", "Monitoreo"]].map(([value, label]) => <button type="button" key={value} aria-pressed={view === value} onClick={() => setView(value)}>{label}</button>)}</div>
    {data.hasMorePatients && <p className="statistics-scope" role="status">Vista parcial: las gráficas corresponden a los pacientes cargados.</p>}
    <div className="statistics-chart-grid">
      {view !== "monitoring" && <>
        {list("Prioridad actual", "Pacientes por nivel · al corte", risk)}
        {list("Diagnósticos", "Un paciente puede tener varios diagnósticos", series.diagnoses.map((d, i) => ({ ...d, fill: palette[i % palette.length] })))}
        {list("Distribución de edades", "Pacientes por grupo de edad · años", series.ages.map((d, i) => ({ ...d, fill: palette[i % palette.length] })))}
        <Plot detail="Interacciones concluidas · últimos 30 días" empty={!responses.some(r => r.value > 0)} rows={responses.map(r => [r.name, r.value])} title="Respuesta a las tomas">
          <DonutChart centerCaption="tomas" colors={responseColors} data={responses} />
        </Plot>
      </>}
      {view !== "profile" && <>
        <Plot detail="Promedio diario de lecturas · mg/dL · últimos 30 días" empty={!series.readings.some(r => r.glucose != null)} rows={series.readings.map(r => [r.date, r.glucose])} title="Glucosa en ayuno">
          <ResponsiveContainer height="100%" width="100%">
            <AreaChart accessibilityLayer data={series.readings} margin={{ right: 12, top: 12 }}>
              <defs>
                <linearGradient id="statistics-glucose-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="5%" stopColor="#0a4470" stopOpacity={0.32} />
                  <stop offset="95%" stopColor="#0a4470" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#e1edf4" vertical={false} />
              <XAxis dataKey="name" minTickGap={30} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={44} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area animationDuration={550} connectNulls={false} dataKey="glucose" dot={{ r: 3 }} fill="url(#statistics-glucose-fill)" isAnimationActive="auto" name="Glucosa (mg/dL)" stroke="#0a4470" strokeWidth={2.5} type="linear" />
            </AreaChart>
          </ResponsiveContainer>
        </Plot>
        <Plot detail="Promedio diario de lecturas · mmHg · últimos 30 días" empty={!series.readings.some(r => r.systolic != null || r.diastolic != null)} rows={[["Fecha", "Sistólica", "Diastólica"], ...series.readings.map(r => [r.date, r.systolic, r.diastolic])]} title="Presión arterial">
          <ResponsiveContainer height="100%" width="100%">
            <AreaChart accessibilityLayer data={series.readings} margin={{ right: 12, top: 12 }}>
              <defs>
                <linearGradient id="statistics-systolic-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="5%" stopColor="#0a4470" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="#0a4470" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="statistics-diastolic-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="5%" stopColor="#51c2ff" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="#51c2ff" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#e1edf4" vertical={false} />
              <XAxis dataKey="name" minTickGap={30} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={44} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area animationDuration={550} connectNulls={false} dataKey="systolic" dot={{ r: 3 }} fill="url(#statistics-systolic-fill)" isAnimationActive="auto" name="Sistólica (mmHg)" stroke="#0a4470" strokeWidth={2.5} type="linear" />
              <Area animationDuration={550} connectNulls={false} dataKey="diastolic" dot={{ r: 3 }} fill="url(#statistics-diastolic-fill)" isAnimationActive="auto" name="Diastólica (mmHg)" stroke="#51c2ff" strokeDasharray="5 3" strokeWidth={2.5} type="linear" />
            </AreaChart>
          </ResponsiveContainer>
        </Plot>
      </>}
    </div>
  </div>;
}
