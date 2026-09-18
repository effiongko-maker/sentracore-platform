/**
 * Accounting period calendar helpers — company-scoped monthly periods.
 */

export type MonthBounds = {
  year: number;
  month: number;
  startDate: string;
  endDate: string;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Inclusive calendar month bounds as ISO dates (YYYY-MM-DD), UTC calendar. */
export function monthBounds(year: number, month: number): MonthBounds {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error("year must be an integer between 2000 and 2100.");
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("month must be an integer between 1 and 12.");
  }
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    year,
    month,
    startDate: `${year}-${pad2(month)}-01`,
    endDate: `${year}-${pad2(month)}-${pad2(lastDay)}`,
  };
}

/** Twelve monthly bounds for a calendar year. */
export function yearMonthBounds(year: number): MonthBounds[] {
  return Array.from({ length: 12 }, (_, i) => monthBounds(year, i + 1));
}

export const FINANCE_PERIOD_MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function financePeriodLabel(year: number, month: number): string {
  return `${FINANCE_PERIOD_MONTH_LABELS[month - 1] ?? month} ${year}`;
}

/** Sort key: year*12 + month (1–12). */
export function periodOrdinal(year: number, month: number): number {
  return year * 12 + month;
}

/**
 * Prefer the open period covering `asOf`, else the newest open period at or
 * before that month, else the newest period at or before that month.
 */
export function selectDefaultFinancePeriod<
  T extends { year: number; month: number; status: string },
>(periods: readonly T[], asOf: Date = new Date()): T | null {
  if (periods.length === 0) return null;
  const currentOrdinal = asOf.getUTCFullYear() * 12 + (asOf.getUTCMonth() + 1);
  const relevant = periods.filter(
    (period) => periodOrdinal(period.year, period.month) <= currentOrdinal
  );
  if (relevant.length === 0) return null;

  const open = relevant.filter((period) => period.status === "open");
  const currentOpen = open.find(
    (period) => periodOrdinal(period.year, period.month) === currentOrdinal
  );
  if (currentOpen) return currentOpen;

  const newestOpen = [...open].sort(
    (a, b) => periodOrdinal(b.year, b.month) - periodOrdinal(a.year, b.month)
  )[0];
  if (newestOpen) return newestOpen;

  return [...relevant].sort(
    (a, b) => periodOrdinal(b.year, b.month) - periodOrdinal(a.year, b.month)
  )[0];
}
