import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from }) }));
vi.mock("@/lib/whatsapp/provider", () => ({
  getWhatsAppProvider: async () => ({ dbProviderValue: "demo" }),
}));

import { materializeDueInteractions, nonresponseStreakAnchors } from "@/lib/jobs/materialize";

function makeChain(result: { data?: unknown; error?: unknown } = { data: null, error: null }) {
  const page = { ...result, count: Array.isArray(result.data) ? result.data.length : 0 };
  const chain = {
    select: vi.fn(() => chain),
    upsert: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    gt: vi.fn(() => chain),
    or: vi.fn(() => chain),
    order: vi.fn(() => chain),
    range: vi.fn(() => chain),
    then: <TResult1 = typeof result>(
      onfulfilled?: ((value: typeof result) => TResult1 | PromiseLike<TResult1>) | null,
    ) => Promise.resolve(page).then(onfulfilled),
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
  it("no regenera la toma anterior al ajuste y conserva la ocurrencia del instante efectivo", async () => {
    const insert = makeChain({ data: [{ id: "new" }], error: null });
    queueFrom({
      health_units: [makeChain({ data: [{ id: "unit-1", timezone: "America/Mexico_City" }], error: null })],
      prescriptions: [makeChain({ data: [{ id: "rx-new", patient_id: "p-1", dose_text: "Dosis de prueba", start_date: "2026-09-08", end_date: null,
        created_at: "2026-09-08T18:00:00Z", medications: { name: "Prueba" },
        prescription_schedules: [{ id: "morning", local_time: "08:00", weekdays: [2] }, { id: "noon", local_time: "12:00", weekdays: [2] }] }], error: null })],
      monitoring_plans: [makeChain({ data: [], error: null })], appointments: [makeChain({ data: [], error: null })],
      bot_interactions: [makeChain({ data: [], error: null }), insert],
    });
    expect(await materializeDueInteractions(new Date("2026-09-08T18:00:00Z"))).toEqual({ candidates: 1, created: 1 });
    expect(insert.upsert).toHaveBeenCalledWith([expect.objectContaining({ scheduled_at: "2026-09-08T18:00:00.000Z", payload_snapshot: expect.objectContaining({ scheduleId: "noon" }) })], expect.anything());
  });
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
              created_at: "2026-01-01T00:00:00Z",
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
      appointments: [makeChain({ data: [], error: null })],
      bot_interactions: [makeChain({ data: [], error: null }), upsertChain],
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
      { onConflict: "unit_id,deduplication_key", ignoreDuplicates: true, count: "exact" },
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
              created_at: "2026-01-01T00:00:00Z",
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
      appointments: [makeChain({ data: [], error: null })],
      // Solo una entrada en la cola: si el código intentara un segundo
      // .from("bot_interactions") (el upsert), la cola vacía lo delataría.
      bot_interactions: [makeChain({ data: [], error: null })],
    });

    const result = await materializeDueInteractions(new Date("2026-09-08T14:00:00.000Z"));

    expect(result).toEqual({ candidates: 0, created: 0 });
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
      appointments: [makeChain({ data: [], error: null })],
      bot_interactions: [makeChain({ data: [], error: null }), upsertChain],
    });

    const result = await materializeDueInteractions(new Date("2026-09-08T14:00:00.000Z"));

    expect(result).toEqual({ candidates: 2, created: 1 });
  });

  it("B7: recuerda una cita 24h antes de starts_at, informativa (expects_response=false)", async () => {
    const upsertChain = makeChain({ data: [{ id: "bi-1" }], error: null });
    queueFrom({
      health_units: [makeChain({ data: [{ id: "unit-1", timezone: "America/Mexico_City" }], error: null })],
      prescriptions: [makeChain({ data: [], error: null })],
      monitoring_plans: [makeChain({ data: [], error: null })],
      appointments: [
        makeChain({
          data: [
            {
              id: "appt-1",
              patient_id: "patient-1",
              starts_at: "2026-09-09T14:00:00.000Z", // exactamente 24h después del "now" de la prueba
              consulting_rooms: { name: "Consultorio 3" },
            },
          ],
          error: null,
        }),
      ],
      bot_interactions: [makeChain({ data: [], error: null }), upsertChain],
    });

    const result = await materializeDueInteractions(new Date("2026-09-08T14:00:00.000Z"));

    expect(result).toEqual({ candidates: 1, created: 1 });
    expect(upsertChain.upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          unit_id: "unit-1",
          kind: "appointment",
          appointment_id: "appt-1",
          deduplication_key: "appointment:appt-1:reminder",
          expects_response: false,
          payload_snapshot: { startsAtLocal: "2026-09-09 08:00", roomName: "Consultorio 3" },
        }),
      ],
      { onConflict: "unit_id,deduplication_key", ignoreDuplicates: true, count: "exact" },
    );
  });

  it("B7: una cita programada para dentro de más de 24h todavía no genera recordatorio", async () => {
    queueFrom({
      health_units: [makeChain({ data: [{ id: "unit-1", timezone: "America/Mexico_City" }], error: null })],
      prescriptions: [makeChain({ data: [], error: null })],
      monitoring_plans: [makeChain({ data: [], error: null })],
      appointments: [
        makeChain({
          data: [{ id: "appt-1", patient_id: "patient-1", starts_at: "2026-09-10T14:00:00.000Z", consulting_rooms: null }],
          error: null,
        }),
      ],
      bot_interactions: [makeChain({ data: [], error: null })],
    });

    const result = await materializeDueInteractions(new Date("2026-09-08T14:00:00.000Z"));

    expect(result).toEqual({ candidates: 0, created: 0 });
  });

  it("B7: materializa el check-in de no-respuesta cuando un paciente cruza el umbral de la racha", async () => {
    const upsertChain = makeChain({ data: [{ id: "bi-1" }], error: null });
    queueFrom({
      health_units: [makeChain({ data: [{ id: "unit-1", timezone: "America/Mexico_City" }], error: null })],
      prescriptions: [makeChain({ data: [], error: null })],
      monitoring_plans: [makeChain({ data: [], error: null })],
      appointments: [makeChain({ data: [], error: null })],
      bot_interactions: [
        makeChain({
          data: [
            { id: "bi-1", patient_id: "patient-1", timeout_at: "2026-09-01T00:00:00.000Z", response_at: null },
            { id: "bi-2", patient_id: "patient-1", timeout_at: "2026-09-03T00:00:00.000Z", response_at: null },
            { id: "bi-3", patient_id: "patient-1", timeout_at: "2026-09-05T00:00:00.000Z", response_at: null },
          ],
          error: null,
        }),
        upsertChain,
      ],
    });

    const result = await materializeDueInteractions(new Date("2026-09-08T14:00:00.000Z"));

    expect(result).toEqual({ candidates: 1, created: 1 });
    expect(upsertChain.upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          unit_id: "unit-1",
          kind: "nonresponse_summary",
          patient_id: "patient-1",
          deduplication_key: "nonresponse_summary:patient-1:bi-3",
          expects_response: false,
        }),
      ],
      { onConflict: "unit_id,deduplication_key", ignoreDuplicates: true, count: "exact" },
    );
  });
});

describe("nonresponseStreakAnchors", () => {
  it("sin 3 no-respuestas seguidas, no dispara nada", () => {
    const anchors = nonresponseStreakAnchors([
      { id: "bi-1", patient_id: "p1", timeout_at: "2026-09-01T00:00:00.000Z", response_at: null },
      { id: "bi-2", patient_id: "p1", timeout_at: "2026-09-02T00:00:00.000Z", response_at: null },
    ]);
    expect(anchors).toEqual([]);
  });

  it("ancla en la 3ª no-respuesta y no se mueve aunque la racha crezca a 5", () => {
    const anchors = nonresponseStreakAnchors([
      { id: "bi-1", patient_id: "p1", timeout_at: "2026-09-01T00:00:00.000Z", response_at: null },
      { id: "bi-2", patient_id: "p1", timeout_at: "2026-09-02T00:00:00.000Z", response_at: null },
      { id: "bi-3", patient_id: "p1", timeout_at: "2026-09-03T00:00:00.000Z", response_at: null },
      { id: "bi-4", patient_id: "p1", timeout_at: "2026-09-04T00:00:00.000Z", response_at: null },
      { id: "bi-5", patient_id: "p1", timeout_at: "2026-09-05T00:00:00.000Z", response_at: null },
    ]);
    expect(anchors).toEqual([{ patientId: "p1", anchorInteractionId: "bi-3" }]);
  });

  it("una respuesta rompe la racha: las no-respuestas previas ya no cuentan", () => {
    const anchors = nonresponseStreakAnchors([
      { id: "bi-1", patient_id: "p1", timeout_at: "2026-09-01T00:00:00.000Z", response_at: null },
      { id: "bi-2", patient_id: "p1", timeout_at: "2026-09-02T00:00:00.000Z", response_at: null },
      { id: "bi-3", patient_id: "p1", timeout_at: null, response_at: "2026-09-03T00:00:00.000Z" }, // respondió
      { id: "bi-4", patient_id: "p1", timeout_at: "2026-09-04T00:00:00.000Z", response_at: null },
    ]);
    expect(anchors).toEqual([]);
  });

  it("tras romper la racha, una nueva racha de 3 dispara un ancla distinta a la anterior", () => {
    const anchors = nonresponseStreakAnchors([
      { id: "bi-1", patient_id: "p1", timeout_at: "2026-09-01T00:00:00.000Z", response_at: null },
      { id: "bi-2", patient_id: "p1", timeout_at: "2026-09-02T00:00:00.000Z", response_at: null },
      { id: "bi-3", patient_id: "p1", timeout_at: "2026-09-03T00:00:00.000Z", response_at: null }, // racha vieja, ya se avisó
      { id: "bi-4", patient_id: "p1", timeout_at: null, response_at: "2026-09-04T00:00:00.000Z" }, // rompe la racha
      { id: "bi-5", patient_id: "p1", timeout_at: "2026-09-05T00:00:00.000Z", response_at: null },
      { id: "bi-6", patient_id: "p1", timeout_at: "2026-09-06T00:00:00.000Z", response_at: null },
      { id: "bi-7", patient_id: "p1", timeout_at: "2026-09-07T00:00:00.000Z", response_at: null },
    ]);
    expect(anchors).toEqual([{ patientId: "p1", anchorInteractionId: "bi-7" }]);
  });

  it("dos pacientes distintos se evalúan por separado", () => {
    const anchors = nonresponseStreakAnchors([
      { id: "a1", patient_id: "p1", timeout_at: "2026-09-01T00:00:00.000Z", response_at: null },
      { id: "a2", patient_id: "p1", timeout_at: "2026-09-02T00:00:00.000Z", response_at: null },
      { id: "a3", patient_id: "p1", timeout_at: "2026-09-03T00:00:00.000Z", response_at: null },
      { id: "b1", patient_id: "p2", timeout_at: "2026-09-01T00:00:00.000Z", response_at: null },
    ]);
    expect(anchors).toEqual([{ patientId: "p1", anchorInteractionId: "a3" }]);
  });
});
