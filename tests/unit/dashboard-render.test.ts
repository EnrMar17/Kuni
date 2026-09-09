import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { dashboard, patient, testNow } from "../support/dashboard";

vi.mock("@/actions/auth", () => ({ logout: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard", useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { ClinicalDashboard } from "@/components/dashboard/clinical-dashboard";

function render(data = dashboard()) {
  return renderToStaticMarkup(createElement(ClinicalDashboard, { data, unitName: "Unidad de prueba", room: { name: "Consultorio 1", doctor: { fullName: "Dra. Ana Prueba" } } }));
}

describe("dashboard con datos del servidor", () => {
  it("muestra ausencia real y dirige las acciones clínicas a sus flujos funcionales", () => {
    const html = render();
    expect(html).toContain("Selecciona un paciente");
    expect(html).toContain("Sin recetas vigentes");
    expect(html).toContain("Sin datos");
    expect(html).toContain('href="/pacientes/nuevo"');
    expect(html).not.toContain("87%");
    expect(html).not.toContain("40% abandono");
    expect(html).not.toContain("María Elena Vargas");
  });

  it("incluye todas las citas aunque haya más de tres", () => {
    const data = dashboard([patient("1", "Paciente actual")]);
    data.appointments = [1, 2, 3, 4].map((id) => ({ id: String(id), patientId: "1", patientName: `Cita paciente ${id}`, reason: "Control", startsAt: testNow, status: "scheduled", urgency: "routine" }));
    const html = render(data);
    expect(html).toContain("Cita paciente 4");
    expect(html).not.toContain("Confirmada vía bot");
  });

  it("expone el contexto y procedencia de una glucosa posprandial sin convertirla en ayuno", () => {
    const current = patient("1", "Paciente actual");
    current.latestGlucose = { id: "m", monitoringPlanId: null, kind: "glucose", context: "after_meal", observedAt: testNow, receivedAt: testNow,
      glucoseMgDl: 155, systolicMmHg: null, diastolicMmHg: null, source: "manual", correctionReason: null,
      thresholds: { glucose: null, systolic: null, diastolic: null } };
    current.measurements = [current.latestGlucose];
    const html = render(dashboard([current]));
    expect(html).toContain("Posprandial");
    expect(html).toContain("Captura manual");
    expect(html).toContain("test ·");
    expect(html).toContain("Sin mediciones para este periodo");
  });
});
