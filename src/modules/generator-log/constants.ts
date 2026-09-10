import type { GeneratorLogSort } from "./types";

export const GENERATOR_LOG_PAGE_SIZE = 8;

export const DEFAULT_GENERATOR_LOG_SORT: GeneratorLogSort = "newest";

export const GENERATOR_LOG_SORT_OPTIONS: Array<{
  value: GeneratorLogSort;
  label: string;
}> = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "date_desc", label: "Date (newest)" },
  { value: "date_asc", label: "Date (oldest)" },
];

/** Display labels for Generator Log fields (presentation / forms). */
export const GENERATOR_LOG_FIELD_LABELS = {
  date: "Date",
  generator: "Generator",
  startedAt: "Start",
  endedAt: "End",
  hours: "Hours",
  fuelUsed: "Diesel Used",
  remarks: "Remarks",
} as const;
