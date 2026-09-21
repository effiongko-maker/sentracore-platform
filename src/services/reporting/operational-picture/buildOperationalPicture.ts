import { shouldReorderNow } from "@/modules/consumables-update/utils";
import { getDieselUsageFlagKinds } from "@/modules/diesel-usage/utils";
import { getFumigationDueState } from "@/modules/fumigation-log/utils";
import type { ConsumablesUpdate } from "@/modules/consumables-update/types";
import type { DeepCleaningLog } from "@/modules/deep-cleaning-log/types";
import type { DieselUsage } from "@/modules/diesel-usage/types";
import type { EnergyReading } from "@/modules/energy-reading/types";
import type { FumigationLog } from "@/modules/fumigation-log/types";
import type { GeneratorLog } from "@/modules/generator-log/types";
import type { WasteLog } from "@/modules/waste-log/types";
import type {
  OperationalRegisterId,
  OperationalRegistersBundle,
} from "@/services/reporting/registers/types";
import type {
  OperationalPicture,
  OperationalPictureDerived,
  OperationalRegisterLatestActivity,
  OperationalRegisterSection,
} from "./types";

type DatedRecord = {
  id: string;
  date?: string;
  createdAt?: string;
};

function compareActivity(a: DatedRecord, b: DatedRecord): number {
  const dateCmp = String(b.date || "").localeCompare(String(a.date || ""));
  if (dateCmp !== 0) return dateCmp;
  return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
}

function latestActivity(
  records: DatedRecord[]
): OperationalRegisterLatestActivity | null {
  if (records.length === 0) return null;
  const top = [...records].sort(compareActivity)[0];
  if (!top?.id) return null;
  return {
    id: top.id,
    date: String(top.date || "").slice(0, 10),
    createdAt: String(top.createdAt || ""),
  };
}

function sectionFor<T extends DatedRecord>(
  registerId: OperationalRegisterId,
  records: T[],
  failed: readonly OperationalRegisterId[]
): OperationalRegisterSection<T> {
  // A failed register is UNAVAILABLE (count unknown) — never a healthy zero.
  if (failed.includes(registerId)) {
    return { registerId, count: null, unavailable: true, latest: null, records: [] };
  }
  return {
    registerId,
    count: records.length,
    unavailable: false,
    latest: latestActivity(records),
    records,
  };
}

function asOfDate(asOf: string): Date {
  const parsed = new Date(asOf);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function buildDerived(
  dieselUsage: DieselUsage[],
  consumablesUpdates: ConsumablesUpdate[],
  fumigationLogs: FumigationLog[],
  asOf: string,
  failed: readonly OperationalRegisterId[]
): OperationalPictureDerived {
  const asOfDt = asOfDate(asOf);

  const dieselHighUsage: DieselUsage[] = [];
  const dieselNegativeConsumption: DieselUsage[] = [];
  for (const row of dieselUsage) {
    const flags = getDieselUsageFlagKinds(row.consumption, row.recordOrigin);
    if (flags.includes("high_usage")) dieselHighUsage.push(row);
    if (flags.includes("negative_consumption")) {
      dieselNegativeConsumption.push(row);
    }
  }

  const consumablesReorder = consumablesUpdates.filter((row) =>
    shouldReorderNow(row.closing, row.reorderLevel)
  );

  const fumigationOverdue: FumigationLog[] = [];
  const fumigationDueSoon: FumigationLog[] = [];
  const fumigationScheduled: FumigationLog[] = [];
  for (const row of fumigationLogs) {
    const state = getFumigationDueState(row.nextDueDate, asOfDt);
    if (state === "overdue") fumigationOverdue.push(row);
    else if (state === "due_soon") fumigationDueSoon.push(row);
    else if (state === "scheduled") fumigationScheduled.push(row);
  }

  const unavailable: OperationalPictureDerived["unavailable"] = [];
  if (failed.includes("diesel-usage")) unavailable.push("dieselHighUsage", "dieselNegativeConsumption");
  if (failed.includes("consumables-update")) unavailable.push("consumablesReorder");
  if (failed.includes("fumigation-log")) unavailable.push("fumigationOverdue", "fumigationDueSoon", "fumigationScheduled");

  return {
    unavailable,
    dieselHighUsage,
    dieselNegativeConsumption,
    consumablesReorder,
    fumigationOverdue,
    fumigationDueSoon,
    fumigationScheduled,
  };
}

/**
 * Pure composition: Operational Registers bundle → Operational Picture.
 * Does not fetch, recalculate domain formulas, or invent thresholds.
 */
export function buildOperationalPicture(
  bundle: OperationalRegistersBundle
): OperationalPicture {
  const generatorLogs: GeneratorLog[] = bundle.generatorLogs;
  const energyReadings: EnergyReading[] = bundle.energyReadings;
  const dieselUsage: DieselUsage[] = bundle.dieselUsage;
  const consumablesUpdates: ConsumablesUpdate[] = bundle.consumablesUpdates;
  const wasteLogs: WasteLog[] = bundle.wasteLogs;
  const fumigationLogs: FumigationLog[] = bundle.fumigationLogs;
  const deepCleaningLogs: DeepCleaningLog[] = bundle.deepCleaningLogs;
  const failed = bundle.meta.failed;

  return {
    asOf: bundle.asOf,
    facilityId: bundle.facilityId,
    dateFrom: bundle.dateFrom,
    dateTo: bundle.dateTo,
    registers: {
      generatorLog: sectionFor("generator-log", generatorLogs, failed),
      energyReading: sectionFor("energy-reading", energyReadings, failed),
      dieselUsage: sectionFor("diesel-usage", dieselUsage, failed),
      consumablesUpdate: sectionFor("consumables-update", consumablesUpdates, failed),
      wasteLog: sectionFor("waste-log", wasteLogs, failed),
      fumigationLog: sectionFor("fumigation-log", fumigationLogs, failed),
      deepCleaningLog: sectionFor("deep-cleaning-log", deepCleaningLogs, failed),
    },
    derived: buildDerived(
      dieselUsage,
      consumablesUpdates,
      fumigationLogs,
      bundle.asOf,
      failed
    ),
    meta: {
      ...bundle.meta,
      facilityFilterUnsupported: bundle.meta.facilityFilterUnsupported,
    },
  };
}
