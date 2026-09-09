"use client";

import { useMemo, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { getWeek } from "date-fns";
import Link from "next/link";
import type { DashboardAppointment, DashboardData } from "@/lib/domain/dashboard";
import { initials } from "@/components/dashboard/presentation";
import { Icon } from "@/components/appointments/icons";
import { KuniDayPicker, type DayLoad } from "@/components/appointments/kuni-day-picker";
import { TIME_SLOTS } from "@/components/appointments/shared";

function localCalendarDate(iso: string, timezone: string): Date {
  const [year, month, day] = formatInTimeZone(iso, timezone, "yyyy-MM-dd").split("-").map(Number);
  return new Date(year, month - 1, day);
}

function timeOnly(iso: string, timezone: string) {
  return new Intl.DateTimeFormat("es-MX", { timeStyle: "short", timeZone: timezone }).format(new Date(iso));
}

function dayLabel(date: Date) {
  const label = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long" }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function monthLabel(date: Date) {
  const label = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric" }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Días de calendario visibles en la rejilla mensual (semanas completas, lunes a domingo). */
function visibleGridDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const leading = (first.getDay() + 6) % 7; // lunes = 0
  const trailing = (7 - ((last.getDay() + 6) % 7) - 1 + 7) % 7;
  return leading + last.getDate() + trailing;
}

/**
 * Calendario grande de "Próximas citas": el mes se navega con react-day-picker
 * (identidad Kuni), marcando los días con citas; al elegir un día se
 * despliega su agenda completa debajo, junto con los horarios que siguen
 * libres ese día (la rejilla de 07:00–20:00 menos lo ya agendado — no hay
 * una tabla de "capacidad" en la base, así que nunca se inventa esa cifra).
 */
export function AppointmentsCalendar({
  data,
  onPickFreeSlot,
}: {
  data: DashboardData;
  onPickFreeSlot?: (date: Date, time: string) => void;
}) {
  const today = useMemo(() => {
    const [year, month, day] = formatInTimeZone(data.generatedAt, data.timezone, "yyyy-MM-dd").split("-").map(Number);
    return new Date(year, month - 1, day);
  }, [data.generatedAt, data.timezone]);
  const nowHm = useMemo(() => formatInTimeZone(data.generatedAt, data.timezone, "HH:mm"), [data.generatedAt, data.timezone]);

  const grouped = useMemo(() => {
    const map = new Map<string, DashboardAppointment[]>();
    for (const appointment of data.appointments) {
      const key = localCalendarDate(appointment.startsAt, data.timezone).toDateString();
      const bucket = map.get(key);
      if (bucket) bucket.push(appointment);
      else map.set(key, [appointment]);
    }
    for (const bucket of map.values()) bucket.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
    return map;
  }, [data.appointments, data.timezone]);

  const dayLoads = useMemo(() => {
    const map = new Map<string, DayLoad>();
    for (const [key, appointments] of grouped) {
      map.set(key, { total: appointments.length, hasUrgent: appointments.some((a) => a.urgency === "urgent") });
    }
    return map;
  }, [grouped]);

  const firstBusyDay = useMemo(() => {
    const sorted = [...data.appointments].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
    return sorted[0] ? localCalendarDate(sorted[0].startsAt, data.timezone) : today;
  }, [data.appointments, data.timezone, today]);

  const [selectedDay, setSelectedDay] = useState<Date>(firstBusyDay);
  const [month, setMonth] = useState<Date>(firstBusyDay);
  const dayAppointments = useMemo(() => grouped.get(selectedDay.toDateString()) ?? [], [grouped, selectedDay]);
  const patientsById = useMemo(() => new Map(data.patients.map((p) => [p.id, p])), [data.patients]);
  const isToday = selectedDay.toDateString() === today.toDateString();
  const isCurrentMonth = month.getFullYear() === today.getFullYear() && month.getMonth() === today.getMonth();

  const bookedTimes = useMemo(
    () => new Set(dayAppointments.map((a) => formatInTimeZone(a.startsAt, data.timezone, "HH:mm"))),
    [dayAppointments, data.timezone],
  );
  const freeSlots = useMemo(
    () => TIME_SLOTS.filter((slot) => !bookedTimes.has(slot) && (!isToday || slot > nowHm)),
    [bookedTimes, isToday, nowHm],
  );

  function goToDay(date: Date) {
    setSelectedDay(date);
    setMonth(date);
  }

  return (
    <section className="dashboard-shadow-soft flex flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-sky-50 p-5">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-full bg-sky-50 text-sky-600">
            <Icon className="size-4" name="calendar" />
          </span>
          <div>
            <h2 className="text-base font-extrabold text-slate-900">Calendario de citas</h2>
            <p className="text-xs font-medium text-slate-400">Toca un día para ver su agenda completa</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isToday ? (
            <button
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 shadow-sm transition motion-safe:hover:-translate-y-0.5 hover:border-sky-200 hover:text-[#0a4470]"
              onClick={() => goToDay(today)}
              type="button"
            >
              Hoy
            </button>
          ) : null}
          <span className="font-mono-data rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-500">
            {data.appointments.length} en 90 días
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-5 p-5">
        <div className="rounded-2xl border border-sky-100 bg-sky-50/50 p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <h3 className="text-sm font-extrabold text-slate-900 sm:text-base">{monthLabel(month)}</h3>
              <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-500">
                Semana {getWeek(selectedDay, { weekStartsOn: 1 })}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                aria-label="Mes anterior"
                className="shrink-0 rounded-md border border-slate-200 bg-white text-slate-600 shadow-xs transition hover:bg-slate-100"
                onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28 }}
                type="button"
              >
                <Icon name="chevronLeft" style={{ width: 16, height: 16 }} />
              </button>
              <button
                className={`shrink-0 rounded-md border px-2.5 py-1 text-xs font-semibold shadow-xs transition ${isCurrentMonth ? "border-sky-200 bg-sky-50 text-[#0a4470]" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"}`}
                onClick={() => setMonth(today)}
                type="button"
              >
                Mes actual
              </button>
              <button
                aria-label="Mes próximo"
                className="shrink-0 rounded-md border border-slate-200 bg-white text-slate-600 shadow-xs transition hover:bg-slate-100"
                onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28 }}
                type="button"
              >
                <Icon name="chevronRight" style={{ width: 16, height: 16 }} />
              </button>
            </div>
          </div>
          <KuniDayPicker
            dayLoads={dayLoads}
            hideOwnCaption
            month={month}
            onMonthChange={setMonth}
            onSelect={(date) => date && goToDay(date)}
            selected={selectedDay}
            today={today}
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-t border-slate-200/70 pt-3 text-[11px] text-slate-500">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" className="size-2.5 rounded-[4px] bg-[#001d39]" />
                Día seleccionado
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" className="size-2.5 rounded-full bg-sky-400" />
                Cita programada
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" className="size-2.5 rounded-[4px] border-2 border-[#7fd0ff]" />
                Hoy
              </span>
            </div>
            <span className="font-mono-data text-slate-400">Mostrando {visibleGridDays(month)} días en vista mensual</span>
          </div>
        </div>

        <div aria-live="polite" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-[#eaf6ff] text-[#0a4470]">
                <Icon className="size-4" name="today" />
              </span>
              <div>
                <h3 className="flex flex-wrap items-center gap-2 text-sm font-extrabold text-slate-900">
                  Agenda del {dayLabel(selectedDay)}
                  {isToday ? (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Hoy</span>
                  ) : null}
                </h3>
                <p className="text-[11px] font-medium text-slate-400">
                  {dayAppointments.length
                    ? `${dayAppointments.length} cita${dayAppointments.length === 1 ? "" : "s"} programada${dayAppointments.length === 1 ? "" : "s"}`
                    : "Sin citas este día"}
                  {" · "}
                  {freeSlots.length} horario{freeSlots.length === 1 ? "" : "s"} libre{freeSlots.length === 1 ? "" : "s"}
                </p>
              </div>
            </div>
            <span className="font-mono-data shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-600 shadow-xs">
              {dayAppointments.length}/{TIME_SLOTS.length} turnos ocupados
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-12 md:items-stretch">
            <div className="flex min-w-0 flex-col gap-2 md:col-span-7">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Citas del día</p>
              <div className="table-scroll flex h-[420px] min-w-0 flex-col gap-2.5 overflow-y-auto rounded-2xl border border-slate-100 bg-slate-50/40 p-2.5 pr-2">
              {dayAppointments.length ? (
                dayAppointments.map((appointment, index) => {
                  const patient = patientsById.get(appointment.patientId);
                  const urgent = appointment.urgency === "urgent";
                  const canWhatsapp = Boolean(patient?.consentGranted && patient && /^\+[1-9]\d{7,14}$/.test(patient.whatsappE164));
                  return (
                    <article
                      className="agenda-card min-w-0 shrink-0 motion-safe:animate-[kuni-rise_320ms_ease-out_both]"
                      data-urgency={appointment.urgency}
                      key={appointment.id}
                      style={{ animationDelay: `${index * 45}ms` }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span
                            className={`grid size-10 shrink-0 place-items-center rounded-full text-xs font-extrabold ${urgent ? "bg-rose-100 text-rose-700" : "bg-sky-100 text-sky-700"}`}
                          >
                            {initials(appointment.patientName)}
                          </span>
                          <div className="min-w-0">
                            <Link
                              className="block truncate text-sm font-bold text-slate-900 hover:text-[#0a4470] hover:underline"
                              href={`/pacientes/${appointment.patientId}`}
                            >
                              {appointment.patientName}
                            </Link>
                            <p className="mt-0.5 truncate text-xs text-slate-500">
                              {patient?.clinicalRecord ? `Exp. ${patient.clinicalRecord}` : "Expediente no disponible"}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold ${urgent ? "border-rose-200 bg-rose-50 text-rose-700" : "border-sky-200 bg-sky-50 text-sky-700"}`}
                        >
                          {urgent ? "Prioritaria" : "Rutina"}
                        </span>
                      </div>
                      <div className="mt-3 flex min-w-0 items-center gap-2 rounded-xl bg-white/70 px-3 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-100">
                        <Icon className="size-3.5 shrink-0 text-sky-600" name="clock" />
                        <span className="shrink-0">{timeOnly(appointment.startsAt, data.timezone)}</span>
                        {patient?.diagnoses.length ? (
                          <>
                            <span aria-hidden="true" className="shrink-0 text-slate-300">
                              ·
                            </span>
                            <span className="min-w-0 flex-1 truncate font-medium text-slate-500">{patient.diagnoses.join(", ")}</span>
                          </>
                        ) : null}
                      </div>
                      {appointment.reason ? (
                        <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-slate-600">
                          <Icon className="mt-0.5 size-3.5 shrink-0 text-slate-400" name="note" />
                          <span className="min-w-0 flex-1">{appointment.reason}</span>
                        </p>
                      ) : null}
                      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
                        <Link
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-600 shadow-sm transition hover:bg-slate-50"
                          href={`/pacientes/${appointment.patientId}`}
                        >
                          Ver expediente
                        </Link>
                        <button
                          aria-label={`Abrir WhatsApp de ${appointment.patientName}`}
                          className="flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-bold text-emerald-800 shadow-sm transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
                          disabled={!canWhatsapp}
                          onClick={() => {
                            if (!canWhatsapp || !patient) return;
                            window.open(`https://wa.me/${patient.whatsappE164.slice(1)}`, "_blank", "noopener,noreferrer");
                          }}
                          title={canWhatsapp ? undefined : "Sin consentimiento o teléfono válido registrado"}
                          type="button"
                        >
                          <span aria-hidden="true" className="size-1.5 rounded-full bg-emerald-500" />
                          WhatsApp
                        </button>
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-white/60 text-center">
                  <span aria-hidden="true" className="grid size-11 place-items-center rounded-full bg-sky-50 text-sky-500">
                    <Icon className="size-5" name="sparkles" />
                  </span>
                  <p className="text-sm font-bold text-slate-700">Día libre</p>
                  <p className="max-w-[220px] text-xs text-slate-400">Todavía no hay citas agendadas para este día.</p>
                </div>
              )}
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-2 md:col-span-5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Horarios libres</p>
              <div className="table-scroll flex h-[420px] flex-col gap-2 overflow-y-auto rounded-2xl border border-slate-100 bg-slate-50/40 p-2.5 pr-2">
                {freeSlots.length ? (
                  freeSlots.map((slot) => (
                    <div
                      className="flex shrink-0 items-center justify-between gap-2 rounded-xl border border-dashed border-slate-200 bg-white px-3 py-2 transition hover:border-sky-200 hover:bg-sky-50/40"
                      key={slot}
                    >
                      <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                        <span aria-hidden="true" className="size-1.5 rounded-full bg-sky-400" />
                        {slot} hrs
                      </span>
                      <button
                        aria-label={`Agendar cita el ${dayLabel(selectedDay)} a las ${slot}`}
                        className="flex items-center gap-1 rounded-md border border-sky-200/80 bg-white px-2 py-1 text-[11px] font-bold text-[#0a4470] shadow-xs transition hover:bg-[#0a4470] hover:text-white"
                        onClick={() => onPickFreeSlot?.(selectedDay, slot)}
                        type="button"
                      >
                        <Icon className="size-3.5" name="calendar" />
                        Agendar
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-200 bg-white/60 text-center">
                    <p className="text-xs font-bold text-slate-500">Sin horarios libres</p>
                    <p className="max-w-[180px] text-[11px] text-slate-400">Todos los turnos de este día ya están ocupados.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
