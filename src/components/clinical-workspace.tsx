"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";

import {
  ClinicalHeader,
  type ClinicalTopBarContext,
} from "@/components/clinical-header";
import { AppointmentForm } from "@/components/appointment-form";
import { StatisticsView } from "@/components/statistics-view";
import { PatientCreateForm } from "@/components/patient-create-form";
import type { PatientEditData } from "@/contracts/patient-registration";
import { AlertActions, ComplicationPanel, MeasurementCorrection, MedicationClassification, PrescriptionAdjustment } from "@/components/clinical-actions";
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
  high: "border-rose-200 bg-rose-50 text-rose-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  low: "border-emerald-200 bg-emerald-50 text-emerald-700",
  unknown: "border-slate-200 bg-slate-100 text-slate-600",
} as const;

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
          className="rounded-xl bg-[#001d39] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-900"
          href="/pacientes/nuevo"
        >
          + Nuevo paciente
        </Link>
      </PageHeader>
      <section className="mt-6 rounded-3xl border border-slate-200/70 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:flex-wrap">
          <label className="flex-1">
            <span className="sr-only">Buscar pacientes</span>
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
              onChange={(event) => updateQuery(event.target.value)}
              placeholder="Buscar nombre, CURP, expediente o diagnóstico"
              type="search"
              value={query}
            />
          </label>
          <label className="text-sm font-semibold text-slate-600">
            Prioridad
            <select
              className="ml-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
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
          <label className="text-sm font-semibold text-slate-600">
            Diagnóstico
            <select
              className="ml-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
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
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
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
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-4">Paciente</th>
                <th className="px-5 py-4">Diagnósticos</th>
                <th className="px-5 py-4">Prioridad actual</th>
                <th className="px-5 py-4">Seguimiento</th>
                <th className="px-5 py-4">Última respuesta</th>
                <th className="px-5 py-4">
                  <span className="sr-only">Abrir ficha</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((patient, index) => (
                <tr
                  className="motion-safe:animate-[kuni-rise_360ms_ease-out_both] transition hover:bg-indigo-50/40"
                  key={patient.id}
                  style={{ animationDelay: `${index * 35}ms` }}
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <span className="grid size-9 place-items-center rounded-full bg-indigo-100 text-xs font-extrabold text-indigo-700">
                        {initials(patient.fullName)}
                      </span>
                      <div>
                        <strong className="block text-slate-900">
                          {patient.fullName}
                        </strong>
                        <span className="font-mono-data text-xs text-slate-500">
                          {patient.clinicalRecord}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-slate-600">
                    {patient.diagnoses.join(" · ") ||
                      "Sin diagnóstico registrado"}
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${riskClass[patient.risk.level]}`}
                    >
                      {riskLabels[patient.risk.level]}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-slate-600">
                    {dateTime(patient.lastResponseAt, data.timezone)}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
                      {patient.alerts.length ? (
                        <span className="rounded-full bg-rose-50 px-2 py-1 text-rose-700">
                          {patient.alerts.length} alerta{patient.alerts.length === 1 ? "" : "s"}
                        </span>
                      ) : null}
                      {patient.nonresponse.pending ? (
                        <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">
                          {patient.nonresponse.pending} pendiente{patient.nonresponse.pending === 1 ? "" : "s"}
                        </span>
                      ) : null}
                      {patient.appointments[0] ? (
                        <span className="rounded-full bg-sky-50 px-2 py-1 text-sky-700">
                          Cita {dateTime(patient.appointments[0].startsAt, data.timezone)}
                        </span>
                      ) : null}
                      {!patient.alerts.length && !patient.nonresponse.pending && !patient.appointments[0] ? (
                        <span className="text-slate-400">Sin pendientes</span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Link
                      className="text-xs font-bold text-indigo-600 hover:text-indigo-800"
                      href={`/pacientes/${patient.id}`}
                    >
                      Ver ficha →
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
        <footer className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          <span>
            {matches.length} resultados
            {data.hasMorePatients
              ? " · el servidor indicó una lista parcial"
              : ""}
          </span>
          <div className="flex gap-2">
            <button
              className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold disabled:opacity-40"
              disabled={page === 0}
              onClick={() => setPage((current) => current - 1)}
              type="button"
            >
              Anterior
            </button>
            <button
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

function NewPatientView({ initial }: { initial?: PatientEditData }) {
  return (
    <>
      <PageHeader
        title={initial ? "Editar expediente" : "Alta de paciente"}
        description="Datos personales, valoración y consentimiento del paciente."
      />
      <PatientCreateForm initial={initial} />
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
}: {
  data: DashboardData;
  mode: WorkspaceMode;
  context: ClinicalTopBarContext;
  patientEdit?: PatientEditData;
}) {
  const content =
    mode === "patients" ? (
      <PatientsView data={data} />
    ) : mode === "new-patient" ? (
      <NewPatientView initial={patientEdit} />
    ) : mode === "appointments" ? (
      <AppointmentsView data={data} />
    ) : mode === "statistics" ? (
      <StatisticsView data={data} context={context} />
    ) : (
      <AlertsView data={data} />
    );
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_12%_2%,#e0e7ff_0,transparent_31%),radial-gradient(circle_at_94%_18%,#dbeafe_0,transparent_28%),#e8ebf2] p-3 text-slate-800 md:p-6 lg:p-8">
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
}: {
  data: DashboardData;
  patient: DashboardPatient;
  context: ClinicalTopBarContext;
  predictionPanel?: ReactNode;
  canWrite?: boolean;
}) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_12%_2%,#e0e7ff_0,transparent_31%),radial-gradient(circle_at_94%_18%,#dbeafe_0,transparent_28%),#e8ebf2] p-3 text-slate-800 md:p-6 lg:p-8">
      <div className="mx-auto w-full max-w-[1480px] rounded-[36px] border border-white/80 bg-[#f7f8fc]/90 p-4 shadow-2xl shadow-slate-900/10 md:p-8">
        <ClinicalHeader context={context} data={data} />
        <div className="clinical-page-content">
          <PageHeader
            title={patient.fullName}
            description={`Expediente ${patient.clinicalRecord}`}
          >
            {canWrite ? <Link className="clinical-button" href={`/pacientes/${patient.id}/editar`}>Editar expediente</Link> : null}
            <Link
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm"
              href="/pacientes"
            >
              Volver al censo
            </Link>
          </PageHeader>
          <div className="mt-6 grid gap-5 lg:grid-cols-3">
            <section className="clinical-panel p-5 lg:col-span-2">
              <h2 className="text-base font-extrabold text-slate-900">
                Resumen clínico
              </h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Detail
                  label="Diagnósticos"
                  value={
                    patient.diagnoses.join(" · ") ||
                    "Sin diagnóstico registrado"
                  }
                />
                {patient.latestGlucose ? <MeasurementCorrection measurement={patient.latestGlucose} patientId={patient.id} /> : null}
                {patient.latestBloodPressure ? <MeasurementCorrection measurement={patient.latestBloodPressure} patientId={patient.id} /> : null}
                <Detail
                  label="Prioridad actual"
                  value={riskLabels[patient.risk.level]}
                />
                <Detail
                  label="Glucosa más reciente"
                  value={
                    patient.latestGlucose?.glucoseMgDl != null
                      ? `${patient.latestGlucose.glucoseMgDl} mg/dL · ${dateTime(patient.latestGlucose.observedAt, data.timezone)}`
                      : "Sin dato"
                  }
                />
                <Detail
                  label="Presión más reciente"
                  value={
                    patient.latestBloodPressure?.systolicMmHg != null
                      ? `${patient.latestBloodPressure.systolicMmHg}/${patient.latestBloodPressure.diastolicMmHg} mmHg · ${dateTime(patient.latestBloodPressure.observedAt, data.timezone)}`
                      : "Sin dato"
                  }
                />
              </div>
              <h3 className="mt-6 text-sm font-extrabold text-slate-900">
                Motivos de prioridad
              </h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
                {patient.risk.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
                {!patient.risk.reasons.length ? (
                  <li>Sin motivos registrados.</li>
                ) : null}
              </ul>
            </section>
            {predictionPanel}
            <aside className="clinical-panel bg-gradient-to-b from-white to-indigo-50/45 p-5">
              <h2 className="text-base font-extrabold text-slate-900">
                Contacto y consentimiento
              </h2>
              <dl className="mt-4 space-y-3">
                <Detail label="WhatsApp" value={patient.whatsappE164} />
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
            </aside>
            <section className="clinical-panel p-5 lg:col-span-3">
              <h2 className="text-base font-extrabold text-slate-900">
                Tratamiento vigente
              </h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {patient.prescriptions.map((prescription) => (
                  <article
                    className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/70 to-white p-4 transition hover:-translate-y-0.5 hover:shadow-md"
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
                  <p className="text-sm text-slate-500">
                    Sin recetas activas disponibles.
                  </p>
                ) : null}
              </div>
            </section>
            <ComplicationPanel complications={patient.complications} patientId={patient.id} />
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
