/**
 * Drill-through from a statement figure to the posted lines that make it up (the General Ledger report), using the
 * same period semantics as the figure: a period P&L drills to that period, YTD to the year's periods up to it, and a
 * balance (Balance Sheet / closing Trial Balance) to every period up to its as-at period.
 */
import { periodOrdinal } from "@/modules/platform-finance/domain/periods";
import { financeReportHref } from "@/modules/platform-finance/reports/catalogue";

type PeriodLike = { id: string; year: number; month: number };

export type LedgerDrillBasis = "period" | "ytd" | "cumulative";

export function ledgerDrillRange(periods: readonly PeriodLike[], period: PeriodLike, basis: LedgerDrillBasis): { from: PeriodLike; to: PeriodLike } {
  if (basis === "period") return { from: period, to: period };
  const target = periodOrdinal(period.year, period.month);
  const candidates = periods.filter(
    (p) => periodOrdinal(p.year, p.month) <= target && (basis === "cumulative" || p.year === period.year)
  );
  const from = candidates.reduce((min, p) => (periodOrdinal(p.year, p.month) < periodOrdinal(min.year, min.month) ? p : min), period);
  return { from, to: period };
}

export function reportQuery(params: Record<string, string | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const text = search.toString();
  return text ? `?${text}` : "";
}

export function ledgerDrillHref(input: {
  companyId: string;
  accountId: string;
  periods: readonly PeriodLike[];
  period: PeriodLike;
  basis: LedgerDrillBasis;
}): string {
  const range = ledgerDrillRange(input.periods, input.period, input.basis);
  return `${financeReportHref("general-ledger")}${reportQuery({
    company: input.companyId,
    from: range.from.id,
    to: range.to.id,
    account: input.accountId,
  })}`;
}

export function journalEntryHref(journalEntryId: string): string {
  return `/platform-finance/accounting/journal/${encodeURIComponent(journalEntryId)}`;
}
