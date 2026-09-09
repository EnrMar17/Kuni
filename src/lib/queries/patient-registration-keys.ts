export const medicationCatalogQueryKey = ["medication-catalog"] as const;
export const patientRegistrationQueryKey = ["patient-registration"] as const;

export function medicationCatalogQueryKeyForRoom(roomId: string) {
  return [...medicationCatalogQueryKey, roomId] as const;
}
export function patientRegistrationQueryKeyForRoom(roomId: string, patientId: string) {
  return [...patientRegistrationQueryKey, roomId, patientId] as const;
}
