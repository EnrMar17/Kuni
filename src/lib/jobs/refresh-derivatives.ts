import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { readAllJobRows } from "./pagination";

/** Time alone can expire clinical evidence. Reconcile every active patient, not just inbound recipients. */
export async function refreshPatientDerivatives() {
  const admin = createAdminClient();
  const patients = await readAllJobRows((from, to) => admin.from("patients")
    .select("id, unit_id", { count: "exact" }).eq("active", true)
    .order("id").range(from, to));
  let refreshed = 0;
  for (const patient of patients) {
    const { data, error } = await admin.rpc("refresh_patient_derivatives", {
      p_unit_id: patient.unit_id, p_patient_id: patient.id,
    });
    if (error) throw error;
    if (typeof data !== "boolean") throw new Error("Respuesta invalida de refresh_patient_derivatives");
    if (data) refreshed += 1;
  }
  return { checked: patients.length, refreshed };
}
