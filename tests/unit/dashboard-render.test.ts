import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { dashboard, patient, testNow } from "../support/dashboard";
import { dateTime } from "@/components/dashboard/presentation";

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
    expect(html).toContain("Sin recetas vigentes registradas");
    expect(html).toContain("Sin datos");
    expect(html).toContain('href="/pacientes/nuevo"');
    expect(html).toContain("Abre las alertas activas para documentar la urgencia");
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

  it("muestra la última respuesta del periodo y no acusa silencio a un aviso informativo", () => {
    const current = patient("1", "Paciente actual");
    current.lastResponseAt = "2026-09-07T10:00:00Z";
    current.interactions = [{ id: "new", kind: "appointment", expectsResponse: false, scheduledAt: testNow,
      deliveredAt: testNow, responseAt: null, timeoutAt: null, deliveryStatus: "delivered", replyCode: "ABCD1234", medicationTaken: null }];
    const html = render(dashboard([current]));
    expect(html).toContain("Aviso informativo; no requiere respuesta");
    expect(html).toContain(dateTime(current.lastResponseAt, "America/Mexico_City"));
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
