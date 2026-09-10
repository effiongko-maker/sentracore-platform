import type { ConsumablesUpdate } from "@/modules/consumables-update/types";
import type { DeepCleaningLog } from "@/modules/deep-cleaning-log/types";
import type { DieselUsage } from "@/modules/diesel-usage/types";
import type { EnergyReading } from "@/modules/energy-reading/types";
import type { FumigationLog } from "@/modules/fumigation-log/types";
import type { GeneratorLog } from "@/modules/generator-log/types";
import type { WasteLog } from "@/modules/waste-log/types";
import { loadOperationalRegistersBundle } from "./loadOperationalRegisters";
import type {
  OperationalRegisterId,
  OperationalRegistersBundle,
  OperationalRegistersQuery,
} from "./types";

type RegisterRowMap = {
  "generator-log": GeneratorLog;
  "energy-reading": EnergyReading;
  "diesel-usage": DieselUsage;
  "consumables-update": ConsumablesUpdate;
  "waste-log": WasteLog;
  "fumigation-log": FumigationLog;
  "deep-cleaning-log": DeepCleaningLog;
};

function rowsForRegister<K extends OperationalRegisterId>(
  bundle: OperationalRegistersBundle,
  id: K
): RegisterRowMap[K][] {
  switch (id) {
    case "generator-log":
      return bundle.generatorLogs as RegisterRowMap[K][];
    case "energy-reading":
      return bundle.energyReadings as RegisterRowMap[K][];
    case "diesel-usage":
      return bundle.dieselUsage as RegisterRowMap[K][];
    case "consumables-update":
      return bundle.consumablesUpdates as RegisterRowMap[K][];
    case "waste-log":
      return bundle.wasteLogs as RegisterRowMap[K][];
    case "fumigation-log":
      return bundle.fumigationLogs as RegisterRowMap[K][];
    case "deep-cleaning-log":
      return bundle.deepCleaningLogs as RegisterRowMap[K][];
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

/**
 * Reporting/read facade for Operational Registers.
 *
 * Consumes existing domain list services only — no persistence, no KPIs,
 * no dashboards, and no cross-register relationships.
 */
export const OperationalRegistersReadService = {
  /**
   * Load one or more operational registers for reporting consumers,
   * scoped by facility (where supported) and date range.
   */
  async getBundle(
    query: OperationalRegistersQuery = {}
  ): Promise<OperationalRegistersBundle> {
    return loadOperationalRegistersBundle(query);
  },

  /**
   * Convenience: load a single register’s rows through the shared query shape.
   */
  async listRegister<K extends OperationalRegisterId>(
    id: K,
    query: Omit<OperationalRegistersQuery, "registers"> = {}
  ): Promise<RegisterRowMap[K][]> {
    const bundle = await loadOperationalRegistersBundle({
      ...query,
      registers: [id],
    });
    return rowsForRegister(bundle, id);
  },
};

export type IOperationalRegistersReadService =
  typeof OperationalRegistersReadService;
