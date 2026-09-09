import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { DashboardPatient } from "@/lib/domain/dashboard";
import { PatientReport } from "@/components/patient-report";

const mocks = vi.hoisted(() => ({ context: vi.fn(), data: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({ getPageAuthContext: mocks.context }));
vi.mock("@/lib/queries/dashboard", () => ({ getDashboardData: mocks.data }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
import Page from "@/app/(protected)/pacientes/[patientId]/reporte/page";

const patient = {
  id: "patient-1", fullName: "Paciente de prueba", clinicalRecord: "EXP-01", birthDate: "1980-01-01", age: 46,
  sex: "unknown", bloodType: null, diagnoses: [], risk: { level: "unknown", reasons: [] }, initialRiskReason: null,
  prescriptions: [], measurements: [], complications: [], alerts: [], appointments: [], lastResponseAt: null,
  curp: "PRIVATE_CURP", whatsappE164: "PRIVATE_PHONE",
  adherence: { confirmedAdherencePct: null, responseCoveragePct: null, y: 0, n: 0, u: 0 },
} as unknown as DashboardPatient;
const context = { unitName: "Unidad", roomName: "Consultorio", doctorName: "Médico" };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue({ role: "doctor", unitName: "Unidad", consultingRoom: { name: "Consultorio", doctorName: "Médico" } });
  mocks.data.mockResolvedValue({ patients: [patient], generatedAt: "2026-09-09T12:00:00Z", timezone: "America/Mexico_City" });
});
describe("individual patient report", () => {
  it("renders identity, logo, confidentiality and honest empty states without extra identifiers", () => {
    const html = renderToStaticMarkup(createElement(PatientReport, { patient, context, generatedAt: "2026-09-09T12:00:00Z", timezone: "America/Mexico_City" }));
    expect(html).toContain("Paciente de prueba"); expect(html).toContain("CONFIDENCIAL");
    expect(html).toContain("/brand/kuni-mark.png"); expect(html).toContain("01/01/1980");
    expect(html).toContain("Sin datos"); expect(html).toContain("no confirma su ausencia clínica");
    expect(html).not.toContain("PRIVATE_CURP"); expect(html).not.toContain("PRIVATE_PHONE");
  });
  it("opens a patient in the authorized dataset", async () => {
    expect(await Page({ params: Promise.resolve({ patientId: patient.id }) })).toBeTruthy();
  });
  it("rejects a patient outside the authorized dataset", async () => {
    await expect(Page({ params: Promise.resolve({ patientId: "another-room" }) })).rejects.toThrow("NOT_FOUND");
  });
  it("rejects a viewer before querying patient data", async () => {
    mocks.context.mockResolvedValue({ role: "viewer", consultingRoom: { name: "Room" } });
    await expect(Page({ params: Promise.resolve({ patientId: patient.id }) })).rejects.toThrow("NOT_FOUND");
    expect(mocks.data).not.toHaveBeenCalled();
  });
  it("requires an assigned consulting room", async () => {
    mocks.context.mockResolvedValue({ role: "doctor", consultingRoom: null });
    await expect(Page({ params: Promise.resolve({ patientId: patient.id }) })).rejects.toThrow("NOT_FOUND");
    expect(mocks.data).not.toHaveBeenCalled();
  });
});
