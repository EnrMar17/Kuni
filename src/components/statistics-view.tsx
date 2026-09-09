"use client";

import { useState } from "react";
import { StatisticsCharts } from "@/components/statistics-charts";
import { StatisticsReport } from "@/components/statistics-report";
import { Icon, type AppointmentIconName } from "@/components/appointments/icons";
import { ProgressCircle } from "@/components/tremor/progress-circle";
import type { DashboardData } from "@/lib/domain/dashboard";
import type { ClinicalTopBarContext } from "@/components/clinical-header";
import { dateTime, percent, riskLabels } from "@/components/dashboard/presentation";

type ReportKind = "summary" | "risk" | "adherence";
const reportLabels: Record<ReportKind, string> = {
  summary: "Resumen del consultorio",
  risk: "Distribución de prioridad actual",
  adherence: "Adherencia y cobertura",
};

/** Aggregates only: exports never include patient identities or raw clinical rows. */
export function reportRows(data: DashboardData, kind: ReportKind): [string, string | number][] {
  const a = data.metrics.adherence;
  const risk: [string, string | number][] = (["high", "medium", "low", "unknown"] as const).map(
    (level) => [riskLabels[level], data.patients.filter((p) => p.risk.level === level).length],
  );
  const adherence: [string, string | number][] = [
    ["Adherencia confirmada · 30 días", percent(a.confirmedAdherencePct)],
    ["Cobertura de respuestas · 30 días", percent(a.responseCoveragePct)],
    ["Tomas confirmadas (Y) · 30 días", a.y],
    ["Tomas negadas (N) · 30 días", a.n],
    ["Tomas desconocidas (U) · 30 días", a.u],
  ];
  if (kind === "risk") return risk;
  if (kind === "adherence") return adherence;
  return [
    ["Pacientes activos", data.metrics.activePatients],
    ["Alertas activas al corte", data.metrics.activeAlerts],
    ["Alertas críticas al corte", data.metrics.criticalAlerts],
    ["Citas programadas · próximos 90 días", data.appointments.length],
    [
      "Glucosa en ayuno promedio · últimos 30 días (mg/dL)",
      data.metrics.meanFastingGlucoseMgDl ?? "Sin datos",
    ],
    ["Lecturas en ayuno · últimos 30 días", data.metrics.fastingGlucoseCount],
    ...risk,
    ...adherence,
  ];
}

function csvCell(value: string | number) {
  const text = String(value);
  const safe = /^[\s]*[=+@-]/.test(text) ? "'" + text : text;
  return '"' + safe.replaceAll('"', '""') + '"';
}

export function StatisticsView({
  data,
  context,
}: {
  data: DashboardData;
  context: ClinicalTopBarContext;
}) {
  const [kind, setKind] = useState<ReportKind>("summary");
  const [report, setReport] = useState<ReportKind | null>(null);
  const rows = report ? reportRows(data, report) : [];

  function download() {
    if (!report) return;
    const content = [
      ["Reporte", reportLabels[report]],
      ["Unidad", context.unitName],
      ["Consultorio", context.roomName],
      ["Corte UTC", data.generatedAt],
      ["Zona horaria", data.timezone],
      ["Pacientes incluidos", data.patients.length],
      ["Cobertura del censo", data.hasMorePatients ? "Parcial: solo pacientes cargados" : "Censo cargado completo"],
      [
        "Alcance",
        "Prioridad y alertas actuales; adherencia y glucosa: 30 días; citas futuras: 90 días.",
      ],
      ["Métrica", "Valor"],
      ...rows,
    ]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "kuni-" + report + "-" + data.generatedAt.slice(0, 10) + ".csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="statistics-view">
      <header className="border-b border-sky-200 bg-[#dcefff] p-6 md:p-8">
        <p className="text-xs font-bold uppercase tracking-widest text-[#1c7fb0]">
          Análisis del consultorio
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">
          Estadísticas
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          Consulta el seguimiento clínico y genera reportes agregados de {context.roomName}.
        </p>
        <p className="mt-3 text-xs text-slate-500">
          Corte de datos: {dateTime(data.generatedAt, data.timezone)}
        </p>
      </header>
      {/* Una sola tira dividida en vez de 4 tarjetas sueltas: nada de gap
          entre "cards" — divide-x/-y solo suman borde a los hijos después
          del primero en orden de documento, así que se salta directo de 1
          a 4 columnas (sin una parada en 2) para no dejar un divisor
          izquierdo huérfano en el primer elemento de una fila envuelta. */}
      <section
        aria-label="Resumen estadístico"
        className="clinical-panel my-6 grid overflow-hidden divide-y divide-slate-200/70 sm:grid-cols-4 sm:divide-x sm:divide-y-0"
      >
        {(
          [
            {
              title: "Pacientes activos",
              value: data.metrics.activePatients,
              detail: "Censo actual",
              icon: "users",
              color: "#0a4470",
              tint: "bg-[#eaf6ff] text-[#0a4470]",
            },
            {
              title: "Prioridad alta",
              value: data.metrics.highRiskPatients,
              detail: "Evaluación actual",
              icon: "alert",
              color: "#001d39",
              tint: "bg-[#e7edf3] text-[#001d39]",
            },
            {
              title: "Adherencia confirmada",
              value: percent(data.metrics.adherence.confirmedAdherencePct),
              pct: data.metrics.adherence.confirmedAdherencePct,
              detail: "Tomas de los últimos 30 días",
              icon: "check",
              color: "#1c7fb0",
              tint: "bg-sky-50 text-[#1c7fb0]",
            },
            {
              title: "Cobertura de respuestas",
              value: percent(data.metrics.adherence.responseCoveragePct),
              pct: data.metrics.adherence.responseCoveragePct,
              detail: "Tomas de los últimos 30 días",
              icon: "phone",
              color: "#51c2ff",
              tint: "bg-sky-50 text-sky-600",
            },
          ] as const
        ).map(({ title, value, detail, icon, color, tint, ...rest }, i) => {
          const pct = "pct" in rest ? rest.pct : null;
          return (
            <article
              key={title}
              className="relative bg-white p-5 pt-6 motion-safe:animate-[kuni-rise_360ms_ease-out_both]"
              style={{ animationDelay: i * 45 + "ms" }}
            >
              {/* Acento flotante: una barrita inset en vez de un border-t
                  sólido, para no chocar con las esquinas redondeadas del
                  contenedor cuando el elemento es el primero o el último. */}
              <span aria-hidden="true" className="absolute inset-x-6 top-0 h-[3px] rounded-full" style={{ background: color }} />
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-xs font-bold text-slate-600">{title}</h2>
                {pct != null ? (
                  <ProgressCircle color={color} size={40} strokeWidth={4} value={pct} label="" />
                ) : (
                  <span aria-hidden="true" className={`grid size-9 shrink-0 place-items-center rounded-xl ${tint}`}>
                    <Icon className="size-4" name={icon as AppointmentIconName} />
                  </span>
                )}
              </div>
              <p className="mt-4 font-mono-data text-3xl font-extrabold text-[#001d39]">
                {value}
              </p>
              <p className="mt-1 text-xs text-slate-500">{detail}</p>
            </article>
          );
        })}
      </section>
      <StatisticsCharts data={data} />
      <div className="statistics-report-layout">
        <section className="clinical-panel report-controls self-start p-6">
          <h2 className="text-lg font-extrabold text-slate-900">Generar reporte</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Elige el contenido para revisar una vista previa y descargarlo como CSV o imprimirlo.
          </p>
          <fieldset className="my-5 grid gap-3">
            <legend className="sr-only">Contenido del reporte</legend>
            {(Object.keys(reportLabels) as ReportKind[]).map((value) => (
              <label className="diagnosis-option" key={value}>
                <input
                  type="radio"
                  name="reportKind"
                  checked={kind === value}
                  onChange={() => {
                    setKind(value);
                    setReport(null);
                  }}
                />
                <span>{reportLabels[value]}</span>
              </label>
            ))}
          </fieldset>
          <p className="mb-5 text-xs leading-6 text-slate-500">
            La prioridad y las alertas reflejan el estado actual. Adherencia y glucosa abarcan 30
            días; las citas, los próximos 90. Los valores sin evidencia aparecen como «Sin datos».
          </p>
          <button
            className="clinical-button clinical-button-primary w-full"
            onClick={() => setReport(kind)}
            type="button"
          >
            Generar vista previa <span aria-hidden="true">→</span>
          </button>
        </section>
        <section
          aria-live="polite"
          className="clinical-panel report-preview p-4 sm:p-6"
          aria-label="Vista previa del reporte"
        >
          {report ? (
            <div key={report}>
              <div className="kuni-report-toolbar report-controls">
                <button className="clinical-button" type="button" onClick={download}>
                  Descargar CSV
                </button>
                <button className="clinical-button clinical-button-primary" type="button" onClick={async () => {
                  await document.fonts.ready;
                  await Promise.all(Array.from(document.querySelectorAll<HTMLImageElement>(".kuni-report-document img")).map(image => image.decode().catch(() => undefined)));
                  window.print();
                }}>
                  Imprimir / PDF
                </button>
              </div>
              <StatisticsReport data={data} context={context} kind={report} title={reportLabels[report]} rows={rows} />
            </div>
          ) : (
            <div className="grid min-h-80 place-content-center text-center">
              <span
                aria-hidden="true"
                className="mx-auto mb-5 grid size-16 place-items-center rounded-2xl border border-sky-100 bg-sky-50 text-3xl text-sky-500"
              >
                ▤
              </span>
              <h2 className="font-bold text-slate-700">Tu reporte aparecerá aquí</h2>
              <p className="mt-2 max-w-xs text-sm leading-6 text-slate-500">
                Selecciona un reporte y genera la vista previa para consultar sus resultados.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
