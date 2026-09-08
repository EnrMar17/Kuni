import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { requireClinicalWriteContext, createClient } = vi.hoisted(() => ({
  requireClinicalWriteContext: vi.fn(),
  createClient: vi.fn(),
}));
vi.mock("@/lib/auth/context", () => ({ requireClinicalWriteContext }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
// `revalidatePath` exige un contexto de request real de Next.js
// ("static generation store missing" fuera de uno) — se mockea como no-op,
// igual que se mockean auth/context y supabase/server.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  resolveAlert,
  markUrgent,
  correctMeasurement,
  correctMedicationResponse,
  adjustPrescription,
  setMedicationTherapeuticClass,
  addPatientComplication,
  deactivatePatientComplication,
  type ResolveAlertRpcInput,
  type UrgentInput,
  type CorrectMeasurementInput,
  type AdjustPrescriptionInput,
  type ComplicationInput,
  type DeactivateComplicationInput,
  type MedicationTherapeuticClassInput,
} from "@/actions/clinical";
import type { MedicationResponseCorrectionInput } from "@/contracts/clinical";

// IDs con formato RFC completo: z.uuid() de Zod v4 valida también el nibble
// de versión (3er grupo, 1-8) y el de variante (4o grupo, 8/9/a/b) — un
// placeholder tipo "11111111-1111-1111-1111-111111111111" falla el parseo
// ANTES de llegar al RPC mockeado y esconde el resultado real de la prueba.
const patientId = "22222222-2222-4222-8222-222222222222";
const alertId = "11111111-1111-4111-8111-111111111111";
const measurementId = "33333333-3333-4333-8333-333333333333";
const responseId = "44444444-4444-4444-8444-444444444444";
const scheduleId = "55555555-5555-4555-8555-555555555555";
const prescriptionId = "66666666-6666-4666-8666-666666666666";
const medicationId = "77777777-7777-4777-8777-777777777777";
const eventId = "88888888-8888-4888-8888-888888888888";
const complicationId = "99999999-9999-4999-8999-999999999999";
const urgentAlertId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const doctorId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const unitId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const roomId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const context = {
  userId: "user-1",
  email: "doc@example.com",
  unitId,
  unitName: "Unidad A",
  unitCode: "A",
  timezone: "America/Mexico_City",
  role: "clinician" as const,
  consultingRoom: {
    id: roomId,
    name: "Consultorio 1",
    doctorId,
    doctorName: "Dra. Ejemplo",
    doctorProfessionalLicense: null,
  },
};

// Encadenable mínimo que imita al query builder de Supabase: cada método
// intermedio (select/eq/update/insert) devuelve `this` y el terminal
// (single/maybeSingle) resuelve al resultado configurado para esa prueba.
function chain(result: { data: unknown; error: unknown }) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    update: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => result),
    single: vi.fn(async () => result),
  };
  return builder;
}

function makeSupabase(options: {
  patientFound?: boolean;
  rpc?: { data?: unknown; error?: unknown };
  complicationsResult?: { data: unknown; error: unknown };
  medicationResult?: { data: unknown; error: unknown };
} = {}) {
  const patientFound = options.patientFound ?? true;
  const rpcResult = options.rpc ?? { data: null, error: null };
  const complicationsResult = options.complicationsResult ?? { data: { id: complicationId }, error: null };
  const medicationResult = options.medicationResult ?? { data: { id: medicationId }, error: null };

  return {
    from: vi.fn((table: string) => {
      if (table === "patients") return chain({ data: patientFound ? { id: patientId } : null, error: null });
      if (table === "patient_complications") return chain(complicationsResult);
      if (table === "prescriptions") return chain({ data: { id: prescriptionId }, error: null });
      if (table === "medications") return chain(medicationResult);
      throw new Error(`tabla inesperada en el mock: ${table}`);
    }),
    rpc: vi.fn(async (...args: [string, Record<string, unknown>]) => {
      void args;
      return rpcResult;
    }),
  };
}

beforeEach(() => {
  requireClinicalWriteContext.mockReset();
  createClient.mockReset();
  requireClinicalWriteContext.mockResolvedValue(context);
});

describe("resolveAlert", () => {
  const input: ResolveAlertRpcInput = {
    patientId,
    alertId,
    expectedUpdatedAt: "2026-09-08T12:00:00.000+00:00",
    status: "resolved",
    note: "Se revisó con el paciente.",
  };

  it("resuelve la alerta y llama al RPC con el motivo y el doctor del consultorio", async () => {
    const supabase = makeSupabase({
      rpc: { data: { data: { alert: { id: alertId, status: "resolved" } }, error: null }, error: null },
    });
    createClient.mockResolvedValue(supabase);

    const result = await resolveAlert(input);

    expect(result.error).toBeNull();
    expect(result.data).toEqual({ id: alertId, status: "resolved" });
    expect(supabase.rpc).toHaveBeenCalledWith(
      "resolve_alert",
      expect.objectContaining({ p_patient_id: patientId, p_alert_id: alertId, p_doctor_id: doctorId, p_next_status: "resolved" }),
    );
  });

  it("mapea PT409 del RPC a CONFLICT", async () => {
    const supabase = makeSupabase({ rpc: { data: null, error: { code: "PT409", message: "La alerta ya fue atendida." } } });
    createClient.mockResolvedValue(supabase);

    const result = await resolveAlert(input);

    expect(result.data).toBeNull();
    expect(result.error?.code).toBe("CONFLICT");
  });

  it("no llama al RPC si el paciente no pertenece al consultorio seleccionado", async () => {
    const supabase = makeSupabase({ patientFound: false });
    createClient.mockResolvedValue(supabase);

    const result = await resolveAlert(input);

    expect(result.error?.code).toBe("FORBIDDEN");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("valida antes de tocar Supabase", async () => {
    const result = await resolveAlert({ ...input, expectedUpdatedAt: "no-es-fecha" });
    expect(result.error?.code).toBe("VALIDATION");
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("markUrgent", () => {
  const input: UrgentInput = { patientId, eventId, reason: "Glucosa fuera de rango con síntomas." };

  it("marca la urgencia y llama al RPC con patientId, eventId y el motivo", async () => {
    const supabase = makeSupabase({
      rpc: { data: { data: { alert: { id: urgentAlertId, status: "open" } }, error: null }, error: null },
    });
    createClient.mockResolvedValue(supabase);

    const result = await markUrgent(input);

    expect(result.error).toBeNull();
    expect(result.data).toEqual({ id: urgentAlertId, status: "open" });
    expect(supabase.rpc).toHaveBeenCalledWith("mark_urgent", {
      p_patient_id: patientId,
      p_event_id: eventId,
      p_reason: input.reason,
      p_doctor_id: doctorId,
    });
  });

  it("exige un motivo no vacío", async () => {
    const result = await markUrgent({ ...input, reason: "   " });
    expect(result.error?.code).toBe("VALIDATION");
  });

  it("acepta la urgencia ya atendida que devuelve un reintento idempotente", async () => {
    createClient.mockResolvedValue(makeSupabase({ rpc: { data: { data: { alert: { id: urgentAlertId, status: "resolved" } }, error: null }, error: null } }));
    expect((await markUrgent(input)).data).toEqual({ id: urgentAlertId, status: "resolved" });
  });
});

describe("correctMeasurement", () => {
  const input: CorrectMeasurementInput = {
    patientId,
    measurementId,
    expectedUpdatedAt: "2026-09-08T12:00:00.000+00:00",
    reason: "Valor mal capturado.",
    kind: "glucose",
    observedAt: "2026-09-08T11:00:00.000Z",
    glucoseMgDl: 110,
    context: "fasting",
  };

  it("corrige la medición y arma p_input sin las llaves de control", async () => {
    const supabase = makeSupabase({ rpc: { data: { data: { measurement: { id: measurementId } }, error: null }, error: null } });
    createClient.mockResolvedValue(supabase);

    const result = await correctMeasurement(input);

    expect(result.error).toBeNull();
    expect(result.data).toEqual({ id: measurementId });
    const call = supabase.rpc.mock.calls[0][1];
    expect(call.p_patient_id).toBe(patientId);
    expect(call.p_measurement_id).toBe(measurementId);
    expect(call.p_input).toEqual({ kind: "glucose", patientId, observedAt: input.observedAt, glucoseMgDl: 110, context: "fasting" });
    const pInput = call.p_input as Record<string, unknown>;
    expect(pInput.measurementId).toBeUndefined();
    expect(pInput.reason).toBeUndefined();
  });

  it("mapea PT422 a VALIDATION", async () => {
    const supabase = makeSupabase({ rpc: { data: null, error: { code: "PT422", message: "Valor fuera de rango." } } });
    createClient.mockResolvedValue(supabase);

    const result = await correctMeasurement(input);

    expect(result.error?.code).toBe("VALIDATION");
  });
});

describe("correctMedicationResponse", () => {
  const input: MedicationResponseCorrectionInput = {
    patientId,
    responseId,
    expectedUpdatedAt: "2026-09-08T12:00:00.000+00:00",
    scheduleId,
    scheduledAt: "2026-09-08T08:00:00.000+00:00",
    taken: true,
    reason: "El paciente confirmó la toma por WhatsApp.",
  };

  it("corrige la toma y llama al RPC con scheduleId + scheduledAt para identificarla sin ambigüedad", async () => {
    const supabase = makeSupabase({ rpc: { data: { data: { medicationResponse: { id: responseId } }, error: null }, error: null } });
    createClient.mockResolvedValue(supabase);

    const result = await correctMedicationResponse(input);

    expect(result.error).toBeNull();
    expect(result.data).toEqual({ id: responseId });
    expect(supabase.rpc).toHaveBeenCalledWith("correct_medication_response", {
      p_patient_id: patientId,
      p_response_id: responseId,
      p_expected_updated_at: input.expectedUpdatedAt,
      p_schedule_id: scheduleId,
      p_scheduled_at: input.scheduledAt,
      p_taken: true,
      p_reason: input.reason,
      p_doctor_id: doctorId,
    });
  });

  it("mapea PT409 a CONFLICT cuando scheduleId+scheduledAt no identifican una toma única", async () => {
    const supabase = makeSupabase({ rpc: { data: null, error: { code: "PT409", message: "No se identificó una toma única." } } });
    createClient.mockResolvedValue(supabase);

    const result = await correctMedicationResponse(input);

    expect(result.error?.code).toBe("CONFLICT");
  });
});

describe("adjustPrescription", () => {
  const input: AdjustPrescriptionInput = {
    patientId,
    prescriptionId,
    expectedVersion: 2,
    expectedUpdatedAt: "2026-09-08T12:00:00.000+00:00",
    medicationId,
    doseText: "500mg",
    instructions: "Cada 12 horas con alimentos.",
    endsAt: null,
    // El formulario y la RPC documentada comparten HH:MM.
    schedules: [
      { weekday: 1, localTime: "08:00" },
      { weekday: 1, localTime: "20:00" },
    ],
    reason: "Ajuste por hipoglucemia recurrente.",
  };

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rechaza horarios con segundos antes de llamar la RPC que exige HH:MM", async () => {
    const result = await adjustPrescription({ ...input, schedules: [{ weekday: 1, localTime: "08:00:00" }] });
    expect(result.error?.code).toBe("VALIDATION");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("calcula startsAt como 'hoy' en la zona horaria de la unidad, no en UTC", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-08T06:00:00.000Z")); // medianoche en America/Mexico_City (UTC-6)
    const supabase = makeSupabase({ rpc: { data: { data: { prescription: { id: prescriptionId } }, error: null }, error: null } });
    createClient.mockResolvedValue(supabase);

    const result = await adjustPrescription(input);

    expect(result.error).toBeNull();
    expect(result.data).toEqual({ id: prescriptionId });
    const call = supabase.rpc.mock.calls[0][1];
    const pInput = call.p_input as Record<string, unknown>;
    expect(pInput.startsAt).toBe("2026-09-08");
    expect(pInput.previousPrescriptionId).toBe(prescriptionId);
    expect(pInput.prescribedByDoctorId).toBe(doctorId);
    expect(pInput.schedules).toEqual(input.schedules);
  });

  it("mapea PT422 a VALIDATION cuando startsAt no coincide con 'hoy'", async () => {
    const supabase = makeSupabase({ rpc: { data: null, error: { code: "PT422", message: "startsAt debe ser hoy." } } });
    createClient.mockResolvedValue(supabase);

    const result = await adjustPrescription(input);

    expect(result.error?.code).toBe("VALIDATION");
  });
});

describe("addPatientComplication", () => {
  const input: ComplicationInput = { patientId, code: "E113", diagnosedOn: "2026-09-01", notes: null };

  it("inserta la complicación con el doctor del consultorio como atribuido", async () => {
    const supabase = makeSupabase({ complicationsResult: { data: { id: complicationId }, error: null } });
    createClient.mockResolvedValue(supabase);

    const result = await addPatientComplication(input);

    expect(result.error).toBeNull();
    expect(result.data).toEqual({ id: complicationId });
  });

  it("rechaza un código de complicación desconocido", async () => {
    const result = await addPatientComplication({ ...input, code: "E999" } as unknown as ComplicationInput);
    expect(result.error?.code).toBe("VALIDATION");
  });
});

describe("deactivatePatientComplication", () => {
  const input: DeactivateComplicationInput = {
    patientId,
    complicationId,
    expectedUpdatedAt: "2026-09-08T12:00:00.000+00:00",
    reason: "Diagnóstico corregido, no aplicaba.",
  };

  it("desactiva la complicación (no la borra) cuando el token de concurrencia coincide", async () => {
    const supabase = makeSupabase({ complicationsResult: { data: { id: complicationId }, error: null } });
    createClient.mockResolvedValue(supabase);

    const result = await deactivatePatientComplication(input);

    expect(result.error).toBeNull();
    expect(result.data).toEqual({ id: complicationId });
  });

  it("devuelve CONFLICT si la complicación ya cambió o fue retirada", async () => {
    const supabase = makeSupabase({ complicationsResult: { data: null, error: null } });
    createClient.mockResolvedValue(supabase);

    const result = await deactivatePatientComplication(input);

    expect(result.error?.code).toBe("CONFLICT");
  });

  it("exige un motivo no vacío", async () => {
    const result = await deactivatePatientComplication({ ...input, reason: "" });
    expect(result.error?.code).toBe("VALIDATION");
  });
});

describe("setMedicationTherapeuticClass", () => {
  const input: MedicationTherapeuticClassInput = {
    patientId,
    prescriptionId,
    medicationId,
    therapeuticClass: "antidiabetic",
  };

  it("valida la receta activa y actualiza solo el medicamento de la unidad", async () => {
    const supabase = makeSupabase();
    createClient.mockResolvedValue(supabase);

    const result = await setMedicationTherapeuticClass(input);

    expect(result).toEqual({ data: { id: medicationId }, error: null });
    const prescriptionBuilder = supabase.from.mock.results[1]?.value;
    expect(prescriptionBuilder.eq).toHaveBeenCalledWith("patient_id", patientId);
    expect(prescriptionBuilder.eq).toHaveBeenCalledWith("status", "active");
    const medicationBuilder = supabase.from.mock.results[2]?.value;
    expect(medicationBuilder.update).toHaveBeenCalledWith({ therapeutic_class: "antidiabetic" });
    expect(medicationBuilder.eq).toHaveBeenCalledWith("unit_id", unitId);
  });

  it("devuelve CONFLICT cuando el medicamento ya no se puede actualizar", async () => {
    const supabase = makeSupabase({ medicationResult: { data: null, error: null } });
    createClient.mockResolvedValue(supabase);

    const result = await setMedicationTherapeuticClass(input);

    expect(result.error?.code).toBe("CONFLICT");
  });
});
