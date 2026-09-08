import "server-only";

// Mismo tamaño de página que las lecturas clínicas existentes.
export const JOB_PAGE_SIZE = 500;
type Page<T> = { data: T[] | null; error: unknown; count?: number | null };

/** Exact counts prevent a server-side response cap from looking like end-of-data. */
export async function readAllJobRows<T>(query: (from: number, to: number) => PromiseLike<Page<T>>): Promise<T[]> {
  const rows: T[] = [];
  let offset = 0;
  for (;;) {
    const page = await query(offset, offset + JOB_PAGE_SIZE - 1);
    if (page.error) throw page.error;
    if (!page.data) throw new Error("El job recibió una lectura incompleta.");
    rows.push(...page.data);
    if (page.count != null) {
      if (rows.length >= page.count) return rows;
      if (!page.data.length) throw new Error("La paginación del job quedó incompleta.");
    } else {
      // All callers request exact counts; absence cannot certify completeness.
      throw new Error("La consulta del job no informó el total exacto.");
    }
    offset += page.data.length;
  }
}
