/**
 * Presentation-only grouping for Finance amount fields.
 * Submitted/API values must be parsed back to a plain number.
 */

const KEEPABLE = /[\d.]/;

export function sanitizeMonetaryInput(
  raw: string,
  allowDecimal = true
): string {
  let cleaned = "";
  let seenDot = false;
  for (const char of raw) {
    if (char >= "0" && char <= "9") {
      cleaned += char;
      continue;
    }
    if (allowDecimal && char === "." && !seenDot) {
      cleaned += ".";
      seenDot = true;
    }
  }

  if (!cleaned) return "";

  const dot = cleaned.indexOf(".");
  const intRaw = dot === -1 ? cleaned : cleaned.slice(0, dot);
  const frac = dot === -1 ? undefined : cleaned.slice(dot + 1);
  const intPart = intRaw.replace(/^0+(?=\d)/, "") || "0";

  if (frac !== undefined) return `${intPart}.${frac}`;
  if (cleaned.endsWith(".")) return `${intPart}.`;
  return intPart;
}

export function formatMonetaryDisplay(sanitized: string): string {
  if (!sanitized) return "";
  const endsWithDot = sanitized.endsWith(".");
  const [intPart = "0", ...rest] = sanitized.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (rest.length > 0) return `${grouped}.${rest.join("")}`;
  if (endsWithDot) return `${grouped}.`;
  return grouped;
}

export function formatMonetaryFromNumber(value: number): string {
  if (!Number.isFinite(value)) return "";
  return formatMonetaryDisplay(sanitizeMonetaryInput(String(value), true));
}

export function parseMonetaryInput(display: string): number | undefined {
  const cleaned = display.replace(/,/g, "").trim();
  if (!cleaned || cleaned === ".") return undefined;
  const amount = Number(cleaned);
  return Number.isFinite(amount) ? amount : undefined;
}

export function countKeepableChars(value: string, end: number): number {
  let count = 0;
  const limit = Math.min(end, value.length);
  for (let i = 0; i < limit; i++) {
    if (KEEPABLE.test(value[i] ?? "")) count += 1;
  }
  return count;
}

export function caretFromKeepableCount(
  formatted: string,
  keepableCount: number
): number {
  if (keepableCount <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (KEEPABLE.test(formatted[i] ?? "")) {
      seen += 1;
      if (seen === keepableCount) return i + 1;
    }
  }
  return formatted.length;
}
