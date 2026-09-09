"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DashboardData } from "@/lib/domain/dashboard";
import { riskLabels } from "@/components/dashboard/presentation";
import { statisticsSeries } from "./statistics-data";
import "./statistics-charts.css";

const palette = ["#0a4470", "#2386b8", "#51c2ff", "#399887", "#899cab"];
const tooltipStyle = { borderRadius: 8, border: "1px solid #b9d6e9", fontSize: 12 };

function Plot({ title, detail, empty, children, rows }: { title: string; detail: string; empty?: boolean; children: ReactNode; rows: (string | number | null)[][] }) {
  return <section className="statistics-plot" aria-label={title}>
    <h2>{title}</h2><p>{detail}</p>
    <div className="statistics-canvas">{empty ? <p className="statistics-empty">Sin datos disponibles</p> : children}</div>
    <details><summary>Ver valores</summary><div className="statistics-values"><table><caption className="sr-only">{title}</caption><tbody>{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => j === 0 ? <th scope="row" key={j}>{cell}</th> : <td key={j}>{cell ?? "Sin datos"}</td>)}</tr>)}</tbody></table></div></details>
  </section>;
}

function Bars({ values }: { values: { name: string; value: number; fill?: string }[] }) {
  return <ResponsiveContainer width="100%" height="100%"><BarChart data={values} layout="vertical" accessibilityLayer margin={{ left: 0, right: 24, top: 8, bottom: 8 }}>
    <CartesianGrid horizontal={false} stroke="#e1edf4" />
    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
    <YAxis type="category" dataKey="name" width={115} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#eaf6ff" }} />
    <Bar dataKey="value" name="Cantidad" radius={[0, 4, 4, 0]} maxBarSize={24} isAnimationActive="auto" animationDuration={550}>
      {values.map((item, i) => <Cell key={item.name} fill={item.fill ?? palette[i % palette.length]} />)}
    </Bar>
  </BarChart></ResponsiveContainer>;
}

export function StatisticsCharts({ data }: { data: DashboardData }) {
  const [view, setView] = useState("all");
  const series = useMemo(() => statisticsSeries(data), [data]);
  const risk = (["high", "medium", "low", "unknown"] as const).map((level, i) => ({ name: riskLabels[level], value: data.patients.filter(p => p.risk.level === level).length, fill: ["#ce5163", "#c38b2d", "#399887", "#899cab"][i] }));
  const a = data.metrics.adherence;
  const responses = [{ name: "Confirmadas", value: a.y, fill: "#0a4470" }, { name: "Negadas", value: a.n, fill: "#ce5163" }, { name: "Desconocidas", value: a.u, fill: "#899cab" }];
  const bars = (title: string, detail: string, values: {name: string; value: number; fill?: string}[]) => <Plot key={title} title={title} detail={detail} empty={!values.some(v => v.value > 0)} rows={values.map(v => [v.name, v.value])}><Bars values={values} /></Plot>;
  return <div className="statistics-visuals">
    <div className="statistics-view-switch" role="group" aria-label="Contenido de las gráficas">{[["all", "Resumen"], ["profile", "Perfil clínico"], ["monitoring", "Monitoreo"]].map(([value, label]) => <button type="button" key={value} aria-pressed={view === value} onClick={() => setView(value)}>{label}</button>)}</div>
    {data.hasMorePatients && <p className="statistics-scope" role="status">Vista parcial: las gráficas corresponden a los pacientes cargados.</p>}
    <div className="statistics-chart-grid">
      {view !== "monitoring" && <>
        {bars("Prioridad actual", "Pacientes por nivel · al corte", risk)}
        {bars("Diagnósticos", "Un paciente puede tener varios diagnósticos", series.diagnoses)}
        {bars("Distribución de edades", "Pacientes por grupo de edad · años", series.ages)}
        {bars("Respuesta a las tomas", "Interacciones concluidas · últimos 30 días", responses)}
      </>}
      {view !== "profile" && <>
        <Plot title="Glucosa en ayuno" detail="Promedio diario de lecturas · mg/dL · últimos 30 días" empty={!series.readings.some(r => r.glucose != null)} rows={series.readings.map(r => [r.date, r.glucose])}>
          <ResponsiveContainer width="100%" height="100%"><LineChart data={series.readings} accessibilityLayer margin={{ right: 12, top: 12 }}><CartesianGrid stroke="#e1edf4" vertical={false}/><XAxis dataKey="name" minTickGap={30} tick={{ fontSize: 11 }}/><YAxis width={44} tick={{ fontSize: 11 }}/><Tooltip contentStyle={tooltipStyle}/><Line type="linear" dataKey="glucose" name="Glucosa (mg/dL)" stroke="#0a4470" strokeWidth={2.5} dot={{ r: 3 }} connectNulls={false} isAnimationActive="auto" animationDuration={550}/></LineChart></ResponsiveContainer>
        </Plot>
        <Plot title="Presión arterial" detail="Promedio diario de lecturas · mmHg · últimos 30 días" empty={!series.readings.some(r => r.systolic != null || r.diastolic != null)} rows={[["Fecha", "Sistólica", "Diastólica"], ...series.readings.map(r => [r.date, r.systolic, r.diastolic])]}>
          <ResponsiveContainer width="100%" height="100%"><LineChart data={series.readings} accessibilityLayer margin={{ right: 12, top: 12 }}><CartesianGrid stroke="#e1edf4" vertical={false}/><XAxis dataKey="name" minTickGap={30} tick={{ fontSize: 11 }}/><YAxis width={44} tick={{ fontSize: 11 }}/><Tooltip contentStyle={tooltipStyle}/><Legend wrapperStyle={{ fontSize: 12 }}/><Line type="linear" dataKey="systolic" name="Sistólica (mmHg)" stroke="#0a4470" strokeWidth={2.5} dot={{ r: 3 }} connectNulls={false} isAnimationActive="auto" animationDuration={550}/><Line type="linear" dataKey="diastolic" name="Diastólica (mmHg)" stroke="#399887" strokeDasharray="5 3" strokeWidth={2.5} dot={{ r: 3 }} connectNulls={false} isAnimationActive="auto" animationDuration={550}/></LineChart></ResponsiveContainer>
        </Plot>
      </>}
    </div>
  </div>;
}
