import type { FumigationDueState, FumigationLogSort } from "./types";

export const FUMIGATION_LOG_PAGE_SIZE = 8;

export const DEFAULT_FUMIGATION_LOG_SORT: FumigationLogSort = "newest";

/** Days ahead of today (inclusive) treated as “Due soon”. */
export const FUMIGATION_DUE_SOON_DAYS = 7;

export const FUMIGATION_LOG_SORT_OPTIONS: Array<{
  value: FumigationLogSort;
  label: string;
}> = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "date_desc", label: "Date (newest)" },
  { value: "date_asc", label: "Date (oldest)" },
  { value: "next_due_asc", label: "Next due (soonest)" },
  { value: "next_due_desc", label: "Next due (latest)" },
];

export const FUMIGATION_DUE_STATE_LABELS: Record<FumigationDueState, string> = {
  overdue: "Overdue",
  due_soon: "Due soon",
  scheduled: "Scheduled",
};

/** Display labels for Fumigation Log fields (presentation / forms). */
export const FUMIGATION_LOG_FIELD_LABELS = {
  id: "Log ID",
  date: "Date",
  facilityId: "Facility",
  areaTreated: "Area Treated",
  pestType: "Pest Type",
  vendor: "Vendor",
  nextDueDate: "Next Due Date",
  remarks: "Remarks",
} as const;
