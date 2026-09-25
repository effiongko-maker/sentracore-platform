/**
 * Reports — General Ledger and Journal over POSTED journal lines (finance_general_ledger_v, status = 'posted').
 *
 * Period semantics follow the ledger: a line belongs to the accounting period its journal entry is pinned to
 * (period_id), not to a free-standing calendar date. Opening balances are the cumulative posted movements of every
 * period before the first reported period, so each account's closing balance reconciles to the Trial Balance as at
 * the last reported period.
 */
import {
  foldCumulativeByAccount,
  roundMoney2,
  type PostedAccountMovement,
} from "@/modules/platform-finance/domain/accountingReadModels";
import { journalSourceDescriptor } from "@/modules/platform-finance/domain/accountingReview";
import { financePeriodLabel, periodOrdinal } from "@/modules/platform-finance/domain/periods";

/** One row of finance_general_ledger_v, plus the ledger period it belongs to. */
export type PostedLedgerLine = {
  journalLineId: string;
  journalEntryId: string;
  transactionId: string;
  periodId: string;
  year: number;
  month: number;
  entryDate: string;
  reference: string;
  entryDescription: string;
  lineDescription: string | null;
  lineNo: number;
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  debit: number;
  credit: number;
  postedAt: string;
};

export type PeriodBound = { year: number; month: number };

export function isWithinPeriodRange(row: PeriodBound, from: PeriodBound, to: PeriodBound): boolean {
  const o = periodOrdinal(row.year, row.month);
  return o >= periodOrdinal(from.year, from.month) && o <= periodOrdinal(to.year, to.month);
}

export function periodRangeLabel(from: PeriodBound, to: PeriodBound): string {
  const a = financePeriodLabel(from.year, from.month);
  const b = financePeriodLabel(to.year, to.month);
  return a === b ? a : `${a} – ${b}`;
}

function compareLines(a: PostedLedgerLine, b: PostedLedgerLine): number {
  return (
    periodOrdinal(a.year, a.month) - periodOrdinal(b.year, b.month) ||
    a.entryDate.localeCompare(b.entryDate) ||
    a.postedAt.localeCompare(b.postedAt) ||
    a.reference.localeCompare(b.reference) ||
    a.lineNo - b.lineNo
  );
}

// ── General Ledger ───────────────────────────────────────────────────────────────────────────────────────────

export type GeneralLedgerReportLine = {
  journalLineId: string;
  journalEntryId: string;
  entryDate: string;
  periodLabel: string;
  reference: string;
  description: string;
  debit: number;
  credit: number;
  /** Net debit balance after this line (credit balances are negative). */
  runningBalance: number;
};

export type GeneralLedgerReportAccount = {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  openingBalance: number;
  lines: GeneralLedgerReportLine[];
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
};

export type GeneralLedgerReport = {
  rangeLabel: string;
  accounts: GeneralLedgerReportAccount[];
  totalDebit: number;
  totalCredit: number;
  lineCount: number;
  hasActivity: boolean;
};

export function buildGeneralLedgerReport(input: {
  from: PeriodBound;
  to: PeriodBound;
  /** Posted movements for the company (every period) — the opening-balance source. */
  movements: readonly PostedAccountMovement[];
  /** Posted lines for the company; lines outside the range are ignored. */
  lines: readonly PostedLedgerLine[];
  accountId?: string | null;
}): GeneralLedgerReport {
  const fromOrdinal = periodOrdinal(input.from.year, input.from.month);
  const opening = new Map(
    foldCumulativeByAccount(input.movements, (row) => periodOrdinal(row.year, row.month) < fromOrdinal).map((r) => [
      r.accountId,
      r,
    ])
  );
  const inRange = input.lines
    .filter((line) => isWithinPeriodRange(line, input.from, input.to))
    .filter((line) => !input.accountId || line.accountId === input.accountId)
    .sort(compareLines);

  const accounts = new Map<string, GeneralLedgerReportAccount>();
  const ensure = (id: string, code: string, name: string, type: string) => {
    let account = accounts.get(id);
    if (!account) {
      const o = opening.get(id);
      account = {
        accountId: id,
        accountCode: code,
        accountName: name,
        accountType: type,
        openingBalance: o ? o.netDebit : 0,
        lines: [],
        totalDebit: 0,
        totalCredit: 0,
        closingBalance: 0,
      };
      accounts.set(id, account);
    }
    return account;
  };
  for (const o of opening.values()) {
    if (input.accountId && o.accountId !== input.accountId) continue;
    if (o.netDebit !== 0) ensure(o.accountId, o.accountCode, o.accountName, o.accountType);
  }
  for (const line of inRange) {
    const account = ensure(line.accountId, line.accountCode, line.accountName, line.accountType);
    const previous = account.lines.at(-1)?.runningBalance ?? account.openingBalance;
    account.lines.push({
      journalLineId: line.journalLineId,
      journalEntryId: line.journalEntryId,
      entryDate: line.entryDate,
      periodLabel: financePeriodLabel(line.year, line.month),
      reference: line.reference,
      description: line.lineDescription?.trim() || line.entryDescription,
      debit: line.debit,
      credit: line.credit,
      runningBalance: roundMoney2(previous + line.debit - line.credit),
    });
    account.totalDebit = roundMoney2(account.totalDebit + line.debit);
    account.totalCredit = roundMoney2(account.totalCredit + line.credit);
  }
  const list = [...accounts.values()]
    .map((a) => ({ ...a, closingBalance: roundMoney2(a.openingBalance + a.totalDebit - a.totalCredit) }))
    .sort((a, b) => a.accountCode.localeCompare(b.accountCode, "en"));
  return {
    rangeLabel: periodRangeLabel(input.from, input.to),
    accounts: list,
    totalDebit: roundMoney2(list.reduce((s, a) => s + a.totalDebit, 0)),
    totalCredit: roundMoney2(list.reduce((s, a) => s + a.totalCredit, 0)),
    lineCount: inRange.length,
    hasActivity: list.length > 0,
  };
}

// ── Journal report ───────────────────────────────────────────────────────────────────────────────────────────

export type JournalSourceRef = { sourceType: string | null; sourceId: string | null; payableId: string | null };

export type JournalReportEntry = {
  journalEntryId: string;
  reference: string;
  entryDate: string;
  periodLabel: string;
  description: string;
  postedAt: string;
  sourceLabel: string;
  sourceHref: string | null;
  lines: Array<{ journalLineId: string; lineNo: number; accountCode: string; accountName: string; description: string | null; debit: number; credit: number }>;
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
};

export type JournalReport = {
  rangeLabel: string;
  entries: JournalReportEntry[];
  totalDebit: number;
  totalCredit: number;
  bySource: Array<{ label: string; count: number }>;
  hasActivity: boolean;
};

export function buildJournalReport(input: {
  from: PeriodBound;
  to: PeriodBound;
  lines: readonly PostedLedgerLine[];
  /** Provenance by transaction id — by source_type, never by transaction_type. */
  sources: ReadonlyMap<string, JournalSourceRef>;
}): JournalReport {
  const inRange = input.lines.filter((line) => isWithinPeriodRange(line, input.from, input.to)).sort(compareLines);
  const entries = new Map<string, JournalReportEntry>();
  for (const line of inRange) {
    let entry = entries.get(line.journalEntryId);
    if (!entry) {
      const source = input.sources.get(line.transactionId) ?? { sourceType: null, sourceId: null, payableId: null };
      const descriptor = journalSourceDescriptor(source);
      entry = {
        journalEntryId: line.journalEntryId,
        reference: line.reference,
        entryDate: line.entryDate,
        periodLabel: financePeriodLabel(line.year, line.month),
        description: line.entryDescription,
        postedAt: line.postedAt,
        sourceLabel: descriptor.label,
        sourceHref: descriptor.href,
        lines: [],
        totalDebit: 0,
        totalCredit: 0,
        balanced: false,
      };
      entries.set(line.journalEntryId, entry);
    }
    entry.lines.push({
      journalLineId: line.journalLineId,
      lineNo: line.lineNo,
      accountCode: line.accountCode,
      accountName: line.accountName,
      description: line.lineDescription,
      debit: line.debit,
      credit: line.credit,
    });
    entry.totalDebit = roundMoney2(entry.totalDebit + line.debit);
    entry.totalCredit = roundMoney2(entry.totalCredit + line.credit);
  }
  const list = [...entries.values()].map((e) => ({
    ...e,
    lines: [...e.lines].sort((a, b) => a.lineNo - b.lineNo),
    balanced: e.lines.length >= 2 && Math.round(e.totalDebit * 100) === Math.round(e.totalCredit * 100),
  }));
  const counts = new Map<string, number>();
  for (const e of list) counts.set(e.sourceLabel, (counts.get(e.sourceLabel) ?? 0) + 1);
  return {
    rangeLabel: periodRangeLabel(input.from, input.to),
    entries: list,
    totalDebit: roundMoney2(list.reduce((s, e) => s + e.totalDebit, 0)),
    totalCredit: roundMoney2(list.reduce((s, e) => s + e.totalCredit, 0)),
    bySource: [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    hasActivity: list.length > 0,
  };
}
