"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { logout } from "@/actions/auth";
import type { DashboardData } from "@/lib/domain/dashboard";
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


export type ClinicalTopBarContext = { unitName: string; roomName: string; doctorName: string };
export function ClinicalHeader({ context, data }: { context: ClinicalTopBarContext; data: DashboardData }) {
 const pathname = usePathname();
 const router = useRouter();
 const room = { name: context.roomName, doctor: { fullName: context.doctorName } };
 const active = (path: string) => pathname === path || pathname.startsWith(path + "/");
 const navClass = (path: string) => "clinical-nav-link " + (active(path) ? "clinical-nav-active" : "");
 return (      <header className="clinical-header">
        <Link aria-label="Ir al dashboard" className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-md shadow-indigo-200" href="/dashboard"><Icon name="heart" className="size-7" /></Link>
          <nav aria-label="Navegación principal" className="flex w-fit max-w-full justify-self-center items-center gap-1.5 overflow-x-auto rounded-full border border-slate-100 bg-white p-1.5 shadow-sm">
            <Link className={navClass("/dashboard")} aria-current={active("/dashboard") ? "page" : undefined} href="/dashboard"><Icon name="grid" />Dashboard</Link>
            <Link className={navClass("/pacientes")} aria-current={active("/pacientes") ? "page" : undefined} href="/pacientes"><Icon name="users" className="size-4 text-slate-400" /><span className="2xl:hidden">Pacientes</span><span className="hidden 2xl:inline">Pacientes / Censo</span></Link>
            <Link className={navClass("/alertas")} aria-current={active("/alertas") ? "page" : undefined} href="/alertas"><Icon name="alert" className="size-4 text-slate-400" /><span className="2xl:hidden">Triaje</span><span className="hidden 2xl:inline">Triaje crítico</span><span className="font-mono-data rounded-full border border-rose-200 bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">{data.metrics.highRiskPatients}</span></Link>
            <Link className={navClass("/citas")} aria-current={active("/citas") ? "page" : undefined} href="/citas"><Icon name="calendar" className="size-4 text-slate-400" /><span className="2xl:hidden">Citas</span><span className="hidden 2xl:inline">Próximas citas</span><span className="font-mono-data rounded-full border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">{data.appointments.length}</span></Link>
            <Link className={navClass("/estadisticas")} aria-current={active("/estadisticas") ? "page" : undefined} href="/estadisticas"><Icon name="chart" />Estadísticas</Link>
          </nav>
        <div className="flex shrink-0 items-center gap-3">
          <button onClick={() => router.push("/alertas")} aria-label="Revisar alertas del paciente" className="relative grid size-11 place-items-center rounded-full border border-slate-200/70 bg-white text-slate-600 shadow-sm" type="button"><Icon name="bell" className="size-5" />{data.alerts.length > 0 ? <span className="absolute right-2 top-2 size-2.5 animate-pulse rounded-full bg-[#e2525c] ring-2 ring-white" /> : null}</button>
          <button onClick={() => router.push("/dashboard#interacciones")} aria-label="Historial de interacciones" className="grid size-11 place-items-center rounded-full border border-slate-200/70 bg-white text-emerald-600 shadow-sm" type="button"><Icon name="chat" className="size-5" /></button>
          <Link href="/consultorios" title="Cambiar consultorio" className="hidden items-center gap-3 rounded-full border border-slate-200/80 bg-white py-1.5 pl-2 pr-4 shadow-sm sm:flex">
            <div className="grid size-9 place-items-center rounded-full bg-slate-200 text-xs font-bold text-slate-700">{room.doctor.fullName.split(" ").filter((part) => !part.includes(".")).slice(0, 2).map((part) => part[0]).join("")}</div>
            <div className="leading-tight"><p className="text-xs font-bold text-slate-800">{room.doctor.fullName}</p><p className="text-[10px] font-medium text-slate-400">{room.name}</p></div>
          </Link>
          <form action={logout}><button className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50" type="submit">Salir</button></form>
        </div>
      </header>);
}
