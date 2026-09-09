import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/contracts/errors";
import { savePatientSchema, type SavePatientInput } from "@/contracts/patient-registration";

const mocks = vi.hoisted(() => ({ context: vi.fn(), client: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({ requireClinicalWriteContext: mocks.context }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { savePatient } from "@/actions/patients";
import { getPatientRegistration } from "@/lib/queries/patient-registration";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const updatedAt = "2026-09-08T12:00:00.123456+00:00";
const value = (): SavePatientInput => ({ patientId: id(1), revision: null, reason: "Alta de paciente", initialCare: null,
  input: { fullName: "Paciente de prueba", birthDate: "1980-01-01", sex: "unknown", clinicalRecord: "A1", curp: null,
    whatsappE164: "+525500000001", bloodType: null, initialRisk: "unknown", initialRiskReason: "Sin valorar",
    diagnoses: ["hypertension"], diagnosedOn: {}, diabetesTreatmentPhase: null, hypertensionTreatmentPhase: null,
    consent: null } });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue({ unitId: id(2), consultingRoom: { id: id(3), doctorId: id(4) } });
  mocks.client.mockResolvedValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: { data: { patient: { id: id(1), updatedAt } }, error: null }, error: null });
});

describe("patient registration action", () => {
  it("uses server attribution and invalidates only after a confirmed result", async () => {
    expect(await savePatient(value())).toEqual({ data: { id: id(1), updatedAt }, error: null });
    expect(mocks.rpc).toHaveBeenCalledWith("register_patient", {
      p_patient_id: id(1), p_room_id: id(3), p_doctor_id: id(4), p_input: value().input,
      p_prescription: null, p_plans: null,
    });
    expect(mocks.revalidate).toHaveBeenCalledWith(`/pacientes/${id(1)}`);
  });
  it("U08 fase 2: manda receta y planes iniciales al alta cuando initialCare viene con datos", async () => {
    const prescription = { medicationId: id(6), doseText: "1 tableta", instructions: "Con alimentos", endsAt: null,
      schedules: [{ weekday: 1, localTime: "08:00" }] };
    const plans = [{ kind: "glucose" as const, localTime: "07:00", weekdays: [1, 2, 3], measurementContext: "fasting" as const,
      glucoseMinMgDl: 70, glucoseMaxMgDl: 140, criticalGlucoseMinMgDl: 50, criticalGlucoseMaxMgDl: 250,
      systolicMinMmHg: null, systolicMaxMmHg: null, diastolicMinMmHg: null, diastolicMaxMmHg: null,
      criticalSystolicMinMmHg: null, criticalSystolicMaxMmHg: null, criticalDiastolicMinMmHg: null, criticalDiastolicMaxMmHg: null }];
    await savePatient({ ...value(), initialCare: { prescription, plans } });
    expect(mocks.rpc).toHaveBeenCalledWith("register_patient", expect.objectContaining({ p_prescription: prescription, p_plans: plans }));
  });
  it("nunca manda receta/planes en una edición: la validación del contrato lo rechaza antes de llamar al servidor", () => {
    const prescription = { medicationId: id(6), doseText: "1 tableta", instructions: "", endsAt: null,
      schedules: [{ weekday: 1, localTime: "08:00" }] };
    const parsed = savePatientSchema.safeParse({ ...value(),
      revision: { updatedAt, consentId: null, diagnoses: [] }, initialCare: { prescription, plans: [] } });
    expect(parsed.success).toBe(false);
  });
  it("sends revision and reason for editing without losing timestamp precision", async () => {
    const data = { ...value(), revision: { updatedAt, consentId: null, diagnoses: [{ id: id(5), updatedAt }] } };
    await savePatient(data);
    expect(mocks.rpc).toHaveBeenCalledWith("update_patient_registration", expect.objectContaining({ p_revision: data.revision, p_reason: data.reason }));
  });
  it.each(["PT401", "PT403", "PT409", "PT422"])("maps %s without invalidation", async code => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code, message: "Rejected" } });
    expect((await savePatient(value())).error?.code).toBe(({ PT401: "UNAUTHENTICATED", PT403: "FORBIDDEN", PT409: "CONFLICT", PT422: "VALIDATION" })[code]);
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("does not touch the database for denied auth", async () => {
    mocks.context.mockRejectedValue(new AppError("FORBIDDEN", "Solo lectura"));
    expect((await savePatient(value())).error?.code).toBe("FORBIDDEN");
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("rejects spoofed authority before calling the database", async () => {
    expect((await savePatient({ ...value(), input: { ...value().input, unitId: id(8) } } as SavePatientInput)).error?.code).toBe("VALIDATION");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([null, { data: { patient: { id: id(9), updatedAt } }, error: null }])("rejects an unconfirmed response", async data => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mocks.rpc.mockResolvedValue({ data, error: null });
      expect((await savePatient(value())).error?.code).toBe("INTERNAL");
      expect(mocks.revalidate).not.toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });
  it.each([{ diagnoses: [] }, { diagnoses: ["hypertension", "hypertension"] }, { consent: { event: "granted" } }, { curp: "INVALID" }, { birthDate: "2026-02-30" }])("validates %j", change => {
    expect(savePatientSchema.safeParse({ ...value(), input: { ...value().input, ...change } }).success).toBe(false);
  });
});

describe("patient edit query", () => {
  function database(options: { missing?: boolean; count?: number; error?: unknown } = {}) {
    const data = value().input;
    const results = {
      patients: { data: options.missing ? null : { id: id(1), full_name: data.fullName, birth_date: data.birthDate, sex: data.sex,
        record_number: data.clinicalRecord, curp: null, whatsapp_e164: data.whatsappE164, blood_type: null,
        initial_risk: data.initialRisk, initial_risk_reason: data.initialRiskReason, updated_at: updatedAt,
        diabetes_treatment_phase: null, hypertension_treatment_phase: null }, error: null },
      patient_diagnoses: { data: [{ id: id(5), condition_code: "hypertension", diagnosed_on: null, updated_at: updatedAt }], count: options.count ?? 1, error: options.error ?? null },
      consent_events: { data: { id: id(6), event: "granted" }, error: null },
    };
    const builders = Object.fromEntries(Object.entries(results).map(([table, result]) => {
      const builder = { select: vi.fn(() => builder), eq: vi.fn(() => builder), order: vi.fn(() => builder),
        limit: vi.fn(() => builder), maybeSingle: vi.fn(async () => result), then: (resolve: (r: unknown) => unknown) => Promise.resolve(result).then(resolve) };
      return [table, builder];
    }));
    mocks.client.mockResolvedValue({ from: (table: string) => builders[table] });
    return builders;
  }
  it("loads a room-scoped form with consent and precise concurrency tokens", async () => {
    const builders = database();
    const data = await getPatientRegistration(id(1));
    expect(data).toMatchObject({ patientId: id(1), consentGranted: true, input: { consent: null },
      revision: { updatedAt, consentId: id(6), diagnoses: [{ id: id(5), updatedAt }] } });
    expect(builders.patients.eq).toHaveBeenCalledWith("consulting_room_id", id(3));
    for (const builder of Object.values(builders)) expect(builder.eq).toHaveBeenCalledWith("unit_id", id(2));
  });
  it("returns no form for an absent patient", async () => {
    database({ missing: true });
    expect(await getPatientRegistration(id(1))).toBeNull();
  });
  it.each([{ count: 2 }, { error: { message: "offline" } }])("fails closed for incomplete diagnosis data", async options => {
    database(options);
    await expect(getPatientRegistration(id(1))).rejects.toMatchObject({ code: "INTERNAL" });
  });
});
