import type { DashboardMeasurement, DashboardPatient } from "@/lib/domain/dashboard";

export const riskLabels = {
  high: "Prioridad alta",
  medium: "Prioridad media",
  low: "Prioridad baja",
  unknown: "Sin evaluar",
} as const;

export const riskRank = { high: 0, medium: 1, unknown: 2, low: 3 } as const;

export function percent(value: number | null): string {
  return value === null ? "Sin datos" : `${value.toLocaleString("es-MX", { maximumFractionDigits: 1 })}%`;
}

export function dateTime(value: string | null, timezone: string): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "Sin fecha";
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}

export function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("");
}

export function measurementDescription(measurement: DashboardMeasurement | null, timezone: string): string {
  if (!measurement) return "Sin medición registrada";
  const contexts: Record<string, string> = {
    fasting: "Ayuno", before_meal: "Antes de comer", after_meal: "Posprandial",
    bedtime: "Antes de dormir", random: "Aleatoria", unspecified: "Contexto no especificado",
  };
  const source = measurement.source === "whatsapp" ? "WhatsApp" : measurement.source === "manual" ? "Captura manual" : "Imagen confirmada";
  const context = measurement.kind === "glucose" ? `${contexts[measurement.context] ?? "Contexto no especificado"} · ` : "";
  return `${context}${dateTime(measurement.observedAt, timezone)} · ${source}${measurement.correctionReason ? ` · Corregida: ${measurement.correctionReason}` : ""}`;
}

export function normalizeSearch(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-MX").trim();
}

export function filterPatients(
  patients: DashboardPatient[],
  query: string,
  priority: keyof typeof riskRank | "all",
  order: "risk" | "name",
  diagnosis = "all",
  pendingOnly = false,
): DashboardPatient[] {
  const search = normalizeSearch(query);
  return patients.filter((patient) =>
    (priority === "all" || patient.risk.level === priority) &&
    (diagnosis === "all" || patient.diagnoses.some((item) => normalizeSearch(item) === normalizeSearch(diagnosis))) &&
    (!pendingOnly || patient.nonresponse.pending > 0) &&
    normalizeSearch(`${patient.fullName} ${patient.clinicalRecord} ${patient.curp ?? ""} ${patient.diagnoses.join(" ")}`).includes(search),
  ).sort((a, b) => {
    const severity = order === "risk" ? riskRank[a.risk.level] - riskRank[b.risk.level] : 0;
    return severity || a.fullName.localeCompare(b.fullName, "es-MX");
  });
}

export function availableDiagnoses(patients: DashboardPatient[]): string[] {
  return [...new Set(patients.flatMap((patient) => patient.diagnoses))]
    .sort((a, b) => a.localeCompare(b, "es-MX"));
}

type PlotPoint = { x: number; y: number; value: number; observedAt: string };
type PlotSeries = { path: string; points: PlotPoint[] };

/** Draw observed values; never fill absent days or fabricate a target band. */
export function measurementChart(measurements: DashboardMeasurement[], nowIso: string, days: number) {
  const end = Date.parse(nowIso);
  const start = end - days * 86_400_000;
  const readings = measurements.filter((measurement) => {
    const instant = Date.parse(measurement.observedAt);
    return instant >= start && instant <= end;
  }).sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
  const groups = [
    readings.filter((m) => m.kind === "glucose" && m.context === "fasting").map((m) => ({ value: m.glucoseMgDl, observedAt: m.observedAt })),
    readings.filter((m) => m.kind === "blood_pressure").map((m) => ({ value: m.systolicMmHg, observedAt: m.observedAt })),
    readings.filter((m) => m.kind === "blood_pressure").map((m) => ({ value: m.diastolicMmHg, observedAt: m.observedAt })),
  ].map((series) => series.filter((item): item is { value: number; observedAt: string } => item.value !== null && Number.isFinite(item.value)));
  const values = groups.flat().map((point) => point.value);
  const minimum = values.length ? Math.min(...values) : 0;
  const maximum = values.length ? Math.max(...values) : 0;
  const range = Math.max(maximum - minimum, 20);
  const series: PlotSeries[] = groups.map((group) => {
    const points = group.map((point) => ({
      ...point,
      x: 8 + 304 * ((Date.parse(point.observedAt) - start) / (end - start)),
      y: 68 - 56 * ((point.value - minimum) / range),
    }));
    return {
      points,
      path: points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" "),
    };
  });
  return { series, hasData: values.length > 0, minimum, maximum, start: new Date(start).toISOString(), end: nowIso };
}
