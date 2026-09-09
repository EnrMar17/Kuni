import { describe, expect, it } from "vitest";
import { statisticsSeries } from "../../src/components/statistics-data";
import type { DashboardData, DashboardMeasurement } from "../../src/lib/domain/dashboard";

const reading = (overrides: Partial<DashboardMeasurement>) => ({ kind: "glucose", context: "fasting", observedAt: "2026-09-08T03:00:00Z", glucoseMgDl: 100, ...overrides }) as DashboardMeasurement;
const fixture = (measurements: DashboardMeasurement[] = []) => ({
  generatedAt: "2026-09-08T12:00:00Z", timezone: "America/Mexico_City",
  patients: [{ age: 40, diagnoses: ["Hipertensión", "Hipertensión"], measurements }],
}) as DashboardData;

describe("statisticsSeries", () => {
  it("counts each diagnosis once per patient and uses age boundaries", () => {
    const result = statisticsSeries(fixture());
    expect(result.diagnoses).toEqual([{ name: "Hipertensión", value: 1 }]);
    expect(result.ages[2].value).toBe(1);
  });
  it("groups by local day and excludes future, old and nonfasting glucose", () => {
    const result = statisticsSeries(fixture([
      reading({}), reading({ glucoseMgDl: 120 }),
      reading({ context: "postprandial", glucoseMgDl: 300 }),
      reading({ observedAt: "2026-09-09T03:00:00Z", glucoseMgDl: 400 }),
      reading({ observedAt: "2026-07-08T03:00:00Z", glucoseMgDl: 400 }),
    ]));
    expect(result.readings.find(r => r.date === "2026-09-07")?.glucose).toBe(110);
    expect(result.readings.find(r => r.date === "2026-09-06")?.glucose).toBeNull();
    expect(result.readings.filter(r => r.glucose != null)).toHaveLength(1);
  });
  it("keeps missing pressure separate from glucose", () => {
    const result = statisticsSeries(fixture([reading({ kind: "blood_pressure", systolicMmHg: 120, diastolicMmHg: null })]));
    expect(result.readings.find(r => r.date === "2026-09-07")).toMatchObject({ glucose: null, systolic: 120, diastolic: null });
  });
});
