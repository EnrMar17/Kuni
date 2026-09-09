"use client";

import { useQuery } from "@tanstack/react-query";

import type { MedicationOption } from "@/contracts/clinical";
import type { PatientEditData } from "@/contracts/patient-registration";
import {
  medicationCatalogQueryKeyForRoom,
  patientRegistrationQueryKeyForRoom,
} from "@/lib/queries/patient-registration-keys";

async function readJson<T>(url: string, fallback: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(body?.message ?? fallback);
  }
  return response.json() as Promise<T>;
}
export function useMedicationCatalog(roomId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: medicationCatalogQueryKeyForRoom(roomId ?? "sin-consultorio"),
    queryFn: () => readJson<MedicationOption[]>("/api/medications", "No se pudo cargar el catálogo de medicamentos."),
    enabled: enabled && Boolean(roomId),
    staleTime: 10 * 60_000,
  });
}

export function usePatientRegistration(
  roomId: string | undefined,
  patientId: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: patientRegistrationQueryKeyForRoom(roomId ?? "sin-consultorio", patientId ?? "sin-paciente"),
    queryFn: () => readJson<PatientEditData>(
      `/api/patients/${encodeURIComponent(patientId!)}/registration`,
      "No se pudo cargar el expediente.",
    ),
    enabled: enabled && Boolean(roomId && patientId),
  });
}
