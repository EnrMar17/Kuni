"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";

import {
  ClinicalHeader,
  type ClinicalTopBarContext,
} from "@/components/clinical-header";
import { AppointmentForm } from "@/components/appointment-form";
import { StatisticsView } from "@/components/statistics-view";
import { PatientCreateForm } from "@/components/patient-create-form";
import type { PatientEditData } from "@/contracts/patient-registration";
import type { MedicationOption } from "@/contracts/clinical";
import { AlertActions, ComplicationPanel, ManualMessageTestAction, MeasurementCorrection, MedicationClassification, MedicationResponseCorrection, PrescriptionAdjustment } from "@/components/clinical-actions";
import type { DashboardData, DashboardPatient } from "@/lib/domain/dashboard";
import {
  availableDiagnoses,
  dateTime,
  filterPatients,
  initials,
  riskLabels,
} from "@/components/dashboard/presentation";

type WorkspaceMode =
  "patients" | "new-patient" | "appointments" | "alerts" | "statistics";

const riskClass = {
  high: "border-[#0a4470]/40 bg-[#0a4470]/10 text-[#0a4470]",
  medium: "border-sky-300 bg-sky-100 text-sky-800",
  low: "border-sky-200 bg-sky-50 text-sky-700",
  unknown: "border-slate-200 bg-slate-100 text-slate-600",
} as const;

const diabetesDiagnosisCodes = ["diabetes_type_1", "diabetes_type_2", "diabetes_gestational", "diabetes_other"];
const diabetesTreatmentPhaseLabels: Record<string, string> = {
  estable_oral: "Estable con tratamiento oral",
  ajuste_insulina: "En ajuste de insulina",
  insulina_estable_hba1c: "Insulina estable, HbA1c controlada",
};
const hypertensionTreatmentPhaseLabels: Record<string, string> = {
  controlada: "Controlada",
  en_ajuste: "En ajuste",
};

function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-slate-200/70 pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">
          {title}
        </h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500">
          {description}
        </p>
      </div>
      {children}
    </header>
  );
}

function PatientsView({ data }: { data: DashboardData }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState<
    "all" | "high" | "medium" | "low" | "unknown"
  >("all");
  const [diagnosis, setDiagnosis] = useState("all");
  const [pendingOnly, setPendingOnly] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 12;
  const diagnoses = useMemo(
    () => availableDiagnoses(data.patients),
    [data.patients],
  );
  const matches = useMemo(
    () =>
      filterPatients(
        data.patients,
        query,
        priority,
        "risk",
        diagnosis,
        pendingOnly,
      ),
    [data.patients, diagnosis, pendingOnly, priority, query],
  );
  const maxPage = Math.max(0, Math.ceil(matches.length / pageSize) - 1);
  const visible = matches.slice(page * pageSize, (page + 1) * pageSize);
  const updateQuery = (value: string) => {
    setQuery(value);
    setPage(0);
  };
  return (
    <>
      <PageHeader
        title="Censo clínico"
        description="Consulta el censo del consultorio autorizado. La prioridad se calcula al leer registros y no se sustituye por valores de demostración."
      >
        <Link
          className="rounded-xl bg-[#001d39] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-slate-900 motion-safe:hover:-translate-y-0.5"
          href="/pacientes/nuevo"
        >
          + Nuevo paciente
        </Link>
      </PageHeader>
      <section className="mt-6 rounded-3xl border border-slate-200/70 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
          <label className="min-w-0 flex-1" htmlFor="censo-buscar">
            <span className="sr-only">Buscar pacientes</span>
            <input
              className="w-full min-w-0 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
              id="censo-buscar"
              onChange={(event) => updateQuery(event.target.value)}
              placeholder="Buscar nombre, CURP, expediente o diagnóstico"
              type="search"
              value={query}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-sm font-semibold text-slate-700" htmlFor="censo-prioridad">
            Prioridad
            <select
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
              id="censo-prioridad"
              onChange={(event) => {
                setPriority(event.target.value as typeof priority);
                setPage(0);
              }}
              value={priority}
            >
              <option value="all">Todas</option>
              <option value="high">Alta</option>
              <option value="medium">Media</option>
              <option value="low">Baja</option>
              <option value="unknown">Sin evaluar</option>
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-sm font-semibold text-slate-700" htmlFor="censo-diagnostico">
            Diagnóstico
            <select
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
              id="censo-diagnostico"
              onChange={(event) => {
                setDiagnosis(event.target.value);
                setPage(0);
              }}
              value={diagnosis}
            >
              <option value="all">Todos</option>
              {diagnoses.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-h-[42px] items-center gap-2 text-sm font-semibold text-slate-700">
            <input
              checked={pendingOnly}
              onChange={(event) => {
                setPendingOnly(event.target.checked);
                setPage(0);
              }}
              type="checkbox"
            />
            Solo pendientes
          </label>
        </div>
      </section>
      <section
        aria-live="polite"
        className="mt-5 overflow-hidden rounded-3xl border border-slate-200/70 bg-white shadow-sm"
      >
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Tabla del censo clínico">
          <table className="w-full min-w-[640px] text-left text-sm">
            <caption className="sr-only">
              Pacientes del consultorio. Página {page + 1} de {maxPage + 1}.
            </caption>
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-4 sm:px-5" scope="col">Paciente</th>
                <th className="px-4 py-4 sm:px-5" scope="col">Diagnósticos</th>
                <th className="px-4 py-4 sm:px-5" scope="col">Prioridad actual</th>
                <th className="px-4 py-4 sm:px-5" scope="col">Seguimiento</th>
                <th className="px-4 py-4 sm:px-5" scope="col">Última respuesta</th>
                <th className="px-4 py-4 sm:px-5" scope="col">
                  <span className="sr-only">Abrir ficha</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((patient, index) => (
                <tr
                  className="cursor-pointer transition hover:bg-sky-50/40 motion-safe:animate-[kuni-rise_360ms_ease-out_both]"
                  key={patient.id}
                  onClick={(event) => {
                    if ((event.target as HTMLElement).closest("a")) return;
                    router.push(`/pacientes/${patient.id}`);
                  }}
                  style={{ animationDelay: `${index * 35}ms` }}
                >
                  <td className="px-4 py-4 sm:px-5">
                    <div className="flex items-center gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-sky-100 text-xs font-extrabold text-sky-800">
                        {initials(patient.fullName)}
                      </span>
                      <div className="min-w-0">
                        <strong className="block truncate text-slate-900">
                          {patient.fullName}
                        </strong>
                        <span className="font-mono-data text-xs text-slate-600">
                          {patient.clinicalRecord}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-slate-700 sm:px-5">
                    {patient.diagnoses.join(" · ") ||
                      "Sin diagnóstico registrado"}
                  </td>
                  <td className="px-4 py-4 sm:px-5">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${riskClass[patient.risk.level]}`}
                    >
                      {riskLabels[patient.risk.level]}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-slate-700 sm:px-5">
                    {dateTime(patient.lastResponseAt, data.timezone)}
                  </td>
                  <td className="px-4 py-4 sm:px-5">
                    <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
                      {patient.alerts.length ? (
                        <span className="rounded-full bg-[#0a4470]/10 px-2 py-1 text-[#0a4470]">
                          {patient.alerts.length} alerta{patient.alerts.length === 1 ? "" : "s"}
                        </span>
                      ) : null}
                      {patient.nonresponse.pending ? (
                        <span className="rounded-full bg-sky-100 px-2 py-1 text-sky-800">
                          {patient.nonresponse.pending} pendiente{patient.nonresponse.pending === 1 ? "" : "s"}
                        </span>
                      ) : null}
                      {patient.appointments[0] ? (
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
                          Cita {dateTime(patient.appointments[0].startsAt, data.timezone)}
                        </span>
                      ) : null}
                      {!patient.alerts.length && !patient.nonresponse.pending && !patient.appointments[0] ? (
                        <span className="text-slate-500">Sin pendientes</span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-right sm:px-5">
                    <Link
                      className="text-xs font-bold text-sky-700 hover:text-sky-900"
                      href={`/pacientes/${patient.id}`}
                    >
                      <span className="sr-only">Ver ficha de {patient.fullName}</span>
                      <span aria-hidden="true">→</span>
                    </Link>
                  </td>
                </tr>
              ))}
              {!visible.length ? (
                <tr>
                  <td
                    className="px-5 py-10 text-center text-slate-500"
                    colSpan={6}
                  >
                    No hay pacientes que coincidan con los filtros.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 text-xs text-slate-600">
          <span>
            {matches.length} resultados
            {data.hasMorePatients
              ? " · el servidor indicó una lista parcial"
              : ""}
            {" · "}página {page + 1} de {maxPage + 1}
          </span>
          <div className="flex gap-2">
            <button
              aria-label="Página anterior del censo"
              className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold disabled:opacity-40"
              disabled={page === 0}
              onClick={() => setPage((current) => current - 1)}
              type="button"
            >
              Anterior
            </button>
            <button
              aria-label="Página siguiente del censo"
              className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold disabled:opacity-40"
              disabled={page === maxPage}
              onClick={() => setPage((current) => current + 1)}
              type="button"
            >
              Siguiente
            </button>
          </div>
        </footer>
      </section>
    </>
  );
}

function NewPatientView({ initial, medications, doctorName }: { initial?: PatientEditData; medications: MedicationOption[]; doctorName: string }) {
  return (
    <>
      <PageHeader
        title={initial ? "Editar expediente" : "Alta de paciente"}
        description="Datos personales, valoración y consentimiento del paciente."
      />
      <PatientCreateForm doctorName={doctorName} initial={initial} medications={medications} />
    </>
  );
}

function AppointmentsView({ data }: { data: DashboardData }) {
  return (
    <>
      <PageHeader
        title="Citas"
        description="Prepara una cita y consulta la agenda del consultorio."
      />
      <div className="mt-6 grid gap-6 lg:grid-cols-[.8fr_1.2fr]">
        <AppointmentForm data={data} />
        <section className="overflow-hidden rounded-3xl border border-slate-200/70 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5">
            <h2 className="font-extrabold text-slate-900">Próximas citas</h2>
            <p className="mt-1 text-xs text-slate-500">
              Solo citas programadas en los siguientes 90 días.
            </p>
          </div>
          <ul className="divide-y divide-slate-100">
            {data.appointments.map((appointment, index) => (
              <li
                className="motion-safe:animate-[kuni-rise_360ms_ease-out_both] flex items-center justify-between gap-4 p-5"
                key={appointment.id}
                style={{ animationDelay: `${index * 40}ms` }}
              >
                <div>
                  <strong className="block text-sm text-slate-900">
                    {appointment.patientName}
                  </strong>
                  <span className="mt-1 block text-xs text-slate-500">
                    {appointment.reason ?? "Sin motivo registrado"} ·{" "}
                    {dateTime(appointment.startsAt, data.timezone)}
                  </span>
                </div>
                <span
                  className={`rounded-full border px-2.5 py-1 text-xs font-bold ${appointment.urgency === "urgent" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-sky-200 bg-sky-50 text-sky-700"}`}
                >
                  {appointment.urgency === "urgent" ? "Prioritaria" : "Rutina"}
                </span>
              </li>
            ))}
            {!data.appointments.length ? (
              <li className="p-8 text-center text-sm text-slate-500">
                No hay citas programadas.
              </li>
            ) : null}
          </ul>
        </section>
      </div>
    </>
  );
}

function AlertsView({ data }: { data: DashboardData }) {
  return (
    <>
      <PageHeader
        title="Alertas y triaje"
        description="Visualiza alertas reales del consultorio y documenta su atención o una urgencia. La prioridad se recalcula en servidor; el modelo experimental no la sustituye."
      />
      <section className="mt-6 grid gap-4">
        {data.alerts.map((alert, index) => (
          <article
            className="motion-safe:animate-[kuni-rise_360ms_ease-out_both] flex flex-col gap-4 rounded-3xl border border-slate-200/70 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"
            key={alert.id}
            style={{ animationDelay: `${index * 45}ms` }}
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-extrabold text-slate-900">{alert.title}</h2>
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs font-bold ${alert.severity === "critical" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}
                >
                  {alert.severity === "critical" ? "Crítica" : "Seguimiento"}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {alert.patientName} · {dateTime(alert.createdAt, data.timezone)}{" "}
                · Estado: {alert.status}
              </p>
            </div>
            <AlertActions alert={alert} />
          </article>
        ))}
        {!data.alerts.length ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
            No hay alertas abiertas en este consultorio.
          </div>
        ) : null}
      </section>
    </>
  );
}

export function ClinicalWorkspace({
  data,
  mode,
  context,
  patientEdit,
  medications = [],
}: {
  data: DashboardData;
  mode: WorkspaceMode;
  context: ClinicalTopBarContext;
  patientEdit?: PatientEditData;
  medications?: MedicationOption[];
}) {
  const content =
    mode === "patients" ? (
      <PatientsView data={data} />
    ) : mode === "new-patient" ? (
      <NewPatientView doctorName={context.doctorName} initial={patientEdit} medications={medications} />
    ) : mode === "appointments" ? (
      <AppointmentsView data={data} />
    ) : mode === "statistics" ? (
      <StatisticsView data={data} context={context} />
    ) : (
      <AlertsView data={data} />
    );
  return (
    <main id="contenido-principal" className="min-h-screen bg-[radial-gradient(circle_at_12%_2%,#eaf6ff_0,transparent_31%),radial-gradient(circle_at_94%_18%,#e7edf3_0,transparent_28%),#e8ebf2] p-3 text-slate-800 md:p-6 lg:p-8">
      <div className="mx-auto w-full max-w-[1480px] rounded-[36px] border border-white/80 bg-[#f7f8fc]/90 p-4 shadow-2xl shadow-slate-900/10 md:p-8">
        <ClinicalHeader context={context} data={data} />
        <div className="clinical-page-content" key={mode}>
          {content}
        </div>
      </div>
    </main>
  );
}

export function PatientProfile({
  data,
  patient,
  context,
  predictionPanel,
  canWrite = false,
  testMessageChannels = [],
}: {
  data: DashboardData;
  patient: DashboardPatient;
  context: ClinicalTopBarContext;
  predictionPanel?: ReactNode;
  canWrite?: boolean;
  testMessageChannels?: ("sms" | "whatsapp")[];
}) {
  const isComorbid = patient.diagnosisCodes.some((code) => diabetesDiagnosisCodes.includes(code))
    && patient.diagnosisCodes.includes("hypertension");
  const medicationInteractions = patient.interactions.filter((interaction) => interaction.kind === "medication").slice(0, 6);
  return (
    <main id="contenido-principal" className="min-h-screen bg-[radial-gradient(circle_at_12%_2%,#eaf6ff_0,transparent_31%),radial-gradient(circle_at_94%_18%,#e7edf3_0,transparent_28%),#e8ebf2] p-3 text-slate-800 md:p-6 lg:p-8">
      <div className="mx-auto w-full max-w-[1480px] rounded-[36px] border border-white/80 bg-[#f7f8fc]/90 p-4 shadow-2xl shadow-slate-900/10 md:p-8">
        <ClinicalHeader context={context} data={data} />
        <div className="clinical-page-content">
          {/* Tarjeta resumen del paciente: identidad, prioridad, contacto y consentimiento de un vistazo. */}
          <section className="clinical-panel p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-4">
                <span className="grid size-14 shrink-0 place-items-center rounded-2xl border border-sky-100 bg-sky-50 text-xl font-extrabold text-sky-800">
                  {initials(patient.fullName)}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <h1 className="text-xl font-extrabold tracking-tight text-slate-900">
                      {patient.fullName}
                    </h1>
                    <span className="font-mono-data rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                      {patient.clinicalRecord}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span className="flex items-center gap-1.5">
                      <span className="font-medium text-slate-400">Prioridad:</span>
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold ${riskClass[patient.risk.level]}`}>
                        {riskLabels[patient.risk.level]}
                      </span>
                    </span>
                    <span className="text-slate-300">•</span>
                    <span className="flex items-center gap-1.5">
                      <span className="font-medium text-slate-400">Teléfono:</span>
                      <a className="font-mono-data font-semibold text-sky-700 hover:underline" href={`tel:${patient.whatsappE164}`}>
                        {patient.whatsappE164}
                      </a>
                    </span>
                    <span className="text-slate-300">•</span>
                    <span className="flex items-center gap-1.5">
                      <span className="font-medium text-slate-400">Consentimiento:</span>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${patient.consentGranted ? "bg-sky-100 text-sky-800" : "bg-slate-100 text-slate-600"}`}>
                        {patient.consentGranted ? "Vigente" : "No registrado"}
                      </span>
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 border-t border-slate-100 pt-3 md:border-t-0 md:pt-0">
                {canWrite ? <Link className="clinical-button" href={`/pacientes/${patient.id}/editar`}>Editar expediente</Link> : null}
                <Link className="clinical-button clinical-button-primary" href="/pacientes">
                  Volver al censo
                </Link>
              </div>
            </div>
          </section>
          <div className="mt-5 grid gap-5 lg:grid-cols-12">
            {/* Columna principal: resumen clínico + triage, tratamiento y complicaciones. */}
            <div className="flex flex-col gap-5 lg:col-span-8">
              <section className="clinical-panel p-5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h2 className="flex items-center gap-2 text-base font-extrabold text-slate-900">
                    <span className="size-2.5 rounded-full bg-sky-500" />
                    Resumen clínico
                  </h2>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                    Triage
                  </span>
                </div>
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Diagnósticos</p>
                  {patient.diagnoses.length ? (
                    <div className="mt-1 space-y-0.5 text-sm font-medium leading-relaxed text-slate-800">
                      {patient.diagnoses.map((label, index) => {
                        const code = patient.diagnosisCodes[index];
                        const date = patient.diagnosedOn[code];
                        return (
                          <p key={code}>
                            {label}
                            {date ? <span className="ml-1.5 text-xs font-normal text-slate-400">· {date}</span> : null}
                          </p>
                        );
                      })}
                      {isComorbid ? (
                        <span className="mt-1 inline-flex rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[11px] font-bold text-sky-800">
                          Comorbilidad: diabetes + hipertensión
                        </span>
                      ) : null}
                      {patient.diabetesTreatmentPhase ? (
                        <p className="text-xs font-normal text-slate-500">
                          Fase — diabetes: {diabetesTreatmentPhaseLabels[patient.diabetesTreatmentPhase] ?? patient.diabetesTreatmentPhase}
                        </p>
                      ) : null}
                      {patient.hypertensionTreatmentPhase ? (
                        <p className="text-xs font-normal text-slate-500">
                          Fase — hipertensión: {hypertensionTreatmentPhaseLabels[patient.hypertensionTreatmentPhase] ?? patient.hypertensionTreatmentPhase}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-1 text-sm font-medium text-slate-700">Sin diagnóstico registrado</p>
                  )}
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Glucosa más reciente</span>
                    <div className="mt-2 flex items-baseline justify-between">
                      <span className="text-lg font-semibold text-slate-800">
                        {patient.latestGlucose?.glucoseMgDl ?? "Sin dato"}
                      </span>
                      <span className="font-mono-data text-xs text-slate-400">mg/dL</span>
                    </div>
                    {patient.latestGlucose ? (
                      <p className="mt-1 text-xs text-slate-400">{dateTime(patient.latestGlucose.observedAt, data.timezone)}</p>
                    ) : null}
                    {patient.latestGlucose ? <MeasurementCorrection measurement={patient.latestGlucose} patientId={patient.id} /> : null}
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Presión más reciente</span>
                    <div className="mt-2 flex items-baseline justify-between">
                      <span className="text-lg font-semibold text-slate-800">
                        {patient.latestBloodPressure?.systolicMmHg != null
                          ? `${patient.latestBloodPressure.systolicMmHg}/${patient.latestBloodPressure.diastolicMmHg}`
                          : "Sin dato"}
                      </span>
                      <span className="font-mono-data text-xs text-slate-400">mmHg</span>
                    </div>
                    {patient.latestBloodPressure ? (
                      <p className="mt-1 text-xs text-slate-400">{dateTime(patient.latestBloodPressure.observedAt, data.timezone)}</p>
                    ) : null}
                    {patient.latestBloodPressure ? <MeasurementCorrection measurement={patient.latestBloodPressure} patientId={patient.id} /> : null}
                  </div>
                  <div className={`rounded-xl border p-3 ${riskClass[patient.risk.level]}`}>
                    <div className="flex items-baseline justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wide">Prioridad actual</span>
                    </div>
                    <div className="mt-2">
                      <span className={`rounded-md border px-2.5 py-0.5 text-xs font-bold ${riskClass[patient.risk.level]}`}>
                        {riskLabels[patient.risk.level]}
                      </span>
                    </div>
                    <p className="mt-2 text-[11px] font-bold uppercase tracking-wide">Motivos</p>
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-relaxed">
                      {patient.risk.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                      {!patient.risk.reasons.length ? <li>Sin motivos registrados.</li> : null}
                    </ul>
                  </div>
                </div>
                {predictionPanel ? <div className="mt-4 border-t border-slate-100 pt-4">{predictionPanel}</div> : null}
              </section>
            </div>
            {/* Columna lateral: contacto, consentimiento, tomas recientes y complicaciones, plegados por defecto. */}
            <aside className="flex flex-col gap-5 lg:col-span-4">
              <details className="details-panel clinical-panel bg-gradient-to-b from-white to-sky-50/45">
                <summary>
                  <h2 className="text-base font-extrabold text-slate-900">
                    Contacto y consentimiento
                  </h2>
                  <svg className="details-panel-chevron size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
                  </svg>
                </summary>
                <div className="details-panel-body">
                  <dl className="space-y-3">
                    <Detail label="Teléfono de mensajería" value={patient.whatsappE164} />
                    <Detail
                      label="Consentimiento"
                      value={
                        patient.consentGranted
                          ? "Vigente"
                          : "No registrado o revocado"
                      }
                    />
                    <Detail
                      label="Última respuesta"
                      value={dateTime(patient.lastResponseAt, data.timezone)}
                    />
                  </dl>
                  {canWrite ? testMessageChannels.map((channel) => (
                    <ManualMessageTestAction
                      key={channel}
                      patientId={patient.id}
                      phoneE164={patient.whatsappE164}
                      consentGranted={patient.consentGranted}
                      channel={channel}
                    />
                  )) : null}
                </div>
              </details>
              <details className="details-panel clinical-panel">
                <summary>
                  <h2 className="text-base font-extrabold text-slate-900">
                    Tomas de medicamento recientes
                  </h2>
                  <svg className="details-panel-chevron size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
                  </svg>
                </summary>
                <div className="details-panel-body grid gap-3">
                  {medicationInteractions.map((interaction) => (
                    <article
                      className="rounded-2xl border border-slate-100 bg-white p-4"
                      key={interaction.id}
                    >
                      <strong className="text-sm text-slate-900">
                        {interaction.medicationName ?? "Medicamento"}
                      </strong>
                      <p className="mt-1 text-sm text-slate-600">
                        {interaction.doseText}
                      </p>
                      <p className="mt-2 text-xs text-slate-500">
                        Programada: {dateTime(interaction.scheduledAt, data.timezone)}
                        {" · "}
                        {interaction.medicationTaken == null
                          ? "Sin respuesta registrada"
                          : interaction.medicationTaken
                            ? "Confirmó que sí la tomó"
                            : "Confirmó que no la tomó"}
                      </p>
                      {interaction.response ? (
                        <MedicationResponseCorrection
                          interaction={interaction as typeof interaction & { response: NonNullable<typeof interaction.response> }}
                          patientId={patient.id}
                        />
                      ) : null}
                    </article>
                  ))}
                  {!medicationInteractions.length ? (
                    <p className="text-sm text-slate-500">Sin recordatorios de medicamento recientes.</p>
                  ) : null}
                </div>
              </details>
              <ComplicationPanel complications={patient.complications} patientId={patient.id} />
            </aside>
            {/* Tratamiento y medicación: fila propia, a todo lo ancho de las dos columnas de arriba. */}
            <section className="clinical-panel p-5 lg:col-span-12">
              <h2 className="text-base font-extrabold text-slate-900">
                Tratamiento y medicación
              </h2>
              <div className="mt-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Tratamiento vigente</p>
                <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {patient.prescriptions.map((prescription) => (
                    <article
                      className="rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50/70 to-white p-4 transition motion-safe:hover:-translate-y-0.5 hover:shadow-md"
                      key={prescription.id}
                    >
                      <strong className="text-sm text-slate-900">
                        {prescription.medicationName}
                      </strong>
                      <p className="mt-1 text-sm text-slate-600">
                        {prescription.doseText}
                        {prescription.instructions
                          ? ` · ${prescription.instructions}`
                          : ""}
                      </p>
                      <p className="mt-2 text-xs text-slate-500">
                        Horarios:{" "}
                        {prescription.schedules
                          .map((schedule) => schedule.localTime.slice(0, 5))
                          .join(", ") || "Sin horarios"}
                      </p>
                      <PrescriptionAdjustment patientId={patient.id} prescription={prescription} />
                      <MedicationClassification patientId={patient.id} prescription={prescription} />
                    </article>
                  ))}
                  {!patient.prescriptions.length ? (
                    <p className="text-sm text-slate-500">Sin recetas activas disponibles.</p>
                  ) : null}
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium leading-relaxed text-slate-700">
        {value}
      </dd>
    </div>
  );
}
