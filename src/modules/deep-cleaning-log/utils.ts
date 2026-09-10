import type { CreateDeepCleaningLogInput, DeepCleaningLog } from "./types";

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

export function toCreateFormValues(entry?: DeepCleaningLog | null) {
  return {
    date: toDateInputValue(entry?.date) || "",
    facilityId: entry?.facilityId ?? "",
    area: entry?.area ?? "",
    vendorTeam: entry?.vendorTeam ?? "",
    status: entry?.status ?? "",
    remarks: entry?.remarks ?? "",
  };
}

/** Build create payload from form-shaped strings. */
export function toCreateDeepCleaningLogInput(values: {
  date: string;
  facilityId: string;
  area: string;
  vendorTeam: string;
  status: string;
  remarks?: string;
}): CreateDeepCleaningLogInput {
  return {
    date: values.date.trim(),
    facilityId: values.facilityId.trim(),
    area: values.area.trim(),
    vendorTeam: values.vendorTeam.trim(),
    status: values.status.trim(),
    remarks: optionalString(values.remarks),
  };
}

/** Lightweight client-side field validation (mirrors Apps Script rules). */
export function validateDeepCleaningLogFormValues(values: {
  date: string;
  facilityId: string;
  area: string;
  vendorTeam: string;
  status: string;
}): Partial<
  Record<"date" | "facilityId" | "area" | "vendorTeam" | "status", string>
> {
  const errors: Partial<
    Record<"date" | "facilityId" | "area" | "vendorTeam" | "status", string>
  > = {};

  if (!values.date.trim()) errors.date = "Date is required";
  if (!values.facilityId.trim()) errors.facilityId = "Facility is required";
  if (!values.area.trim()) errors.area = "Area is required";
  if (!values.vendorTeam.trim()) {
    errors.vendorTeam = "Vendor/Team is required";
  }
  if (!values.status.trim()) errors.status = "Status is required";

  return errors;
}
