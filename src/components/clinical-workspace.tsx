"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { formatInTimeZone } from "date-fns-tz";

import {
  ClinicalHeader,
  type ClinicalTopBarContext,
} from "@/components/clinical-header";
import { AppointmentForm, type AppointmentSlotPrefill } from "@/components/appointment-form";
import { AppointmentsCalendar } from "@/components/appointments/appointments-calendar";
import { Icon as AppointmentIcon, type AppointmentIconName } from "@/components/appointments/icons";
import { MedicationCalendar } from "@/components/medication-calendar";
import { StatisticsView } from "@/components/statistics-view";
import { PatientCreateForm } from "@/components/patient-create-form";
import type { PatientEditData } from "@/contracts/patient-registration";
import type { MedicationOption } from "@/contracts/clinical";
import { AlertActions, ComplicationPanel, ManualMessageTestAction, MeasurementCorrection, MedicationClassification, PrescriptionAdjustment } from "@/components/clinical-actions";
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
  flatBackground,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
  /** Fondo azul plano en vez del degradado que trae `.clinical-page-content > header` por defecto. */
  flatBackground?: boolean;
}) {
  return (
    <header
      className="flex flex-col gap-4 border-b border-slate-200/70 pb-6 sm:flex-row sm:items-end sm:justify-between"
      style={flatBackground ? { background: "var(--kuni-sky-tint)" } : undefined}
    >
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
  const riskCounts = {
    high: data.patients.filter((patient) => patient.risk.level === "high").length,
    medium: data.patients.filter((patient) => patient.risk.level === "medium").length,
    stable: data.patients.filter((patient) => ["low", "unknown"].includes(patient.risk.level)).length,
  };
  const pendingCount = data.patients.filter(
    (patient) => patient.alerts.length > 0 || patient.nonresponse.pending > 0,
  ).length;
  const filtersActive = query !== "" || priority !== "all" || diagnosis !== "all" || pendingOnly;
  const resetFilters = () => {
    setQuery("");
    setPriority("all");
    setDiagnosis("all");
    setPendingOnly(false);
    setPage(0);
  };
  const priorityOptions = [
    { value: "all", label: "Todos", count: data.patients.length },
    { value: "high", label: "Prioridad alta", count: riskCounts.high },
    { value: "medium", label: "En vigilancia", count: riskCounts.medium },
    { value: "low", label: "Estables", count: data.patients.filter((patient) => patient.risk.level === "low").length },
    { value: "unknown", label: "Sin evaluar", count: data.patients.filter((patient) => patient.risk.level === "unknown").length },
  ] as const;
  return (
    <>
      <PageHeader
        title="Censo clínico"
        description="Consulta el censo del consultorio autorizado. La prioridad se calcula al leer registros y no se sustituye por valores de demostración."
        flatBackground
      >
        <Link
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#001d39] px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-[#0a4470]/20 transition hover:bg-[#0a4470] hover:shadow-lg motion-safe:hover:-translate-y-0.5"
          href="/pacientes/nuevo"
        >
          <span aria-hidden="true" className="text-lg leading-none">+</span>
          Nuevo paciente
        </Link>
      </PageHeader>

      <section aria-label="Resumen del censo" className="patients-kpi-grid mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Total en censo", value: data.patients.length, note: "pacientes registrados", icon: "users" as const, tone: "blue" },
          { label: "Prioridad alta", value: riskCounts.high, note: "requieren revisión", icon: "alert" as const, tone: "rose" },
          { label: "En vigilancia", value: riskCounts.medium, note: "prioridad media", icon: "clock" as const, tone: "amber" },
          { label: "Sin pendientes", value: riskCounts.stable, note: `${pendingCount} con seguimiento`, icon: "check" as const, tone: "emerald" },
        ].map((metric) => (
          <article className="patients-kpi-card flex min-h-28 items-center justify-between gap-3 rounded-2xl border p-4" data-tone={metric.tone} key={metric.label}>
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[.12em] opacity-70">{metric.label}</p>
              <p className="mt-1 flex items-baseline gap-2">
                <strong className="patients-kpi-number font-mono-data text-2xl font-black">{metric.value}</strong>
                <span className="text-[11px] font-semibold opacity-65">{metric.note}</span>
              </p>
            </div>
            <span className="patients-kpi-icon grid size-10 shrink-0 place-items-center rounded-xl border bg-white/75 shadow-sm">
              <AppointmentIcon name={metric.icon} className="size-5" />
            </span>
          </article>
        ))}
      </section>

      <section className="patients-filter-panel mt-5 overflow-hidden rounded-3xl border border-[#a9d2e7] bg-white shadow-sm" aria-label="Búsqueda y filtros del censo">
        <div className="grid gap-4 p-5 lg:grid-cols-[minmax(280px,1fr)_minmax(220px,.42fr)] lg:items-end">
          <label className="grid gap-2" htmlFor="censo-buscar">
            <span className="flex items-center gap-2 text-xs font-extrabold text-[#0a4470]">
              <AppointmentIcon name="search" className="size-4" />
              Búsqueda de paciente
            </span>
            <span className="relative">
              <AppointmentIcon name="search" className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#1c7fb0]" />
              <input
                className="min-h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-[#8fcbe8] focus:border-[#1c7fb0] focus:bg-white focus:ring-4 focus:ring-sky-100"
                id="censo-buscar"
                onChange={(event) => updateQuery(event.target.value)}
                placeholder="Nombre, CURP, expediente o diagnóstico…"
                type="search"
                value={query}
              />
            </span>
          </label>
          <label className="grid gap-2 text-xs font-extrabold text-[#0a4470]" htmlFor="censo-diagnostico">
            Padecimiento o diagnóstico
            <select
              className="min-h-12 cursor-pointer rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-800 outline-none transition hover:border-[#8fcbe8] focus:border-[#1c7fb0] focus:bg-white focus:ring-4 focus:ring-sky-100"
              id="censo-diagnostico"
              onChange={(event) => {
                setDiagnosis(event.target.value);
                setPage(0);
              }}
              value={diagnosis}
            >
              <option value="all">Todos los diagnósticos</option>
              {diagnoses.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        </div>
        <div className="flex flex-col gap-3 border-t border-sky-100 bg-[#edf6fa] px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar por prioridad">
            <span className="mr-1 text-[10px] font-extrabold uppercase tracking-[.14em] text-[#0a4470]/65">Prioridad</span>
            {priorityOptions.map((option) => (
              <button
                aria-pressed={priority === option.value}
                className="patients-filter-chip cursor-pointer rounded-xl border px-3 py-1.5 text-xs font-bold"
                data-priority={option.value}
                key={option.value}
                onClick={() => { setPriority(option.value); setPage(0); }}
                type="button"
              >
                {option.label} <span className="ml-1 opacity-65">{option.count}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              aria-pressed={pendingOnly}
              className="patients-pending-toggle inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[#8fcbe8] bg-white px-3 py-2 text-xs font-bold text-[#0a4470] transition"
              onClick={() => { setPendingOnly((current) => !current); setPage(0); }}
              type="button"
            >
              <span aria-hidden="true" className={`size-2 rounded-full ${pendingOnly ? "bg-rose-500 motion-safe:animate-pulse" : "bg-slate-300"}`} />
              Solo con pendientes
            </button>
            {filtersActive ? (
              <button className="cursor-pointer rounded-xl px-3 py-2 text-xs font-bold text-slate-500 transition hover:bg-white hover:text-[#0a4470]" onClick={resetFilters} type="button">
                Limpiar filtros
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <section
        aria-live="polite"
        className="patients-table-shell mt-5 overflow-hidden rounded-3xl border border-[#a9d2e7] bg-white shadow-sm"
      >
        <div className="flex flex-col gap-2 border-b border-[#b8dceb] bg-[#dceef7] px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-xs font-bold text-[#0a4470]">
            <span aria-hidden="true" className="grid size-6 place-items-center rounded-lg bg-[#1c7fb0] text-white">i</span>
            Selecciona cualquier fila para abrir el expediente clínico completo.
          </p>
          <span className="inline-flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[.12em] text-slate-500">
            <i className="size-2 rounded-full bg-emerald-500 motion-safe:animate-pulse" />
            Censo actualizado
          </span>
        </div>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Tabla del censo clínico">
          <table className="patients-table w-full min-w-[920px] border-separate border-spacing-0 text-left text-sm">
            <caption className="sr-only">
              Pacientes del consultorio. Página {page + 1} de {maxPage + 1}.
            </caption>
            <thead className="bg-[#eef6fa] text-[10px] font-extrabold uppercase tracking-[.12em] text-[#0a4470]">
              <tr>
                <th className="border-b border-[#c9e2ee] px-5 py-4" scope="col">Paciente y expediente</th>
                <th className="border-b border-[#c9e2ee] px-4 py-4" scope="col">Perfil clínico</th>
                <th className="border-b border-[#c9e2ee] px-4 py-4" scope="col">Prioridad</th>
                <th className="border-b border-[#c9e2ee] px-4 py-4" scope="col">Último seguimiento</th>
                <th className="border-b border-[#c9e2ee] px-4 py-4" scope="col">Alertas y próximos pasos</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((patient, index) => (
                <tr
                  className="patients-table-row cursor-pointer motion-safe:animate-[kuni-rise_360ms_ease-out_both]"
                  data-risk={patient.risk.level}
                  key={patient.id}
                  onClick={() => {
                    router.push(`/pacientes/${patient.id}`);
                  }}
                  style={{ animationDelay: `${index * 35}ms` }}
                >
                  <td className="border-b border-slate-100 px-5 py-4">
                    <div className="flex items-center gap-3">
                      <span className="patient-table-avatar grid size-11 shrink-0 place-items-center rounded-2xl border border-[#acd5e8] bg-[#dceef7] text-xs font-black text-[#0a4470] shadow-sm">
                        {initials(patient.fullName)}
                      </span>
                      <div className="min-w-0">
                        <strong className="block max-w-48 truncate text-sm font-extrabold text-slate-900">
                          {patient.fullName}
                        </strong>
                        <span className="font-mono-data mt-1 block text-[10px] font-semibold text-slate-500">
                          {patient.clinicalRecord}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="border-b border-slate-100 px-4 py-4 text-slate-700">
                    <div className="flex max-w-64 flex-wrap gap-1.5">
                      {patient.diagnoses.length ? patient.diagnoses.map((item) => (
                        <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-600" key={item}>{item}</span>
                      )) : <span className="text-xs text-slate-400">Sin diagnóstico registrado</span>}
                    </div>
                    <span className="mt-1.5 block text-[10px] font-medium text-slate-400">{patient.age} años</span>
                  </td>
                  <td className="border-b border-slate-100 px-4 py-4">
                    <span
                      className={`inline-flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs font-extrabold ${riskClass[patient.risk.level]}`}
                    >
                      <i aria-hidden="true" className="size-1.5 rounded-full bg-current" />
                      {riskLabels[patient.risk.level]}
                    </span>
                  </td>
                  <td className="border-b border-slate-100 px-4 py-4">
                    <span className="block text-xs font-bold text-slate-700">{dateTime(patient.lastResponseAt, data.timezone)}</span>
                    <span className="mt-1 block text-[10px] font-medium text-slate-400">Última respuesta registrada</span>
                  </td>
                  <td className="border-b border-slate-100 px-4 py-4">
                    <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
                      {patient.alerts.length ? (
                        <span className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-rose-700">
                          {patient.alerts.length} alerta{patient.alerts.length === 1 ? "" : "s"}
                        </span>
                      ) : null}
                      {patient.nonresponse.pending ? (
                        <span className="rounded-lg border border-[#acd5e8] bg-[#e5f3fa] px-2 py-1 text-[#0a4470]">
                          {patient.nonresponse.pending} pendiente{patient.nonresponse.pending === 1 ? "" : "s"}
                        </span>
                      ) : null}
                      {patient.appointments[0] ? (
                        <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-slate-700">
                          Cita {dateTime(patient.appointments[0].startsAt, data.timezone)}
                        </span>
                      ) : null}
                      {!patient.alerts.length && !patient.nonresponse.pending && !patient.appointments[0] ? (
                        <span className="inline-flex items-center gap-1.5 text-emerald-700"><i className="size-1.5 rounded-full bg-emerald-500" />Sin pendientes</span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {!visible.length ? (
                <tr>
                  <td
                    className="px-5 py-16 text-center text-slate-500"
                    colSpan={5}
                  >
                    <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#e5f3fa] text-[#0a4470]"><AppointmentIcon name="search" className="size-5" /></span>
                    <strong className="mt-3 block text-sm text-slate-700">No encontramos pacientes</strong>
                    <span className="mt-1 block text-xs">Prueba con otros términos o limpia los filtros.</span>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-3 bg-slate-50/70 px-5 py-3.5 text-xs text-slate-600">
          <span>
            {matches.length} resultados
            {data.hasMorePatients
              ? " · el servidor indicó una lista parcial"
              : ""}
            {" · "}página {page + 1} de {maxPage + 1}
          </span>
          <div className="flex items-center gap-2">
            <button
              aria-label="Página anterior del censo"
              className="grid size-9 cursor-pointer place-items-center rounded-xl border border-slate-200 bg-white font-semibold text-[#0a4470] transition hover:border-[#8fcbe8] hover:bg-[#e5f3fa] disabled:cursor-not-allowed disabled:opacity-40"
              disabled={page === 0}
              onClick={() => setPage((current) => current - 1)}
              type="button"
            >
              <AppointmentIcon name="chevronLeft" className="size-4" />
            </button>
            <span className="font-mono-data rounded-lg bg-[#e5f3fa] px-3 py-1.5 text-[10px] font-bold text-[#0a4470]">{page + 1} / {maxPage + 1}</span>
            <button
              aria-label="Página siguiente del censo"
              className="grid size-9 cursor-pointer place-items-center rounded-xl border border-slate-200 bg-white font-semibold text-[#0a4470] transition hover:border-[#8fcbe8] hover:bg-[#e5f3fa] disabled:cursor-not-allowed disabled:opacity-40"
              disabled={page === maxPage}
              onClick={() => setPage((current) => current + 1)}
              type="button"
            >
              <AppointmentIcon name="chevronRight" className="size-4" />
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
  const upcoming = data.appointments[0];
  const todayKey = formatInTimeZone(data.generatedAt, data.timezone, "yyyy-MM-dd");
  const today = data.appointments.filter((a) => formatInTimeZone(a.startsAt, data.timezone, "yyyy-MM-dd") === todayKey);
  const urgent = data.appointments.filter((a) => a.urgency === "urgent");
  const routine = data.appointments.length - urgent.length;
  const [slotPrefill, setSlotPrefill] = useState<AppointmentSlotPrefill | null>(null);
  return (
    <>
      <PageHeader
        description="Agenda una nueva cita y consulta el calendario del consultorio en un solo lugar."
        flatBackground
        title="Citas"
      >
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white px-4 py-2 text-xs font-bold text-slate-600 shadow-sm">
            <span aria-hidden="true" className="size-2 rounded-full bg-emerald-500 motion-safe:animate-pulse" />
            {data.appointments.length} programadas · 90 días
          </span>
          {upcoming ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-bold text-[#0a4470] shadow-sm">
              Próxima: {upcoming.patientName.split(" ")[0]} · {dateTime(upcoming.startsAt, data.timezone).split(",")[1]?.trim() ?? dateTime(upcoming.startsAt, data.timezone)}
            </span>
          ) : null}
        </div>
      </PageHeader>
      <div className="mt-6 grid items-stretch gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <AppointmentForm data={data} prefill={slotPrefill} />
        </div>
        <div className="flex flex-col gap-4 lg:col-span-7">
          <div className="grid grid-cols-3 gap-3">
            <AppointmentStat icon="today" label="Citas hoy" tone="sky" value={today.length} />
            <AppointmentStat icon="alert" label="Prioritarias · 90 días" tone="rose" value={urgent.length} />
            <AppointmentStat icon="stethoscope" label="Rutina · 90 días" tone="emerald" value={routine} />
          </div>
          <AppointmentsCalendar
            data={data}
            onPickFreeSlot={(date, time) => setSlotPrefill({ date, time, nonce: Date.now() })}
          />
        </div>
      </div>
    </>
  );
}

const statTone = {
  sky: "bg-sky-50 text-sky-600",
  rose: "bg-rose-50 text-[#e2525c]",
  emerald: "bg-emerald-50 text-emerald-600",
} as const;

function AppointmentStat({
  icon,
  label,
  value,
  tone,
}: {
  icon: AppointmentIconName;
  label: string;
  value: number;
  tone: keyof typeof statTone;
}) {
  return (
    <article className="dashboard-shadow-soft flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3.5">
      <span className={`grid size-9 shrink-0 place-items-center rounded-xl font-mono-data text-sm font-extrabold ${statTone[tone]}`}>
        <AppointmentIcon className="size-4" name={icon} />
      </span>
      <div className="min-w-0 leading-tight">
        <p className="font-mono-data text-lg font-extrabold text-slate-900">{value}</p>
        <p className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      </div>
    </article>
  );
}

function AlertsView({ data }: { data: DashboardData }) {
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState<"all" | "critical" | "other">("all");
  const [page, setPage] = useState(0);
  const pageSize = 9;
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = data.alerts.filter((alert) => {
    const matchesQuery = normalizedQuery === "" || alert.patientName.toLowerCase().includes(normalizedQuery);
    const matchesSeverity = severity === "all" || (severity === "critical" ? alert.severity === "critical" : alert.severity !== "critical");
    return matchesQuery && matchesSeverity;
  });
  const maxPage = Math.max(0, Math.ceil(filtered.length / pageSize) - 1);
  const currentPage = Math.min(page, maxPage);
  const visible = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const severityOptions = [
    { value: "all", label: "Todas", count: data.alerts.length },
    { value: "critical", label: "Crítica", count: data.alerts.filter((alert) => alert.severity === "critical").length },
    { value: "other", label: "Seguimiento", count: data.alerts.filter((alert) => alert.severity !== "critical").length },
  ] as const;
  const filtersActive = normalizedQuery !== "" || severity !== "all";
  const resetFilters = () => {
    setQuery("");
    setSeverity("all");
    setPage(0);
  };
  return (
    <>
      <PageHeader
        title="Alertas y triaje"
        description="Visualiza alertas reales del consultorio y documenta su atención o una urgencia. La prioridad se recalcula en servidor; el modelo experimental no la sustituye."
      />
      <section aria-label="Búsqueda y filtros de alertas" className="mt-6 overflow-hidden rounded-3xl border border-[#a9d2e7] bg-white shadow-sm">
        <div className="p-5">
          <label className="grid gap-2" htmlFor="alertas-buscar">
            <span className="flex items-center gap-2 text-xs font-extrabold text-[#0a4470]">
              <AppointmentIcon className="size-4" name="search" />
              Búsqueda de paciente
            </span>
            <span className="relative">
              <AppointmentIcon className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#1c7fb0]" name="search" />
              <input
                className="min-h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-[#8fcbe8] focus:border-[#1c7fb0] focus:bg-white focus:ring-4 focus:ring-sky-100"
                id="alertas-buscar"
                onChange={(event) => { setQuery(event.target.value); setPage(0); }}
                placeholder="Nombre del paciente…"
                type="search"
                value={query}
              />
            </span>
          </label>
        </div>
        <div className="flex flex-col gap-3 border-t border-sky-100 bg-[#edf6fa] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div aria-label="Filtrar por severidad" className="flex flex-wrap items-center gap-2" role="group">
            <span className="mr-1 text-[10px] font-extrabold uppercase tracking-[.14em] text-[#0a4470]/65">Severidad</span>
            {severityOptions.map((option) => (
              <button
                aria-pressed={severity === option.value}
                className={`cursor-pointer rounded-xl border px-3 py-1.5 text-xs font-bold transition ${severity === option.value ? "border-[#0a4470] bg-[#0a4470] text-white" : "border-slate-200 bg-white text-slate-600 hover:border-[#8fcbe8] hover:bg-[#e5f3fa]"}`}
                key={option.value}
                onClick={() => { setSeverity(option.value); setPage(0); }}
                type="button"
              >
                {option.label} <span className="ml-1 opacity-65">{option.count}</span>
              </button>
            ))}
          </div>
          {filtersActive ? (
            <button className="cursor-pointer self-start rounded-xl px-3 py-2 text-xs font-bold text-slate-500 transition hover:bg-white hover:text-[#0a4470] sm:self-auto" onClick={resetFilters} type="button">
              Limpiar filtros
            </button>
          ) : null}
        </div>
      </section>
      <div className="mt-5 flex items-stretch gap-3">
        {filtered.length > pageSize ? (
          <button
            aria-label="Página anterior de alertas"
            className="grid shrink-0 place-self-center place-items-center rounded-full border border-slate-200 bg-white text-[#0a4470] shadow-sm transition hover:border-[#8fcbe8] hover:bg-[#e5f3fa] disabled:cursor-not-allowed disabled:opacity-40 size-10"
            disabled={currentPage === 0}
            onClick={() => setPage((current) => current - 1)}
            type="button"
          >
            <AppointmentIcon className="size-5" name="chevronLeft" />
          </button>
        ) : null}
        <section aria-label="Alertas del consultorio" className="grid min-w-0 flex-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((alert, index) => (
            <article
              className="motion-safe:animate-[kuni-rise_360ms_ease-out_both] flex flex-col gap-3 rounded-3xl border border-slate-200/70 bg-white p-5 shadow-sm"
              key={alert.id}
              style={{ animationDelay: `${index * 45}ms` }}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="min-w-0 font-extrabold text-slate-900">{alert.title}</h2>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-bold ${alert.severity === "critical" ? "border-[#0a4470]/40 bg-[#0a4470]/10 text-[#0a4470]" : "border-sky-200 bg-sky-50 text-sky-700"}`}
                >
                  {alert.severity === "critical" ? "Crítica" : "Seguimiento"}
                </span>
              </div>
              <p className="text-sm text-slate-600">
                {alert.patientName}
                <br />
                {dateTime(alert.createdAt, data.timezone)} · Estado: {alert.status}
              </p>
              <div className="mt-auto pt-1">
                <AlertActions alert={alert} />
              </div>
            </article>
          ))}
          {!visible.length ? (
            <div className="col-span-full rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
              {data.alerts.length
                ? "No hay alertas que coincidan con la búsqueda o los filtros."
                : "No hay alertas abiertas en este consultorio."}
            </div>
          ) : null}
        </section>
        {filtered.length > pageSize ? (
          <button
            aria-label="Página siguiente de alertas"
            className="grid shrink-0 place-self-center place-items-center rounded-full border border-slate-200 bg-white text-[#0a4470] shadow-sm transition hover:border-[#8fcbe8] hover:bg-[#e5f3fa] disabled:cursor-not-allowed disabled:opacity-40 size-10"
            disabled={currentPage === maxPage}
            onClick={() => setPage((current) => current + 1)}
            type="button"
          >
            <AppointmentIcon className="size-5" name="chevronRight" />
          </button>
        ) : null}
      </div>
      {filtered.length > pageSize ? (
        <p className="mt-3 text-center text-xs font-semibold text-slate-500">
          {filtered.length} alertas · página {currentPage + 1} de {maxPage + 1}
        </p>
      ) : null}
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
  const medicationInteractions = patient.interactions.filter((interaction) => interaction.kind === "medication");
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
              <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 md:border-t-0 md:pt-0">
                {canWrite ? <Link className="clinical-button" href={`/pacientes/${patient.id}/reporte`}>Reporte PDF</Link> : null}
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
              <MedicationCalendar
                interactions={medicationInteractions}
                now={data.generatedAt}
                patientId={patient.id}
                timezone={data.timezone}
              />
              <ComplicationPanel
                canWrite={canWrite}
                complications={patient.complications}
                patientId={patient.id}
              />
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
