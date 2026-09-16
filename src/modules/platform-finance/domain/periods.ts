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
