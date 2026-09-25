import type { DieselUsageSort } from "./types";

export const DIESEL_USAGE_PAGE_SIZE = 8;

/** Diesel Usage is a chronological register: newest observation DATE first across all facilities (never grouped by
 *  facility or by when rows were entered); equal dates tie-break deterministically by entry time. */
export const DEFAULT_DIESEL_USAGE_SORT: DieselUsageSort = "date_desc";

/** Spec: flag high usage when daily consumption exceeds 100L. */
export const DIESEL_HIGH_USAGE_THRESHOLD_L = 100;

export const DIESEL_USAGE_SORT_OPTIONS: Array<{
  value: DieselUsageSort;
  label: string;
}> = [
  { value: "date_desc", label: "Date (newest)" },
  { value: "date_asc", label: "Date (oldest)" },
  { value: "newest", label: "Recently entered" },
  { value: "oldest", label: "First entered" },
];

/** Display labels for Diesel Usage fields (presentation / forms). */
export const DIESEL_USAGE_FIELD_LABELS = {
  date: "Date",
  facilityId: "Facility ID",
  generatorId: "Generator ID",
  openingLevel: "Opening Level (L)",
  undergroundTankQty: "Underground tank (L)",
  surfaceTankQty: "Surface tank (L)",
  added: "Added (L)",
  closingLevel: "Closing Level (L)",
  consumption: "Consumption (L)",
} as const;

export const DIESEL_USAGE_FLAG_LABELS = {
  high_usage: "⚠ High usage",
  negative_consumption: "⚠ Negative — check entry",
} as const;
