import { describe, expect, it } from "vitest";
import { isAtOrAfterEffectiveTime } from "@/lib/jobs/effective-time";

describe("corte efectivo PostgreSQL", () => {
  it("no pierde los microsegundos de la versión ajustada", () => {
    expect(isAtOrAfterEffectiveTime("2026-09-08T18:00:00.000Z", "2026-09-08T18:00:00.000001+00:00")).toBe(false);
    expect(isAtOrAfterEffectiveTime("2026-09-08T18:00:00.001Z", "2026-09-08T18:00:00.000999Z")).toBe(true);
  });
  it("acepta el instante exacto incluso con distinto offset", () => {
    expect(isAtOrAfterEffectiveTime("2026-09-08T12:00:00-06:00", "2026-09-08T18:00:00.000000Z")).toBe(true);
  });
  it("rechaza fechas inválidas", () => {
    expect(() => isAtOrAfterEffectiveTime("invalid", "2026-09-08T18:00:00Z")).toThrow("inválidos");
  });
});
