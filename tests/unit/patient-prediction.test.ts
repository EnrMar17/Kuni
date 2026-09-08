import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ request: vi.fn(), trajectory: vi.fn(), build: vi.fn() }));

vi.mock("../../domain-core/src/lib/ml/client", () => ({
  requestMlPrediction: mocks.request,
  requestMlTrajectory: mocks.trajectory,
}));
vi.mock("../../domain-core/src/lib/ml/features", () => ({ buildMlFeatureVector: mocks.build }));
vi.mock("@/lib/env/server", () => ({ serverEnv: { ML_ENDPOINT_URL: "https://model.example.test", ML_TIMEOUT_MS: 2000 } }));

import { getPatientPrediction } from "@/lib/ml/predict-patient";
import { patient } from "../support/dashboard";

const asOf = new Date("2026-09-08T12:00:00Z");

beforeEach(() => {
  mocks.build.mockReturnValue({ vector: {}, gaps: [] });
  mocks.trajectory.mockResolvedValue({ status: "unavailable" });
});

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

describe("trayectoria (independiente del resultado de riesgo)", () => {
  it("expone la trayectoria devuelta por el cliente, sin transformarla", async () => {
    mocks.request.mockResolvedValue({ status: "unavailable" });
    const trajectoryResult = {
      status: "available" as const,
      modelVersion: "trayectoria_v7",
      glucose: [{ step: 1, expected: 100, rangeMin: 90, rangeMax: 110 }],
      systolicBp: [],
      diastolicBp: [],
    };
    mocks.trajectory.mockResolvedValue(trajectoryResult);

    const result = await getPatientPrediction(patient("p", "Prueba"), asOf);
    expect(result.trajectory).toEqual(trajectoryResult);
  });

  it("no depende de que la predicción de riesgo esté disponible", async () => {
    mocks.request.mockResolvedValue({ status: "unavailable" });
    mocks.trajectory.mockResolvedValue({ status: "unavailable" });
    const result = await getPatientPrediction(patient("p", "Prueba"), asOf);
    expect(result.prediction).toEqual({ status: "unavailable" });
    expect(result.trajectory).toEqual({ status: "unavailable" });
  });
});
