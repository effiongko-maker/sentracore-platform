import type { ConsumablesUpdate } from "@/modules/consumables-update/types";
import type { DeepCleaningLog } from "@/modules/deep-cleaning-log/types";
import type { DieselUsage } from "@/modules/diesel-usage/types";
import type { EnergyReading } from "@/modules/energy-reading/types";
import type { FumigationLog } from "@/modules/fumigation-log/types";
import type { GeneratorLog } from "@/modules/generator-log/types";
import type { WasteLog } from "@/modules/waste-log/types";

/**
 * Operational Register identifiers — mirror Apps Script / API resource slugs.
 * Registers remain independent domains; this layer only reads them.
 */
export const OPERATIONAL_REGISTER_IDS = [
  "generator-log",
  "energy-reading",
  "diesel-usage",
  "consumables-update",
  "waste-log",
  "fumigation-log",
  "deep-cleaning-log",
] as const;

export type OperationalRegisterId = (typeof OPERATIONAL_REGISTER_IDS)[number];

/**
 * Shared reporting query for operational registers.
 * Facility is applied only where the source register supports facilityId.
 */
export interface OperationalRegistersQuery {
  /** Facility ID. Applied where supported; ignored for generator-log / energy-reading. */
  facilityId?: string;
  /** Inclusive lower bound on register `date` (ISO `YYYY-MM-DD`). */
  dateFrom?: string;
  /** Inclusive upper bound on register `date` (ISO `YYYY-MM-DD`). */
  dateTo?: string;
  /** Optional snapshot timestamp metadata (ISO datetime). Defaults to now. */
  asOf?: string;
  /** Subset of registers to load. Defaults to all seven. */
  registers?: OperationalRegisterId[];
}

export interface OperationalRegistersBundleMeta {
  /** Registers requested for this load. */
  requested: OperationalRegisterId[];
  /** Registers that returned successfully (may be empty arrays). */
  loaded: OperationalRegisterId[];
  /** Registers that threw and were replaced with empty arrays. */
  failed: OperationalRegisterId[];
  /** Registers intentionally skipped via `registers` filter. */
  omitted: OperationalRegisterId[];
  /**
   * Registers that cannot honour `facilityId` (no facility dimension today).
   * Populated only when `facilityId` was requested.
   */
  facilityFilterUnsupported: OperationalRegisterId[];
}

/**
 * Canonical operational-register rows for reporting consumers.
 * Values (including derived hours / consumption / closing / due display) come
 * from each domain service unchanged — this bundle does not recalculate them.
 */
export interface OperationalRegistersBundle {
  asOf: string;
  facilityId?: string;
  dateFrom?: string;
  dateTo?: string;
  generatorLogs: GeneratorLog[];
  energyReadings: EnergyReading[];
  dieselUsage: DieselUsage[];
  consumablesUpdates: ConsumablesUpdate[];
  wasteLogs: WasteLog[];
  fumigationLogs: FumigationLog[];
  deepCleaningLogs: DeepCleaningLog[];
  meta: OperationalRegistersBundleMeta;
}
