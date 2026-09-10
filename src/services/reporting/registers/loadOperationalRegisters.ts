import { ConsumablesUpdateService } from "@/services/consumablesUpdate/ConsumablesUpdateService";
import { DeepCleaningLogService } from "@/services/deepCleaningLog/DeepCleaningLogService";
import { DieselUsageService } from "@/services/dieselUsage/DieselUsageService";
import { EnergyReadingService } from "@/services/energyReading/EnergyReadingService";
import { FumigationLogService } from "@/services/fumigationLog/FumigationLogService";
import { GeneratorLogService } from "@/services/generatorLog/GeneratorLogService";
import { WasteLogService } from "@/services/wasteLog/WasteLogService";
import { loadAllPages } from "@/services/reporting/loadAllPages";
import {
  OPERATIONAL_REGISTER_IDS,
  type OperationalRegisterId,
  type OperationalRegistersBundle,
  type OperationalRegistersQuery,
} from "./types";

/** Registers with no facilityId on the domain model / list API. */
const FACILITY_FILTER_UNSUPPORTED: OperationalRegisterId[] = [
  "generator-log",
  "energy-reading",
];

function resolveRequested(
  registers?: OperationalRegisterId[]
): OperationalRegisterId[] {
  if (!registers || registers.length === 0) {
    return [...OPERATIONAL_REGISTER_IDS];
  }
  const allowed = new Set<string>(OPERATIONAL_REGISTER_IDS);
  const unique: OperationalRegisterId[] = [];
  for (const id of registers) {
    if (!allowed.has(id)) continue;
    if (unique.includes(id)) continue;
    unique.push(id);
  }
  return unique.length > 0 ? unique : [...OPERATIONAL_REGISTER_IDS];
}

function facilityParam(facilityId?: string): string | "all" {
  const trimmed = facilityId?.trim();
  return trimmed ? trimmed : "all";
}

async function safeLoad<T>(
  id: OperationalRegisterId,
  requested: Set<OperationalRegisterId>,
  loader: () => Promise<T[]>,
  failed: OperationalRegisterId[]
): Promise<T[]> {
  if (!requested.has(id)) return [];
  try {
    return await loader();
  } catch {
    failed.push(id);
    return [];
  }
}

/**
 * Compose full operational-register row sets from existing domain services.
 * Does not persist, recalculate, or cross-link registers.
 */
export async function loadOperationalRegistersBundle(
  query: OperationalRegistersQuery = {}
): Promise<OperationalRegistersBundle> {
  const facilityId = query.facilityId?.trim() || undefined;
  const dateFrom = query.dateFrom?.trim() || undefined;
  const dateTo = query.dateTo?.trim() || undefined;
  const asOf = query.asOf?.trim() || new Date().toISOString();
  const requested = resolveRequested(query.registers);
  const requestedSet = new Set(requested);
  const omitted = OPERATIONAL_REGISTER_IDS.filter((id) => !requestedSet.has(id));
  const failed: OperationalRegisterId[] = [];
  const facilityFilter =
    facilityId != null
      ? FACILITY_FILTER_UNSUPPORTED.filter((id) => requestedSet.has(id))
      : [];

  const [
    generatorLogs,
    energyReadings,
    dieselUsage,
    consumablesUpdates,
    wasteLogs,
    fumigationLogs,
    deepCleaningLogs,
  ] = await Promise.all([
    safeLoad("generator-log", requestedSet, () =>
      loadAllPages((page, pageSize) =>
        GeneratorLogService.listGeneratorLogs({
          page,
          pageSize,
          dateFrom,
          dateTo,
        })
      )
    , failed),
    safeLoad("energy-reading", requestedSet, () =>
      loadAllPages((page, pageSize) =>
        EnergyReadingService.listEnergyReadings({
          page,
          pageSize,
          dateFrom,
          dateTo,
        })
      )
    , failed),
    safeLoad("diesel-usage", requestedSet, () =>
      loadAllPages((page, pageSize) =>
        DieselUsageService.listDieselUsage({
          page,
          pageSize,
          facilityId: facilityParam(facilityId),
          dateFrom,
          dateTo,
        })
      )
    , failed),
    safeLoad("consumables-update", requestedSet, () =>
      loadAllPages((page, pageSize) =>
        ConsumablesUpdateService.listConsumablesUpdates({
          page,
          pageSize,
          facilityId: facilityParam(facilityId),
          dateFrom,
          dateTo,
        })
      )
    , failed),
    safeLoad("waste-log", requestedSet, () =>
      loadAllPages((page, pageSize) =>
        WasteLogService.listWasteLogs({
          page,
          pageSize,
          facilityId: facilityParam(facilityId),
          dateFrom,
          dateTo,
        })
      )
    , failed),
    safeLoad("fumigation-log", requestedSet, () =>
      loadAllPages((page, pageSize) =>
        FumigationLogService.listFumigationLogs({
          page,
          pageSize,
          facilityId: facilityParam(facilityId),
          dateFrom,
          dateTo,
        })
      )
    , failed),
    safeLoad("deep-cleaning-log", requestedSet, () =>
      loadAllPages((page, pageSize) =>
        DeepCleaningLogService.listDeepCleaningLogs({
          page,
          pageSize,
          facilityId: facilityParam(facilityId),
          dateFrom,
          dateTo,
        })
      )
    , failed),
  ]);

  const loaded = requested.filter((id) => !failed.includes(id));

  return {
    asOf,
    facilityId,
    dateFrom,
    dateTo,
    generatorLogs,
    energyReadings,
    dieselUsage,
    consumablesUpdates,
    wasteLogs,
    fumigationLogs,
    deepCleaningLogs,
    meta: {
      requested,
      loaded,
      failed,
      omitted,
      facilityFilterUnsupported: facilityFilter,
    },
  };
}
