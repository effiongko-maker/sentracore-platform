import type {
  CreateDieselUsageInput,
  DieselUsage,
  DieselUsageFlagKind,
} from "./types";
import {
  DIESEL_HIGH_USAGE_THRESHOLD_L,
  DIESEL_USAGE_FLAG_LABELS,
} from "./constants";

export function labelize(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function optionalString(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** date input value (`YYYY-MM-DD`) from an ISO date or datetime. */
export function toDateInputValue(iso?: string): string {
  if (!iso) return "";
  const trimmed = iso.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Arithmetic consumption (L) = Opening + Added − Closing — a HELPER for the entry form's suggestion only; the stored
 * consumption is what was recorded. Returns null when a reading is missing (a missing Added is "no delivery entered").
 */
export function calculateDieselConsumption(
  openingLevel: number | null | undefined,
  closingLevel: number | null | undefined,
  added?: number | null
): number | null {
  if (openingLevel == null || closingLevel == null) return null;
  const opening = Number(openingLevel);
  const closing = Number(closingLevel);
  const add = added == null ? 0 : Number(added);
  if (!Number.isFinite(opening) || !Number.isFinite(closing) || !Number.isFinite(add)) return null;
  return Math.round((opening + add - closing) * 100) / 100;
}

/**
 * Reading variance (L) = (Opening + Added − Closing) − recorded Consumption: shown to the reviewer, never corrected.
 * null unless opening, closing and consumption were all recorded. `addedRecorded` says whether Added was part of it.
 */
export function dieselVariance(entry: Pick<DieselUsage, "openingLevel" | "closingLevel" | "consumption" | "added">): { variance: number; addedRecorded: boolean } | null {
  if (entry.openingLevel == null || entry.closingLevel == null || entry.consumption == null) return null;
  const expected = calculateDieselConsumption(entry.openingLevel, entry.closingLevel, entry.added);
  if (expected == null) return null;
  return { variance: Math.round((expected - entry.consumption) * 100) / 100, addedRecorded: entry.added != null };
}

/** Litres for display; null → "Not recorded" (never 0). */
export function formatLitres(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "Not recorded" : `${value.toLocaleString("en-GB", { maximumFractionDigits: 2 })} L`;
}

export function isHighUsage(consumption: number | null | undefined): boolean {
  return consumption != null && Number.isFinite(consumption) && consumption > DIESEL_HIGH_USAGE_THRESHOLD_L;
}

export function isNegativeConsumption(consumption: number | null | undefined): boolean {
  return consumption != null && Number.isFinite(consumption) && consumption < 0;
}

/**
 * Spec flags for a consumption value (null = not recorded → no flag).
 *
 * `high_usage` is a per-generator-entry threshold (DIESEL_HIGH_USAGE_THRESHOLD_L litres for one generator's entry).
 * A migrated historical row is a WHOLE-SITE tank observation, so that threshold does not apply.
 */
export function getDieselUsageFlagKinds(
  consumption: number | null | undefined,
  origin?: "operational" | "migrated_historical"
): DieselUsageFlagKind[] {
  const flags: DieselUsageFlagKind[] = [];
  if (isNegativeConsumption(consumption)) flags.push("negative_consumption");
  if (origin !== "migrated_historical" && isHighUsage(consumption)) flags.push("high_usage");
  return flags;
}

export function getDieselUsageFlagLabels(
  consumption: number | null | undefined,
  origin?: "operational" | "migrated_historical"
): string[] {
  return getDieselUsageFlagKinds(consumption, origin).map(
    (kind) => DIESEL_USAGE_FLAG_LABELS[kind]
  );
}

/**
 * Presentation of the "generator" field. A migrated historical row is a whole-site tank measurement with no
 * generator (generatorId is null): it reads "Whole-site tank", never a generator id and never a source label.
 */
export function dieselGeneratorPresentation(entry: {
  generatorId?: string | null;
  recordOrigin?: "operational" | "migrated_historical";
}): { primary: string; note?: string } {
  if (entry.generatorId) return { primary: entry.generatorId };
  if (entry.recordOrigin === "migrated_historical") return { primary: "Whole-site tank", note: "No generator recorded" };
  return { primary: "—" };
}

export function toCreateFormValues(entry?: DieselUsage | null) {
  const str = (v: number | null | undefined) => (v != null ? String(v) : "");
  return {
    date: toDateInputValue(entry?.date) || "",
    facilityId: entry?.facilityId ?? "",
    generatorId: entry?.generatorId ?? "",
    openingLevel: str(entry?.openingLevel),
    added: str(entry?.added),
    closingLevel: str(entry?.closingLevel),
    consumption: str(entry?.consumption),
    undergroundTankQty: str(entry?.undergroundTankQty),
    surfaceTankQty: str(entry?.surfaceTankQty),
  };
}

/** Blank → null (not recorded), never 0. */
function parseRecorded(value: string | number | undefined): number | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Build the create/update payload from form strings: every blank value is sent as null (not recorded). */
export function toCreateDieselUsageInput(values: {
  date: string;
  facilityId: string;
  generatorId: string;
  openingLevel: string | number;
  added?: string | number;
  closingLevel: string | number;
  consumption?: string | number;
  undergroundTankQty?: string | number;
  surfaceTankQty?: string | number;
}): CreateDieselUsageInput {
  return {
    date: values.date.trim(),
    facilityId: values.facilityId.trim(),
    generatorId: values.generatorId.trim(),
    openingLevel: parseRecorded(values.openingLevel),
    added: parseRecorded(values.added),
    closingLevel: parseRecorded(values.closingLevel),
    consumption: parseRecorded(values.consumption),
    undergroundTankQty: parseRecorded(values.undergroundTankQty),
    surfaceTankQty: parseRecorded(values.surfaceTankQty),
  };
}
