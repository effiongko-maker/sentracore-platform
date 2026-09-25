import type { CreateGeneratorLogInput, GeneratorLog } from "./types";

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

/**
 * Run hours from generator hour-meter readings (end − start), matching the database's derivation for the
 * hour_meter basis. Returns null when either reading is missing or the end is below the start.
 */
export function calculateRunHoursFromReadings(start: number | null | undefined, end: number | null | undefined): number | null {
  if (start == null || end == null || !Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.round((end - start) * 100) / 100;
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

export function toCreateFormValues(entry?: GeneratorLog | null) {
  return {
    date: toDateInputValue(entry?.date) || "",
    generator: entry?.generator ?? "",
    startMeterReading: entry?.startMeterReading != null ? String(entry.startMeterReading) : "",
    endMeterReading: entry?.endMeterReading != null ? String(entry.endMeterReading) : "",
    fuelUsed: entry?.fuelUsed != null ? String(entry.fuelUsed) : "",
    remarks: entry?.remarks ?? "",
  };
}

function numberOrNull(value: string | number): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/**
 * Build create/update payload from form-shaped strings. Run hours are always derived — never taken from the form.
 * A blank Diesel Used is sent as null (not recorded), never 0.
 */
export function toCreateGeneratorLogInput(values: {
  date: string;
  generator: string;
  startMeterReading: string | number;
  endMeterReading: string | number;
  fuelUsed: string | number;
  remarks?: string;
}): CreateGeneratorLogInput {
  return {
    date: values.date.trim(),
    generator: values.generator.trim(),
    startMeterReading: numberOrNull(values.startMeterReading) ?? Number.NaN,
    endMeterReading: numberOrNull(values.endMeterReading) ?? Number.NaN,
    fuelUsed: numberOrNull(values.fuelUsed),
    remarks: optionalString(values.remarks),
  };
}
