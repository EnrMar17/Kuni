import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth/context", () => ({ requireConsultingRoom: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
import { loadDashboardRows, readAllDashboardRows } from "../../src/lib/queries/dashboard";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/types/database.types";

describe("dashboard query boundaries", () => {
  it("paginates related rows beyond the API page without silently losing observations", async () => {
    const all = Array.from({ length: 1_234 }, (_, id) => ({ id }));
    const query = vi.fn(async (start: number, end: number) => ({ data: all.slice(start, end + 1), error: null }));
    const loaded = await readAllDashboardRows(query);
    expect(loaded).toEqual(all);
    expect(query).toHaveBeenCalledTimes(3);
  });

  it("rejects a failed relation instead of returning zero metrics or fixtures", async () => {
    await expect(readAllDashboardRows(async () => ({ data: null, error: { message: "upstream unavailable" } }))).rejects.toMatchObject({ code: "INTERNAL" });
  });

  it("honors the total count when an API cap is lower than the requested page size", async () => {
    const all = Array.from({ length: 250 }, (_, id) => ({ id }));
    const query = vi.fn(async (start: number) => ({ data: all.slice(start, start + 100), error: null, count: all.length }));
    expect(await readAllDashboardRows(query)).toEqual(all);
    expect(query).toHaveBeenCalledTimes(3);
    await expect(readAllDashboardRows(query, 200)).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("applies unit and room filters before reading any clinical relations", async () => {
    const calls: [string, ...unknown[]][] = [];
    const query = {
      select: (columns: string) => { calls.push(["select", columns]); return query; },
      eq: (column: string, value: unknown) => { calls.push(["eq", column, value]); return query; },
      order: () => query,
      range: async () => ({ data: [], error: null, count: 0 }),
    };
    const from = vi.fn(() => query);
    const client = { from } as unknown as SupabaseClient<Database>;
    const result = await loadDashboardRows(client, { unitId: "unit-a", roomId: "room-a" }, new Date("2026-09-08T18:00:00Z"));
    expect(calls).toContainEqual(["eq", "unit_id", "unit-a"]);
    expect(calls).toContainEqual(["eq", "consulting_room_id", "room-a"]);
    expect(calls).toContainEqual(["eq", "active", true]);
    expect(from).toHaveBeenCalledTimes(1);
    expect(result.rows.patients).toEqual([]);
  });

  it("batches authorized patient ids to bound URLs and keeps unit filters on every relation", async () => {
    const patients = Array.from({ length: 210 }, (_, index) => ({ id: `patient-${index}` }));
    const idBatches: string[][] = [];
    const unitFilters: string[] = [];
    const timeFilters: string[] = [];
    const from = vi.fn((table: string) => {
      const query = {
        select: () => query,
        eq: (column: string, value: string) => { if (column === "unit_id") unitFilters.push(value); return query; },
        in: (column: string, values: string[]) => { if (column === "patient_id") idBatches.push(values); return query; },
        is: () => query, gte: () => query, lte: () => query, or: (clause: string) => { timeFilters.push(clause); return query; }, order: () => query,
        range: async (start: number, end: number) => ({ data: table === "patients" ? patients.slice(start, end + 1) : [], error: null, count: table === "patients" ? patients.length : 0 }),
      };
      return query;
    });
    const result = await loadDashboardRows({ from } as unknown as SupabaseClient<Database>, { unitId: "unit-a", roomId: "room-a" }, new Date("2026-09-08T18:00:00Z"));
    expect(result.rows.patients).toHaveLength(210);
    expect(result.hasMorePatients).toBe(false);
    expect(idBatches).toHaveLength(30);
    expect(idBatches.every((batch) => batch.length <= 100)).toBe(true);
    expect(new Set(idBatches.flat()).size).toBe(210);
    expect(unitFilters).toHaveLength(31);
    expect(unitFilters.every((unit) => unit === "unit-a")).toBe(true);
    expect(timeFilters.every((clause) => clause.includes("response_at.gte."))).toBe(true);
  });
});
