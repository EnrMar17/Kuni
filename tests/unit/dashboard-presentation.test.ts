import { describe, expect, it } from "vitest";
import { patient } from "../support/dashboard";
import type { DashboardMeasurement } from "@/lib/domain/dashboard";
import { filterPatients, measurementChart, percent } from "@/components/dashboard/presentation";

const now = "2026-09-08T12:00:00.000Z";

function reading(observedAt: string, overrides: Partial<DashboardMeasurement> = {}): DashboardMeasurement {
  return { id: observedAt, monitoringPlanId: null, kind: "glucose", context: "fasting", observedAt, receivedAt: observedAt,
    glucoseMgDl: 100, systolicMmHg: null, diastolicMmHg: null, source: "whatsapp", correctionReason: null,
    thresholds: { glucose: null, systolic: null, diastolic: null }, ...overrides };
}

describe("presentación del dashboard", () => {
  it("distingue falta de datos, cero válido y porcentaje confirmado", () => {
    expect(percent(null)).toBe("Sin datos");
    expect(percent(0)).toBe("0%");
    expect(percent(100)).toBe("100%");
  });

  it("busca por expediente y por nombre sin depender de acentos", () => {
    const people = [patient("3", "José López"), patient("4", "Ana Díaz")];
    expect(filterPatients(people, "jose lopez", "all", "risk").map((p) => p.id)).toEqual(["3"]);
    expect(filterPatients(people, "EXP-4", "all", "risk").map((p) => p.id)).toEqual(["4"]);
  });

  it("ordena por prioridad y filtra sin modificar los datos originales", () => {
    const people = [patient("1", "Ana", "low"), patient("2", "Zoé", "high"), patient("3", "Carlos", "unknown")];
    expect(filterPatients(people, "", "all", "risk").map((p) => p.id)).toEqual(["2", "3", "1"]);
    expect(filterPatients(people, "", "high", "name").map((p) => p.id)).toEqual(["2"]);
    expect(people.map((p) => p.id)).toEqual(["1", "2", "3"]);
  });

  it("grafica solo datos de la ventana sin juntar glucosa en ayuno y posprandial", () => {
    const readings = [
      reading("2026-08-01T12:00:00Z"),
      reading("2026-09-01T12:00:00Z"),
      reading("2026-09-02T12:00:00Z", { context: "after_meal", glucoseMgDl: 180 }),
      reading("2026-09-09T12:00:00Z"),
      reading("2026-09-08T12:00:00Z", { kind: "blood_pressure", context: "unspecified", glucoseMgDl: null, systolicMmHg: 120, diastolicMmHg: 80 }),
    ];
    const chart = measurementChart(readings, now, 7);
    expect(chart.series.map((s) => s.points.map((p) => p.value))).toEqual([[100], [120], [80]]);
    expect(chart.series[0].points[0].x).toBe(8);
    expect(chart.series[1].points[0].x).toBe(312);
  });

  it("no inventa curvas ni rangos cuando no hay lecturas", () => {
    const chart = measurementChart([], now, 30);
    expect(chart.hasData).toBe(false);
    expect(chart.series.every((s) => s.path === "" && s.points.length === 0)).toBe(true);
  });
});
