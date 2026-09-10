import type {
  ConsumablesUpdate,
  ConsumablesUpdateFlagKind,
  CreateConsumablesUpdateInput,
} from "./types";
import { CONSUMABLES_UPDATE_FLAG_LABELS } from "./constants";

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

/**
 * Closing = Opening + Received − Issued.
 * Missing / invalid Received is treated as 0. Rounded to 2 decimal places.
 */
export function calculateConsumablesClosing(
  opening: number,
  issued: number,
  received?: number | null
): number {
  const open = Number(opening);
  const issue = Number(issued);
  const recv = received == null ? 0 : Number(received);
  if (!Number.isFinite(open) || !Number.isFinite(issue)) return 0;
  const add = Number.isFinite(recv) ? recv : 0;
  const closing = open + add - issue;
  return Math.round(closing * 100) / 100;
}

/** Spec: flag when Closing <= Reorder Level and Reorder Level > 0. */
export function shouldReorderNow(
  closing: number,
  reorderLevel?: number | null
): boolean {
  if (reorderLevel == null) return false;
  const level = Number(reorderLevel);
  if (!Number.isFinite(level) || level <= 0) return false;
  if (!Number.isFinite(closing)) return false;
  return closing <= level;
}

export function getConsumablesUpdateFlagKinds(
  closing: number,
  reorderLevel?: number | null
): ConsumablesUpdateFlagKind[] {
  return shouldReorderNow(closing, reorderLevel) ? ["reorder_now"] : [];
}

export function getConsumablesUpdateFlagLabels(
  closing: number,
  reorderLevel?: number | null
): string[] {
  return getConsumablesUpdateFlagKinds(closing, reorderLevel).map(
    (kind) => CONSUMABLES_UPDATE_FLAG_LABELS[kind]
  );
}

export function toCreateFormValues(entry?: ConsumablesUpdate | null) {
  return {
    date: toDateInputValue(entry?.date) || "",
    facilityId: entry?.facilityId ?? "",
    itemName: entry?.itemName ?? "",
    opening: entry?.opening != null ? String(entry.opening) : "",
    received: entry?.received != null ? String(entry.received) : "",
    issued: entry?.issued != null ? String(entry.issued) : "",
    reorderLevel:
      entry?.reorderLevel != null ? String(entry.reorderLevel) : "",
  };
}

function parseOptionalNumber(
  value: string | number | undefined
): number | undefined {
  if (value == null) return undefined;
  const raw = String(value).trim();
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function parseRequiredNumber(value: string | number): number {
  if (typeof value === "number") return value;
  return Number(String(value).trim());
}

/**
 * Build create payload from form-shaped strings.
 * Closing is always derived — never taken from the form.
 */
export function toCreateConsumablesUpdateInput(values: {
  date: string;
  facilityId: string;
  itemName: string;
  opening: string | number;
  received?: string | number;
  issued: string | number;
  reorderLevel?: string | number;
}): CreateConsumablesUpdateInput {
  const opening = parseRequiredNumber(values.opening);
  const issued = parseRequiredNumber(values.issued);
  const received = parseOptionalNumber(values.received);
  const reorderLevel = parseOptionalNumber(values.reorderLevel);

  return {
    date: values.date.trim(),
    facilityId: values.facilityId.trim(),
    itemName: values.itemName.trim(),
    opening: Number.isFinite(opening) ? opening : 0,
    issued: Number.isFinite(issued) ? issued : 0,
    ...(received != null ? { received } : {}),
    ...(reorderLevel != null ? { reorderLevel } : {}),
  };
}
