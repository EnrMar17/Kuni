/**
 * Query key única para el snapshot clínico (`getDashboardData`). Dashboard,
 * censo de pacientes, citas, alertas y estadísticas son distintos "modos" de
 * la misma data (ver `ClinicalWorkspace`), así que comparten esta key: cambiar
 * de tab reutiliza el caché en vez de repetir la agregación pesada contra
 * Supabase. Sin directiva de cliente/servidor: es solo una constante, la usan
 * tanto el hook de cliente como el Route Handler y las páginas que hidratan.
 */
export const dashboardQueryKey = ["dashboard"] as const;

/**
 * El consultorio forma parte de la identidad del dato. Esto evita que, al
 * cambiar la cookie de consultorio, TanStack llegue a mostrar durante unos
 * segundos el snapshot del consultorio anterior bajo la misma clave.
 * `dashboardQueryKey` se conserva como prefijo para invalidar todos los
 * snapshots clínicos después de una mutación.
 */
export function dashboardQueryKeyForRoom(roomId: string) {
  return [...dashboardQueryKey, roomId] as const;
}
