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
 * Consumption (L) = Opening + Added − Closing.
 * Missing / invalid Added is treated as 0. Rounded to 2 decimal places.
 */
export function calculateDieselConsumption(
  openingLevel: number,
  closingLevel: number,
  added?: number | null
): number {
  const opening = Number(openingLevel);
  const closing = Number(closingLevel);
  const addedLitres = added == null ? 0 : Number(added);
  if (!Number.isFinite(opening) || !Number.isFinite(closing)) return 0;
  const add = Number.isFinite(addedLitres) ? addedLitres : 0;
  const consumption = opening + add - closing;
  return Math.round(consumption * 100) / 100;
}

export function isHighUsage(consumption: number): boolean {
  return Number.isFinite(consumption) && consumption > DIESEL_HIGH_USAGE_THRESHOLD_L;
}

export function isNegativeConsumption(consumption: number): boolean {
  return Number.isFinite(consumption) && consumption < 0;
}

/**
 * Spec flags for a calculated consumption value.
 *
 * `high_usage` is a per-generator-entry threshold (DIESEL_HIGH_USAGE_THRESHOLD_L litres for one generator's entry).
 * A migrated historical row is a WHOLE-SITE tank checklist measurement (hundreds to thousands of litres per day
 * across every generator), so that threshold does not apply and the flag would be a false alarm on every row.
 * Negative consumption is arithmetic and applies to every row.
 */
export function getDieselUsageFlagKinds(
  consumption: number,
  origin?: "operational" | "migrated_historical"
): DieselUsageFlagKind[] {
  const flags: DieselUsageFlagKind[] = [];
  if (isNegativeConsumption(consumption)) flags.push("negative_consumption");
  if (origin !== "migrated_historical" && isHighUsage(consumption)) flags.push("high_usage");
  return flags;
}

export function getDieselUsageFlagLabels(
  consumption: number,
  origin?: "operational" | "migrated_historical"
): string[] {
  return getDieselUsageFlagKinds(consumption, origin).map(
    (kind) => DIESEL_USAGE_FLAG_LABELS[kind]
  );
}

/** Presentation of the "generator" field: a migrated row's value is the source checklist label, not a generator. */
export function dieselGeneratorPresentation(entry: {
  generatorId?: string;
  recordOrigin?: "operational" | "migrated_historical";
}): { primary: string; note?: string } {
  if (entry.recordOrigin === "migrated_historical") {
    return { primary: "Whole-site tank", note: entry.generatorId ? `Source: ${entry.generatorId}` : undefined };
  }
  return { primary: entry.generatorId || "—" };
}

export function toCreateFormValues(entry?: DieselUsage | null) {
  return {
    date: toDateInputValue(entry?.date) || "",
    facilityId: entry?.facilityId ?? "",
    generatorId: entry?.generatorId ?? "",
    openingLevel: entry?.openingLevel != null ? String(entry.openingLevel) : "",
    added: entry?.added != null ? String(entry.added) : "",
    closingLevel: entry?.closingLevel != null ? String(entry.closingLevel) : "",
  };
}

function parseOptionalNumber(value: string | number | undefined): number | undefined {
  if (value == null) return undefined;
  const raw = String(value).trim();
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function parseRequiredNumber(value: string | number): number {
  if (typeof value === "number") return value;
  return Number(String(value).trim());
}

/**
 * Build create payload from form-shaped strings.
 * Consumption is always derived — never taken from the form.
 */
export function toCreateDieselUsageInput(values: {
  date: string;
  facilityId: string;
  generatorId: string;
  openingLevel: string | number;
  added?: string | number;
  closingLevel: string | number;
}): CreateDieselUsageInput {
  const openingLevel = parseRequiredNumber(values.openingLevel);
  const closingLevel = parseRequiredNumber(values.closingLevel);
  const added = parseOptionalNumber(values.added);

  return {
    date: values.date.trim(),
    facilityId: values.facilityId.trim(),
    generatorId: values.generatorId.trim(),
    openingLevel: Number.isFinite(openingLevel) ? openingLevel : 0,
    closingLevel: Number.isFinite(closingLevel) ? closingLevel : 0,
    ...(added != null ? { added } : {}),
  };
}
