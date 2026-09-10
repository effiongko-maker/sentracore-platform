import type { ConsumablesUpdate } from "@/modules/consumables-update/types";
import type { DeepCleaningLog } from "@/modules/deep-cleaning-log/types";
import type { DieselUsage } from "@/modules/diesel-usage/types";
import type { EnergyReading } from "@/modules/energy-reading/types";
import type { FumigationLog } from "@/modules/fumigation-log/types";
import type { GeneratorLog } from "@/modules/generator-log/types";
import type { WasteLog } from "@/modules/waste-log/types";
import type {
  OperationalRegisterId,
  OperationalRegistersBundleMeta,
  OperationalRegistersQuery,
} from "@/services/reporting/registers/types";

/** Query for Operational Picture — same scope axes as the register read layer. */
export type OperationalPictureQuery = Omit<
  OperationalRegistersQuery,
  "registers"
>;

/** Latest activity pointer within a register section (no invented metrics). */
export interface OperationalRegisterLatestActivity {
  id: string;
  /** Register calendar date (`YYYY-MM-DD`) when present. */
  date: string;
  createdAt: string;
}

/**
 * One register’s contribution to the picture.
 * `records` are already scoped by the read layer (facility where supported + date range).
 */
export interface OperationalRegisterSection<T> {
  registerId: OperationalRegisterId;
  count: number;
  latest: OperationalRegisterLatestActivity | null;
  records: T[];
}

/**
 * Register-derived states already defined by domain utils / fields.
 * Grouped by existing semantics — no new thresholds or severities.
 */
export interface OperationalPictureDerived {
  dieselHighUsage: DieselUsage[];
  dieselNegativeConsumption: DieselUsage[];
  consumablesReorder: ConsumablesUpdate[];
  fumigationOverdue: FumigationLog[];
  fumigationDueSoon: FumigationLog[];
  fumigationScheduled: FumigationLog[];
}

export interface OperationalPictureMeta extends OperationalRegistersBundleMeta {
  /**
   * Echo of facility filter unsupported registers when facilityId was requested.
   * Same meaning as the read layer (generator-log / energy-reading today).
   */
  facilityFilterUnsupported: OperationalRegisterId[];
}

/**
 * Typed Operational Picture — composition over Operational Registers only.
 * Not a dashboard DTO and not part of ReportingSnapshot KPIs.
 */
export interface OperationalPicture {
  asOf: string;
  facilityId?: string;
  dateFrom?: string;
  dateTo?: string;
  registers: {
    generatorLog: OperationalRegisterSection<GeneratorLog>;
    energyReading: OperationalRegisterSection<EnergyReading>;
    dieselUsage: OperationalRegisterSection<DieselUsage>;
    consumablesUpdate: OperationalRegisterSection<ConsumablesUpdate>;
    wasteLog: OperationalRegisterSection<WasteLog>;
    fumigationLog: OperationalRegisterSection<FumigationLog>;
    deepCleaningLog: OperationalRegisterSection<DeepCleaningLog>;
  };
  derived: OperationalPictureDerived;
  meta: OperationalPictureMeta;
}
