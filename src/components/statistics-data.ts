import { formatInTimeZone } from "date-fns-tz";
import type { DashboardData } from "@/lib/domain/dashboard";

export function statisticsSeries(data: DashboardData) {
  const diagnoses = new Map<string, number>();
  const ages = [0, 0, 0, 0, 0];
  const end = Date.parse(data.generatedAt);
  const start = end - 30 * 86400000;
  const days = new Map<string, { glucose: number[]; systolic: number[]; diastolic: number[] }>();
  // Enumerate local calendar dates so missing days remain gaps, not interpolated observations.
  const firstDay = Date.parse(formatInTimeZone(start, data.timezone, "yyyy-MM-dd") + "T00:00:00Z");
  const lastDay = Date.parse(formatInTimeZone(end, data.timezone, "yyyy-MM-dd") + "T00:00:00Z");
  for (let day = firstDay; day <= lastDay; day += 86400000) {
    days.set(new Date(day).toISOString().slice(0, 10), { glucose: [], systolic: [], diastolic: [] });
  }
  for (const patient of data.patients) {
    for (const diagnosis of new Set(patient.diagnoses)) diagnoses.set(diagnosis, (diagnoses.get(diagnosis) ?? 0) + 1);
    if (Number.isFinite(patient.age) && patient.age >= 0) ages[patient.age < 18 ? 0 : patient.age < 40 ? 1 : patient.age < 60 ? 2 : patient.age < 80 ? 3 : 4]++;
    for (const reading of patient.measurements) {
      const time = Date.parse(reading.observedAt);
      if (!Number.isFinite(time) || time < start || time > end) continue;
      const key = formatInTimeZone(time, data.timezone, "yyyy-MM-dd");
      const bucket = days.get(key) ?? { glucose: [], systolic: [], diastolic: [] };
      if (reading.kind === "glucose" && reading.context === "fasting" && reading.glucoseMgDl != null) bucket.glucose.push(reading.glucoseMgDl);
      if (reading.kind === "blood_pressure") {
        if (reading.systolicMmHg != null) bucket.systolic.push(reading.systolicMmHg);
        if (reading.diastolicMmHg != null) bucket.diastolic.push(reading.diastolicMmHg);
      }
      days.set(key, bucket);
    }
  }
  const mean = (values: number[]) => values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length * 10) / 10 : null;
  return {
    diagnoses: [...diagnoses].sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value })),
    ages: ["0–17", "18–39", "40–59", "60–79", "80+"].map((name, i) => ({ name, value: ages[i] })),
    readings: [...days].sort(([a], [b]) => a.localeCompare(b)).map(([date, values]) => ({
      name: date.slice(8) + "/" + date.slice(5, 7), date,
      glucose: mean(values.glucose), systolic: mean(values.systolic), diastolic: mean(values.diastolic),
    })),
  };
}
