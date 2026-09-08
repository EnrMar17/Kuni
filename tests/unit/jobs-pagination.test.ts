import { describe, expect, it, vi } from "vitest";
import { readAllJobRows } from "@/lib/jobs/pagination";

describe("lectura completa de jobs", () => {
  it("continúa aunque el API limite las páginas por debajo de 500", async () => {
    const all = Array.from({ length: 1_201 }, (_, id) => ({ id }));
    const query = vi.fn(async (from: number) => ({ data: all.slice(from, from + 200), count: all.length, error: null }));
    expect(await readAllJobRows(query)).toEqual(all);
    expect(query).toHaveBeenLastCalledWith(1_200, 1_699);
  });
  it("no declara completa una página vacía antes del total", async () => {
    await expect(readAllJobRows(async () => ({ data: [], count: 4, error: null }))).rejects.toThrow("incompleta");
  });
  it("propaga errores y rechaza ausencia de conteo", async () => {
    await expect(readAllJobRows(async () => ({ data: null, error: new Error("offline") }))).rejects.toThrow("offline");
    await expect(readAllJobRows(async () => ({ data: [], count: null, error: null }))).rejects.toThrow("total exacto");
  });
});
