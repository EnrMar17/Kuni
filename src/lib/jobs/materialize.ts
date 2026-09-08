import "server-only";
import type { Database } from "@/types/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWhatsAppProvider } from "@/lib/whatsapp/provider";
import { todaysOccurrenceInstant } from "@/lib/whatsapp/schedule";

/**
 * Materializador — sección 3 de kuni-plan-tecnico.md ("Cada ocurrencia de
 * un horario crea una bot_interaction") y `docs/documentacionB.md`
 * ("Qué falta de B" #3). Convierte recetas/planes de monitoreo activos con
 * ocurrencia de HOY en filas `bot_interactions` (delivery_status='queued'),
 * listas para que `sendDueInteractions()` (send.ts) las reclame y mande.
 *
 * Alcance de esta entrega: `medication` y `measurement` (el CORE — "una
 * toma y una solicitud de medición tienen entrega y respuesta vinculadas").
 * `appointment` y `nonresponse_summary` quedan fuera a propósito: el primero
 * necesita una plantilla aprobada cuyo contenido real no existe todavía: el
 * segundo tiene un disparador ambiguo en el plan ("al siguiente contacto
 * permitido") que no está definido con precisión suficiente para
 * implementarlo sin inventar la regla.
 *
 * Idempotente por diseño: la clave de deduplicación (`tipo:id:instanteISO`)
 * es determinística, así que reinsertar la misma ocurrencia en un tick
 * posterior simplemente no hace nada (`ignoreDuplicates`), sin necesidad de
 * una consulta previa de existencia ni riesgo de condición de carrera entre
 * dos ticks concurrentes.
 */

type BotInteractionInsert = Database["public"]["Tables"]["bot_interactions"]["Insert"];

export interface MaterializeResult {
  /** Ocurrencias candidatas calculadas en este tick (antes de deduplicar). */
  candidates: number;
  /** Filas nuevas realmente insertadas (candidatas menos las ya existentes). */
  created: number;
}

export async function materializeDueInteractions(now: Date = new Date()): Promise<MaterializeResult> {
  const admin = createAdminClient();
  const provider = await getWhatsAppProvider();

  const { data: units, error: unitsError } = await admin
    .from("health_units")
    .select("id, timezone")
    .eq("active", true);
  if (unitsError) throw unitsError;
  if (!units?.length) return { candidates: 0, created: 0 };

  const rows: BotInteractionInsert[] = [];

  for (const unit of units) {
    const [prescriptionsResult, plansResult] = await Promise.all([
      admin
        .from("prescriptions")
        .select(
          "id, patient_id, dose_text, start_date, end_date, medications(name), prescription_schedules(local_time, weekdays), patients!inner(active)",
        )
        .eq("unit_id", unit.id)
        .eq("status", "active")
        .eq("patients.active", true),
      admin
        .from("monitoring_plans")
        .select("id, patient_id, kind, local_time, weekdays, start_date, end_date, patients!inner(active)")
        .eq("unit_id", unit.id)
        .eq("active", true)
        .eq("patients.active", true),
    ]);

    if (prescriptionsResult.error) throw prescriptionsResult.error;
    if (plansResult.error) throw plansResult.error;

    for (const prescription of prescriptionsResult.data ?? []) {
      const range = { startDate: prescription.start_date, endDate: prescription.end_date };
      for (const schedule of prescription.prescription_schedules ?? []) {
        const instant = todaysOccurrenceInstant(
          { localTime: schedule.local_time, weekdays: schedule.weekdays },
          range,
          unit.timezone,
          now,
        );
        if (!instant) continue;
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
            doseText: prescription.dose_text,
            medicationName: prescription.medications?.name ?? null,
            localTime: schedule.local_time,
          },
        });
      }
    }

    for (const plan of plansResult.data ?? []) {
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
  }

  if (!rows.length) return { candidates: 0, created: 0 };

  const { data: inserted, error: insertError } = await admin
    .from("bot_interactions")
    .upsert(rows, { onConflict: "unit_id,deduplication_key", ignoreDuplicates: true })
    .select("id");
  if (insertError) throw insertError;

  return { candidates: rows.length, created: inserted?.length ?? 0 };
}
