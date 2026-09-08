import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

/**
 * Cálculo puro de "¿toca ahora?" para el materializador — sección 3 de
 * kuni-plan-tecnico.md ("Cada ocurrencia de un horario crea una
 * bot_interaction"). Sin I/O: `jobs/materialize.ts` hace la consulta/insert.
 *
 * Mismo criterio de "qué día es hoy" que `lastExpectedAt()` en
 * `src/lib/domain/dashboard.ts` (ancla a mediodía UTC del día calendario en
 * la zona del paciente) — se reutiliza a propósito el mismo criterio para
 * no tener dos nociones distintas de "hoy" que puedan discrepar en el borde
 * de una zona horaria. A diferencia de esa función (que busca hacia atrás
 * hasta 7 días para mostrar "la última esperada"), esta SOLO mira el día de
 * hoy: no rellena ocurrencias de días donde el tick no corrió. Perderse un
 * día así es una limitación operativa real, no un bug — reintentar sin
 * límite mandaría un recordatorio de un día que ya pasó.
 */

export interface WeeklySchedule {
  /** "HH:MM" o "HH:MM:SS", hora local del paciente/unidad. */
  localTime: string;
  /** ISO 8601: 1=lunes … 7=domingo. */
  weekdays: number[];
}

export interface ActiveRange {
  startDate: string;
  endDate: string | null;
}

function activeOn(range: ActiveRange, date: string): boolean {
  return range.startDate <= date && (range.endDate == null || range.endDate >= date);
}

/**
 * Instante (UTC) de la ocurrencia de HOY, si hoy es un día programado, el
 * rango sigue vigente hoy, y ese instante ya se cumplió (`<= now`). `null`
 * si no aplica todavía o el rango no cubre hoy.
 */
export function todaysOccurrenceInstant(
  schedule: WeeklySchedule,
  range: ActiveRange,
  timezone: string,
  now: Date,
): Date | null {
  const today = formatInTimeZone(now, timezone, "yyyy-MM-dd");
  if (!activeOn(range, today)) return null;
  const localMidday = new Date(`${today}T12:00:00Z`);
  const weekday = localMidday.getUTCDay() || 7;
  if (!schedule.weekdays.includes(weekday)) return null;
  const instant = fromZonedTime(`${today}T${schedule.localTime}`, timezone);
  if (instant.getTime() > now.getTime()) return null;
  return instant;
}
