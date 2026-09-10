import {
  FUMIGATION_DUE_SOON_DAYS,
  FUMIGATION_DUE_STATE_LABELS,
} from "./constants";
import type {
  CreateFumigationLogInput,
  FumigationDueState,
  FumigationLog,
} from "./types";

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

function todayIsoDate(asOf: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${asOf.getFullYear()}-${pad(asOf.getMonth() + 1)}-${pad(asOf.getDate())}`;
}

function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

/**
 * Derive display due state from nextDueDate.
 * Not persisted — nextDueDate remains the source of truth.
 */
export function getFumigationDueState(
  nextDueDate: string | undefined,
  asOf: Date = new Date()
): FumigationDueState | null {
  const due = toDateInputValue(nextDueDate);
  if (!due) return null;

  const today = todayIsoDate(asOf);
  if (due < today) return "overdue";
  const soonCutoff = addDaysIso(today, FUMIGATION_DUE_SOON_DAYS);
  if (due <= soonCutoff) return "due_soon";
  return "scheduled";
}

export function getFumigationDueStateLabel(
  nextDueDate: string | undefined,
  asOf: Date = new Date()
): string | null {
  const state = getFumigationDueState(nextDueDate, asOf);
  return state ? FUMIGATION_DUE_STATE_LABELS[state] : null;
}

export function toCreateFormValues(entry?: FumigationLog | null) {
  return {
    date: toDateInputValue(entry?.date) || "",
    facilityId: entry?.facilityId ?? "",
    areaTreated: entry?.areaTreated ?? "",
    pestType: entry?.pestType ?? "",
    vendor: entry?.vendor ?? "",
    nextDueDate: toDateInputValue(entry?.nextDueDate) || "",
    remarks: entry?.remarks ?? "",
  };
}

/** Build create payload from form-shaped strings. */
export function toCreateFumigationLogInput(values: {
  date: string;
  facilityId: string;
  areaTreated: string;
  pestType: string;
  vendor: string;
  nextDueDate: string;
  remarks?: string;
}): CreateFumigationLogInput {
  return {
    date: values.date.trim(),
    facilityId: values.facilityId.trim(),
    areaTreated: values.areaTreated.trim(),
    pestType: values.pestType.trim(),
    vendor: values.vendor.trim(),
    nextDueDate: values.nextDueDate.trim(),
    remarks: optionalString(values.remarks),
  };
}

/** Lightweight client-side field validation (mirrors Apps Script rules). */
export function validateFumigationLogFormValues(values: {
  date: string;
  facilityId: string;
  areaTreated: string;
  pestType: string;
  vendor: string;
  nextDueDate: string;
}): Partial<
  Record<
    | "date"
    | "facilityId"
    | "areaTreated"
    | "pestType"
    | "vendor"
    | "nextDueDate",
    string
  >
> {
  const errors: Partial<
    Record<
      | "date"
      | "facilityId"
      | "areaTreated"
      | "pestType"
      | "vendor"
      | "nextDueDate",
      string
    >
  > = {};

  if (!values.date.trim()) errors.date = "Date is required";
  if (!values.facilityId.trim()) errors.facilityId = "Facility is required";
  if (!values.areaTreated.trim()) {
    errors.areaTreated = "Area Treated is required";
  }
  if (!values.pestType.trim()) errors.pestType = "Pest Type is required";
  if (!values.vendor.trim()) errors.vendor = "Vendor is required";
  if (!values.nextDueDate.trim()) {
    errors.nextDueDate = "Next Due Date is required";
  }

  return errors;
}
