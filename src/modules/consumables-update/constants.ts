import type { ConsumablesUpdateSort } from "./types";

export const CONSUMABLES_UPDATE_PAGE_SIZE = 8;

export const DEFAULT_CONSUMABLES_UPDATE_SORT: ConsumablesUpdateSort = "newest";

export const CONSUMABLES_UPDATE_SORT_OPTIONS: Array<{
  value: ConsumablesUpdateSort;
  label: string;
}> = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "date_desc", label: "Date (newest)" },
  { value: "date_asc", label: "Date (oldest)" },
];

/** Display labels for Consumables Update fields (presentation / forms). */
export const CONSUMABLES_UPDATE_FIELD_LABELS = {
  date: "Date",
  facilityId: "Facility ID",
  itemId: "Item ID",
  itemName: "Item Name",
  opening: "Opening",
  received: "Received",
  issued: "Issued",
  closing: "Closing",
  reorderLevel: "Reorder Level",
} as const;

export const CONSUMABLES_UPDATE_FLAG_LABELS = {
  reorder_now: "⚠ Reorder now",
} as const;
