// Utilidades compartidas entre el formulario de citas y el calendario de
// agenda — evita duplicar la rejilla de horarios y la conversión de fecha
// "de calendario" del día picker entre ambos archivos.

/** 07:00 → 20:00 cada 30 min. Es la única noción de "horario del consultorio"
 * que existe en el dominio: no hay una tabla de capacidad/slots en la base,
 * así que "turnos disponibles" se deriva de esta rejilla menos las citas ya
 * agendadas ese día — nunca de datos inventados. */
export const TIME_SLOTS = Array.from({ length: 27 }, (_, index) => {
  const totalMinutes = 7 * 60 + index * 30;
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const minutes = String(totalMinutes % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
});

/**
 * El día picker entrega un Date "de calendario" (medianoche en el huso del
 * navegador) — no una fecha en el huso del consultorio. Aquí se extraen sus
 * componentes Y-M-D tal cual, sin reinterpretarlos por zona horaria, para
 * armar la cadena "yyyy-MM-dd" que sí se interpreta como hora local del
 * consultorio (fromZonedTime).
 */
export function calendarYmd(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Nombres cortos en español para los husos IANA que usan los consultorios en México. */
const FRIENDLY_TIMEZONES: Record<string, string> = {
  "America/Mexico_City": "Hora CDMX",
  "America/Cancun": "Hora Quintana Roo",
  "America/Merida": "Hora Yucatán",
  "America/Monterrey": "Hora Monterrey",
  "America/Chihuahua": "Hora Chihuahua",
  "America/Ciudad_Juarez": "Hora Cd. Juárez",
  "America/Hermosillo": "Hora Sonora",
  "America/Mazatlan": "Hora Mazatlán",
  "America/Tijuana": "Hora Tijuana",
  "America/Bahia_Banderas": "Hora Bahía de Banderas",
};

/** Etiqueta corta y legible para un huso IANA (p. ej. "America/Mexico_City" → "Hora CDMX"). */
export function friendlyTimezone(timezone: string): string {
  if (FRIENDLY_TIMEZONES[timezone]) return FRIENDLY_TIMEZONES[timezone];
  const city = timezone.split("/").pop();
  return city ? `Hora ${city.replace(/_/g, " ")}` : timezone;
}
