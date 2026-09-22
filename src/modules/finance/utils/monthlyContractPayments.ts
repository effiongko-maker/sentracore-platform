/**
 * Monthly Contract Payments — presentation-only derivations over the read-only
 * Platform Finance historical commercial fact projection (never persisted in FM,
 * never a duplicate transaction; see MonthlyContractPaymentsSection.tsx). Pure,
 * framework-agnostic functions: safe to import from both the API route (server)
 * and the register/card/detail components (client).
 */

export type MonthlyPaymentStatusTone = "neutral" | "info" | "warn" | "ok";

export type MonthlyPaymentStatus = {
  /** Concise operational label — never a fabricated workflow state. */
  label: string;
  tone: MonthlyPaymentStatusTone;
};

/**
 * Collapses the verbose/technical source status text (e.g. "Requested (no Status
 * recorded on the Monthly Payment sheet row)") into a concise operational label.
 * Recognised prefixes only — an unrecognised source text is shown VERBATIM (never
 * silently replaced with "Not recorded", never guessed into a workflow state the
 * source does not support). The raw text always stays separately available on the
 * fact for the detail view.
 */
export function deriveMonthlyPaymentStatus(
  sourcePaymentStatus?: string | null
): MonthlyPaymentStatus {
  const text = (sourcePaymentStatus ?? "").trim();
  if (!text) return { label: "Not recorded", tone: "neutral" };
  const lower = text.toLowerCase();
  if (lower.startsWith("paid")) return { label: "Paid", tone: "ok" };
  if (lower.startsWith("requested")) return { label: "Requested", tone: "info" };
  if (lower.startsWith("not recorded")) return { label: "Not recorded", tone: "neutral" };
  return { label: text, tone: "neutral" };
}

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/**
 * A stable, URL-safe identifier derived ONLY from the already-shown month label
 * (e.g. "October 2026" -> "2026-10") — never the internal historical-fact code or
 * UUID. Consistent with this surface's existing rule that no source id/code is
 * exposed (see the API route's own doc comment).
 */
export function monthlyPaymentSlug(month?: string | null): string | null {
  if (!month) return null;
  const m = /^([A-Za-z]+)\s+(\d{4})$/.exec(month.trim());
  if (!m) return null;
  const index = MONTH_NAMES.indexOf(m[1]!.toLowerCase());
  if (index < 0) return null;
  return `${m[2]}-${String(index + 1).padStart(2, "0")}`;
}

/**
 * "...Facility Management and Maintenance Works — October 2026" -> "October 2026".
 * Accepts a plain hyphen or an en/em dash before the month — both occur verbatim in
 * the source description text across the imported batches. No date is invented;
 * an unparseable description yields undefined (never a guessed period).
 */
export function monthlyPaymentPeriodLabel(description: string): string | undefined {
  const m = /[-–—]\s*([A-Za-z]+)\s+(\d{4})\s*$/.exec(description.trim());
  if (!m) return undefined;
  const month = m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1).toLowerCase();
  return `${month} ${m[2]}`;
}

/** Shared amount formatting for the card, register and detail surfaces. */
export function formatMonthlyPaymentAmount(
  amount: number | undefined,
  currency: string
): string {
  if (amount == null) return "Not established";
  return `${currency} ${amount.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Stored digits are already the WAT wall-clock time verbatim (see
 * CostDetailPage.formatOrgDatetime) — read via UTC, never a further Africa/Lagos shift.
 */
export function formatMonthlyPaymentDatetime(iso?: string): string {
  if (!iso) return "Not recorded";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "Not recorded";
  const datePart = date.toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
  const timePart = date.toLocaleTimeString("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", hour12: false });
  return `${datePart} · ${timePart} WAT`;
}
