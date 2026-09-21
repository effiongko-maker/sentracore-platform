import type { Maintenance } from "@/modules/maintenance/types";

/**
 * Imported historical Work (record_origin = migrated_historical) is source evidence, not current operational state.
 * The authoritative refusal is server-side (FmWorkRepository.update → FmWorkReadOnlyError); this only lets the UI stop
 * offering actions that would be refused.
 */
export function isHistoricalWork(work: Pick<Maintenance, "recordOrigin"> | null | undefined): boolean {
  return work?.recordOrigin === "migrated_historical";
}
