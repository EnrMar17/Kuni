"use client";

import { useMemo, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { getWeek } from "date-fns";
import type { DashboardInteraction } from "@/lib/domain/dashboard";
import { Icon } from "@/components/appointments/icons";
import { KuniDayPicker, type DayStatus } from "@/components/appointments/kuni-day-picker";
import { MedicationResponseCorrection } from "@/components/clinical-actions";

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

/**
 * Calendario de adherencia — "Tomas de medicamento" del expediente del
 * paciente. Mismo componente base que `AppointmentsCalendar` (mes navegable
 * con `KuniDayPicker` + detalle del día seleccionado debajo), pero el mes
 * marca cada día en azul (tomó/registró) o gris (no la tomó) en vez de
 * puntos de carga — ver `DayStatus` en kuni-day-picker.tsx.
 */
export function MedicationCalendar({
  patientId,
  interactions,
  timezone,
  now,
}: {
  patientId: string;
  interactions: DashboardInteraction[];
  timezone: string;
  now: string;
}) {
  const today = useMemo(() => {
    const [year, month, day] = formatInTimeZone(now, timezone, "yyyy-MM-dd").split("-").map(Number);
    return new Date(year, month - 1, day);
  }, [now, timezone]);

  const grouped = useMemo(() => {
    const map = new Map<string, DashboardInteraction[]>();
    for (const interaction of interactions) {
      const key = localCalendarDate(interaction.scheduledAt, timezone).toDateString();
      const bucket = map.get(key);
      if (bucket) bucket.push(interaction);
      else map.set(key, [interaction]);
    }
    for (const bucket of map.values()) bucket.sort((a, b) => Date.parse(b.scheduledAt) - Date.parse(a.scheduledAt));
    return map;
  }, [interactions, timezone]);

  const dayStatuses = useMemo(() => {
    const map = new Map<string, DayStatus>();
    for (const [key, dayInteractions] of grouped) {
      const withResponse = dayInteractions.filter((interaction) => interaction.medicationTaken != null);
      if (!withResponse.length) continue;
      map.set(key, withResponse.some((interaction) => interaction.medicationTaken) ? "taken" : "missed");
    }
    return map;
  }, [grouped]);

  const mostRecentDay = useMemo(() => {
    const sorted = [...interactions].sort((a, b) => Date.parse(b.scheduledAt) - Date.parse(a.scheduledAt));
    return sorted[0] ? localCalendarDate(sorted[0].scheduledAt, timezone) : today;
  }, [interactions, timezone, today]);

  const [selectedDay, setSelectedDay] = useState<Date>(mostRecentDay);
  const [month, setMonth] = useState<Date>(mostRecentDay);
  const dayInteractions = useMemo(() => grouped.get(selectedDay.toDateString()) ?? [], [grouped, selectedDay]);
  const isToday = selectedDay.toDateString() === today.toDateString();
  const isCurrentMonth = month.getFullYear() === today.getFullYear() && month.getMonth() === today.getMonth();

  function goToDay(date: Date) {
    setSelectedDay(date);
    setMonth(date);
  }

  const takenCount = interactions.filter((interaction) => interaction.medicationTaken === true).length;
  const respondedCount = interactions.filter((interaction) => interaction.medicationTaken != null).length;

  return (
    <section className="dashboard-shadow-soft flex flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-sky-50 p-5">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-full bg-sky-50 text-sky-600">
            <Icon className="size-4" name="calendar" />
          </span>
          <div>
            <h2 className="text-base font-extrabold text-slate-900">Calendario de tomas</h2>
            <p className="text-xs font-medium text-slate-400">Toca un día para ver el detalle de sus tomas</p>
          </div>
        </div>
        <span className="font-mono-data rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-500">
          {takenCount}/{respondedCount || interactions.length} confirmadas
        </span>
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
            hideOwnCaption
            medicationStatuses={dayStatuses}
            month={month}
            onMonthChange={setMonth}
            onSelect={(date) => date && goToDay(date)}
            selected={selectedDay}
            today={today}
          />
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-200/70 pt-3 text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="size-2.5 rounded-[4px]" style={{ background: "var(--kuni-sky)" }} />
              Tomó su medicamento / lo registró
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="size-2.5 rounded-[4px] bg-slate-200" />
              No lo tomó
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="size-2.5 rounded-[4px] border-2 border-[#7fd0ff]" />
              Hoy
            </span>
          </div>
        </div>

        <details className="details-panel rounded-2xl border border-slate-200 bg-white" open>
          <summary aria-live="polite">
            <span className="flex min-w-0 items-center gap-2.5">
              <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-[#eaf6ff] text-[#0a4470]">
                <Icon className="size-4" name="today" />
              </span>
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2 text-sm font-extrabold text-slate-900">
                  Tomas del {dayLabel(selectedDay)}
                  {isToday ? (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Hoy</span>
                  ) : null}
                </span>
                <span className="block text-[11px] font-medium text-slate-400">
                  {dayInteractions.length
                    ? `${dayInteractions.length} dosis programada${dayInteractions.length === 1 ? "" : "s"}`
                    : "Sin dosis programadas este día"}
                </span>
              </span>
            </span>
            <svg className="details-panel-chevron size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
            </svg>
          </summary>
          <div className="details-panel-body">
            <div className="table-scroll flex max-h-[420px] min-w-0 flex-col gap-2.5 overflow-y-auto rounded-2xl border border-slate-100 bg-slate-50/40 p-2.5 pr-2">
            {dayInteractions.length ? (
              dayInteractions.map((interaction, index) => (
                <article
                  className="rounded-2xl border border-slate-100 bg-white p-4 shadow-xs transition motion-safe:hover:-translate-y-0.5 hover:shadow-sm motion-safe:animate-[kuni-rise_320ms_ease-out_both]"
                  key={interaction.id}
                  style={{ animationDelay: `${index * 45}ms` }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <strong className="block truncate text-sm font-bold text-slate-900">
                        {interaction.medicationName ?? "Medicamento"}
                      </strong>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{interaction.doseText}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold ${
                        interaction.medicationTaken == null
                          ? "border-slate-200 bg-slate-50 text-slate-500"
                          : interaction.medicationTaken
                            ? "border-sky-200 bg-sky-50 text-sky-700"
                            : "border-slate-300 bg-slate-100 text-slate-600"
                      }`}
                    >
                      {interaction.medicationTaken == null ? "Sin respuesta" : interaction.medicationTaken ? "Sí la tomó" : "No la tomó"}
                    </span>
                  </div>
                  <div className="mt-3 flex min-w-0 items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-100">
                    <Icon className="size-3.5 shrink-0 text-sky-600" name="clock" />
                    <span className="shrink-0">{timeOnly(interaction.scheduledAt, timezone)}</span>
                  </div>
                  {interaction.response ? (
                    <MedicationResponseCorrection
                      interaction={interaction as typeof interaction & { response: NonNullable<typeof interaction.response> }}
                      patientId={patientId}
                    />
                  ) : null}
                </article>
              ))
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-white/60 py-8 text-center">
                <span aria-hidden="true" className="grid size-11 place-items-center rounded-full bg-sky-50 text-sky-500">
                  <Icon className="size-5" name="sparkles" />
                </span>
                <p className="text-sm font-bold text-slate-700">Sin dosis este día</p>
                <p className="max-w-[220px] text-xs text-slate-400">No hay medicamentos programados para esta fecha.</p>
              </div>
            )}
            </div>
          </div>
        </details>
      </div>
    </section>
  );
}
