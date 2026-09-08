import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from }) }));
vi.mock("@/lib/whatsapp/provider", () => ({
  getWhatsAppProvider: async () => ({ dbProviderValue: "demo" }),
}));

import { materializeDueInteractions } from "@/lib/jobs/materialize";

function makeChain(result: { data?: unknown; error?: unknown } = { data: null, error: null }) {
  const chain = {
    select: vi.fn(() => chain),
    upsert: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    then: <TResult1 = typeof result>(
      onfulfilled?: ((value: typeof result) => TResult1 | PromiseLike<TResult1>) | null,
    ) => Promise.resolve(result).then(onfulfilled),
  };
  return chain;
}

function queueFrom(queues: Record<string, ReturnType<typeof makeChain>[]>) {
  mocks.from.mockImplementation((table: string) => {
    const next = queues[table]?.shift();
    if (!next) throw new Error(`Llamada inesperada a .from("${table}") sin chain en cola`);
    return next;
  });
}

beforeEach(() => {
  mocks.from.mockReset();
});

describe("materializeDueInteractions", () => {
  it("sin unidades activas, no hace ninguna otra consulta", async () => {
    queueFrom({ health_units: [makeChain({ data: [], error: null })] });
    const result = await materializeDueInteractions(new Date("2026-09-08T14:00:00.000Z"));
    expect(result).toEqual({ candidates: 0, created: 0 });
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });

  it("genera una fila de medicamento y una de medición cuando ambas ya tocan hoy", async () => {
    const upsertChain = makeChain({ data: [{ id: "bi-1" }, { id: "bi-2" }], error: null });
    queueFrom({
      health_units: [makeChain({ data: [{ id: "unit-1", timezone: "America/Mexico_City" }], error: null })],
      prescriptions: [
        makeChain({
          data: [
            {
              id: "presc-1",
              patient_id: "patient-1",
              dose_text: "1 tableta",
              start_date: "2026-01-01",
              end_date: null,
              medications: { name: "Metformina" },
              prescription_schedules: [{ local_time: "08:00", weekdays: [2] }], // martes
            },
          ],
          error: null,
        }),
      ],
      monitoring_plans: [
        makeChain({
          data: [
            {
              id: "plan-1",
              patient_id: "patient-1",
              kind: "glucose",
              local_time: "08:00",
              weekdays: [2],
              start_date: "2026-01-01",
              end_date: null,
            },
          ],
          error: null,
        }),
      ],
      bot_interactions: [upsertChain],
    });

    // 2026-09-08 es martes; 14:00Z = 08:00 CDMX (UTC-6).
    const result = await materializeDueInteractions(new Date("2026-09-08T14:00:00.000Z"));

    expect(result).toEqual({ candidates: 2, created: 2 });
    expect(upsertChain.upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          unit_id: "unit-1",
          kind: "medication",
          prescription_id: "presc-1",
          deduplication_key: "medication:presc-1:2026-09-08T14:00:00.000Z",
          provider: "demo",
        }),
        expect.objectContaining({
          unit_id: "unit-1",
          kind: "measurement",
          monitoring_plan_id: "plan-1",
          deduplication_key: "measurement:plan-1:2026-09-08T14:00:00.000Z",
          provider: "demo",
        }),
      ],
      { onConflict: "unit_id,deduplication_key", ignoreDuplicates: true },
    );
  });

  it("no genera nada si ningún horario toca hoy todavía (candidates=0 evita el upsert)", async () => {
    queueFrom({
      health_units: [makeChain({ data: [{ id: "unit-1", timezone: "America/Mexico_City" }], error: null })],
      prescriptions: [
        makeChain({
          data: [
            {
              id: "presc-1",
              patient_id: "patient-1",
              dose_text: "1 tableta",
              start_date: "2026-01-01",
              end_date: null,
              medications: { name: "Metformina" },
              prescription_schedules: [{ local_time: "20:00", weekdays: [2] }], // aún no son las 20:00
            },
          ],
          error: null,
        }),
      ],
      monitoring_plans: [makeChain({ data: [], error: null })],
    });

    const result = await materializeDueInteractions(new Date("2026-09-08T14:00:00.000Z"));

    expect(result).toEqual({ candidates: 0, created: 0 });
    expect(mocks.from).not.toHaveBeenCalledWith("bot_interactions");
  });

  it("created puede ser menor que candidates cuando una ocurrencia ya existía (upsert ignora duplicados)", async () => {
    const upsertChain = makeChain({ data: [{ id: "bi-1" }], error: null }); // solo 1 de 2 candidatas era nueva
    queueFrom({
      health_units: [makeChain({ data: [{ id: "unit-1", timezone: "America/Mexico_City" }], error: null })],
      prescriptions: [makeChain({ data: [], error: null })],
      monitoring_plans: [
        makeChain({
          data: [
            { id: "plan-1", patient_id: "p1", kind: "glucose", local_time: "08:00", weekdays: [2], start_date: "2026-01-01", end_date: null },
            { id: "plan-2", patient_id: "p2", kind: "blood_pressure", local_time: "08:00", weekdays: [2], start_date: "2026-01-01", end_date: null },
          ],
          error: null,
        }),
      ],
      bot_interactions: [upsertChain],
    });

    const result = await materializeDueInteractions(new Date("2026-09-08T14:00:00.000Z"));

    expect(result).toEqual({ candidates: 2, created: 1 });
  });
});
