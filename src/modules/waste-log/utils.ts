import type { CreateWasteLogInput, WasteLog } from "./types";

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

export function toCreateFormValues(entry?: WasteLog | null) {
  return {
    date: toDateInputValue(entry?.date) || "",
    facilityId: entry?.facilityId ?? "",
    wasteType: entry?.wasteType ?? "",
    quantity: entry?.quantity != null ? String(entry.quantity) : "",
    unit: entry?.unit ?? "",
    disposalMethod: entry?.disposalMethod ?? "",
    remarks: entry?.remarks ?? "",
  };
}

/**
 * Build create payload from form-shaped strings.
 * No derived quantity or other calculated fields.
 */
export function toCreateWasteLogInput(values: {
  date: string;
  facilityId: string;
  wasteType: string;
  quantity: string | number;
  unit: string;
  disposalMethod: string;
  remarks?: string;
}): CreateWasteLogInput {
  const quantity =
    typeof values.quantity === "number"
      ? values.quantity
      : Number(String(values.quantity).trim());

  return {
    date: values.date.trim(),
    facilityId: values.facilityId.trim(),
    wasteType: values.wasteType.trim(),
    quantity: Number.isFinite(quantity) ? quantity : 0,
    unit: values.unit.trim(),
    disposalMethod: values.disposalMethod.trim(),
    remarks: optionalString(values.remarks),
  };
}

/** Lightweight client-side field validation (mirrors Apps Script rules). */
export function validateWasteLogFormValues(values: {
  date: string;
  facilityId: string;
  wasteType: string;
  quantity: string | number;
  unit: string;
  disposalMethod: string;
}): Partial<
  Record<
    | "date"
    | "facilityId"
    | "wasteType"
    | "quantity"
    | "unit"
    | "disposalMethod",
    string
  >
> {
  const errors: Partial<
    Record<
      | "date"
      | "facilityId"
      | "wasteType"
      | "quantity"
      | "unit"
      | "disposalMethod",
      string
    >
  > = {};

  if (!values.date.trim()) errors.date = "Date is required";
  if (!values.facilityId.trim()) errors.facilityId = "Facility is required";
  if (!values.wasteType.trim()) errors.wasteType = "Waste Type is required";
  if (!values.unit.trim()) errors.unit = "Unit is required";
  if (!values.disposalMethod.trim()) {
    errors.disposalMethod = "Disposal Method is required";
  }

  const quantityRaw = String(values.quantity).trim();
  if (!quantityRaw) {
    errors.quantity = "Quantity is required";
  } else if (!Number.isFinite(Number(quantityRaw))) {
    errors.quantity = "Quantity must be a number";
  }

  return errors;
}
