import type { DeepCleaningLogSort } from "./types";

export const DEEP_CLEANING_LOG_PAGE_SIZE = 8;

export const DEFAULT_DEEP_CLEANING_LOG_SORT: DeepCleaningLogSort = "newest";

export const DEEP_CLEANING_LOG_SORT_OPTIONS: Array<{
  value: DeepCleaningLogSort;
  label: string;
}> = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "date_desc", label: "Date (newest)" },
  { value: "date_asc", label: "Date (oldest)" },
];

/** Display labels for Deep Cleaning Log fields (presentation / forms). */
export const DEEP_CLEANING_LOG_FIELD_LABELS = {
  id: "Log ID",
  date: "Date",
  facilityId: "Facility",
  area: "Area",
  vendorTeam: "Vendor/Team",
  status: "Status",
  remarks: "Remarks",
} as const;
