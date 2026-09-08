import { describe, expect, it } from "vitest";
import { todaysOccurrenceInstant } from "@/lib/whatsapp/schedule";

const TZ = "America/Mexico_City"; // UTC-6, sin horario de verano actualmente

describe("todaysOccurrenceInstant", () => {
  it("devuelve el instante cuando hoy es día programado y ya se cumplió la hora local", () => {
    // 2026-09-08 es martes (weekday 2). 14:00Z = 08:00 CDMX.
    const now = new Date("2026-09-08T14:00:00.000Z");
    const instant = todaysOccurrenceInstant(
      { localTime: "08:00", weekdays: [2] },
      { startDate: "2026-01-01", endDate: null },
      TZ,
      now,
    );
    expect(instant?.toISOString()).toBe("2026-09-08T14:00:00.000Z");
  });

  it("null si la hora local todavía no llega", () => {
    const now = new Date("2026-09-08T13:00:00.000Z"); // 07:00 CDMX, antes de las 08:00
    const instant = todaysOccurrenceInstant(
      { localTime: "08:00", weekdays: [2] },
      { startDate: "2026-01-01", endDate: null },
      TZ,
      now,
    );
    expect(instant).toBeNull();
  });

  it("null si hoy no es un día programado", () => {
    const now = new Date("2026-09-08T14:00:00.000Z"); // martes
    const instant = todaysOccurrenceInstant(
      { localTime: "08:00", weekdays: [1, 3, 5] }, // lun/mié/vie, no martes
      { startDate: "2026-01-01", endDate: null },
      TZ,
      now,
    );
    expect(instant).toBeNull();
  });

  it("null si el rango de vigencia todavía no empieza", () => {
    const now = new Date("2026-09-08T14:00:00.000Z");
    const instant = todaysOccurrenceInstant(
      { localTime: "08:00", weekdays: [2] },
      { startDate: "2026-09-09", endDate: null },
      TZ,
      now,
    );
    expect(instant).toBeNull();
  });

  it("null si el rango de vigencia ya terminó", () => {
    const now = new Date("2026-09-08T14:00:00.000Z");
    const instant = todaysOccurrenceInstant(
      { localTime: "08:00", weekdays: [2] },
      { startDate: "2026-01-01", endDate: "2026-09-07" },
      TZ,
      now,
    );
    expect(instant).toBeNull();
  });

  it("no retrocede a un día anterior si hoy no toca (a diferencia de lastExpectedAt)", () => {
    // Lunes 2026-09-07 sí estaba programado, pero "hoy" (martes) no lo está.
    const now = new Date("2026-09-08T20:00:00.000Z");
    const instant = todaysOccurrenceInstant(
      { localTime: "08:00", weekdays: [1] },
      { startDate: "2026-01-01", endDate: null },
      TZ,
      now,
    );
    expect(instant).toBeNull();
  });
});
