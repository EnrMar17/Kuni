/** PostgreSQL keeps microseconds; Date alone would admit a dose just before an adjustment. */
export function isAtOrAfterEffectiveTime(occurrence: string, effective: string): boolean {
  const occurrenceMs = Date.parse(occurrence);
  const effectiveMs = Date.parse(effective);
  if (!Number.isFinite(occurrenceMs) || !Number.isFinite(effectiveMs)) throw new Error("Instante efectivo u ocurrencia inválidos.");
  if (occurrenceMs !== effectiveMs) return occurrenceMs > effectiveMs;
  const submillisecond = (iso: string) => {
    const fraction = iso.match(/\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/i)?.[1] ?? "";
    return Number(fraction.padEnd(6, "0").slice(3, 6));
  };
  return submillisecond(occurrence) >= submillisecond(effective);
}
