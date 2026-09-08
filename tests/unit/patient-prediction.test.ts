import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ request: vi.fn(), build: vi.fn() }));
vi.mock("../../domain-core/src/lib/ml/client", () => ({ requestMlPrediction: mocks.request }));
vi.mock("../../domain-core/src/lib/ml/features", () => ({ buildMlFeatureVector: mocks.build }));
vi.mock("@/lib/env/server", () => ({ serverEnv: { ML_ENDPOINT_URL: "https://model.example.test", ML_TIMEOUT_MS: 2000 } }));
import { getPatientPrediction } from "@/lib/ml/predict-patient";
import { patient } from "../support/dashboard";
const asOf = new Date("2026-09-08T12:00:00Z");
beforeEach(() => mocks.build.mockReturnValue({ vector: {}, gaps: [] }));

describe("procedencia de la predicción publicada", () => {
  it("construye features con el corte de lectura, no con la hora posterior del panel", async () => {
    mocks.request.mockResolvedValue({ status: "unavailable" });
    const result = await getPatientPrediction(patient("p", "Prueba"), asOf);
    expect(mocks.build).toHaveBeenCalledWith(expect.anything(), { now: asOf });
    expect(result.asOf).toBe(asOf.toISOString());
  });
  it.each(["available", "ceiling"])("no publica %s sin versión identificable", async (status) => {
    mocks.request.mockResolvedValue({ status, modelVersion: null });
    expect((await getPatientPrediction(patient("p", "Prueba"), asOf)).prediction).toEqual({ status: "unavailable" });
  });
  it("conserva probabilidad cero con versión identificable", async () => {
    mocks.request.mockResolvedValue({ status: "available", probability: 0, modelVersion: "synthetic-v1" });
    expect((await getPatientPrediction(patient("p", "Prueba"), asOf)).prediction).toMatchObject({ probability: 0, status: "available" });
  });
});
