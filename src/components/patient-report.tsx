import Image from "next/image";
import type { ReactNode } from "react";
import type { DashboardPatient } from "@/lib/domain/dashboard";
import type { ClinicalTopBarContext } from "@/components/clinical-header";
import { dateTime, measurementDescription, percent, riskLabels } from "@/components/dashboard/presentation";
import "./patient-report.css";

function dateOnly(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Sin fecha registrada";
  return value.slice(8) + "/" + value.slice(5, 7) + "/" + value.slice(0, 4);
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="patient-report-section"><h2>{title}</h2>{children}</section>;
}
function Fields({ values }: { values: [string, ReactNode][] }) {
  return <dl className="patient-report-fields">{values.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}
const weekdays: Record<number, string> = { 1: "Lun", 2: "Mar", 3: "Mié", 4: "Jue", 5: "Vie", 6: "Sáb", 7: "Dom" };

export function PatientReport({ patient, context, generatedAt, timezone }: {
  patient: DashboardPatient; context: ClinicalTopBarContext; generatedAt: string; timezone: string;
}) {
  const readings = [...patient.measurements].sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt)).slice(0, 10);
  const appointments = [...patient.appointments].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)).slice(0, 10);
  const adherence = patient.adherence;
  return <article className="patient-report-document" aria-label="Reporte clínico individual">
    <table className="patient-report-frame" role="presentation">
      <thead><tr><td><header className="patient-report-header">
        <div className="patient-report-brand"><Image src="/brand/kuni-mark.png" width={48} height={40} unoptimized alt=""/><strong>Kuni</strong></div>
        <div><strong>REPORTE CLÍNICO INDIVIDUAL</strong><span>Expediente {patient.clinicalRecord}</span></div>
      </header></td></tr></thead>
      <tbody><tr><td>
        <div className="patient-report-title"><p>Resumen del expediente al corte</p><h1>{patient.fullName}</h1></div>
        <Fields values={[["Unidad", context.unitName], ["Consultorio", context.roomName], ["Médico a cargo del consultorio", context.doctorName], ["Corte de información", dateTime(generatedAt, timezone)], ["Zona horaria", timezone], ["Expediente", patient.clinicalRecord]]}/>
        <p className="patient-report-confidential">CONFIDENCIAL · Contiene datos personales de salud. Compartir únicamente con personas autorizadas.</p>
        <Section title="01 / Identificación y valoración actual">
          <Fields values={[["Nacimiento", dateOnly(patient.birthDate)], ["Edad", `${patient.age} años`], ["Sexo", ({female:"Femenino",male:"Masculino",other:"Otro",unknown:"No especificado"} as Record<string,string>)[patient.sex] ?? "No especificado"], ["Grupo sanguíneo", patient.bloodType ?? "No registrado"], ["Prioridad actual", riskLabels[patient.risk.level]], ["Diagnósticos", patient.diagnoses.join(" · ") || "Sin diagnósticos registrados"]]}/>
          <h3>Motivos de prioridad actual</h3>
          {patient.risk.reasons.length ? <ul>{patient.risk.reasons.map((reason, i) => <li key={i}>{reason}</li>)}</ul> : <p>Sin motivos registrados.</p>}
          {patient.initialRiskReason && <><h3>Motivo de valoración inicial</h3><p>{patient.initialRiskReason}</p></>}
        </Section>
        <Section title="02 / Tratamiento vigente">
          {patient.prescriptions.length ? patient.prescriptions.map(prescription => <div className="patient-report-entry" key={prescription.id}>
            <h3>{prescription.medicationName}</h3>
            <p><strong>Dosis:</strong> {prescription.doseText} · <strong>Vía:</strong> {prescription.route ?? "No registrada"}</p>
            <p><strong>Vigencia:</strong> {dateOnly(prescription.startDate)} al {prescription.endDate ? dateOnly(prescription.endDate) : "sin fecha final registrada"}</p>
            <p><strong>Horarios:</strong> {prescription.schedules.map(s => `${s.localTime.slice(0, 5)} (${s.weekdays.map(day => weekdays[day] ?? String(day)).join(", ")})`).join("; ") || "Sin horarios registrados"}</p>
            {prescription.instructions && <p><strong>Indicaciones:</strong> {prescription.instructions}</p>}
          </div>) : <p>Sin recetas vigentes registradas.</p>}
          <p className="patient-report-note">Transcripción del tratamiento registrado. Este reporte no constituye una nueva receta ni modifica las indicaciones médicas.</p>
        </Section>
        <Section title="03 / Adherencia y seguimiento">
          <Fields values={[["Adherencia confirmada · 30 días", percent(adherence.confirmedAdherencePct)], ["Cobertura de respuestas · 30 días", percent(adherence.responseCoveragePct)], ["Tomas confirmadas / negadas / desconocidas", `${adherence.y} / ${adherence.n} / ${adherence.u}`], ["Última respuesta registrada", dateTime(patient.lastResponseAt, timezone)]]}/>
          <p className="patient-report-note">Adherencia = confirmadas / (confirmadas + negadas). Cobertura = respuestas conocidas / total de interacciones concluidas. Las respuestas desconocidas no se consideran tomas negadas. Se excluyen fallos técnicos según el cálculo del sistema.</p>
        </Section>
        <Section title="04 / Mediciones recientes">
          <p className="patient-report-note">Últimas {readings.length} de {patient.measurements.length} lecturas disponibles en los últimos 90 días. Fechas en la zona horaria del consultorio.</p>
          {readings.length ? <table className="patient-report-readings"><caption className="sr-only">Mediciones recientes del paciente</caption><thead><tr><th scope="col">Registro</th><th scope="col">Resultado</th></tr></thead><tbody>{readings.map(reading => <tr key={reading.id}>
            <td><strong>{reading.kind === "glucose" ? "Glucosa" : "Presión arterial"}</strong><span>{measurementDescription(reading, timezone)}</span></td>
            <td>{reading.kind === "glucose" ? `${reading.glucoseMgDl ?? "Sin dato"} mg/dL` : `${reading.systolicMmHg ?? "Sin dato"} / ${reading.diastolicMmHg ?? "Sin dato"} mmHg`}</td>
          </tr>)}</tbody></table> : <p>Sin mediciones disponibles en este período.</p>}
        </Section>
        <Section title="05 / Complicaciones registradas">
          {patient.complications.length ? patient.complications.map(item => <div className="patient-report-entry" key={item.id}><h3>{item.code}</h3><p>{dateOnly(item.diagnosedOn)}{item.notes ? ` · ${item.notes}` : ""}</p></div>) : <p>Sin registros de complicaciones. La ausencia de registros no confirma su ausencia clínica.</p>}
        </Section>
        <Section title="06 / Alertas activas y próximas citas">
          <h3>Alertas activas al corte ({patient.alerts.length})</h3>
          {patient.alerts.length ? <ul>{patient.alerts.map(alert => <li key={alert.id}><strong>{alert.title}</strong> · {dateTime(alert.createdAt, timezone)}</li>)}</ul> : <p>Sin alertas activas registradas.</p>}
          <h3>Próximas {appointments.length} de {patient.appointments.length} citas programadas · próximos 90 días</h3>
          {appointments.length ? <ul>{appointments.map(appointment => <li key={appointment.id}>{dateTime(appointment.startsAt, timezone)} · {appointment.reason ?? "Sin motivo registrado"}</li>)}</ul> : <p>Sin citas programadas en este período.</p>}
        </Section>
        <Section title="07 / Alcance del documento">
          <p>Información registrada en Kuni al momento del corte, limitada al paciente y consultorio autorizados. No es una copia íntegra del expediente ni incluye una firma médica. «Sin datos» indica ausencia de evidencia o denominador válido; no equivale a cero. Este resumen no sustituye una valoración clínica.</p>
        </Section>
      </td></tr></tbody>
      <tfoot><tr><td><footer className="patient-report-footer"><strong>Kuni · Documento confidencial</strong><span>Exp. {patient.clinicalRecord} · {dateTime(generatedAt, timezone)}</span></footer></td></tr></tfoot>
    </table>
  </article>;
}
