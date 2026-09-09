import Image from "next/image";
import type { ReactNode } from "react";
import type { DashboardData } from "@/lib/domain/dashboard";
import type { ClinicalTopBarContext } from "@/components/clinical-header";
import { dateTime } from "@/components/dashboard/presentation";
import "./statistics-report.css";

type ReportRow = [string, string | number];

function ReportTable({ title, number, rows }: { title: string; number: string; rows: ReportRow[] }) {
  return <section className="kuni-report-section">
    <h3><span>{number}</span>{title}</h3>
    <table><caption className="sr-only">{title}</caption><thead><tr><th scope="col">Indicador</th><th scope="col">Resultado</th></tr></thead>
      <tbody>{rows.map(([label, value]) => <tr key={label}><th scope="row">{label}</th><td>{value}</td></tr>)}</tbody>
    </table>
  </section>;
}

export function StatisticsReport({ data, context, kind, title, rows }: {
  data: DashboardData; context: ClinicalTopBarContext; kind: "summary" | "risk" | "adherence"; title: string; rows: ReportRow[];
}) {
  const total = kind === "summary" ? 2 : 1;
  function page(number: number, subtitle: string, children: ReactNode) {
    return <section className="kuni-report-page" aria-label={`Página ${number}: ${subtitle}`}>
      <header className="kuni-report-header">
        <div className="kuni-report-brand"><Image src="/brand/kuni-mark.png" alt="" width={48} height={40} unoptimized /><strong>Kuni</strong></div>
        <div><strong>REPORTE ESTADÍSTICO</strong><span>Monitoreo del consultorio</span></div>
      </header>
      <div className="kuni-report-heading"><p>{subtitle}</p><h2>{title}</h2></div>
      <dl className="kuni-report-meta">
        <div><dt>Unidad</dt><dd>{context.unitName}</dd></div>
        <div><dt>Consultorio</dt><dd>{context.roomName}</dd></div>
        <div><dt>Corte de información</dt><dd>{dateTime(data.generatedAt, data.timezone)}</dd></div>
        <div><dt>Zona horaria</dt><dd>{data.timezone}</dd></div>
      </dl>
      {data.hasMorePatients && <p className="kuni-report-warning">ALCANCE PARCIAL. Este reporte incluye únicamente los pacientes cargados; no representa necesariamente el total del consultorio.</p>}
      <div className="kuni-report-body">{children}</div>
      <footer className="kuni-report-footer"><div><strong>Kuni · Información agregada</strong><span>Uso interno · Sin identidades de pacientes</span></div><span>Página {number} de {total}</span></footer>
    </section>;
  }
  const definitions = <section className="kuni-report-section kuni-report-notes"><h3><span>{kind === "summary" ? "04" : "02"}</span>Alcance y metodología</h3>
    <dl>
      {kind !== "adherence" && <div><dt>Prioridad clínica</dt><dd>Distribución al momento del corte. «Sin evaluar» se mantiene como categoría independiente y no equivale a prioridad baja.</dd></div>}
      {kind !== "risk" && <>
        <div><dt>Adherencia confirmada</dt><dd>Tomas confirmadas / (confirmadas + negadas). Las respuestas desconocidas no se consideran tomas negadas.</dd></div>
        <div><dt>Cobertura de respuestas</dt><dd>(Confirmadas + negadas) / (confirmadas + negadas + desconocidas). Ambas métricas corresponden a interacciones concluidas de los últimos 30 días; se excluyen fallos técnicos según el cálculo del sistema.</dd></div>
      </>}
      {kind === "summary" && <div><dt>Glucosa y agenda</dt><dd>Glucosa: promedio de las lecturas en ayuno de los últimos 30 días, no promedio por paciente. Agenda: citas programadas en los próximos 90 días, no consultas realizadas.</dd></div>}
      <div><dt>Disponibilidad y privacidad</dt><dd>«Sin datos» indica ausencia de evidencia o denominador válido, no un resultado de cero. Documento agregado, sin nombres, teléfonos ni expedientes de pacientes. No sustituye la valoración clínica.</dd></div>
    </dl>
  </section>;
  return <article className="kuni-report-document" aria-label={title}>
    {kind === "summary" ? <>
      {page(1, "01 / Panorama del consultorio", <>
        <p className="kuni-report-intro">Resumen de actividad y seguimiento de <strong>{data.patients.length}</strong> pacientes incluidos en el corte. Los indicadores describen períodos distintos, indicados en cada sección.</p>
        <ReportTable number="01" title="Indicadores del consultorio" rows={rows.slice(0, 6)} />
        <ReportTable number="02" title="Prioridad actual" rows={rows.slice(6, 10)} />
      </>)}
      {page(2, "02 / Seguimiento y criterios de lectura", <>
        <ReportTable number="03" title="Adherencia y cobertura · últimos 30 días" rows={rows.slice(10)} />
        {definitions}
      </>)}
    </> : page(1, kind === "risk" ? "Prioridad al corte" : "Seguimiento de tratamientos", <>
      <p className="kuni-report-intro">Pacientes incluidos: <strong>{data.patients.length}</strong>. {kind === "risk" ? "Distribución actual de prioridad en el consultorio." : "Resultados de interacciones concluidas de los últimos 30 días."}</p>
      <ReportTable number="01" title={title} rows={rows} />{definitions}
    </>)}
  </article>;
}
