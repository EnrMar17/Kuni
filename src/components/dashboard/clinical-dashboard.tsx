"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

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

type Room = { name: string; doctor: { fullName: string } };

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

export function ClinicalDashboard({
  room,
  unitName,
  data,
}: {
  room: Room;
  unitName: string;
  data: DashboardData;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(
    data.patients[0]?.id ?? null,
  );
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState<
    "all" | "high" | "medium" | "unknown" | "low"
  >("all");
  const [order, setOrder] = useState<"risk" | "name">("risk");
  const [days, setDays] = useState(30);
  const selectedPatient =
    data.patients.find((patient) => patient.id === selectedId) ??
    data.patients[0] ??
    null;
  const selected = presentPatient(selectedPatient, data.timezone);
  const filteredPatients = useMemo(
    () =>
      filterPatients(data.patients, query, priority, order).map((patient) =>
        presentPatient(patient, data.timezone),
      ),
    [data.patients, data.timezone, query, priority, order],
  );
  const doctorFirstName = room.doctor.fullName
    .replace(/^Dr(a)?\.\s*/, "")
    .split(" ")[0];
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
  const recentInteraction = selectedPatient?.interactions[0] ?? null;
  const interactionNames: Record<string, string> = {
    medication: "Confirmación de medicamento",
    measurement: "Solicitud de medición",
    appointment: "Recordatorio de cita",
    nonresponse_summary: "Resumen de seguimiento",
  };
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
    <div className="relative w-full max-w-[1480px] overflow-hidden rounded-[36px] border border-slate-200/70 bg-[#f7f8fc] p-4 shadow-2xl md:p-8">
      <ClinicalHeader
        context={{
          unitName,
          roomName: room.name,
          doctorName: room.doctor.fullName,
        }}
        data={data}
      />

      <section className="mb-6 mt-5 flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 lg:text-4xl">
            Hola, {doctorFirstName}
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
            className="flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white px-5 py-2.5 text-xs font-semibold text-slate-700 shadow-sm md:text-sm"
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
            className="rounded-full border border-slate-200/80 bg-white px-5 py-2.5 text-xs font-semibold text-slate-700 shadow-sm md:text-sm"
            onClick={() => setOrder(order === "risk" ? "name" : "risk")}
            type="button"
          >
            {order === "risk" ? "Orden: prioridad" : "Orden: nombre"}
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-7 lg:grid-cols-12">
        <div className="flex flex-col gap-7 lg:col-span-8">
          <section
            id="metricas"
            aria-label="Métricas clínicas"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            <article className="dashboard-shadow-soft flex min-h-[140px] flex-col justify-between rounded-3xl border border-slate-100 bg-white p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">
                  Glucosa en ayuno
                </span>
                <span className="grid size-8 place-items-center rounded-full bg-indigo-50 text-indigo-600">
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
                  <span className="font-mono-data text-2xl font-extrabold text-slate-900">
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
                  <span className="font-mono-data text-2xl font-extrabold text-[#e2525c]">
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
            <article className="dashboard-shadow-soft flex min-h-[140px] flex-col justify-between rounded-3xl border border-slate-100 bg-white p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">
                  Adherencia confirmada
                </span>
                <span className="grid size-8 place-items-center rounded-full bg-sky-50 text-sky-500">
                  <Icon name="chat" />
                </span>
              </div>
              <div className="my-3 h-5 overflow-hidden rounded-full bg-slate-100 p-0.5">
                <div
                  className="h-full rounded-full bg-sky-400"
                  style={{
                    width: `${data.metrics.adherence.confirmedAdherencePct ?? 0}%`,
                  }}
                />
              </div>
              <div>
                <p className="font-mono-data text-2xl font-extrabold text-slate-900">
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
              className="group flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-slate-300 p-5 text-center transition hover:border-indigo-400 hover:bg-indigo-50/30 motion-safe:hover:-translate-y-0.5"
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
              className="dashboard-shadow-soft rounded-3xl border border-slate-100 bg-white p-5 md:col-span-5"
            >
              <div className="mb-1 flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-900">
                  Pacientes del consultorio
                </h2>
                <SectionArrow
                  label="Ver pacientes cargados"
                  onClick={selectCensus}
                />
              </div>
              <p className="mb-4 text-xs font-medium text-slate-400">
                {data.metrics.activePatients} pacientes
                {data.hasMorePatients
                  ? " · Lista parcial; hay más pacientes"
                  : ""}
              </p>
              <div className="flex flex-col gap-2.5">
                {filteredPatients.length ? (
                  filteredPatients.map((patient) => {
                    const active = patient.id === selected.id;
                    return (
                      <button
                        aria-pressed={active}
                        className={`flex w-full items-center justify-between rounded-2xl border p-3 text-left transition ${active ? "border-indigo-200 bg-indigo-50/50" : "border-slate-100 bg-slate-50/60 hover:bg-slate-100/80"}`}
                        key={patient.id}
                        onClick={() => setSelectedId(patient.id)}
                        type="button"
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <span
                            className={`grid size-10 shrink-0 place-items-center rounded-full text-xs font-bold ${toneStyles[patient.tone]}`}
                          >
                            {patient.initials}
                          </span>
                          <span className="min-w-0 leading-tight">
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
                            <span className="font-mono-data mt-0.5 block text-[11px] font-semibold text-rose-600">
                              {patient.reading}
                            </span>
                            <span className="block text-[10px] text-slate-400">
                              {patient.location}
                            </span>
                          </span>
                        </span>
                        <span className="grid size-7 shrink-0 place-items-center rounded-full border border-slate-200/50 bg-white text-slate-400">
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
              className="dashboard-shadow-soft rounded-3xl border border-slate-100 bg-white p-5 md:col-span-7"
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
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {medicines.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    Sin recetas vigentes registradas.
                  </p>
                ) : null}
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
            </section>
          </div>

          <section
            id="citas"
            className="dashboard-shadow-soft flex flex-col gap-4 rounded-3xl border border-slate-100 bg-white p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="grid size-8 place-items-center rounded-full bg-indigo-50 text-indigo-600">
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
                      <Icon name="clock" className="size-3.5 text-indigo-600" />
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
          <div className="dashboard-shadow-floating flex h-full flex-col justify-between overflow-hidden rounded-[32px] border border-slate-200/90 bg-white p-6">
            <div>
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
                  <span className="mt-2 inline-flex rounded-full bg-indigo-500 px-3 py-1 text-[11px] font-bold text-white shadow-sm">
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
              <div className="relative my-5 flex flex-col items-center overflow-hidden rounded-3xl border border-indigo-50 bg-gradient-to-b from-indigo-50/60 to-purple-50/40 p-4">
                <svg
                  aria-hidden="true"
                  className="absolute inset-0 h-full w-full opacity-40"
                  preserveAspectRatio="none"
                  viewBox="0 0 300 120"
                ></svg>
                <span className="relative z-10 grid size-20 place-items-center rounded-full border-4 border-rose-100 bg-white font-mono text-2xl font-extrabold text-slate-700 shadow-md">
                  {selected.initials}
                </span>
                <div className="relative z-10 mt-2.5 flex flex-wrap justify-center gap-2">
                  <span className="rounded-full border border-slate-100 bg-white/90 px-3 py-1 text-xs font-bold text-slate-800 shadow-sm">
                    <i className="mr-1.5 inline-block size-2 rounded-full bg-rose-500 motion-safe:animate-pulse" />
                    {selected.glucose}
                  </span>
                  <span className="rounded-full border border-slate-100 bg-white/90 px-3 py-1 text-xs font-bold text-slate-800 shadow-sm">
                    <i className="mr-1.5 inline-block size-2 rounded-full bg-amber-500" />
                    {selected.bloodPressure}
                  </span>
                </div>
                <span
                  className={`relative z-10 mt-2 rounded-full border px-3 py-1 text-[11px] font-bold ${toneStyles[selected.tone]}`}
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
                  className="mt-1 text-xs font-bold text-indigo-600 hover:text-indigo-800"
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
                            ? "rounded-full bg-white px-2 py-0.5 text-[#001d39] shadow-sm"
                            : "px-2 py-0.5"
                        }
                      >
                        {period}d
                      </button>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200/70 bg-[#f8f9fc] p-3">
                  <div className="mb-1 flex justify-between text-[9px] font-semibold">
                    <span className="text-indigo-700">● Ayuno (mg/dL)</span>
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
                          stroke={["#6366f1", "#e2525c", "#10b981"][index]}
                          strokeWidth="2"
                        />
                        {series.points.map((point, pointIndex) => (
                          <circle
                            key={pointIndex}
                            cx={point.x}
                            cy={point.y}
                            r="2"
                            fill={["#6366f1", "#e2525c", "#10b981"][index]}
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
              <section
                id="interacciones"
                className="mt-3.5 border-t border-slate-100 pt-3"
              >
                <div className="mb-2 flex justify-between">
                  <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Interacción reciente WhatsApp
                  </h3>
                  <span className="font-mono-data text-[10px] text-slate-400">
                    {dateTime(
                      recentInteraction?.scheduledAt ?? null,
                      data.timezone,
                    )}
                  </span>
                </div>
                <div className="flex flex-col gap-2 text-xs">
                  <p className="max-w-[85%] self-start rounded-2xl rounded-tl-sm border border-slate-200/60 bg-slate-100 px-3 py-2 text-slate-800">
                    {recentInteraction
                      ? `${interactionNames[recentInteraction.kind] ?? "Interacción"} · ${recentInteraction.replyCode}`
                      : "Sin interacciones registradas."}
                  </p>
                  <p className="max-w-[88%] self-end rounded-2xl rounded-tr-sm border border-emerald-200/80 bg-emerald-50 px-3 py-2 text-slate-800">
                    {recentInteraction && !recentInteraction.expectsResponse
                      ? "Aviso informativo; no requiere respuesta"
                      : recentInteraction?.medicationTaken === true
                        ? "Toma confirmada"
                        : recentInteraction?.medicationTaken === false
                          ? "El paciente reportó que no tomó la dosis"
                          : recentInteraction?.responseAt
                            ? "Respuesta registrada"
                            : "Sin respuesta registrada"}
                  </p>
                  <p className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-2.5 py-1.5 text-[10px] font-bold text-[#e2525c]">
                    <Icon name="alert" className="size-3.5 shrink-0" />
                    {selectedPatient?.alerts.length
                      ? selectedPatient.alerts
                          .map(
                            (alert) =>
                              `${alert.title} · ${dateTime(alert.createdAt, data.timezone)}`,
                          )
                          .join("; ")
                      : "Sin alertas activas registradas"}{" "}
                    · No respuestas pendientes:{" "}
                    {selectedPatient?.nonresponse.pending ?? 0} · Históricas:{" "}
                    {selectedPatient?.nonresponse.historical ?? 0}
                  </p>
                </div>
              </section>
              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 text-xs font-medium text-slate-600">
                <span className="flex items-center gap-1.5">
                  <Icon name="calendar" className="size-4 text-indigo-500" />
                  {selected.time}
                </span>
                <span className="flex items-center gap-1.5">
                  <Icon name="clock" className="size-4 text-emerald-500" />
                  Última respuesta: {selected.time}
                </span>
              </div>
            </div>
            <div className="mt-6">
              <button
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#001d39] py-3.5 text-sm font-bold text-white shadow-lg shadow-slate-900/10 hover:bg-slate-900"
                onClick={openWhatsApp}
                disabled={!selectedPatient?.consentGranted}
                title={
                  selectedPatient?.consentGranted
                    ? "Abre WhatsApp para contacto manual"
                    : "Se requiere paciente y consentimiento vigente"
                }
                type="button"
              >
                <Icon name="chat" className="size-4 text-emerald-400" />
                Abrir WhatsApp
              </button>
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                <button
                  className="rounded-xl bg-rose-500 px-2 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-rose-600"
                  onClick={() => router.push("/alertas")}
                  title="Abre las alertas activas para documentar la urgencia"
                  type="button"
                >
                  Citar a urgencias
                </button>
                <button
                  className="rounded-xl border border-indigo-200 bg-indigo-50 px-2 py-2.5 text-xs font-bold text-indigo-700 shadow-sm transition hover:bg-indigo-100"
                  onClick={() => selectedPatient && router.push(`/pacientes/${selectedPatient.id}`)}
                  title="Abre la ficha del paciente para ajustar el tratamiento"
                  type="button"
                >
                  Ajustar dosis
                </button>
              </div>
              <button
                className="mx-auto mt-3 flex items-center gap-1 text-[11px] font-semibold text-slate-400 transition hover:text-emerald-700"
                onClick={() => startRefresh(() => router.refresh())}
                disabled={refreshing}
                type="button"
              >
                <Icon name="chat" className="size-3.5 text-emerald-600" />
                {refreshing ? "Actualizando…" : "Actualizar datos"}
              </button>
              <p className="mt-2 text-center text-[11px] font-medium text-slate-400">
                {unitName} ·{" "}
                <Link href="/consultorios" title="Cambiar consultorio">
                  {room.name}
                </Link>{" "}
                · {dateTime(data.generatedAt, data.timezone)}
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
