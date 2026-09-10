import type { CreateEnergyReadingInput, EnergyReading } from "./types";

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

export function toCreateFormValues(entry?: EnergyReading | null) {
  return {
    date: toDateInputValue(entry?.date) || "",
    meter: entry?.meter ?? "",
    reading: entry?.reading != null ? String(entry.reading) : "",
    remarks: entry?.remarks ?? "",
  };
}

/**
 * Build create payload from form-shaped strings.
 * Reading is the observed meter value — no consumption math is applied.
 */
export function toCreateEnergyReadingInput(values: {
  date: string;
  meter: string;
  reading: string | number;
  remarks?: string;
}): CreateEnergyReadingInput {
  const reading =
    typeof values.reading === "number"
      ? values.reading
      : Number(String(values.reading).trim());

  return {
    date: values.date.trim(),
    meter: values.meter.trim(),
    reading: Number.isFinite(reading) ? reading : 0,
    remarks: optionalString(values.remarks),
  };
}
