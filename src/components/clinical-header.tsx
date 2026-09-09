"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { logout } from "@/actions/auth";
import type { DashboardData } from "@/lib/domain/dashboard";
type IconName =
  | "alert"
  | "arrow"
  | "bell"
  | "calendar"
  | "chart"
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
 const notificationsRef = useRef<HTMLDetailsElement>(null);
 const room = { name: context.roomName, doctor: { fullName: context.doctorName } };
 const active = (path: string) => pathname === path || pathname.startsWith(path + "/");
 const navClass = (path: string) => "clinical-nav-link " + (active(path) ? "clinical-nav-active" : "");
 const doctorInitials = room.doctor.fullName.split(" ").filter((part) => !part.includes(".")).slice(0, 2).map((part) => part[0]).join("");

 useEffect(() => {
   const closeNotifications = (event: PointerEvent) => {
     const notifications = notificationsRef.current;
     if (notifications?.open && !notifications.contains(event.target as Node)) {
       notifications.open = false;
     }
   };
   const closeNotificationsWithEscape = (event: KeyboardEvent) => {
     if (event.key === "Escape" && notificationsRef.current?.open) {
       notificationsRef.current.open = false;
       notificationsRef.current.querySelector("summary")?.focus();
     }
   };

   document.addEventListener("pointerdown", closeNotifications);
   document.addEventListener("keydown", closeNotificationsWithEscape);
   return () => {
     document.removeEventListener("pointerdown", closeNotifications);
     document.removeEventListener("keydown", closeNotificationsWithEscape);
   };
 }, []);

 return (
      <header className="clinical-header">
        <Link aria-label="Ir al dashboard" className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white shadow-md shadow-sky-200 ring-1 ring-sky-100 transition motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-lg" href="/dashboard"><Image alt="Kuni" className="h-8 w-auto" height={530} src="/brand/kuni-mark.png" width={640} /></Link>
          <nav aria-label="Navegación principal" className="flex w-fit max-w-full justify-self-center items-center gap-1.5 overflow-x-auto rounded-full border border-slate-100 bg-white p-1.5 shadow-sm">
            <Link className={navClass("/dashboard")} aria-current={active("/dashboard") ? "page" : undefined} href="/dashboard"><Icon name="grid" />Dashboard</Link>
            <Link className={navClass("/pacientes")} aria-current={active("/pacientes") ? "page" : undefined} href="/pacientes"><Icon name="users" className="size-4 text-slate-400" /><span className="2xl:hidden">Pacientes</span><span className="hidden 2xl:inline">Pacientes / Censo</span></Link>
            <Link className={navClass("/alertas")} aria-current={active("/alertas") ? "page" : undefined} href="/alertas" aria-label={`Triaje crítico, ${data.metrics.highRiskPatients} con prioridad alta`}><Icon name="alert" className="size-4 text-slate-400" /><span className="2xl:hidden">Triaje</span><span className="hidden 2xl:inline">Triaje crítico</span><span aria-hidden="true" className="font-mono-data rounded-full border border-rose-200 bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-800">{data.metrics.highRiskPatients}</span></Link>
            <Link className={navClass("/citas")} aria-current={active("/citas") ? "page" : undefined} href="/citas" aria-label={`Citas, ${data.appointments.length} programadas`}><Icon name="calendar" className="size-4 text-slate-400" /><span className="2xl:hidden">Citas</span><span className="hidden 2xl:inline">Próximas citas</span><span aria-hidden="true" className="font-mono-data rounded-full border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-bold text-sky-800">{data.appointments.length}</span></Link>
            <Link className={navClass("/estadisticas")} aria-current={active("/estadisticas") ? "page" : undefined} href="/estadisticas"><Icon name="chart" />Estadísticas</Link>
        </nav>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <details className="group/notifications relative" ref={notificationsRef}>
            <summary
              aria-label={data.alerts.length > 0 ? `Abrir notificaciones, ${data.alerts.length} pendientes` : "Abrir notificaciones"}
              className="relative grid size-11 cursor-pointer list-none place-items-center rounded-full border border-slate-200/70 bg-white text-slate-600 shadow-sm transition hover:border-sky-200 hover:bg-sky-50 hover:text-[#0a4470] hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0a4470] [&::-webkit-details-marker]:hidden"
            >
              <Icon name="bell" className="size-5 transition-transform group-open/notifications:rotate-12" />
              {data.alerts.length > 0 ? (
                <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-[#e2525c] px-1 text-[9px] font-extrabold leading-5 text-white ring-2 ring-white">
                  {Math.min(data.alerts.length, 99)}
                </span>
              ) : null}
            </summary>
            <section className="notifications-popover absolute right-0 z-[120] mt-3 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-2xl shadow-slate-900/15">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div>
                  <h2 className="text-sm font-extrabold text-slate-900">Notificaciones</h2>
                  <p className="mt-0.5 text-[10px] font-medium text-slate-400">Actividad que requiere atención</p>
                </div>
                <span className="rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-bold text-rose-700">
                  {data.alerts.length} pendientes
                </span>
              </div>
              <div className="grid gap-2 p-3">
                {data.alerts.length ? data.alerts.slice(0, 3).map((alert) => (
                  <article className="rounded-xl border border-slate-100 bg-slate-50/80 p-3" key={alert.id}>
                    <div className="flex items-start gap-2.5">
                      <span aria-hidden="true" className={`mt-1 size-2.5 shrink-0 rounded-full ${alert.severity === "critical" ? "bg-rose-500" : "bg-amber-400"}`} />
                      <div className="min-w-0">
                        <p className="text-xs font-bold leading-snug text-slate-800">{alert.title}</p>
                        <p className="mt-1 truncate text-[10px] font-medium text-slate-500">{alert.patientName}</p>
                      </div>
                    </div>
                  </article>
                )) : (
                  <p className="rounded-xl bg-emerald-50 px-4 py-5 text-center text-xs font-semibold text-emerald-700">
                    No hay notificaciones pendientes.
                  </p>
                )}
              </div>
              <Link className="block border-t border-slate-100 px-4 py-3 text-center text-xs font-bold text-sky-700 transition hover:bg-sky-50 hover:text-[#0a4470]" href="/alertas">
                Abrir triaje clínico
              </Link>
            </section>
          </details>
          <Link href="/consultorios" aria-label={`Cambiar consultorio. Actual: ${room.name}, ${room.doctor.fullName}`} title="Cambiar consultorio" className="flex items-center gap-2 rounded-full border border-slate-200/80 bg-white py-1.5 pl-2 pr-2 shadow-sm transition hover:border-sky-200 hover:bg-sky-50 hover:shadow-md sm:gap-3 sm:pr-4">
            <div className="grid size-9 place-items-center rounded-full bg-slate-200 text-xs font-bold text-slate-800">{doctorInitials}</div>
            <div className="hidden leading-tight sm:block"><p className="text-xs font-bold text-slate-800">{room.doctor.fullName}</p><p className="text-[10px] font-medium text-slate-500">{room.name}</p></div>
          </Link>
          <form action={logout}><button className="clinical-logout-button cursor-pointer rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600" type="submit">Salir</button></form>
        </div>
      </header>);
}
