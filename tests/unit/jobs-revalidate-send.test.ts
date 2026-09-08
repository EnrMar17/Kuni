import { describe, expect, it, vi } from "vitest";
import { revalidateSend } from "@/lib/jobs/revalidate-send";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database.types";

type Interaction = Database["public"]["Tables"]["bot_interactions"]["Row"];
const now = new Date("2026-09-08T14:00:00Z");
const claimed = { id: "i-1", unit_id: "unit-1", patient_id: "p-1", provider: "demo", kind: "medication", prescription_id: "rx-1",
  claimed_at: now.toISOString(), scheduled_at: now.toISOString(), delivery_status: "sending", provider_message_id: null,
  accepted_at: null, delivered_at: null, read_at: null, response_at: null } as Interaction;

function setup(overrides: Record<string, unknown> = {}) {
  const rows: Record<string, unknown> = {
    bot_interactions: claimed, patients: { active: true, whatsapp_e164: "+525500001111" },
    health_units: { active: true, timezone: "America/Mexico_City" }, patient_consent_status: { consent_granted: true },
    patient_messaging_state: { last_inbound_at: now.toISOString() },
    prescriptions: { status: "active", start_date: "2026-01-01", end_date: null, created_at: "2026-01-01T00:00:00Z" },
    monitoring_plans: { active: true, start_date: "2026-01-01", end_date: null },
    appointments: { status: "scheduled", starts_at: "2026-09-09T14:00:00Z" }, ...overrides,
  };
  const chains: { table: string; eq: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }[] = [];
  const from = vi.fn((table: string) => {
    const result = rows[table] instanceof Error ? { data: null, error: rows[table] } : { data: rows[table], error: null };
    const chain = { table, select: vi.fn(() => chain), eq: vi.fn(() => chain), is: vi.fn(() => chain), update: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => result), then: (resolve: (r: typeof result) => unknown) => Promise.resolve(result).then(resolve) };
    chains.push(chain);
    return chain;
  });
  return { admin: { from } as unknown as ReturnType<typeof createAdminClient>, from, chains };
}

describe("revalidación final de envío", () => {
  it("relee autorización, teléfono y sesión actuales con ámbito de unidad/paciente", async () => {
    const { admin, chains } = setup();
    expect(await revalidateSend(admin, claimed, now)).toMatchObject({ phoneE164: "+525500001111", interaction: claimed });
    for (const chain of chains.filter((c) => c.table !== "health_units")) expect(chain.eq).toHaveBeenCalledWith("unit_id", "unit-1");
    expect(chains.find((c) => c.table === "prescriptions")!.eq).toHaveBeenCalledWith("patient_id", "p-1");
  });

  it.each([
    ["patient_consent_status", { consent_granted: false }], ["patients", { active: false }], ["health_units", { active: false }],
    ["prescriptions", { status: "superseded", start_date: "2026-01-01", end_date: null, created_at: "2026-01-01T00:00:00Z" }],
    ["prescriptions", { status: "active", start_date: "2026-01-01", end_date: null, created_at: "2026-09-08T15:00:00Z" }],
  ])("cancela sin enviar si cambió %s", async (table, row) => {
    const { admin, chains } = setup({ [table as string]: row });
    expect(await revalidateSend(admin, claimed, now)).toBeNull();
    const update = chains.find((c) => c.update.mock.calls.length)!;
    expect(update.update).toHaveBeenCalledWith(expect.objectContaining({ delivery_status: "cancelled" }));
    expect(update.eq).toHaveBeenCalledWith("claimed_at", claimed.claimed_at);
    expect(update.eq).toHaveBeenCalledWith("delivery_status", "sending");
  });

  it.each([{ delivery_status: "read", delivered_at: now.toISOString() }, { delivery_status: "cancelled" }, { claimed_at: "another-claim" }])("no altera historia ni claims ajenos: %j", async (change) => {
    const { admin, chains } = setup({ bot_interactions: { ...claimed, ...change } });
    expect(await revalidateSend(admin, claimed, now)).toBeNull();
    expect(chains.every((c) => !c.update.mock.calls.length)).toBe(true);
  });

  it("un error de lectura impide el envío sin fingir una cancelación confirmada", async () => {
    const { admin, chains } = setup({ patient_consent_status: new Error("offline") });
    await expect(revalidateSend(admin, claimed, now)).rejects.toThrow("offline");
    expect(chains.every((c) => !c.update.mock.calls.length)).toBe(true);
  });

  it("un plan inactivo invalida una medición reclamada", async () => {
    const current = { ...claimed, prescription_id: null, monitoring_plan_id: "plan-1", kind: "measurement" };
    const { admin } = setup({ bot_interactions: current, monitoring_plans: { active: false } });
    expect(await revalidateSend(admin, current, now)).toBeNull();
  });

  it("una cita reprogramada invalida el recordatorio con el horario viejo", async () => {
    const current = { ...claimed, prescription_id: null, appointment_id: "appt-1", kind: "appointment" };
    const { admin } = setup({ bot_interactions: current, appointments: { status: "scheduled", starts_at: "2026-09-09T15:00:00Z" } });
    expect(await revalidateSend(admin, current, now)).toBeNull();
  });
});
