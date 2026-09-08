"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { logout } from "@/actions/auth";
import type { ConsultingRoomFixture } from "@/lib/queries/fixtures";

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

type Patient = {
  id: string;
  initials: string;
  name: string;
  shortName: string;
  location: string;
  reading: string;
  glucose: string;
  bloodPressure: string;
  badge: string;
  risk: string;
  summary: string;
  time: string;
  tone: "rose" | "amber" | "slate" | "violet";
};

const patients: Patient[] = [
  {
    id: "maria-vargas",
    initials: "MV",
    name: "María Elena Vargas",
    shortName: "María Elena Vargas",
    location: "Morelia, Col. Ventura",
    reading: "278 mg/dL · 168/104",
    glucose: "278 mg/dL",
    bloodPressure: "168/104 mmHg",
    badge: "DM2 descontrolada + HTA",
    risk: "Riesgo 7d: 87%",
    summary:
      "Paciente de 61 años. Reporta 278 mg/dL de glucosa en ayuno y 168/104 mmHg con cefalea matutina. Confirmó toma de losartán hace 2 horas.",
    time: "Hoy, 07:15 AM",
    tone: "rose",
  },
  {
    id: "jose-ramirez",
    initials: "JR",
    name: "José Guadalupe Ramírez",
    shortName: "José Guadalupe R.",
    location: "Uruapan, La Cedrera",
    reading: "182/110 mmHg · HTA",
    glucose: "142 mg/dL",
    bloodPressure: "182/110 mmHg",
    badge: "Crisis hipertensiva grado 2",
    risk: "Atención prioritaria",
    summary:
      "Paciente de 68 años. Reporta 182/110 mmHg con visión borrosa y acúfenos. Refiere olvido de dosis nocturna de enalapril.",
    time: "Hoy, 08:30 AM",
    tone: "amber",
  },
  {
    id: "agustin-cardenas",
    initials: "AC",
    name: "Agustín Cárdenas Torres",
    shortName: "Agustín Cárdenas",
    location: "Pátzcuaro, Centro",
    reading: "Sin reporte · 4 días",
    glucose: "Sin reporte",
    bloodPressure: "Últ. 140/90",
    badge: "Sin reporte durante 4 días",
    risk: "Seguimiento pendiente",
    summary:
      "No responde a recordatorios automáticos de WhatsApp desde el jueves. Tiene registrado un esquema combinado de insulina NPH.",
    time: "Hace 4 días",
    tone: "slate",
  },
  {
    id: "rosa-guzman",
    initials: "RG",
    name: "Rosa Isela Guzmán",
    shortName: "Rosa Isela Guzmán",
    location: "Zitácuaro, San Juan",
    reading: "58 mg/dL · Hipoglucemia",
    glucose: "58 mg/dL",
    bloodPressure: "122/78 mmHg",
    badge: "Hipoglucemia capilar",
    risk: "Alerta activa",
    summary:
      "Paciente de 72 años. Registró 58 mg/dL con diaforesis y debilidad general. Un familiar confirmó ingesta de jugo azucarado.",
    time: "Hoy, 06:40 AM",
    tone: "violet",
  },
];

const toneStyles = {
  rose: "bg-rose-100 text-rose-700",
  amber: "bg-amber-100 text-amber-700",
  slate: "bg-slate-200 text-slate-700",
  violet: "bg-violet-100 text-violet-700",
} as const;

const medicines = [
  { code: "01", name: "Metformina", detail: "850 mg / Oral", status: "95% cumplido", value: "95%", tone: "emerald", shape: "rounded-lg bg-amber-200" },
  { code: "02", name: "Losartán", detail: "50 mg / 12 hrs", status: "40% · Abandono", value: "40%", tone: "rose", shape: "rounded-full bg-rose-400" },
  { code: "03", name: "Insulina Glarg.", detail: "100 UI / Pen", status: "90% cumplido", value: "90%", tone: "emerald", shape: "rounded-full bg-sky-300" },
  { code: "04", name: "Tiras glucosa", detail: "50 pzas / Sensor", status: "Stock: 2 días", value: "Stock", tone: "amber", shape: "rounded-md bg-emerald-300" },
  { code: "05", name: "Amlodipino", detail: "5 mg / 24 hrs", status: "92% cumplido", value: "92%", tone: "emerald", shape: "rounded-t-lg bg-rose-200" },
  { code: "06", name: "Enalapril", detail: "10 mg / Noche", status: "Stock óptimo", value: "Stock", tone: "slate", shape: "rounded-md bg-amber-300" },
] as const;

const appointments = [
  { initials: "MV", name: "María Elena Vargas", reason: "Control glucémico y ajuste terapéutico", time: "Hoy, 10:30 AM", channel: "Teleconsulta RPM", status: "Confirmada vía bot", tone: "rose" },
  { initials: "JR", name: "José Guadalupe R.", reason: "Evaluación de crisis hipertensiva", time: "Hoy, 12:00 PM", channel: "Presencial · Cons. 3", status: "Pendiente", tone: "amber" },
  { initials: "CM", name: "Carlos Mendoza", reason: "Revisión de laboratorio trimestral", time: "Mañana, 09:15 AM", channel: "Presencial · Cons. 1", status: "Confirmada vía bot", tone: "sky" },
] as const;

const iconPaths: Record<IconName, React.ReactNode> = {
  alert: <><path d="M12 9v2m0 4h.01"/><path d="M5.1 19h13.8a2 2 0 0 0 1.73-3L13.73 4a2 2 0 0 0-3.46 0L3.37 16a2 2 0 0 0 1.73 3Z"/></>,
  arrow: <path d="m7 17 10-10m0 0H7m10 0v10"/>,
  bell: <><path d="M15 17H5l1.4-1.4A2 2 0 0 0 7 14.2V11a5 5 0 0 1 10 0v3.2a2 2 0 0 0 .6 1.4L19 17h-4"/><path d="M14 17v1a2 2 0 0 1-4 0v-1"/></>,
  calendar: <><path d="M8 3v4m8-4v4M5 10h14"/><rect x="4" y="5" width="16" height="16" rx="2"/></>,
  chart: <><path d="M5 20V10m7 10V4m7 16v-7"/><path d="M3 20h18"/></>,
  chat: <path d="M21 12a8 8 0 0 1-8.5 8 9.6 9.6 0 0 1-4.2-1L3 20l1.4-3.7A7.3 7.3 0 0 1 3 12a8.4 8.4 0 0 1 9-8 8.4 8.4 0 0 1 9 8Z"/>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  filter: <path d="M4 5h16l-6.5 7v5L10 20v-8Z"/>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  heart: <><path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3C14.7 3 13.5 3.5 12 5 10.5 3.5 9.3 3 7.5 3A5.5 5.5 0 0 0 2 8.5C2 10.8 3.5 12.5 5 14l7 7Z"/><path d="M12 9v4m-2-2h4"/></>,
  plus: <path d="M12 4v16m8-8H4"/>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  users: <><path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 20v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></>,
};

function Icon({ name, className = "size-4" }: { name: IconName; className?: string }) {
  return <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">{iconPaths[name]}</svg>;
}

function SectionArrow({ label }: { label: string }) {
  return <button aria-label={label} className="grid size-7 place-items-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200" type="button"><Icon name="arrow" className="size-3.5" /></button>;
}

export function ClinicalDashboard({ room }: { room: ConsultingRoomFixture }) {
  const [selectedId, setSelectedId] = useState(patients[0].id);
  const [query, setQuery] = useState("");
  const selected = patients.find((patient) => patient.id === selectedId) ?? patients[0];
  const filteredPatients = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("es");
    if (!normalized) return patients;
    return patients.filter((patient) => `${patient.name} ${patient.badge} ${patient.location}`.toLocaleLowerCase("es").includes(normalized));
  }, [query]);
  const doctorFirstName = room.doctor.fullName.replace(/^Dr(a)?\.\s*/, "").split(" ")[0];

  return (
    <div className="relative w-full max-w-[1480px] overflow-hidden rounded-[36px] border border-slate-200/70 bg-[#f7f8fc] p-4 shadow-2xl md:p-8">
      <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 border-b border-slate-200/50 pb-6">
        <Link aria-label="Ir al dashboard" className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-md shadow-indigo-200" href="/dashboard"><Icon name="heart" className="size-7" /></Link>
          <nav aria-label="Navegación principal" className="flex w-fit max-w-full justify-self-center items-center gap-1.5 overflow-x-auto rounded-full border border-slate-100 bg-white p-1.5 shadow-sm">
            <Link className="flex shrink-0 items-center gap-2 rounded-full bg-[#001d39] px-4 py-2.5 text-xs font-semibold text-white shadow-sm 2xl:px-5 2xl:text-sm" href="/dashboard"><Icon name="grid" />Dashboard</Link>
            <button className="flex shrink-0 items-center gap-2 rounded-full px-3 py-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 2xl:px-4 2xl:text-sm" type="button"><Icon name="users" className="size-4 text-slate-400" /><span className="2xl:hidden">Pacientes</span><span className="hidden 2xl:inline">Pacientes / Censo</span></button>
            <button className="flex shrink-0 items-center gap-2 rounded-full px-3 py-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 2xl:px-4 2xl:text-sm" type="button"><Icon name="alert" className="size-4 text-slate-400" /><span className="2xl:hidden">Triaje</span><span className="hidden 2xl:inline">Triaje crítico</span><span className="font-mono-data rounded-full border border-rose-200 bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">14</span></button>
            <button className="flex shrink-0 items-center gap-2 rounded-full px-3 py-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 2xl:px-4 2xl:text-sm" type="button"><Icon name="calendar" className="size-4 text-slate-400" /><span className="2xl:hidden">Citas</span><span className="hidden 2xl:inline">Próximas citas</span><span className="font-mono-data rounded-full border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">3</span></button>
          </nav>
        <div className="flex shrink-0 items-center gap-3">
          <button aria-label="Notificaciones" className="relative grid size-11 place-items-center rounded-full border border-slate-200/70 bg-white text-slate-600 shadow-sm" type="button"><Icon name="bell" className="size-5" /><span className="absolute right-2 top-2 size-2.5 animate-pulse rounded-full bg-[#e2525c] ring-2 ring-white" /></button>
          <button aria-label="Mensajería clínica" className="grid size-11 place-items-center rounded-full border border-slate-200/70 bg-white text-emerald-600 shadow-sm" type="button"><Icon name="chat" className="size-5" /></button>
          <div className="hidden items-center gap-3 rounded-full border border-slate-200/80 bg-white py-1.5 pl-2 pr-4 shadow-sm sm:flex">
            <div className="grid size-9 place-items-center rounded-full bg-slate-200 text-xs font-bold text-slate-700">{room.doctor.fullName.split(" ").filter((part) => !part.includes(".")).slice(0, 2).map((part) => part[0]).join("")}</div>
            <div className="leading-tight"><p className="text-xs font-bold text-slate-800">{room.doctor.fullName}</p><p className="text-[10px] font-medium text-slate-400">{room.name} · Demo</p></div>
          </div>
          <form action={logout}><button className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50" type="submit">Salir</button></form>
        </div>
      </header>

      <div className="mt-3 flex justify-center">
        <button className="flex items-center gap-2 rounded-full border border-indigo-100 bg-white px-4 py-2 text-xs font-bold text-indigo-700 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50" type="button">
          <Icon name="chart" className="size-4" />
          Estadísticas
          <span className="hidden border-l border-indigo-100 pl-2 font-medium text-slate-400 sm:inline">Indicadores de la unidad</span>
          <span aria-hidden="true" className="text-sm leading-none">→</span>
        </button>
      </div>

      <section className="mb-6 mt-5 flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
        <div><h1 className="text-3xl font-extrabold tracking-tight text-slate-900 lg:text-4xl">Hola, Dr. {doctorFirstName}</h1><p className="mt-1 text-base font-medium text-slate-500">Tienes <span className="font-mono-data text-lg font-bold text-[#e2525c]">14 pacientes</span> en estado crítico hoy</p></div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative min-w-[260px] flex-1 md:min-w-[320px]"><span className="sr-only">Buscar pacientes</span><input className="w-full rounded-full border border-slate-200/80 bg-white py-2.5 pl-5 pr-11 text-xs text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-[#001d39] md:text-sm" onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por paciente, CURP o expediente..." type="search" value={query}/><Icon name="search" className="absolute right-4 top-1/2 size-4 -translate-y-1/2 text-slate-400" /></label>
          <button className="flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white px-5 py-2.5 text-xs font-semibold text-slate-700 shadow-sm md:text-sm" type="button"><Icon name="filter" className="size-3.5 text-slate-500" />Filtrar</button>
          <button className="rounded-full border border-slate-200/80 bg-white px-5 py-2.5 text-xs font-semibold text-slate-700 shadow-sm md:text-sm" type="button">Ordenar</button>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-7 lg:grid-cols-12">
        <div className="flex flex-col gap-7 lg:col-span-8">
          <section aria-label="Métricas clínicas" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <article className="dashboard-shadow-soft flex min-h-[140px] flex-col justify-between rounded-3xl border border-slate-100 bg-white p-5"><div className="flex items-center justify-between"><span className="text-xs font-bold text-slate-500">Glucemia media</span><span className="grid size-8 place-items-center rounded-full bg-indigo-50 text-indigo-600"><Icon name="heart" /></span></div><svg aria-hidden="true" className="my-2.5 h-10 w-full" preserveAspectRatio="none" viewBox="0 0 200 40"><path d="M0 22Q25 24 45 14T95 10t50 18t55-12" fill="none" stroke="#818cf8" strokeLinecap="round" strokeWidth="3"/></svg><div><p><span className="font-mono-data text-2xl font-extrabold text-slate-900">138</span> <span className="text-[11px] font-bold text-slate-400">mg/dL</span></p><p className="mt-0.5 text-[10px] font-semibold text-emerald-600">↓ 4.2% <span className="text-slate-400">vs semana anterior</span></p></div></article>
            <article className="dashboard-shadow-soft flex min-h-[140px] flex-col justify-between rounded-3xl border border-slate-100 bg-white p-5"><div className="flex items-center justify-between"><span className="text-xs font-bold text-slate-500">Alertas críticas</span><span className="grid size-8 place-items-center rounded-full bg-red-50 text-[#e2525c]"><Icon name="alert" /></span></div><div className="my-2.5 flex h-10 items-end justify-between gap-1.5 px-1">{[4,7,3,9,5,8,4,6,5].map((height, index) => <span className="w-1.5 rounded-full bg-red-400" key={index} style={{ height: `${height * 4}px` }} />)}</div><div><p><span className="font-mono-data text-2xl font-extrabold text-[#e2525c]">14</span> <span className="text-[11px] font-bold text-slate-400">casos</span></p><p className="mt-0.5 truncate text-[10px] font-medium text-slate-400">Reglas personalizadas fuera de objetivo</p></div></article>
            <article className="dashboard-shadow-soft flex min-h-[140px] flex-col justify-between rounded-3xl border border-slate-100 bg-white p-5"><div className="flex items-center justify-between"><span className="text-xs font-bold text-slate-500">Adherencia bot</span><span className="grid size-8 place-items-center rounded-full bg-sky-50 text-sky-500"><Icon name="chat" /></span></div><div className="my-3 h-5 overflow-hidden rounded-full bg-slate-100 p-0.5"><div className="h-full w-[84.2%] rounded-full bg-sky-400" /></div><div><p className="font-mono-data text-2xl font-extrabold text-slate-900">84.2%</p><p className="font-mono-data mt-0.5 text-[10px] font-semibold text-slate-500">406 / 482 pacientes activos</p></div></article>
            <button className="group flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-slate-300 p-5 text-center transition hover:border-indigo-400 hover:bg-indigo-50/30" type="button"><span className="grid size-10 place-items-center rounded-full bg-[#001d39] text-white shadow-sm transition group-hover:scale-110"><Icon name="plus" className="size-5" /></span><span className="text-xs font-bold text-slate-700">Nueva alerta</span><span className="text-[10px] font-medium text-slate-400">Ingresar paciente</span></button>
          </section>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
            <section className="dashboard-shadow-soft rounded-3xl border border-slate-100 bg-white p-5 md:col-span-5"><div className="mb-1 flex items-center justify-between"><h2 className="text-base font-bold text-slate-900">Triaje inmediato</h2><SectionArrow label="Ver censo completo" /></div><p className="mb-4 text-xs font-medium text-slate-400">Casos descompensados o sin reporte</p><div className="flex flex-col gap-2.5">{filteredPatients.length ? filteredPatients.map((patient) => { const active = patient.id === selected.id; return <button aria-pressed={active} className={`flex w-full items-center justify-between rounded-2xl border p-3 text-left transition ${active ? "border-indigo-200 bg-indigo-50/50" : "border-slate-100 bg-slate-50/60 hover:bg-slate-100/80"}`} key={patient.id} onClick={() => setSelectedId(patient.id)} type="button"><span className="flex min-w-0 items-center gap-3"><span className={`grid size-10 shrink-0 place-items-center rounded-full text-xs font-bold ${toneStyles[patient.tone]}`}>{patient.initials}</span><span className="min-w-0 leading-tight"><span className="flex flex-wrap items-center gap-2"><strong className="truncate text-xs text-slate-900">{patient.shortName}</strong>{patient.id === patients[0].id ? <span className="rounded-full border border-rose-200 bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold text-rose-700">{patient.risk}</span> : null}</span><span className="font-mono-data mt-0.5 block text-[11px] font-semibold text-rose-600">{patient.reading}</span><span className="block text-[10px] text-slate-400">{patient.location}</span></span></span><span className="grid size-7 shrink-0 place-items-center rounded-full border border-slate-200/50 bg-white text-slate-400"><Icon name="arrow" className="size-3" /></span></button>; }) : <p className="rounded-2xl bg-slate-50 p-4 text-center text-xs text-slate-500">No encontramos pacientes con esa búsqueda.</p>}</div></section>

            <section className="dashboard-shadow-soft rounded-3xl border border-slate-100 bg-white p-5 md:col-span-7"><div className="mb-1 flex items-center justify-between"><h2 className="text-base font-bold text-slate-900">Esquemas y fármacos crónicos</h2><SectionArrow label="Ver catálogo" /></div><p className="mb-4 text-xs font-medium text-slate-400">Adherencia reportada y disponibilidad de recetas</p><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{medicines.map((medicine) => <article className="flex flex-col items-center rounded-2xl border border-slate-100 bg-slate-50/70 p-3 text-center transition hover:bg-slate-100/70" key={medicine.code}><div className="flex w-full items-center justify-between"><span className={`rounded-sm border px-1 text-[9px] font-bold ${medicine.tone === "emerald" ? "border-emerald-200 bg-emerald-50 text-emerald-600" : medicine.tone === "rose" ? "border-rose-200 bg-rose-50 text-rose-600" : "border-slate-200 bg-white text-slate-600"}`}>● {medicine.value}</span><span className="font-mono-data text-[10px] text-slate-400">{medicine.code}</span></div><div className="my-1 grid h-14 w-12 place-items-center"><span className={`h-10 w-7 border border-white/80 shadow-inner ${medicine.shape}`} /></div><h3 className="text-xs font-bold text-slate-800">{medicine.name}</h3><span className="text-[10px] font-medium text-slate-400">{medicine.detail}</span><span className={`mt-0.5 text-[9px] font-semibold ${medicine.tone === "rose" ? "text-rose-600" : medicine.tone === "emerald" ? "text-emerald-600" : "text-amber-600"}`}>{medicine.status}</span></article>)}</div><div className="flex items-center justify-center gap-1.5 pt-4"><span className="h-1.5 w-6 rounded-full bg-indigo-600"/><span className="size-1.5 rounded-full bg-slate-300"/><span className="size-1.5 rounded-full bg-slate-300"/></div></section>
          </div>

          <section className="dashboard-shadow-soft flex flex-col gap-4 rounded-3xl border border-slate-100 bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2.5"><span className="grid size-8 place-items-center rounded-full bg-indigo-50 text-indigo-600"><Icon name="calendar" /></span><div><h2 className="text-base font-bold text-slate-900">Próximas citas y teleconsultas</h2><p className="text-xs font-medium text-slate-400">Agendadas vía triaje y canal automatizado</p></div></div><span className="font-mono-data rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">3 citas para hoy</span></div><div className="grid grid-cols-1 gap-3 md:grid-cols-3">{appointments.map((appointment) => <article className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-3.5" key={appointment.name}><div className="flex items-start justify-between gap-2"><div className="flex items-center gap-2.5"><span className={`grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold ${appointment.tone === "rose" ? "bg-rose-100 text-rose-700" : appointment.tone === "amber" ? "bg-amber-100 text-amber-700" : "bg-sky-100 text-sky-700"}`}>{appointment.initials}</span><div><h3 className="text-xs font-bold leading-tight text-slate-900">{appointment.name}</h3><p className="mt-0.5 text-[10px] font-medium text-slate-500">{appointment.reason}</p></div></div><span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${appointment.status === "Pendiente" ? "border-amber-200 bg-amber-50 text-amber-600" : "border-emerald-200 bg-emerald-50 text-emerald-600"}`}>{appointment.status}</span></div><div className="flex items-center justify-between border-t border-slate-200/60 pt-2 text-[10px]"><strong className="font-mono-data flex items-center gap-1 text-[11px] text-slate-700"><Icon name="clock" className="size-3.5 text-indigo-600" />{appointment.time}</strong><span className="rounded-md border border-slate-200/60 bg-white px-2 py-0.5 font-semibold text-slate-500">{appointment.channel}</span></div></article>)}</div></section>
        </div>

        <aside className="lg:col-span-4">
          <div className="dashboard-shadow-floating flex h-full flex-col justify-between overflow-hidden rounded-[32px] border border-slate-200/90 bg-white p-6">
            <div><div className="flex items-center justify-between"><span className="text-sm font-semibold text-slate-500">Caso en revisión</span><SectionArrow label="Abrir expediente completo" /></div><div className="mt-3 flex items-start justify-between gap-3"><div><h2 className="text-2xl font-black leading-tight text-slate-900">{selected.name}</h2><span className="mt-2 inline-flex rounded-full bg-indigo-500 px-3 py-1 text-[11px] font-bold text-white shadow-sm">{selected.badge}</span></div><button aria-label={`Enviar mensaje a ${selected.name}`} className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#001d39] text-white shadow-md" type="button"><Icon name="chat" className="size-5" /></button></div>
              <div className="relative my-5 flex flex-col items-center overflow-hidden rounded-3xl border border-indigo-50 bg-gradient-to-b from-indigo-50/60 to-purple-50/40 p-4"><svg aria-hidden="true" className="absolute inset-0 h-full w-full opacity-40" preserveAspectRatio="none" viewBox="0 0 300 120"><path d="M0 95Q40 90 75 78t75-13t70-15t80-30" fill="none" stroke="#e2525c" strokeWidth="2.5"/></svg><span className="relative z-10 grid size-20 place-items-center rounded-full border-4 border-rose-100 bg-white font-mono text-2xl font-extrabold text-slate-700 shadow-md">{selected.initials}</span><div className="relative z-10 mt-2.5 flex flex-wrap justify-center gap-2"><span className="rounded-full border border-slate-100 bg-white/90 px-3 py-1 text-xs font-bold text-slate-800 shadow-sm"><i className="mr-1.5 inline-block size-2 animate-pulse rounded-full bg-rose-500"/>{selected.glucose}</span><span className="rounded-full border border-slate-100 bg-white/90 px-3 py-1 text-xs font-bold text-slate-800 shadow-sm"><i className="mr-1.5 inline-block size-2 rounded-full bg-amber-500"/>{selected.bloodPressure}</span></div><span className="relative z-10 mt-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-bold text-rose-700">{selected.risk}</span></div>
              <section><h3 className="text-xs font-bold tracking-wide text-slate-900">Resumen del reporte matutino</h3><p className="mt-1.5 text-xs font-normal leading-relaxed text-slate-500">{selected.summary}</p><button className="mt-1 text-xs font-bold text-indigo-600 hover:text-indigo-800" type="button">Ver historial de 30 días →</button></section>
              <section className="mt-4 border-t border-slate-100 pt-3"><div className="mb-2 flex items-center justify-between"><h3 className="text-xs font-bold text-slate-900">Tendencia histórica</h3><div className="flex rounded-full bg-slate-100 p-0.5 text-[10px] font-bold text-slate-500"><span className="px-2 py-0.5">7d</span><span className="px-2 py-0.5">14d</span><span className="rounded-full bg-white px-2 py-0.5 text-[#001d39] shadow-sm">30d</span></div></div><div className="rounded-2xl border border-slate-200/70 bg-[#f8f9fc] p-3"><div className="mb-1 flex justify-between text-[9px] font-semibold"><span className="text-indigo-700">● Glucosa</span><span className="text-rose-600">● PA sistólica</span><span className="text-emerald-600">Rango objetivo</span></div><svg aria-label="Tendencia ascendente de glucosa y presión arterial" className="h-20 w-full" preserveAspectRatio="none" role="img" viewBox="0 0 320 80"><rect fill="#dcfce7" height="26" opacity=".45" width="320" y="34"/><path d="M0 52Q40 48 80 50t80-8t80-12t80-20" fill="none" stroke="#6366f1" strokeWidth="2.2"/><path d="M0 58Q40 56 80 54t80-6t80-10t80-20" fill="none" stroke="#e2525c" strokeWidth="2"/></svg><div className="font-mono-data flex justify-between border-t border-slate-200/50 pt-1 text-[9px] text-slate-400"><span>Día 1</span><span>Día 10</span><span>Día 20</span><strong className="text-rose-600">Hoy</strong></div></div></section>
              <section className="mt-3.5 border-t border-slate-100 pt-3"><div className="mb-2 flex justify-between"><h3 className="text-xs font-bold text-slate-900">Adherencia farmacológica</h3><span className="text-[10px] font-semibold text-slate-400">Ficha individual</span></div><div className="flex flex-col gap-2">{[{ name: "Metformina 850 mg", detail: "Oral / 12 hrs · Última toma 06:00", status: "95% cumplido", alert: false }, { name: "Losartán 50 mg", detail: "Omisión frecuente de dosis matutina", status: "40% abandono", alert: true }, { name: "Insulina glargina", detail: "Apego regular nocturno", status: "90% cumplido", alert: false }].map((item) => <article className={`flex items-center justify-between rounded-xl border p-2.5 ${item.alert ? "border-rose-200 bg-rose-50/40" : "border-slate-100 bg-slate-50/70"}`} key={item.name}><div className="flex items-center gap-2"><span className={`size-2 shrink-0 rounded-full ${item.alert ? "animate-pulse bg-red-500" : "bg-emerald-500"}`}/><div><p className="text-xs font-bold text-slate-800">{item.name}</p><p className={`text-[10px] ${item.alert ? "font-medium text-rose-600" : "text-slate-400"}`}>{item.detail}</p></div></div><span className={`font-mono-data rounded-full border px-2 py-0.5 text-[9px] font-bold ${item.alert ? "border-rose-200 bg-rose-50 text-rose-600" : "border-emerald-200 bg-emerald-50 text-emerald-600"}`}>{item.status}</span></article>)}</div></section>
              <section className="mt-3.5 border-t border-slate-100 pt-3"><div className="mb-2 flex justify-between"><h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Interacción reciente bot WA</h3><span className="font-mono-data text-[10px] text-slate-400">07:12 AM</span></div><div className="flex flex-col gap-2 text-xs"><p className="max-w-[85%] self-start rounded-2xl rounded-tl-sm border border-slate-200/60 bg-slate-100 px-3 py-2 text-slate-800">¿Tomaste tu losartán hoy?</p><p className="max-w-[88%] self-end rounded-2xl rounded-tr-sm border border-emerald-200/80 bg-emerald-50 px-3 py-2 text-slate-800">Sí, pero me duele mucho la cabeza y veo borroso.</p><p className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-2.5 py-1.5 text-[10px] font-bold text-[#e2525c]"><Icon name="alert" className="size-3.5 shrink-0"/>Síntoma de alarma detectado automáticamente</p></div></section>
              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 text-xs font-medium text-slate-600"><span className="flex items-center gap-1.5"><Icon name="calendar" className="size-4 text-indigo-500"/>{selected.time}</span><span className="flex items-center gap-1.5"><Icon name="clock" className="size-4 text-emerald-500"/>Respuesta bot WA</span></div>
            </div>
            <div className="mt-6"><button className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#001d39] py-3.5 text-sm font-bold text-white shadow-lg shadow-slate-900/10 hover:bg-slate-900" type="button"><Icon name="chat" className="size-4 text-emerald-400"/>Contactar por WhatsApp</button><div className="mt-2.5 grid grid-cols-2 gap-2"><button className="rounded-xl bg-rose-500 px-2 py-2.5 text-xs font-bold text-white shadow-sm" type="button">Citar a urgencias</button><button className="rounded-xl border border-indigo-200 bg-indigo-50 px-2 py-2.5 text-xs font-bold text-indigo-700 shadow-sm" type="button">Ajustar dosis</button></div><button className="mx-auto mt-3 flex items-center gap-1 text-[11px] font-semibold text-slate-400 transition hover:text-emerald-700" type="button"><Icon name="chat" className="size-3.5 text-emerald-600" />Bot WhatsApp</button><p className="mt-2 text-center text-[11px] font-medium text-slate-400">SSM Telemetría · {room.name} · Datos ficticios</p></div>
          </div>
        </aside>
      </div>
    </div>
  );
}
