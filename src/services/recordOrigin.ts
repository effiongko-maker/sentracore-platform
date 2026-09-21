/**
 * Carry the server's `recordOrigin` through a browser-side mapper.
 *
 * The client services rebuild each domain object field by field; a field they do not copy is silently lost, and
 * everything that depends on it (Issues origin / actions, report periods, activity feeds, diesel semantics) then
 * treats an imported historical record as an operational one. `migrated_historical` is preserved verbatim; anything
 * else is operational.
 */
export type ClientRecordOrigin = "operational" | "migrated_historical";

export function readRecordOrigin(raw: unknown): ClientRecordOrigin {
  const value = (raw as { recordOrigin?: unknown } | null | undefined)?.recordOrigin;
  return value === "migrated_historical" ? "migrated_historical" : "operational";
}
