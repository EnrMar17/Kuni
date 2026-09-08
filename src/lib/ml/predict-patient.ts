/**
 * Punto de entrada de servidor para RF30: arma el vector de features de un
 * paciente y le pregunta al microservicio del modelo (C1) su predicción.
 *
 * Nunca lanza — `requestMlPrediction()` ya tiene esa regla de oro (sin
 * `ML_ENDPOINT_URL`, con la red caída, timeout o forma inesperada, resuelve
 * a `{ status: 'unavailable' }`), así que quien llame esto no necesita
 * `try/catch` alrededor. El panel de A debe tratar `unavailable` como "no
 * mostrar nada", nunca como error ni como 0%.
 */
import "server-only";
import { requestMlPrediction, type MlPrediction } from "../../../domain-core/src/lib/ml/client";
import { buildMlFeatureVector, type MlFeatureBuild } from "../../../domain-core/src/lib/ml/features";
import type { DashboardPatient } from "../domain/dashboard";
import { serverEnv } from "../env/server";
import { buildPatientMlFeatureInput } from "./patient-features";

export interface PatientPrediction {
  prediction: MlPrediction;
  /** Variables enviadas con relleno porque Kuni todavía no las captura (B3/B4). Vacío = sin brechas. */
  gaps: MlFeatureBuild["gaps"];
}

/** Una llamada por paciente seleccionado — nunca en lote para todo el censo. */
export async function getPatientPrediction(patient: DashboardPatient, now: Date = new Date()): Promise<PatientPrediction> {
  const input = buildPatientMlFeatureInput(patient);
  const { vector, gaps } = buildMlFeatureVector(input, { now });

  const prediction = await requestMlPrediction(vector, {
    endpointUrl: serverEnv.ML_ENDPOINT_URL ?? null,
    apiKey: serverEnv.ML_API_KEY,
    timeoutMs: serverEnv.ML_TIMEOUT_MS,
  });

  return { prediction, gaps };
}
