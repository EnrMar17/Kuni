"use client";

import { DayPicker, type DayButtonProps } from "react-day-picker";
import { es } from "react-day-picker/locale";

export type DayLoad = { total: number; hasUrgent: boolean };

function BusyDayButton(
  loads: Map<string, DayLoad>,
) {
  return function DayButton({ day, modifiers, className, children, ...rest }: DayButtonProps) {
    void modifiers;
    const key = day.date.toDateString();
    const load = loads.get(key);
    return (
      <button className={className} type="button" {...rest}>
        <span className="kuni-calendar-day">
          {children}
          {load ? (
            <span aria-hidden="true" className="kuni-calendar-day-dot">
              {Array.from({ length: Math.min(load.total, 3) }).map((_, index) => (
                <span data-urgent={load.hasUrgent} key={index} />
              ))}
            </span>
          ) : (
            <span aria-hidden="true" className="kuni-calendar-day-dot" />
          )}
        </span>
      </button>
    );
  };
}

/**
 * Envoltura de react-day-picker con la identidad visual de Kuni (ver
 * .kuni-calendar en globals.css) y, opcionalmente, puntos indicadores de
 * carga de citas por día (para el calendario grande de "Próximas citas").
 */
export function KuniDayPicker({
  selected,
  onSelect,
  disabledBefore,
  dayLoads,
  className = "",
  numberOfMonths = 1,
  today,
  month,
  onMonthChange,
  hideOwnCaption = false,
}: {
  selected: Date | undefined;
  onSelect: (date: Date | undefined) => void;
  disabledBefore?: Date;
  dayLoads?: Map<string, DayLoad>;
  className?: string;
  numberOfMonths?: number;
  /**
   * El servidor corre en UTC (ver run-next.mjs) mientras el navegador corre
   * en el huso local — sin fijar "hoy" explícitamente, react-day-picker usa
   * `new Date()` en cada lado y puede marcar días distintos como "hoy",
   * produciendo un mismatch de hidratación. Se pasa siempre calculado en el
   * huso del consultorio (ver calendarYmd/formatInTimeZone en quien lo usa).
   */
  today: Date;
  /** Mes mostrado, controlado desde fuera (para un botón "Mes actual" o un encabezado propio). */
  month?: Date;
  onMonthChange?: (month: Date) => void;
  /** Oculta el título+navegación propios de react-day-picker cuando el llamador dibuja su propio encabezado (ver AppointmentsCalendar). */
  hideOwnCaption?: boolean;
}) {
  return (
    <DayPicker
      animate
      className={`kuni-calendar ${className}`}
      components={{
        ...(dayLoads ? { DayButton: BusyDayButton(dayLoads) } : {}),
        ...(hideOwnCaption ? { MonthCaption: () => <></> } : {}),
      }}
      disabled={disabledBefore ? { before: disabledBefore } : undefined}
      hideNavigation={hideOwnCaption}
      locale={es}
      mode="single"
      month={month}
      numberOfMonths={numberOfMonths}
      onMonthChange={onMonthChange}
      onSelect={onSelect}
      selected={selected}
      showOutsideDays
      today={today}
      weekStartsOn={1}
    />
  );
}
