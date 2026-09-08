import { beforeEach, describe, expect, it, vi } from "vitest";

// `vi.mock` se sube (hoist) al inicio del archivo, antes de cualquier `const`
// de nivel superior — declarar los mocks con `vi.hoisted` es lo que evita el
// "Cannot access before initialization".
const { requireClinicalWriteContext, createClient } = vi.hoisted(() => ({
  requireClinicalWriteContext: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@/lib/auth/context", () => ({ requireClinicalWriteContext }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));

import { AppError } from "@/contracts/errors";
import {
  adjustPrescription,
  correctMeasurement,
  correctMedicationResponse,
  markUrgent,
  resolveAlert,
} from "@/actions/clinical";

const context = {
  userId: "user-a",
  email: "doctora@example.com",
  unitId: "unit-a",
  unitName: "Unidad de prueba",
  unitCode: null,
  timezone: "America/Mexico_City",
  role: "clinician" as const,
  consultingRoom: {
    id: "room-a",
    name: "Consultorio 1",
    doctorId: "doctor-a",
    doctorName: "Dra. Prueba",
    doctorProfessionalLicense: null,
  },
};

// z.uuid() de Zod v4 valida el formato completo (versión y variante RFC),
// no solo la forma de 8-4-4-4-12 — por eso todo id de prueba aquí trae un
// nibble de versión (4) y de variante (8) reales, no un placeholder cualquiera.
const patientId = "22222222-2222-4222-8222-222222222222";
const alertId = "11111111-1111-4111-8111-111111111111";
const now = "2026-09-08T12:00:00.000Z";

function clientWith(rpc: ReturnType<typeof vi.fn>) {
  return { rpc };
}

beforeEach(() => {
  requireClinicalWriteContext.mockReset();
  createClient.mockReset();
  requireClinicalWriteContext.mockResolvedValue(context);
});

describe("resolveAlert", () => {
  it("rejects malformed input before touching the RPC", async () => {
    const rpc = vi.fn();
    createClient.mockResolvedValue(clientWith(rpc));
    const result = await resolveAlert({
      alertId: "not-a-uuid",
      status: "resolved",
      note: "",
      patientId,
      expectedUpdatedAt: now,
    } as never);
    expect(result.error).toMatchObject({ code: "VALIDATION" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("propagates a role without write access without calling the RPC", async () => {
    requireClinicalWriteContext.mockRejectedValue(new AppError("FORBIDDEN", "Tu cuenta tiene acceso de solo lectura."));
    const rpc = vi.fn();
    createClient.mockResolvedValue(clientWith(rpc));
    const result = await resolveAlert({
      alertId,
      status: "resolved",
      note: "atendida",
      patientId,
      expectedUpdatedAt: now,
    });
    expect(result.error).toMatchObject({ code: "FORBIDDEN" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps a stale optimistic-concurrency token (PT409) to CONFLICT", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "PT409", message: "La alerta cambio; recargar antes de corregir." } });
    createClient.mockResolvedValue(clientWith(rpc));
    const result = await resolveAlert({
      alertId,
      status: "resolved",
      note: "atendida",
      patientId,
      expectedUpdatedAt: now,
    });
    expect(result.error).toMatchObject({ code: "CONFLICT" });
  });

  it("sends the write context's doctor id and returns the resolved alert", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { data: { alert: { id: alertId, status: "resolved" } }, error: null },
      error: null,
    });
    createClient.mockResolvedValue(clientWith(rpc));
    const result = await resolveAlert({
      alertId,
      status: "resolved",
      note: "atendida",
      patientId,
      expectedUpdatedAt: now,
    });
    expect(rpc).toHaveBeenCalledWith("resolve_alert", expect.objectContaining({ p_doctor_id: "doctor-a", p_patient_id: patientId }));
    expect(result).toEqual({ data: { id: alertId, status: "resolved" }, error: null });
  });

  it("never leaks an internal error message to the client", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("connection reset by supabase-js"));
    createClient.mockResolvedValue(clientWith(rpc));
    const result = await resolveAlert({
      alertId,
      status: "resolved",
      note: "atendida",
      patientId,
      expectedUpdatedAt: now,
    });
    expect(result.error).toEqual({ code: "INTERNAL", message: "Error inesperado del servidor." });
  });
});

describe("correctMeasurement", () => {
  const measurementId = "33333333-3333-4333-8333-333333333333";
  const glucoseInput = {
    measurementId,
    expectedUpdatedAt: now,
    reason: "Valor capturado con báscula descalibrada",
    input: { kind: "glucose" as const, patientId, observedAt: now, glucoseMgDl: 110, context: "fasting" as const },
  };

  it("rejects a glucose value outside the capture range before calling the RPC", async () => {
    const rpc = vi.fn();
    createClient.mockResolvedValue(clientWith(rpc));
    const result = await correctMeasurement({ ...glucoseInput, input: { ...glucoseInput.input, glucoseMgDl: 5 } });
    expect(result.error).toMatchObject({ code: "VALIDATION" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("sends p_input exactly as the discriminated union produced it, nothing extra", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { data: { measurement: { id: measurementId, updated_at: now } }, error: null },
      error: null,
    });
    createClient.mockResolvedValue(clientWith(rpc));
    const result = await correctMeasurement(glucoseInput);
    expect(rpc).toHaveBeenCalledWith("correct_measurement", {
      p_patient_id: patientId,
      p_measurement_id: measurementId,
      p_expected_updated_at: now,
      p_input: glucoseInput.input,
      p_reason: glucoseInput.reason,
      p_doctor_id: "doctor-a",
    });
    expect(result).toEqual({ data: { id: measurementId, updatedAt: now }, error: null });
  });

  it("maps an out-of-range value rejected server-side (PT422) to VALIDATION", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "PT422", message: "Valor o contexto de glucosa invalido." } });
    createClient.mockResolvedValue(clientWith(rpc));
    const result = await correctMeasurement(glucoseInput);
    expect(result.error).toMatchObject({ code: "VALIDATION" });
    expect(rpc).toHaveBeenCalled();
  });
});

describe("correctMedicationResponse", () => {
  const input = {
    patientId,
    responseId: "44444444-4444-4444-8444-444444444444",
    expectedUpdatedAt: now,
    scheduleId: "55555555-5555-4555-8555-555555555555",
    scheduledAt: now,
    taken: false,
    reason: "El paciente confirmó por telefono que sí la tomó",
  };

  it("returns CONFLICT when the original dose can't be identified without ambiguity", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "PT409", message: "La toma original no se identifica sin ambiguedad." } });
    createClient.mockResolvedValue(clientWith(rpc));
    const result = await correctMedicationResponse(input);
    expect(result.error).toMatchObject({ code: "CONFLICT" });
  });

  it("forwards taken/schedule/occurrence and the doctor id from context", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { data: { medicationResponse: { id: input.responseId, updated_at: now, taken: true } }, error: null },
      error: null,
    });
    createClient.mockResolvedValue(clientWith(rpc));
    const result = await correctMedicationResponse(input);
    expect(rpc).toHaveBeenCalledWith("correct_medication_response", {
      p_patient_id: patientId,
      p_response_id: input.responseId,
      p_expected_updated_at: now,
      p_schedule_id: input.scheduleId,
      p_scheduled_at: input.scheduledAt,
      p_taken: input.taken,
      p_reason: input.reason,
      p_doctor_id: "doctor-a",
    });
    expect(result).toEqual({ data: { id: input.responseId, updatedAt: now, taken: true }, error: null });
  });
});

describe("adjustPrescription", () => {
  const prescriptionId = "66666666-6666-4666-8666-666666666666";
  const input = {
    patientId,
    prescriptionId,
    expectedVersion: 1,
    expectedUpdatedAt: now,
    reason: "Ajuste de dosis por HbA1c fuera de meta",
    medicationId: "77777777-7777-4777-8777-777777777777",
    doseText: "10 mg",
    instructions: "Una tableta en ayuno",
    endsAt: null,
    schedules: [{ weekday: 1, localTime: "08:00" }],
  };

  it("computes startsAt in the unit's timezone rather than trusting the client clock", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-08T06:00:00.000Z")); // medianoche en America/Mexico_City (UTC-6)
    const rpc = vi.fn().mockResolvedValue({
      data: { data: { prescription: { id: prescriptionId, version: 2, updated_at: now, status: "active" } }, error: null },
      error: null,
    });
    createClient.mockResolvedValue(clientWith(rpc));
    try {
      await adjustPrescription(input);
    } finally {
      vi.useRealTimers();
    }
    const call = rpc.mock.calls[0][1] as { p_input: { startsAt: string; previousPrescriptionId: string; prescribedByDoctorId: string } };
    expect(call.p_input.startsAt).toBe("2026-09-08");
    expect(call.p_input.previousPrescriptionId).toBe(prescriptionId);
    expect(call.p_input.prescribedByDoctorId).toBe("doctor-a");
  });

  it("only sends the exact key allow-list the RPC validates", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { data: { prescription: { id: prescriptionId, version: 2, updated_at: now, status: "active" } }, error: null },
      error: null,
    });
    createClient.mockResolvedValue(clientWith(rpc));
    await adjustPrescription(input);
    const call = rpc.mock.calls[0][1] as { p_input: Record<string, unknown> };
    expect(Object.keys(call.p_input).sort()).toEqual(
      ["patientId", "medicationId", "doseText", "instructions", "startsAt", "endsAt", "schedules", "prescribedByDoctorId", "previousPrescriptionId"].sort(),
    );
  });

  it("returns the new draft-turned-active version", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { data: { prescription: { id: prescriptionId, version: 2, updated_at: now, status: "active" } }, error: null },
      error: null,
    });
    createClient.mockResolvedValue(clientWith(rpc));
    const result = await adjustPrescription(input);
    expect(result).toEqual({ data: { id: prescriptionId, version: 2, updatedAt: now, status: "active" }, error: null });
  });

  it("maps a prescription that changed underneath (PT409) to CONFLICT", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "PT409", message: "La receta cambio o ya no esta activa." } });
    createClient.mockResolvedValue(clientWith(rpc));
    const result = await adjustPrescription(input);
    expect(result.error).toMatchObject({ code: "CONFLICT" });
  });
});

describe("markUrgent", () => {
  const eventId = "88888888-8888-4888-8888-888888888888";
  const urgentAlertId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  it("requires a stable event id (schema-level, before the RPC)", async () => {
    const rpc = vi.fn();
    createClient.mockResolvedValue(clientWith(rpc));
    const result = await markUrgent({ patientId, eventId: "not-a-uuid", reason: "Paciente reporta dolor de pecho" } as never);
    expect(result.error).toMatchObject({ code: "VALIDATION" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("marks the alert urgent under the acting doctor", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { data: { alert: { id: urgentAlertId, status: "open" } }, error: null },
      error: null,
    });
    createClient.mockResolvedValue(clientWith(rpc));
    const result = await markUrgent({ patientId, eventId, reason: "Paciente reporta dolor de pecho" });
    expect(rpc).toHaveBeenCalledWith("mark_urgent", {
      p_patient_id: patientId,
      p_event_id: eventId,
      p_reason: "Paciente reporta dolor de pecho",
      p_doctor_id: "doctor-a",
    });
    expect(result).toEqual({ data: { id: urgentAlertId, status: "open" }, error: null });
  });
});
