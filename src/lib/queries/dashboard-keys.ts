/**
 * Query key única para el snapshot clínico (`getDashboardData`). Dashboard,
 * censo de pacientes, citas, alertas y estadísticas son distintos "modos" de
 * la misma data (ver `ClinicalWorkspace`), así que comparten esta key: cambiar
 * de tab reutiliza el caché en vez de repetir la agregación pesada contra
 * Supabase. Sin directiva de cliente/servidor: es solo una constante, la usan
 * tanto el hook de cliente como el Route Handler y las páginas que hidratan.
 */
export const dashboardQueryKey = ["dashboard"] as const;
