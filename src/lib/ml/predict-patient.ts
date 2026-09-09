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
import { requestMlPrediction, requestMlTrajectory, type MlFeatureVector, type MlPrediction, type MlTrajectory } from "../../../domain-core/src/lib/ml/client";
import { buildMlFeatureVector, type MlFeatureBuild } from "../../../domain-core/src/lib/ml/features";
import type { DashboardPatient } from "../domain/dashboard";
import { serverEnv } from "../env/server";
import { buildPatientMlFeatureInput } from "./patient-features";

export interface PatientPrediction {
  prediction: MlPrediction;
  /** Proyección a 3 pasos de glucosa/PA (mismo vector) — endpoint hermano, ver domain-core/ml/client.ts. */
  trajectory: MlTrajectory;
  asOf: string;
  /** Brechas reales del expediente en este corte. Vacío = sin brechas declaradas. */
  gaps: MlFeatureBuild["gaps"];
  /** Las 17 entradas efectivamente enviadas, para trazabilidad en la ficha. */
  vector: MlFeatureVector;
}

/** Una llamada por paciente seleccionado — nunca en lote para todo el censo. */
export async function getPatientPrediction(patient: DashboardPatient, now: Date): Promise<PatientPrediction> {
  const input = buildPatientMlFeatureInput(patient);
  const { vector, gaps } = buildMlFeatureVector(input, { now });

  const config = {
    endpointUrl: serverEnv.ML_ENDPOINT_URL ?? null,
    apiKey: serverEnv.ML_API_KEY,
    timeoutMs: serverEnv.ML_TIMEOUT_MS,
  };

  // Independientes entre sí: si la trayectoria falla o no está disponible,
  // el panel de riesgo futuro (RF30) no debe verse afectado, y viceversa.
  const [prediction, trajectory] = await Promise.all([
    requestMlPrediction(vector, config),
    requestMlTrajectory(vector, config),
  ]);

  // El cliente puro admite versiones null en pruebas; el panel del modelo real
  // exige procedencia identificable (plan-integracion RF30).
  const publishable = prediction.status !== "unavailable" && !prediction.modelVersion
    ? { status: "unavailable" as const }
    : prediction;
  return { prediction: publishable, trajectory, gaps, vector, asOf: now.toISOString() };
}
