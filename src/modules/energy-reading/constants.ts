import type { EnergyReadingSort } from "./types";

export const ENERGY_READING_PAGE_SIZE = 8;

export const DEFAULT_ENERGY_READING_SORT: EnergyReadingSort = "newest";

export const ENERGY_READING_SORT_OPTIONS: Array<{
  value: EnergyReadingSort;
  label: string;
}> = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "date_desc", label: "Date (newest)" },
  { value: "date_asc", label: "Date (oldest)" },
];

/** Display labels for Energy Reading fields (presentation / forms). */
export const ENERGY_READING_FIELD_LABELS = {
  date: "Date",
  meter: "Meter No.",
  reading: "Reading",
  remarks: "Remarks",
} as const;
