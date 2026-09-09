"use client";

import { useQuery } from "@tanstack/react-query";

import type { PatientPrediction } from "@/lib/ml/predict-patient";

export const patientPredictionQueryKey = ["patient-prediction"] as const;

function patientPredictionKey(roomId: string, patientId: string, dashboardVersion: string) {
  return [...patientPredictionQueryKey, roomId, patientId, dashboardVersion] as const;
}
async function fetchPatientPrediction(patientId: string): Promise<PatientPrediction> {
  const response = await fetch(`/api/patients/${encodeURIComponent(patientId)}/prediction`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(body?.message ?? "No se pudo calcular la predicción del paciente.");
  }
  return response.json() as Promise<PatientPrediction>;
}

/** La versión del dashboard evita reutilizar una predicción después de que
 * cambian las mediciones, tratamientos o complicaciones del paciente. */
export function usePatientPrediction(
  roomId: string | undefined,
  patientId: string,
  dashboardVersion: string | undefined,
) {
  return useQuery({
    queryKey: patientPredictionKey(roomId ?? "sin-consultorio", patientId, dashboardVersion ?? "sin-snapshot"),
    queryFn: () => fetchPatientPrediction(patientId),
    enabled: Boolean(roomId && dashboardVersion),
    staleTime: 5 * 60_000,
    refetchOnMount: false,
  });
}
