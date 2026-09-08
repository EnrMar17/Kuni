import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { AppError } from "@/contracts/errors";
import { requireConsultingRoom } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { buildDashboardData, type DashboardRows } from "@/lib/domain/dashboard";

const PATIENT_LIMIT = 1_000;
const PAGE_SIZE = 500;
const MAX_RELATED_ROWS = 50_000;
const DAY_MS = 86_400_000;
type Page<T> = { data: T[] | null; error: { message: string } | null; count?: number | null };

/** Never return quietly truncated clinical metrics when the API caps a response. */
export async function readAllDashboardRows<T>(query: (from: number, to: number) => PromiseLike<Page<T>>, maxRows = MAX_RELATED_ROWS): Promise<T[]> {
  const rows: T[] = [];
  let start = 0;
  while (start <= maxRows) {
    const result = await query(start, start + PAGE_SIZE - 1);
    if (result.error || !result.data) throw new AppError("INTERNAL", "No se pudieron consultar los datos clínicos. Intenta nuevamente.");
    if (result.count != null && result.count > maxRows) break;
    rows.push(...result.data);
    if (rows.length > maxRows) break;
    if (result.count != null) {
      if (rows.length >= result.count) return rows;
      if (result.data.length === 0) throw new AppError("INTERNAL", "La lectura clínica quedó incompleta. Actualiza el dashboard.");
    } else if (result.data.length < PAGE_SIZE) return rows;
    start += result.data.length;
  }
  throw new AppError("VALIDATION", "El consultorio excede el volumen de lectura disponible. Reduce el alcance antes de calcular indicadores.");
}

export async function loadDashboardRows(client: SupabaseClient<Database>, scope: { unitId: string; roomId: string }, now: Date): Promise<{ rows: DashboardRows; hasMorePatients: boolean }> {
  const patients = await readAllDashboardRows((from, to) => client.from("patients").select("*", { count: "exact" })
    .eq("unit_id", scope.unitId).eq("consulting_room_id", scope.roomId).eq("active", true)
    .order("id").range(from, to), PATIENT_LIMIT);
  const hasMorePatients = false;
  const emptyRows: DashboardRows = { patients, diagnoses: [], plans: [], measurements: [], interactions: [], responses: [], prescriptions: [], appointments: [], alerts: [], nonresponse: [], consent: [], complications: [] };
  if (!patients.length) return { rows: emptyRows, hasMorePatients };
  // Bound URL length and request concurrency; batches are by patients, never one query per patient.
  for (let offset = 0; offset < patients.length; offset += 100) {
    const ids = patients.slice(offset, offset + 100).map((p) => p.id);
    const related = await loadRelatedRows(client, scope, ids, now);
    appendRows(emptyRows.diagnoses, related.diagnoses);
    appendRows(emptyRows.plans, related.plans);
    appendRows(emptyRows.measurements, related.measurements);
    appendRows(emptyRows.interactions, related.interactions);
    appendRows(emptyRows.responses, related.responses);
    appendRows(emptyRows.prescriptions, related.prescriptions);
    appendRows(emptyRows.appointments, related.appointments);
    appendRows(emptyRows.alerts, related.alerts);
    appendRows(emptyRows.nonresponse, related.nonresponse);
    appendRows(emptyRows.consent, related.consent);
    appendRows(emptyRows.complications, related.complications);
  }
  return { rows: emptyRows, hasMorePatients };
}

function appendRows<T>(target: T[], incoming: T[]) {
  if (target.length + incoming.length > MAX_RELATED_ROWS) throw new AppError("VALIDATION", "El consultorio excede el volumen de lectura disponible. Reduce el alcance antes de calcular indicadores.");
  target.push(...incoming);
}

async function loadRelatedRows(client: SupabaseClient<Database>, scope: { unitId: string; roomId: string }, ids: string[], now: Date): Promise<Omit<DashboardRows, "patients">> {
  const since90 = new Date(now.getTime() - 90 * DAY_MS).toISOString();
  const since7 = new Date(now.getTime() - 7 * DAY_MS).toISOString();
  const until90 = new Date(now.getTime() + 90 * DAY_MS).toISOString();
  const nowIso = now.toISOString();
  // A fixed set of batched reads; every relation keeps the unit and authorized patient ids.
  const [diagnoses, plans, measurements, interactions, responses, prescriptions, appointments, alerts, nonresponse, consent, complications] = await Promise.all([
    readAllDashboardRows((from, to) => client.from("patient_diagnoses").select("*", { count: "exact" }).eq("unit_id", scope.unitId).in("patient_id", ids).eq("active", true).order("id").range(from, to)),
    readAllDashboardRows((from, to) => client.from("monitoring_plans").select("*", { count: "exact" }).eq("unit_id", scope.unitId).in("patient_id", ids).order("id").range(from, to)),
    readAllDashboardRows((from, to) => client.from("measurements").select("*", { count: "exact" }).eq("unit_id", scope.unitId).in("patient_id", ids).is("voided_at", null).gte("measured_at", since90).lte("measured_at", nowIso).order("id").range(from, to)),
    readAllDashboardRows((from, to) => client.from("bot_interactions").select("*", { count: "exact" }).eq("unit_id", scope.unitId).in("patient_id", ids).or(`scheduled_at.gte.${since90},timeout_at.gte.${since7},response_at.gte.${since90}`).lte("scheduled_at", nowIso).order("id").range(from, to)),
    readAllDashboardRows((from, to) => client.from("medication_responses").select("*", { count: "exact" }).eq("unit_id", scope.unitId).in("patient_id", ids).gte("reported_at", since90).lte("reported_at", nowIso).order("id").range(from, to)),
    readAllDashboardRows((from, to) => client.from("prescriptions").select("*, medications(name, strength), prescription_schedules(local_time, weekdays)", { count: "exact" }).eq("unit_id", scope.unitId).in("patient_id", ids).eq("status", "active").order("id").range(from, to)),
    readAllDashboardRows((from, to) => client.from("appointments").select("*", { count: "exact" }).eq("unit_id", scope.unitId).in("patient_id", ids).eq("consulting_room_id", scope.roomId).eq("status", "scheduled").gte("starts_at", nowIso).lte("starts_at", until90).order("id").range(from, to)),
    readAllDashboardRows((from, to) => client.from("alerts").select("*", { count: "exact" }).eq("unit_id", scope.unitId).in("patient_id", ids).in("status", ["open", "acknowledged"]).order("id").range(from, to)),
    readAllDashboardRows((from, to) => client.from("patient_nonresponse_counts").select("*", { count: "exact" }).eq("unit_id", scope.unitId).in("patient_id", ids).order("patient_id").range(from, to)),
    readAllDashboardRows((from, to) => client.from("patient_consent_status").select("*", { count: "exact" }).eq("unit_id", scope.unitId).in("patient_id", ids).order("patient_id").range(from, to)),
    // Fila ausente = expediente sin revisar; solo importan las vigentes (`active`), igual que diagnósticos.
    readAllDashboardRows((from, to) => client.from("patient_complications").select("*", { count: "exact" }).eq("unit_id", scope.unitId).in("patient_id", ids).eq("active", true).order("id").range(from, to)),
  ]);
  return { diagnoses, plans, measurements, interactions, responses, prescriptions, appointments, alerts, nonresponse, consent, complications };
}

/** Per-request session/RLS client: no administrative key, writes, or fixture fallback. */
export async function getDashboardData() {
  const context = await requireConsultingRoom();
  const client = await createClient();
  const now = new Date();
  const scope = { unitId: context.unitId, roomId: context.consultingRoom.id, timezone: context.timezone };
  const { rows, hasMorePatients } = await loadDashboardRows(client, scope, now);
  return buildDashboardData(rows, scope, now, hasMorePatients);
}
