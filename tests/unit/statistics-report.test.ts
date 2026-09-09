import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { StatisticsReport } from "../../src/components/statistics-report";
import { reportRows } from "../../src/components/statistics-view";
import type { DashboardData } from "../../src/lib/domain/dashboard";

const data = {
  generatedAt: "2026-09-08T12:00:00Z", timezone: "America/Mexico_City", hasMorePatients: true,
  patients: [{ fullName: "PRIVATE_PATIENT", risk: { level: "high" } }], appointments: [],
  metrics: { activePatients: 1, activeAlerts: 2, criticalAlerts: 1, meanFastingGlucoseMgDl: null, fastingGlucoseCount: 0,
    adherence: { confirmedAdherencePct: null, responseCoveragePct: null, y: 0, n: 0, u: 0 } },
} as unknown as DashboardData;
const context = { unitName: "Unidad de prueba", roomName: "Consultorio 01", doctorName: "Médico" };

describe("StatisticsReport", () => {
  it.each(["summary", "risk", "adherence"] as const)("renders branded pages and every exported metric for %s", kind => {
    const rows = reportRows(data, kind);
    const html = renderToStaticMarkup(createElement(StatisticsReport, { data, context, kind, title: "Reporte", rows }));
    expect(html.match(/class="kuni-report-page"/g)).toHaveLength(kind === "summary" ? 2 : 1);
    expect(html).toContain("/brand/kuni-mark.png");
    expect(html).toContain("ALCANCE PARCIAL");
    expect(html).not.toContain("PRIVATE_PATIENT");
    for (const [label] of rows) expect(html).toContain(label);
    expect(html).toContain("Sin datos");
  });
});
