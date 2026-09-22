/**
 * Deterministic parser for the MBORA order-register / Monthly Payment "Time and Date of Payment" column.
 *
 * Every populated cell in this column is a plain string (kind=string, dateFormatted=false — never a hidden-
 * formatted Excel datetime serial) of the form "HH:MM MonthName DD, YYYY", e.g. "14:57 May 23, 2025". The month
 * is always spelled out, so — unlike dd/mm/yyyy dates elsewhere in this migration — there is NO day/month swap
 * ambiguity here: exactly one calendar reading is possible once the month token is identified.
 *
 * The source text carries a handful of typos, enumerated here from an exhaustive scan of every "Paid" row's C
 * column across the four order-register sheets and the Monthly Payment sheet (never inferred, never guessed for
 * an individual row): "0ctober" (zero for capital O), "Sept" (abbreviation), "Janauary" (transposed letters),
 * and a missing space after the day's comma ("May 23,2025"). All are resolved by an explicit, exhaustive map —
 * never a fuzzy/heuristic match — so nothing is corrected beyond what was actually observed in source.
 */

const MONTH_TOKENS: Record<string, number> = {
  january: 1, jan: 1, janauary: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sept: 9, sep: 9,
  october: 10, oct: 10, "0ctober": 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

export type PaymentDatetimeResolution = {
  raw: string;
  iso: string | null;
  status: "exact" | "unparseable";
  rule: string;
};

const PATTERN = /^\s*(\d{1,2}):(\d{2})\s+([A-Za-z0]+)\.?\s+(\d{1,2}),\s*(\d{4})\s*$/;

function isValidCalendarDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/**
 * Parses a raw "Time and Date of Payment" cell value into a UTC ISO timestamp. Returns status "unparseable"
 * (iso: null) rather than guessing when the text does not resolve to a real, unambiguous calendar date/time —
 * the caller must then treat the fact as SOURCE_FACT_AMBIGUOUS, never fall back to any other value.
 *
 * The source records local (Nigeria, UTC+1) wall-clock time as plain text with no timezone marker. It is stored
 * verbatim as UTC-labelled (no offset is invented) — the raw text remains the authoritative record of exactly
 * what the source stated; the parsed value exists only for sortability/filtering, never as a replacement fact.
 */
export function parsePaymentDatetime(raw: string): PaymentDatetimeResolution {
  const trimmed = raw.trim();
  const m = PATTERN.exec(trimmed);
  if (!m) return { raw: trimmed, iso: null, status: "unparseable", rule: "does_not_match_hh_mm_month_dd_yyyy" };

  const [, hh, mm, monthToken, dayStr, yearStr] = m as unknown as [string, string, string, string, string, string];
  const month = MONTH_TOKENS[monthToken.toLowerCase()];
  if (month == null) return { raw: trimmed, iso: null, status: "unparseable", rule: `unrecognised_month_token:${monthToken}` };

  const hour = Number(hh);
  const minute = Number(mm);
  const day = Number(dayStr);
  const year = Number(yearStr);
  if (hour > 23 || minute > 59) return { raw: trimmed, iso: null, status: "unparseable", rule: "invalid_time_of_day" };
  if (!isValidCalendarDate(year, month, day)) return { raw: trimmed, iso: null, status: "unparseable", rule: "invalid_calendar_date" };

  const iso = new Date(Date.UTC(year, month - 1, day, hour, minute, 0)).toISOString();
  const canonical = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"][month - 1];
  const rule = monthToken.toLowerCase() === canonical ? "exact" : `exact_source_variant_normalised:${monthToken}`;
  return { raw: trimmed, iso, status: "exact", rule };
}
