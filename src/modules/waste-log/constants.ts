import type { WasteLogSort } from "./types";

export const WASTE_LOG_PAGE_SIZE = 8;

export const DEFAULT_WASTE_LOG_SORT: WasteLogSort = "newest";

export const WASTE_LOG_SORT_OPTIONS: Array<{
  value: WasteLogSort;
  label: string;
}> = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "date_desc", label: "Date (newest)" },
  { value: "date_asc", label: "Date (oldest)" },
];

/** Display labels for Waste Log fields (presentation / forms). */
export const WASTE_LOG_FIELD_LABELS = {
  id: "Log ID",
  date: "Date",
  facilityId: "Facility",
  wasteType: "Waste Type",
  quantity: "Quantity",
  unit: "Unit",
  disposalMethod: "Disposal Method",
  remarks: "Remarks",
} as const;
