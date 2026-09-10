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
 * Hours between start and end (ISO datetimes), matching platform duration math.
 * Returns 0 for invalid / inverted ranges. Rounded to 2 decimal places.
 */
export function calculateGeneratorLogHours(
  startedAt: string,
  endedAt: string
): number {
  const startMs = Date.parse(startedAt);
  const endMs = Date.parse(endedAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 0;
  const hours = Math.max(0, (endMs - startMs) / 36e5);
  return Math.round(hours * 100) / 100;
}

/** datetime-local input value from an ISO timestamp (local wall clock). */
export function toDatetimeLocalValue(iso?: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
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
    startedAt: toDatetimeLocalValue(entry?.startedAt),
    endedAt: toDatetimeLocalValue(entry?.endedAt),
    fuelUsed: entry?.fuelUsed != null ? String(entry.fuelUsed) : "",
    remarks: entry?.remarks ?? "",
  };
}

/** Convert datetime-local form value to ISO for API payloads. */
export function fromDatetimeLocalValue(local: string): string {
  const trimmed = local.trim();
  if (!trimmed) return "";
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return trimmed;
  return date.toISOString();
}

/**
 * Build create payload from form-shaped strings.
 * Hours are always derived — never taken from the form.
 * datetime-local values are converted to ISO.
 */
export function toCreateGeneratorLogInput(values: {
  date: string;
  generator: string;
  startedAt: string;
  endedAt: string;
  fuelUsed: string | number;
  remarks?: string;
}): CreateGeneratorLogInput {
  const fuelUsed =
    typeof values.fuelUsed === "number"
      ? values.fuelUsed
      : Number(String(values.fuelUsed).trim());

  return {
    date: values.date.trim(),
    generator: values.generator.trim(),
    startedAt: fromDatetimeLocalValue(values.startedAt),
    endedAt: fromDatetimeLocalValue(values.endedAt),
    fuelUsed: Number.isFinite(fuelUsed) ? fuelUsed : 0,
    remarks: optionalString(values.remarks),
  };
}
