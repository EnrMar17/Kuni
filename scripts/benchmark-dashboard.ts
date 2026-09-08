/** Synthetic CPU benchmark. Optional baseline module must export buildDashboardData. */
import { deepStrictEqual } from "node:assert";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildDashboardData, type DashboardRows } from "../src/lib/domain/dashboard";

async function main() {
  const baseline = process.argv[2]
    ? (await import(pathToFileURL(resolve(process.argv[2])).href)).buildDashboardData as typeof buildDashboardData
    : null;
  const now = new Date("2026-09-08T18:00:00Z");
  const scope = { unitId: "synthetic-unit", roomId: "synthetic-room", timezone: "America/Mexico_City" };
  for (const size of [100, 1_000]) {
    // Only fields read by the adapter are populated; these rows never reach a database.
    const rows = {
      patients: Array.from({ length: size }, (_, i) => ({ id: `p-${i}`, unit_id: scope.unitId, consulting_room_id: scope.roomId,
        active: true, full_name: `Synthetic ${i}`, birth_date: "1980-01-01", initial_risk: "unknown", updated_at: now.toISOString() })),
      diagnoses: [], plans: [], measurements: [], consent: [], nonresponse: [],
      prescriptions: Array.from({ length: size * 4 }, (_, i) => ({ id: `rx-${i}`, patient_id: `p-${Math.floor(i / 4)}`, unit_id: scope.unitId,
        status: "active", start_date: "2026-01-01", end_date: null, medications: { name: "Synthetic", therapeutic_class: i % 2 ? "antidiabetic" : "antihypertensive" }, prescription_schedules: [] })),
      interactions: Array.from({ length: size * 40 }, (_, i) => ({ id: `i-${i}`, patient_id: `p-${Math.floor(i / 40)}`, unit_id: scope.unitId,
        prescription_id: `rx-${Math.floor(i / 10)}`, kind: "medication", scheduled_at: "2026-09-08T08:00:00Z", delivery_status: "delivered",
        delivered_at: "2026-09-08T08:01:00Z", response_deadline_at: "2026-09-08T09:00:00Z", response_at: null, timeout_at: null })),
      responses: [],
      alerts: Array.from({ length: size * 20 }, (_, i) => ({ id: `a-${i}`, patient_id: `p-${i % size}`, unit_id: scope.unitId,
        status: "open", kind: "no_response", severity: "warning" })),
      appointments: Array.from({ length: size * 20 }, (_, i) => ({ id: `c-${i}`, patient_id: `p-${i % size}`, unit_id: scope.unitId,
        consulting_room_id: scope.roomId, status: "scheduled", starts_at: "2026-09-09T12:00:00Z" })),
      complications: Array.from({ length: size * 4 }, (_, i) => ({ id: `co-${i}`, patient_id: `p-${i % size}`, unit_id: scope.unitId, active: true, code: "E113" })),
    } as unknown as DashboardRows;
    if (baseline) deepStrictEqual(buildDashboardData(rows, scope, now), baseline(rows, scope, now));
    const durations: Record<string, number[]> = { current: [], baseline: [] };
    // Alternate order to reduce warmup/GC bias; report median, not best case.
    for (let run = 0; run < 13; run++) {
      const variants = run % 2 ? ["current", "baseline"] : ["baseline", "current"];
      for (const variant of variants) {
        const build = variant === "current" ? buildDashboardData : baseline;
        if (!build) continue;
        const start = performance.now();
        build(rows, scope, now);
        if (run >= 3) durations[variant].push(performance.now() - start);
      }
    }
    const median = (values: number[]) => {
      values.sort((a, b) => a - b);
      return values.length ? Number(((values[4] + values[5]) / 2).toFixed(2)) : null;
    };
    console.log(JSON.stringify({ patients: size, interactions: rows.interactions.length, alerts: rows.alerts.length,
      appointments: rows.appointments.length, currentMedianMs: median(durations.current), baselineMedianMs: median(durations.baseline),
      outputParity: baseline ? "exact" : "not compared", measured: "CPU only; synthetic data; no network" }));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
