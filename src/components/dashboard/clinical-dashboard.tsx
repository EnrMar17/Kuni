"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { ClinicalHeader } from "@/components/clinical-header";
import type { DashboardData, DashboardPatient } from "@/lib/domain/dashboard";
import {
  dateTime,
  filterPatients,
  initials,
  measurementChart,
  measurementDescription,
  percent,
  riskLabels,
} from "./presentation";

type IconName =
  | "alert"
  | "arrow"
  | "bell"
  | "calendar"
  | "chart"
  | "chat"
  | "clock"
  | "filter"
  | "grid"
  | "heart"
  | "plus"
  | "search"
  | "users";

const toneStyles = {
  rose: "bg-rose-100 text-rose-700",
  amber: "bg-amber-100 text-amber-700",
  slate: "bg-slate-200 text-slate-700",
  violet: "bg-violet-100 text-violet-700",
  emerald: "bg-emerald-100 text-emerald-700",
} as const;

const iconPaths: Record<IconName, React.ReactNode> = {
  alert: (
    <>
      <path d="M12 9v2m0 4h.01" />
      <path d="M5.1 19h13.8a2 2 0 0 0 1.73-3L13.73 4a2 2 0 0 0-3.46 0L3.37 16a2 2 0 0 0 1.73 3Z" />
    </>
  ),
  arrow: <path d="m7 17 10-10m0 0H7m10 0v10" />,
  bell: (
    <>
      <path d="M15 17H5l1.4-1.4A2 2 0 0 0 7 14.2V11a5 5 0 0 1 10 0v3.2a2 2 0 0 0 .6 1.4L19 17h-4" />
      <path d="M14 17v1a2 2 0 0 1-4 0v-1" />
    </>
  ),
  calendar: (
    <>
      <path d="M8 3v4m8-4v4M5 10h14" />
      <rect x="4" y="5" width="16" height="16" rx="2" />
    </>
  ),
  chart: (
    <>
      <path d="M5 20V10m7 10V4m7 16v-7" />
      <path d="M3 20h18" />
    </>
  ),
  chat: (
    <path d="M21 12a8 8 0 0 1-8.5 8 9.6 9.6 0 0 1-4.2-1L3 20l1.4-3.7A7.3 7.3 0 0 1 3 12a8.4 8.4 0 0 1 9-8 8.4 8.4 0 0 1 9 8Z" />
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  filter: <path d="M4 5h16l-6.5 7v5L10 20v-8Z" />,
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  heart: (
    <>
      <path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3C14.7 3 13.5 3.5 12 5 10.5 3.5 9.3 3 7.5 3A5.5 5.5 0 0 0 2 8.5C2 10.8 3.5 12.5 5 14l7 7Z" />
      <path d="M12 9v4m-2-2h4" />
    </>
  ),
  plus: <path d="M12 4v16m8-8H4" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  users: (
    <>
      <path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 20v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
    </>
  ),
};

function Icon({
  name,
  className = "size-4",
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      {iconPaths[name]}
    </svg>
  );
}

function SectionArrow({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className="grid size-7 place-items-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200"
      type="button"
    >
      <Icon name="arrow" className="size-3.5" />
    </button>
  );
}

export type Room = { name: string; doctor: { fullName: string } };

function scrollToSection(id: string) {
  document
    .getElementById(id)
    ?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "start",
    });
}

function presentPatient(patient: DashboardPatient | null, timezone: string) {
  const glucose = patient?.latestGlucose;
  const pressure = patient?.latestBloodPressure;
  const level = patient?.risk.level ?? "unknown";
  const glucoseText =
    glucose?.glucoseMgDl != null
      ? glucose.glucoseMgDl + " mg/dL"
      : "Sin glucosa";
  const pressureText =
    pressure?.systolicMmHg != null && pressure.diastolicMmHg != null
      ? pressure.systolicMmHg + "/" + pressure.diastolicMmHg + " mmHg"
      : "Sin presión";
  const tones = {
    high: "rose",
    medium: "amber",
    unknown: "slate",
    low: "emerald",
  } as const;
  return {
    id: patient?.id ?? "",
    name: patient?.fullName ?? "Selecciona un paciente",
    shortName: patient?.fullName ?? "Sin pacientes",
    initials: patient ? initials(patient.fullName) : "—",
    badge: patient?.diagnoses.join(" · ") || "Sin diagnóstico registrado",
    risk: riskLabels[level],
    tone: tones[level],
    glucose: glucoseText,
    bloodPressure: pressureText,
    reading: glucoseText + " · " + pressureText,
    location: patient ? "Exp. " + patient.clinicalRecord : "",
    summary: patient
      ? patient.age + " años. " + patient.risk.reasons.join(" ")
      : "No hay un expediente seleccionado en este consultorio.",
    time: dateTime(patient?.lastResponseAt ?? null, timezone),
  };
}

function PatientSummarySkeleton() {
  return (
    <div
      aria-label="Selecciona un paciente para ver su resumen"
      className="dashboard-shadow-floating min-h-[620px] overflow-hidden rounded-[32px] border border-slate-200/90 bg-white p-6"
    >
      <div aria-hidden="true">
        <div className="flex items-center justify-between">
          <div className="skeleton-bone h-4 w-36" />
          <div className="skeleton-bone size-7 !rounded-full" />
        </div>

        <div className="mt-5 space-y-3">
          <div className="skeleton-bone h-7 w-3/4" />
          <div className="skeleton-bone h-6 w-2/5 !rounded-full" />
        </div>

        <div className="my-5 flex min-h-48 flex-col items-center justify-center rounded-3xl border border-sky-100 bg-[#e8f4fb] p-4">
          <div className="skeleton-bone size-20 !rounded-full" />
          <div className="mt-4 grid w-full grid-cols-2 gap-2">
            <div className="skeleton-bone h-7 !rounded-full" />
            <div className="skeleton-bone h-7 !rounded-full" />
          </div>
          <div className="skeleton-bone mt-3 h-6 w-24 !rounded-full" />
        </div>

        <div className="space-y-3">
          <div className="skeleton-bone h-3 w-2/5" />
          <div className="skeleton-bone h-3 w-full" />
          <div className="skeleton-bone h-3 w-full" />
          <div className="skeleton-bone h-3 w-4/5" />
        </div>

        <div className="mt-6 border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between">
            <div className="skeleton-bone h-3 w-32" />
            <div className="skeleton-bone h-6 w-28 !rounded-full" />
          </div>
          <div className="skeleton-bone mt-3 h-24 w-full !rounded-2xl" />
        </div>

        <div className="mt-5 border-t border-slate-100 pt-4">
          <div className="skeleton-bone h-3 w-40" />
          <div className="mt-3 grid gap-2">
            <div className="skeleton-bone h-10 w-full !rounded-xl" />
            <div className="skeleton-bone h-10 w-full !rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ClinicalDashboard({
  room,
  unitName,
  data,
}: {
  room: Room;
  unitName: string;
  data: DashboardData;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState<
    "all" | "high" | "medium" | "unknown" | "low"
  >("all");
  const [order, setOrder] = useState<"risk" | "name">("risk");
  const [days, setDays] = useState(30);
  const selectedPatient =
    data.patients.find((patient) => patient.id === selectedId) ?? null;
  const selected = presentPatient(selectedPatient, data.timezone);
  const filteredPatients = useMemo(
    () =>
      filterPatients(data.patients, query, priority, order).map((patient) =>
        presentPatient(patient, data.timezone),
      ),
    [data.patients, data.timezone, query, priority, order],
  );
  const doctorDisplayName = /^(Dr|Dra)\.\s/i.test(room.doctor.fullName)
    ? room.doctor.fullName
    : `Dr. ${room.doctor.fullName}`;
  const chart = measurementChart(
    selectedPatient?.measurements ?? [],
    data.generatedAt,
    days,
  );
  const medicines = (selectedPatient?.prescriptions ?? []).map(
    (prescription, index) => ({
      code: prescription.id,
      label: String(index + 1).padStart(2, "0"),
      name: prescription.medicationName,
      detail: prescription.doseText,
      status:
        "Cobertura: " + percent(prescription.adherence.responseCoveragePct),
      value: percent(prescription.adherence.confirmedAdherencePct),
      tone: "slate" as string,
      shape: [
        "rounded-lg bg-amber-200",
        "rounded-full bg-rose-400",
        "rounded-full bg-sky-300",
      ][index % 3],
    }),
  );
  const appointments = data.appointments.map((appointment) => ({
    ...appointment,
    initials: initials(appointment.patientName),
    name: appointment.patientName,
    time: dateTime(appointment.startsAt, data.timezone),
    channel: room.name,
    status: "Programada",
    tone: "sky",
  }));
  const openWhatsApp = () => {
    if (
      selectedPatient?.consentGranted &&
      /^\+[1-9]\d{7,14}$/.test(selectedPatient.whatsappE164)
    ) {
      window.open(
        "https://wa.me/" + selectedPatient.whatsappE164.slice(1),
        "_blank",
        "noopener,noreferrer",
      );
    }
  };
  const selectCensus = () => {
    setPriority("all");
    setQuery("");
    scrollToSection("pacientes");
  };

  return (
    <div className="clinical-dashboard relative w-full max-w-[1480px] overflow-hidden rounded-[36px] border border-slate-200/70 bg-[#f7f8fc] p-4 shadow-2xl md:p-8">
      <ClinicalHeader
        context={{
          unitName,
          roomName: room.name,
          doctorName: room.doctor.fullName,
        }}
        data={data}
      />

      <section className="dashboard-hero mb-6 mt-5 flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 lg:text-4xl">
            Bienvenido, {doctorDisplayName}
          </h1>
          <p className="mt-1 text-base font-medium text-slate-500">
            Tienes{" "}
            <span className="font-mono-data text-lg font-bold text-[#e2525c]">
              {data.metrics.highRiskPatients} pacientes
            </span>{" "}
            con prioridad alta
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative min-w-0 flex-1 basis-full sm:min-w-[260px] sm:basis-auto md:min-w-[320px]">
            <span className="sr-only">Buscar pacientes</span>
            <input
              className="w-full min-w-0 rounded-full border border-slate-200/80 bg-white py-2.5 pl-5 pr-11 text-xs text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-[#001d39] md:text-sm"
              id="dashboard-buscar"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por paciente, CURP o expediente..."
              type="search"
              value={query}
            />
            <Icon
              name="search"
              className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-slate-400"
            />
          </label>
          <button
            aria-label={`Filtrar por prioridad: ${priority === "all" ? "todas" : riskLabels[priority]}. Pulsar para cambiar.`}
            className="dashboard-filter-button flex cursor-pointer items-center gap-1.5 rounded-full border border-slate-200/80 bg-white px-5 py-2.5 text-xs font-semibold text-slate-700 shadow-sm md:text-sm"
            onClick={() => {
              const levels = [
                "all",
                "high",
                "medium",
                "unknown",
                "low",
              ] as const;
              setPriority(
                levels[(levels.indexOf(priority) + 1) % levels.length],
              );
            }}
            type="button"
          >
            <Icon name="filter" className="size-3.5 text-slate-500" />
            {priority === "all" ? "Filtrar prioridad" : riskLabels[priority]}
          </button>
          <button
            aria-label={`Orden actual: ${order === "risk" ? "prioridad" : "nombre"}. Pulsar para cambiar.`}
            className="dashboard-filter-button cursor-pointer rounded-full border border-slate-200/80 bg-white px-5 py-2.5 text-xs font-semibold text-slate-700 shadow-sm md:text-sm"
            onClick={() => setOrder(order === "risk" ? "name" : "risk")}
            type="button"
          >
            {order === "risk" ? "Orden: prioridad" : "Orden: nombre"}
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 items-start gap-7 lg:grid-cols-12">
        <div className="flex flex-col gap-7 lg:col-span-8">
          <section
            id="metricas"
            aria-label="Métricas clínicas"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            <article className="dashboard-accent-card dashboard-shadow-soft flex min-h-[140px] flex-col justify-between rounded-3xl border p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">
                  Glucosa en ayuno
                </span>
                <span className="dashboard-section-icon grid size-8 place-items-center rounded-full bg-[#1c7fb0] text-white shadow-sm shadow-sky-900/20">
                  <Icon name="heart" />
                </span>
              </div>
              <svg
                aria-hidden="true"
                className="my-2.5 h-10 w-full"
                preserveAspectRatio="none"
                viewBox="0 0 200 40"
              ></svg>
              <div>
                <p>
                  <span className="dashboard-key-value font-mono-data text-2xl font-extrabold text-slate-900">
                    {data.metrics.meanFastingGlucoseMgDl?.toLocaleString(
                      "es-MX",
                      { maximumFractionDigits: 1 },
                    ) ?? "Sin datos"}
                  </span>{" "}
                  <span className="text-[11px] font-bold text-slate-400">
                    mg/dL
                  </span>
                </p>
                <p className="mt-0.5 text-[10px] font-semibold text-emerald-600">
                  Promedio{" "}
                  <span className="text-slate-400">
                    de {data.metrics.fastingGlucoseCount} lecturas en 30 días
                  </span>
                </p>
              </div>
            </article>
            <article className="dashboard-shadow-soft flex min-h-[140px] flex-col justify-between rounded-3xl border border-slate-100 bg-white p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">
                  Alertas críticas
                </span>
                <span className="grid size-8 place-items-center rounded-full bg-red-50 text-[#e2525c]">
                  <Icon name="alert" />
                </span>
              </div>
              <div className="my-2.5 flex h-10 items-end justify-between gap-1.5 px-1"></div>
              <div>
                <p>
                  <span className="dashboard-key-value dashboard-key-value-alert font-mono-data text-2xl font-extrabold text-[#e2525c]">
                    {data.metrics.criticalAlerts}
                  </span>{" "}
                  <span className="text-[11px] font-bold text-slate-400">
                    alertas
                  </span>
                </p>
                <p className="mt-0.5 truncate text-[10px] font-medium text-slate-400">
                  {data.metrics.activeAlerts} alertas activas registradas
                </p>
              </div>
            </article>
            <article className="dashboard-accent-card dashboard-shadow-soft flex min-h-[140px] flex-col justify-between rounded-3xl border p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">
                  Adherencia confirmada
                </span>
                <span className="dashboard-section-icon grid size-8 place-items-center rounded-full bg-[#287ca8] text-white shadow-sm shadow-sky-900/20">
                  <Icon name="chat" />
                </span>
              </div>
              <div className="my-3 h-5 overflow-hidden rounded-full bg-slate-100 p-0.5">
                <div
                  className="dashboard-progress-fill h-full rounded-full bg-sky-500"
                  style={{
                    width: `${data.metrics.adherence.confirmedAdherencePct ?? 0}%`,
                  }}
                />
              </div>
              <div>
                <p className="dashboard-key-value font-mono-data text-2xl font-extrabold text-slate-900">
                  {percent(data.metrics.adherence.confirmedAdherencePct)}
                </p>
                <p className="font-mono-data mt-0.5 text-[10px] font-semibold text-slate-500">
                  Cobertura{" "}
                  {percent(data.metrics.adherence.responseCoveragePct)} ·{" "}
                  {data.metrics.adherence.u} desconocidos
                </p>
              </div>
            </article>
            <Link
              className="group flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-slate-300 p-5 text-center transition hover:border-sky-400 hover:bg-sky-50/30 motion-safe:hover:-translate-y-0.5"
              href="/pacientes/nuevo"
            >
              <span className="grid size-10 place-items-center rounded-full bg-[#001d39] text-white shadow-sm transition motion-safe:group-hover:scale-110">
                <Icon name="plus" className="size-5" />
              </span>
              <span className="text-xs font-bold text-slate-700">
                Nuevo paciente
              </span>
              <span className="text-[10px] font-medium text-slate-400">
                Preparar alta clínica
              </span>
            </Link>
          </section>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
            <section
              id="pacientes"
              aria-label="Pacientes del consultorio"
              className="dashboard-shadow-soft flex h-full flex-col rounded-3xl border border-slate-100 bg-white p-5 md:col-span-5"
            >
              <div className="mb-5 flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="dashboard-section-icon grid size-10 shrink-0 place-items-center rounded-2xl bg-[#1c7fb0] text-white shadow-sm ring-1 ring-sky-700/20">
                    <Icon name="users" className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-base font-bold text-slate-900">
                      Pacientes del consultorio
                    </h2>
                    <p className="mt-1 text-xs font-medium text-slate-400">
                      {data.metrics.activePatients} pacientes
                      {data.hasMorePatients
                        ? " · Lista parcial; hay más pacientes"
                        : ""}
                    </p>
                  </div>
                </div>
                <SectionArrow
                  label="Ver pacientes cargados"
                  onClick={selectCensus}
                />
              </div>
              <div className="table-scroll flex max-h-[340px] flex-col gap-3 overflow-y-auto pr-2">
                {filteredPatients.length ? (
                  filteredPatients.map((patient) => {
                    const active = patient.id === selected.id;
                    return (
                      <button
                        aria-pressed={active}
                        className={`group/patient relative flex min-h-[88px] w-full cursor-pointer items-center justify-between gap-3 overflow-hidden rounded-2xl border p-3.5 text-left shadow-sm transition duration-200 motion-safe:hover:-translate-y-0.5 ${active ? "border-[#51a9d5] bg-[#e6f3fa] shadow-sky-100/70" : "border-slate-100 bg-slate-50/70 hover:border-sky-100 hover:bg-white hover:shadow-md"}`}
                        key={patient.id}
                        onClick={() => setSelectedId(patient.id)}
                        type="button"
                      >
                        <span
                          aria-hidden="true"
                          className={`absolute inset-y-0 left-0 w-1 rounded-r-full transition-opacity duration-200 ${active ? "bg-[#0a4470] opacity-100" : "opacity-0"}`}
                        />
                        <span className="flex min-w-0 items-center gap-3.5 pl-1.5">
                          <span
                            className={`grid size-11 shrink-0 place-items-center rounded-2xl text-xs font-bold shadow-sm ring-2 ring-white transition-transform duration-200 motion-safe:group-hover/patient:scale-105 ${toneStyles[patient.tone]}`}
                          >
                            {patient.initials}
                          </span>
                          <span className="min-w-0 leading-snug">
                            <span className="flex flex-wrap items-center gap-2">
                              <strong className="truncate text-xs text-slate-900">
                                {patient.shortName}
                              </strong>
                              {patient.id ? (
                                <span
                                  className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${toneStyles[patient.tone]}`}
                                >
                                  {patient.risk}
                                </span>
                              ) : null}
                            </span>
                            <span className="font-mono-data mt-1.5 block text-[11px] font-semibold text-rose-600">
                              {patient.reading}
                            </span>
                            <span className="mt-0.5 block text-[10px] text-slate-400">
                              {patient.location}
                            </span>
                          </span>
                        </span>
                        <span className="grid size-8 shrink-0 place-items-center rounded-xl border border-slate-200/70 bg-white text-slate-400 shadow-sm transition-transform duration-200 motion-safe:group-hover/patient:translate-x-0.5 motion-safe:group-hover/patient:text-[#0a4470]">
                          <Icon name="arrow" className="size-3" />
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <p className="rounded-2xl bg-slate-50 p-4 text-center text-xs text-slate-500">
                    No encontramos pacientes con esa búsqueda.
                  </p>
                )}
              </div>
            </section>

            <section
              id="recetas"
              className="dashboard-shadow-soft flex h-full flex-col rounded-3xl border border-slate-100 bg-white p-5 md:col-span-7"
            >
              <div className="mb-1 flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-900">
                  Esquemas y fármacos crónicos
                </h2>
                <SectionArrow
                  label="Ver tratamiento del paciente"
                  onClick={() => scrollToSection("adherencia")}
                />
              </div>
              <p className="mb-4 text-xs font-medium text-slate-400">
                Tratamiento del paciente seleccionado · confirmaciones de 30
                días
              </p>
              {medicines.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 py-10 text-center">
                  <span
                    aria-hidden="true"
                    className="grid size-12 place-items-center rounded-full bg-sky-50 text-2xl text-sky-500"
                  >
                    <Icon name="heart" className="size-6" />
                  </span>
                  <p className="text-sm font-bold text-slate-700">
                    Sin recetas vigentes
                  </p>
                  <p className="max-w-[220px] text-xs text-slate-400">
                    Cuando se registre una receta activa, sus esquemas y
                    adherencia aparecerán aquí.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {medicines.map((medicine) => (
                  <article
                    className="flex flex-col items-center rounded-2xl border border-slate-100 bg-slate-50/70 p-3 text-center transition hover:bg-slate-100/70"
                    key={medicine.code}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span
                        className={`rounded-sm border px-1 text-[9px] font-bold ${medicine.tone === "emerald" ? "border-emerald-200 bg-emerald-50 text-emerald-600" : medicine.tone === "rose" ? "border-rose-200 bg-rose-50 text-rose-600" : "border-slate-200 bg-white text-slate-600"}`}
                      >
                        ● {medicine.value}
                      </span>
                      <span className="font-mono-data text-[10px] text-slate-400">
                        {medicine.label}
                      </span>
                    </div>
                    <div className="my-1 grid h-14 w-12 place-items-center">
                      <span
                        className={`h-10 w-7 border border-white/80 shadow-inner ${medicine.shape}`}
                      />
                    </div>
                    <h3 className="text-xs font-bold text-slate-800">
                      {medicine.name}
                    </h3>
                    <span className="text-[10px] font-medium text-slate-400">
                      {medicine.detail}
                    </span>
                    <span
                      className={`mt-0.5 text-[9px] font-semibold ${medicine.tone === "rose" ? "text-rose-600" : medicine.tone === "emerald" ? "text-emerald-600" : "text-amber-600"}`}
                    >
                      {medicine.status}
                    </span>
                  </article>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section
            id="citas"
            className="dashboard-accent-panel dashboard-shadow-soft flex flex-col gap-4 rounded-3xl border p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="dashboard-section-icon grid size-8 place-items-center rounded-full bg-[#1c7fb0] text-white shadow-sm shadow-sky-900/20">
                  <Icon name="calendar" />
                </span>
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Próximas citas
                  </h2>
                  <p className="text-xs font-medium text-slate-400">
                    Registradas por el equipo de salud
                  </p>
                </div>
              </div>
              <span className="font-mono-data rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                {data.appointments.length} citas en los próximos 90 días
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {appointments.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Sin citas programadas en este periodo.
                </p>
              ) : null}
              {appointments.map((appointment) => (
                <article
                  className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-3.5"
                  key={appointment.id}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold ${appointment.tone === "rose" ? "bg-rose-100 text-rose-700" : appointment.tone === "amber" ? "bg-amber-100 text-amber-700" : "bg-sky-100 text-sky-700"}`}
                      >
                        {appointment.initials}
                      </span>
                      <div>
                        <h3 className="text-xs font-bold leading-tight text-slate-900">
                          {appointment.name}
                        </h3>
                        <p className="mt-0.5 text-[10px] font-medium text-slate-500">
                          {appointment.reason}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${appointment.status === "Pendiente" ? "border-amber-200 bg-amber-50 text-amber-600" : "border-emerald-200 bg-emerald-50 text-emerald-600"}`}
                    >
                      {appointment.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-200/60 pt-2 text-[10px]">
                    <strong className="font-mono-data flex items-center gap-1 text-[11px] text-slate-700">
                      <Icon name="clock" className="size-3.5 text-sky-600" />
                      {appointment.time}
                    </strong>
                    <span className="rounded-md border border-slate-200/60 bg-white px-2 py-0.5 font-semibold text-slate-500">
                      {appointment.channel}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>

        <aside id="ficha" aria-live="polite" className="lg:col-span-4">
          {!selectedPatient ? (
            <PatientSummarySkeleton />
          ) : (
          <div className="dashboard-shadow-floating flex h-full flex-col justify-between overflow-hidden rounded-[32px] border border-slate-200/90 bg-white p-6">
            <div>
              <Link
                className="group/record mb-5 flex min-h-11 cursor-pointer items-center justify-between rounded-2xl bg-[#0a4470] px-4 text-xs font-extrabold text-white shadow-md shadow-sky-900/20 transition hover:bg-[#001d39] hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#51c2ff] motion-safe:hover:-translate-y-0.5"
                href={`/pacientes/${selectedPatient.id}`}
              >
                Ver expediente completo
                <Icon name="arrow" className="size-4 transition-transform duration-200 motion-safe:group-hover/record:translate-x-0.5" />
              </Link>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-500">
                  Resumen del paciente
                </span>
                <SectionArrow
                  label="Ver mediciones del paciente"
                  onClick={() => scrollToSection("historial")}
                />
              </div>
              <div className="mt-3 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-black leading-tight text-slate-900">
                    {selected.name}
                  </h2>
                  <span className="mt-2 inline-flex rounded-full bg-[#0a4470] px-3 py-1 text-[11px] font-bold text-white shadow-sm">
                    {selected.badge}
                  </span>
                </div>
                <button
                  onClick={openWhatsApp}
                  disabled={!selectedPatient?.consentGranted}
                  title="Abrir WhatsApp; no envía mensajes automáticamente"
                  aria-label={`Abrir WhatsApp de ${selected.name}`}
                  className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#001d39] text-white shadow-md"
                  type="button"
                >
                  <Icon name="chat" className="size-5" />
                </button>
              </div>
              <div className="patient-vitals-panel relative my-5 flex flex-col items-center overflow-hidden rounded-3xl border border-[#8fcbe8] bg-[#e5f3fa] p-4">
                <svg
                  aria-hidden="true"
                  className="absolute inset-0 h-full w-full"
                  preserveAspectRatio="none"
                  viewBox="0 0 300 120"
                >
                  <circle cx="18" cy="18" fill="#51a9d5" opacity=".2" r="38" />
                  <circle cx="286" cy="106" fill="#0a4470" opacity=".12" r="52" />
                  <path className="patient-vitals-trace" d="M0 91 C58 70 95 107 151 82 S245 54 300 69" fill="none" opacity=".28" pathLength="100" stroke="#1c7fb0" strokeDasharray="5 7" strokeWidth="2" />
                  <path d="M258 18h12M264 12v12M33 98h10M38 93v10" opacity=".35" stroke="#0a4470" strokeLinecap="round" strokeWidth="2" />
                </svg>
                <span className="patient-avatar relative z-10 grid size-20 place-items-center rounded-full border-4 border-[#51a9d5] bg-white font-mono text-2xl font-extrabold text-[#0a4470] shadow-md">
                  {selected.initials}
                </span>
                <div className="relative z-10 mt-2.5 flex flex-wrap justify-center gap-2">
                  <span className="patient-vital-chip rounded-full border border-[#9fd1ea] bg-white px-3 py-1 text-xs font-bold text-slate-800 shadow-sm">
                    <i className="mr-1.5 inline-block size-2 rounded-full bg-rose-500 motion-safe:animate-pulse" />
                    {selected.glucose}
                  </span>
                  <span className="patient-vital-chip rounded-full border border-[#9fd1ea] bg-white px-3 py-1 text-xs font-bold text-slate-800 shadow-sm">
                    <i className="mr-1.5 inline-block size-2 rounded-full bg-amber-500" />
                    {selected.bloodPressure}
                  </span>
                </div>
                <span
                  className={`dashboard-priority-badge relative z-10 mt-2 rounded-full border px-3 py-1 text-[11px] font-bold ${toneStyles[selected.tone]}`}
                >
                  {selected.risk}
                </span>
              </div>
              <section>
                <h3 className="text-xs font-bold tracking-wide text-slate-900">
                  Motivos de prioridad actual
                </h3>
                <p className="mt-1.5 text-xs font-normal leading-relaxed text-slate-500">
                  {selected.summary}
                </p>
                <p className="mt-1.5 text-xs font-normal leading-relaxed text-slate-500">
                  {selectedPatient
                    ? `${selectedPatient.risk.ruleVersion} · ${dateTime(selectedPatient.risk.evaluatedAt, data.timezone)}`
                    : "Sin evaluación disponible"}
                </p>
                <p className="mt-1.5 text-xs font-normal leading-relaxed text-slate-500">
                  Glucosa:{" "}
                  {measurementDescription(
                    selectedPatient?.latestGlucose ?? null,
                    data.timezone,
                  )}
                  <br />
                  Presión:{" "}
                  {measurementDescription(
                    selectedPatient?.latestBloodPressure ?? null,
                    data.timezone,
                  )}
                </p>
                <button
                  className="mt-1 cursor-pointer text-xs font-bold text-sky-700 hover:text-[#0a4470]"
                  onClick={() => {
                    setDays(90);
                    scrollToSection("historial");
                  }}
                  type="button"
                >
                  Ver historial de 90 días →
                </button>
              </section>
              <section
                id="historial"
                className="mt-4 border-t border-slate-100 pt-3"
              >
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-900">
                    Tendencia histórica
                  </h3>
                  <div className="flex rounded-full bg-slate-100 p-0.5 text-[10px] font-bold text-slate-500">
                    {[7, 14, 30, 90].map((period) => (
                      <button
                        key={period}
                        type="button"
                        aria-pressed={days === period}
                        onClick={() => setDays(period)}
                        className={
                          days === period
                            ? "cursor-pointer rounded-full bg-white px-2 py-0.5 text-[#001d39] shadow-sm"
                            : "cursor-pointer rounded-full px-2 py-0.5 transition hover:bg-sky-100 hover:text-[#0a4470]"
                        }
                      >
                        {period}d
                      </button>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200/70 bg-[#f8f9fc] p-3">
                  <div className="mb-1 flex justify-between text-[9px] font-semibold">
                    <span className="text-sky-700">● Ayuno (mg/dL)</span>
                    <span className="text-rose-600">● Sist. (mmHg)</span>
                    <span className="text-emerald-600">● Diast. (mmHg)</span>
                  </div>
                  <svg
                    aria-label={
                      chart.hasData
                        ? "Lecturas observadas de glucosa en ayuno y presión arterial"
                        : "Sin mediciones para este periodo"
                    }
                    className="h-20 w-full"
                    preserveAspectRatio="none"
                    role="img"
                    viewBox="0 0 320 80"
                  >
                    {chart.series.map((series, index) => (
                      <g key={index}>
                        <path
                          d={series.path}
                          fill="none"
                          stroke={["#1c7fb0", "#e2525c", "#10b981"][index]}
                          strokeWidth="2"
                        />
                        {series.points.map((point, pointIndex) => (
                          <circle
                            key={pointIndex}
                            cx={point.x}
                            cy={point.y}
                            r="2"
                            fill={["#1c7fb0", "#e2525c", "#10b981"][index]}
                          >
                            <title>
                              {point.value} ·{" "}
                              {dateTime(point.observedAt, data.timezone)}
                            </title>
                          </circle>
                        ))}
                      </g>
                    ))}
                    {!chart.hasData ? (
                      <text
                        x="160"
                        y="42"
                        textAnchor="middle"
                        fontSize="12"
                        fill="#64748b"
                      >
                        Sin datos
                      </text>
                    ) : null}
                  </svg>
                  <div className="font-mono-data flex justify-between border-t border-slate-200/50 pt-1 text-[9px] text-slate-400">
                    <span>
                      {dateTime(chart.start, data.timezone).split(",")[0]}
                    </span>
                    <span>
                      {chart.hasData
                        ? `${chart.minimum}–${chart.maximum}`
                        : "Sin lecturas"}
                    </span>
                    <strong className="text-rose-600">
                      {dateTime(chart.end, data.timezone).split(",")[0]}
                    </strong>
                  </div>
                </div>
              </section>
              <section
                id="adherencia"
                className="mt-3.5 border-t border-slate-100 pt-3"
              >
                <div className="mb-2 flex justify-between">
                  <h3 className="text-xs font-bold text-slate-900">
                    Adherencia farmacológica
                  </h3>
                  <span className="text-[10px] font-semibold text-slate-400">
                    {percent(
                      selectedPatient?.adherence.confirmedAdherencePct ?? null,
                    )}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {medicines
                    .map((medicine) => ({
                      id: medicine.code,
                      name: medicine.name,
                      detail: medicine.detail + " · " + medicine.status,
                      status: medicine.value,
                      alert: false,
                    }))
                    .map((item) => (
                      <article
                        className={`flex items-center justify-between rounded-xl border p-2.5 ${item.alert ? "border-rose-200 bg-rose-50/40" : "border-slate-100 bg-slate-50/70"}`}
                        key={item.id}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`size-2 shrink-0 rounded-full ${item.alert ? "bg-red-500 motion-safe:animate-pulse" : "bg-emerald-500"}`}
                          />
                          <div>
                            <p className="text-xs font-bold text-slate-800">
                              {item.name}
                            </p>
                            <p
                              className={`text-[10px] ${item.alert ? "font-medium text-rose-600" : "text-slate-400"}`}
                            >
                              {item.detail}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`font-mono-data rounded-full border px-2 py-0.5 text-[9px] font-bold ${item.alert ? "border-rose-200 bg-rose-50 text-rose-600" : "border-emerald-200 bg-emerald-50 text-emerald-600"}`}
                        >
                          {item.status}
                        </span>
                      </article>
                    ))}
                </div>
              </section>
              <p className="mt-2 text-center text-[11px] font-medium text-slate-400">
                {unitName} ·{" "}
                <Link href="/consultorios" title="Cambiar consultorio">
                  {room.name}
                </Link>{" "}
                · {dateTime(data.generatedAt, data.timezone)}
              </p>
            </div>
          </div>
          )}
        </aside>
      </div>
    </div>
  );
}
