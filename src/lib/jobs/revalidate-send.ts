import "server-only";
import { formatInTimeZone } from "date-fns-tz";
import type { Database } from "@/types/database.types";
import type { createAdminClient } from "@/lib/supabase/admin";
import { isAtOrAfterEffectiveTime } from "./effective-time";

type Admin = ReturnType<typeof createAdminClient>;
type Interaction = Database["public"]["Tables"]["bot_interactions"]["Row"];

/** Final read before the provider call. Does not promise a transaction across HTTP. */
export async function revalidateSend(admin: Admin, claimed: Interaction, now = new Date()) {
  if (!claimed.claimed_at) throw new Error("La interacción no tiene token de reclamación.");
  const [current, patient, unit, consent, session] = await Promise.all([
    admin.from("bot_interactions").select("*").eq("unit_id", claimed.unit_id).eq("id", claimed.id).maybeSingle(),
    admin.from("patients").select("active, whatsapp_e164").eq("unit_id", claimed.unit_id).eq("id", claimed.patient_id).maybeSingle(),
    admin.from("health_units").select("active, timezone").eq("id", claimed.unit_id).maybeSingle(),
    admin.from("patient_consent_status").select("consent_granted").eq("unit_id", claimed.unit_id).eq("patient_id", claimed.patient_id).maybeSingle(),
    admin.from("patient_messaging_state").select("last_inbound_at").eq("unit_id", claimed.unit_id).eq("patient_id", claimed.patient_id).maybeSingle(),
  ]);
  for (const result of [current, patient, unit, consent, session]) if (result.error) throw result.error;
  const row = current.data;
  // Another writer advanced/cancelled this claim. Never send it again.
  if (!row || row.delivery_status !== "sending" || row.claimed_at !== claimed.claimed_at
    || row.provider_message_id || row.accepted_at || row.delivered_at || row.read_at || row.response_at) return null;
  if (row.patient_id !== claimed.patient_id || row.provider !== claimed.provider) throw new Error("Cambió la identidad de la interacción reclamada.");
  let eligible = Boolean(patient.data?.active && unit.data?.active && consent.data?.consent_granted);
  if (eligible) {
    const today = formatInTimeZone(now, unit.data!.timezone, "yyyy-MM-dd");
    if (row.prescription_id) {
      const prescription = await admin.from("prescriptions").select("status, start_date, end_date, created_at")
        .eq("unit_id", row.unit_id).eq("patient_id", row.patient_id).eq("id", row.prescription_id).maybeSingle();
      if (prescription.error) throw prescription.error;
      const p = prescription.data;
      eligible = Boolean(p && p.status === "active" && p.start_date <= today && (!p.end_date || p.end_date >= today)
        && isAtOrAfterEffectiveTime(row.scheduled_at, p.created_at));
    } else if (row.monitoring_plan_id) {
      const plan = await admin.from("monitoring_plans").select("active, start_date, end_date")
        .eq("unit_id", row.unit_id).eq("patient_id", row.patient_id).eq("id", row.monitoring_plan_id).maybeSingle();
      if (plan.error) throw plan.error;
      const p = plan.data;
      eligible = Boolean(p?.active && p.start_date <= today && (!p.end_date || p.end_date >= today));
    } else if (row.appointment_id) {
      const appointment = await admin.from("appointments").select("status, starts_at")
        .eq("unit_id", row.unit_id).eq("patient_id", row.patient_id).eq("id", row.appointment_id).maybeSingle();
      if (appointment.error) throw appointment.error;
      const a = appointment.data;
      // A rescheduled appointment invalidates its old reminder snapshot.
      eligible = Boolean(a && a.status === "scheduled" && Date.parse(a.starts_at) > now.getTime()
        && Date.parse(a.starts_at) - 86_400_000 === Date.parse(row.scheduled_at));
    }
  }
  if (!eligible) {
    const result = await admin.from("bot_interactions").update({ delivery_status: "cancelled", failure_code: "send_revalidation_failed", failure_detail: "La autorización o indicación cambió antes del envío." })
      .eq("unit_id", row.unit_id).eq("id", row.id).eq("delivery_status", "sending").eq("claimed_at", claimed.claimed_at)
      .is("provider_message_id", null).is("accepted_at", null).is("delivered_at", null).is("read_at", null).is("response_at", null);
    if (result.error) throw result.error;
    return null;
  }
  return { interaction: row, phoneE164: patient.data!.whatsapp_e164, lastInboundAt: session.data?.last_inbound_at ?? null };
}
