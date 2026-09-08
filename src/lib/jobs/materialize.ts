import "server-only";
import { formatInTimeZone } from "date-fns-tz";
import type { Database } from "@/types/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWhatsAppProvider } from "@/lib/whatsapp/provider";
import { todaysOccurrenceInstant } from "@/lib/whatsapp/schedule";
import { JOB_PAGE_SIZE, readAllJobRows } from "./pagination";
import { isAtOrAfterEffectiveTime } from "./effective-time";

/**
 * Materializador — sección 3 de kuni-plan-tecnico.md ("Cada ocurrencia de
 * un horario crea una bot_interaction") y `docs/documentacionB.md`
 * ("Qué falta de B" #3). Convierte recetas/planes de monitoreo activos con
 * ocurrencia de HOY, citas próximas y rachas de no-respuesta en filas
 * `bot_interactions` (delivery_status='queued'), listas para que
 * `sendDueInteractions()` (send.ts) las reclame y mande.
 *
 * B7 (2026-09-08, decidido con el equipo — ver bitácora): `appointment` y
 * `nonresponse_summary` ya no quedan fuera. `appointment` recuerda una cita
 * 24h antes de `starts_at`. `nonresponse_summary` es un check-in amable, UNA
 * VEZ por racha, cuando un paciente acumula 3 no-respuestas seguidas desde
 * su última respuesta — ver `materializeNonresponseSummaries()` abajo para
 * el criterio exacto y por qué es idempotente sin volver a mandar el mismo
 * mensaje mientras la racha sigue viva.
 *
 * Idempotente por diseño: la clave de deduplicación (`tipo:id:instanteISO`
 * para medicamento/medición/cita, `nonresponse_summary:paciente:ancla` para
 * el check-in) es determinística, así que reinsertar la misma ocurrencia en
 * un tick posterior simplemente no hace nada (`ignoreDuplicates`), sin
 * necesidad de una consulta previa de existencia ni riesgo de condición de
 * carrera entre dos ticks concurrentes.
 */

type BotInteractionInsert = Database["public"]["Tables"]["bot_interactions"]["Insert"];

/** Anticipación del recordatorio de cita — decidida con el equipo, B7. */
const APPOINTMENT_REMINDER_LEAD_MS = 24 * 60 * 60 * 1000;
/** No-respuestas seguidas (desde la última respuesta) que disparan el check-in — decidido con el equipo, B7. */
const NONRESPONSE_STREAK_THRESHOLD = 3;

export interface MaterializeResult {
  /** Ocurrencias candidatas calculadas en este tick (antes de deduplicar). */
  candidates: number;
  /** Filas nuevas realmente insertadas (candidatas menos las ya existentes). */
  created: number;
}

export async function materializeDueInteractions(now: Date = new Date()): Promise<MaterializeResult> {
  const admin = createAdminClient();
  const provider = await getWhatsAppProvider();

  const units = await readAllJobRows((from, to) => admin
    .from("health_units")
    .select("id, timezone", { count: "exact" })
    .eq("active", true).order("id").range(from, to));
  if (!units?.length) return { candidates: 0, created: 0 };

  const rows: BotInteractionInsert[] = [];

  for (const unit of units) {
    const [prescriptionsResult, plansResult, appointmentsResult, nonresponseHistoryResult] = await Promise.all([
      readAllJobRows((from, to) => admin
        .from("prescriptions")
        .select(
          "id, patient_id, dose_text, start_date, end_date, created_at, medications(name), prescription_schedules(id, local_time, weekdays), patients!inner(active)",
          { count: "exact" },
        )
        .eq("unit_id", unit.id)
        .eq("status", "active")
        .eq("patients.active", true).order("id").range(from, to)),
      readAllJobRows((from, to) => admin
        .from("monitoring_plans")
        .select("id, patient_id, kind, local_time, weekdays, start_date, end_date, patients!inner(active)", { count: "exact" })
        .eq("unit_id", unit.id)
        .eq("active", true)
        .eq("patients.active", true).order("id").range(from, to)),
      readAllJobRows((from, to) => admin
        .from("appointments")
        .select("id, patient_id, starts_at, consulting_rooms(name), patients!inner(active)", { count: "exact" })
        .eq("unit_id", unit.id)
        .eq("status", "scheduled")
        .eq("patients.active", true)
        .gt("starts_at", now.toISOString()).order("id").range(from, to)),
      readAllJobRows((from, to) => admin
        .from("bot_interactions")
        .select("id, patient_id, timeout_at, response_at, patients!inner(active)", { count: "exact" })
        .eq("unit_id", unit.id)
        .in("kind", ["medication", "measurement"])
        .eq("patients.active", true)
        .or("response_at.not.is.null,timeout_at.not.is.null").order("id").range(from, to)),
    ]);

    for (const prescription of prescriptionsResult) {
      const range = { startDate: prescription.start_date, endDate: prescription.end_date };
      for (const schedule of prescription.prescription_schedules ?? []) {
        const instant = todaysOccurrenceInstant(
          { localTime: schedule.local_time, weekdays: schedule.weekdays },
          range,
          unit.timezone,
          now,
        );
        if (!instant) continue;
        // C: una versión ajustada solo genera tomas desde su instante efectivo.
        if (!isAtOrAfterEffectiveTime(instant.toISOString(), prescription.created_at)) continue;
        rows.push({
          unit_id: unit.id,
          patient_id: prescription.patient_id,
          kind: "medication",
          prescription_id: prescription.id,
          deduplication_key: `medication:${prescription.id}:${instant.toISOString()}`,
          scheduled_at: instant.toISOString(),
          expects_response: true,
          provider: provider.dbProviderValue,
          payload_snapshot: {
            scheduleId: schedule.id,
            doseText: prescription.dose_text,
            medicationName: prescription.medications?.name ?? null,
            localTime: schedule.local_time,
          },
        });
      }
    }

    for (const plan of plansResult) {
      const range = { startDate: plan.start_date, endDate: plan.end_date };
      const instant = todaysOccurrenceInstant(
        { localTime: plan.local_time, weekdays: plan.weekdays },
        range,
        unit.timezone,
        now,
      );
      if (!instant) continue;
      rows.push({
        unit_id: unit.id,
        patient_id: plan.patient_id,
        kind: "measurement",
        monitoring_plan_id: plan.id,
        deduplication_key: `measurement:${plan.id}:${instant.toISOString()}`,
        scheduled_at: instant.toISOString(),
        expects_response: true,
        provider: provider.dbProviderValue,
        payload_snapshot: { variable: plan.kind, localTime: plan.local_time },
      });
    }

    for (const appointment of appointmentsResult) {
      const startsAt = new Date(appointment.starts_at);
      const reminderInstant = new Date(startsAt.getTime() - APPOINTMENT_REMINDER_LEAD_MS);
      if (reminderInstant.getTime() > now.getTime()) continue; // todavía no toca avisar
      rows.push({
        unit_id: unit.id,
        patient_id: appointment.patient_id,
        kind: "appointment",
        appointment_id: appointment.id,
        deduplication_key: `appointment:${appointment.id}:reminder`,
        scheduled_at: reminderInstant.toISOString(),
        expects_response: false,
        provider: provider.dbProviderValue,
        payload_snapshot: {
          startsAtLocal: formatInTimeZone(startsAt, unit.timezone, "yyyy-MM-dd HH:mm"),
          roomName: appointment.consulting_rooms?.name ?? null,
        },
      });
    }

    for (const anchorId of nonresponseStreakAnchors(nonresponseHistoryResult)) {
      rows.push({
        unit_id: unit.id,
        patient_id: anchorId.patientId,
        kind: "nonresponse_summary",
        deduplication_key: `nonresponse_summary:${anchorId.patientId}:${anchorId.anchorInteractionId}`,
        scheduled_at: now.toISOString(),
        expects_response: false,
        provider: provider.dbProviderValue,
        payload_snapshot: { anchorInteractionId: anchorId.anchorInteractionId },
      });
    }
  }

  if (!rows.length) return { candidates: 0, created: 0 };

  let created = 0;
  for (let offset = 0; offset < rows.length; offset += JOB_PAGE_SIZE) {
    const { count, error } = await admin.from("bot_interactions")
      .upsert(rows.slice(offset, offset + JOB_PAGE_SIZE), { onConflict: "unit_id,deduplication_key", ignoreDuplicates: true, count: "exact" })
      .select("id");
    if (error) throw error;
    if (count == null) throw new Error("No se pudo confirmar el total de ocurrencias insertadas.");
    created += count;
  }
  return { candidates: rows.length, created };
}

interface NonresponseHistoryRow {
  id: string;
  patient_id: string;
  timeout_at: string | null;
  response_at: string | null;
}

/**
 * B7 — criterio de "racha de no-respuesta": desde la última vez que el
 * paciente respondió CUALQUIER medicamento/medición (o desde siempre, si
 * nunca ha respondido), cuenta sus no-respuestas seguidas (`timeout_at` sin
 * `response_at`). Al llegar a `NONRESPONSE_STREAK_THRESHOLD`, el `id` de esa
 * no-respuesta N-ésima (la más antigua que cierra el umbral) es el ancla del
 * mensaje — fija mientras la racha siga creciendo, así que la clave de
 * deduplicación no cambia y el check-in se manda UNA SOLA VEZ por racha. La
 * racha se "rompe" (y una futura podría volver a disparar el mensaje, con
 * una ancla distinta) en cuanto el paciente responde algo: esa respuesta se
 * vuelve la nueva `lastResponseAt` y las no-respuestas previas a ella dejan
 * de contar.
 *
 * Función pura: no hace I/O, recibe ya cargada la historia relevante.
 */
export function nonresponseStreakAnchors(
  rows: NonresponseHistoryRow[],
): { patientId: string; anchorInteractionId: string }[] {
  const byPatient = new Map<string, NonresponseHistoryRow[]>();
  for (const row of rows) {
    const list = byPatient.get(row.patient_id) ?? [];
    list.push(row);
    byPatient.set(row.patient_id, list);
  }

  const anchors: { patientId: string; anchorInteractionId: string }[] = [];
  for (const [patientId, history] of byPatient) {
    const lastResponseAt = history.reduce<number | null>((max, row) => {
      if (!row.response_at) return max;
      const t = Date.parse(row.response_at);
      return max == null || t > max ? t : max;
    }, null);

    const streak = history
      .filter((row) => row.timeout_at && !row.response_at && (lastResponseAt == null || Date.parse(row.timeout_at) > lastResponseAt))
      .sort((a, b) => Date.parse(a.timeout_at!) - Date.parse(b.timeout_at!) || a.id.localeCompare(b.id));

    if (streak.length >= NONRESPONSE_STREAK_THRESHOLD) {
      anchors.push({ patientId, anchorInteractionId: streak[NONRESPONSE_STREAK_THRESHOLD - 1].id });
    }
  }
  return anchors;
}
