"use client";

import { useQuery } from "@tanstack/react-query";

import type { PatientPrediction } from "@/lib/ml/predict-patient";

export const patientPredictionQueryKey = ["patient-prediction"] as const;

function patientPredictionKey(roomId: string, patientId: string) {
  return [...patientPredictionQueryKey, roomId, patientId] as const;
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

/**
 * Caché estable por paciente y consultorio. Las mutaciones clínicas invalidan
 * el prefijo `patientPredictionQueryKey`; navegar o regenerar el timestamp del
 * dashboard por sí solo no vuelve a ejecutar el modelo.
 */
export function usePatientPrediction(
  roomId: string | undefined,
  patientId: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: patientPredictionKey(roomId ?? "sin-consultorio", patientId),
    queryFn: () => fetchPatientPrediction(patientId),
    enabled: enabled && Boolean(roomId),
    staleTime: 30 * 60_000,
    refetchOnMount: false,
  });
}
