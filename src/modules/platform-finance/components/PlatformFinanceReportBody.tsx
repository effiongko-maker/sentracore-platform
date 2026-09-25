"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { FinanceReportRun } from "@/modules/platform-finance/reports/types";
import type { ComparedFigure, ComparedSection } from "@/modules/platform-finance/reports/statements";
import type { AgeingSummaryRow, CurrencyTotal } from "@/modules/platform-finance/reports/operational";
import type { JournalReportEntry } from "@/modules/platform-finance/reports/ledger";
import { journalEntryHref, ledgerDrillHref, type LedgerDrillBasis } from "@/modules/platform-finance/reports/drill";

type PeriodLike = { id: string; year: number; month: number };

export type ReportDrillContext = {
  companyId: string;
  periods: readonly PeriodLike[];
  /** The period the statement's current column is for (P&L, Balance Sheet, Trial Balance). */
  period: PeriodLike | null;
};

// ── Formatting ───────────────────────────────────────────────────────────────────────────────────────────────

/** Ledger amounts (base currency, as on the Accounting statements). Nil shows as a dash; negatives in brackets. */
export function ledgerAmount(amount: number | null, options: { nilDash?: boolean } = {}): string {
  if (amount === null || !Number.isFinite(amount)) return "—";
  if (options.nilDash && amount === 0) return "—";
  const formatted = `₦${Math.abs(amount).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return amount < 0 ? `(${formatted})` : formatted;
}

function balance(amount: number): string {
  if (amount === 0) return "₦0.00";
  return `${ledgerAmount(Math.abs(amount))} ${amount > 0 ? "Dr" : "Cr"}`;
}

export function currencyAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-NG", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function currencyTotals(list: readonly CurrencyTotal[]): ReactNode {
  if (!list.length) return "—";
  return list.map((t, i) => (
    <span key={t.currency} className="pf-report-multi">
      {i > 0 ? <br /> : null}
      {currencyAmount(t.amount, t.currency)}
    </span>
  ));
}

function day(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="pf-report-empty" role="status">
      <p className="pf-report-empty-title">{title}</p>
      {children ? <p className="pf-report-empty-copy">{children}</p> : null}
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="pf-report-note">{children}</p>;
}

// ── Statements ───────────────────────────────────────────────────────────────────────────────────────────────

function ComparedStatement(props: {
  sections: readonly ComparedSection[];
  results: Array<{ afterSection: string; figure: ComparedFigure }>;
  currentLabel: string;
  comparativeLabel: string | null;
  drill: (accountId: string) => string | null;
}) {
  const cmp = props.comparativeLabel !== null;
  const cols = cmp ? 5 : 3;
  return (
    <div className="pf-journal-table-wrap pf-report-table-wrap">
      <table className="pf-journal-table pf-statement-table pf-report-table">
        <thead>
          <tr>
            <th className="pf-report-col-code">Code</th>
            <th>Account</th>
            <th className="is-num">{props.currentLabel}</th>
            {cmp ? <th className="is-num">{props.comparativeLabel}</th> : null}
            {cmp ? <th className="is-num">Variance</th> : null}
          </tr>
        </thead>
        <tbody>
          {props.sections.map((section) => {
            const after = props.results.filter((r) => r.afterSection === section.key);
            return (
              <SectionRows key={section.key} section={section} cols={cols} cmp={cmp} drill={props.drill}>
                {after.map(({ figure }) => (
                  <tr key={figure.label} className="pf-statement-result">
                    <td colSpan={2}>{figure.label}</td>
                    <td className="is-num">{ledgerAmount(figure.current)}</td>
                    {cmp ? <td className="is-num">{ledgerAmount(figure.comparative)}</td> : null}
                    {cmp ? <td className="is-num">{ledgerAmount(figure.variance)}</td> : null}
                  </tr>
                ))}
              </SectionRows>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SectionRows(props: { section: ComparedSection; cols: number; cmp: boolean; drill: (accountId: string) => string | null; children?: ReactNode }) {
  const { section, cmp } = props;
  return (
    <>
      <tr className="pf-statement-section">
        <td colSpan={props.cols}>{section.label}</td>
      </tr>
      {section.lines.length === 0 ? (
        <tr className="pf-report-nil">
          <td colSpan={props.cols}>No posted activity</td>
        </tr>
      ) : null}
      {section.lines.map((line) => {
        const href = line.accountId ? props.drill(line.accountId) : null;
        return (
          <tr key={line.accountId ?? line.accountName} className={line.derived ? "pf-statement-derived" : undefined}>
            <td className="pf-journal-code">{line.accountCode}</td>
            <td>
              {href ? (
                <Link href={href} className="pf-report-drill" title="Show the posted lines behind this figure">
                  {line.accountName}
                </Link>
              ) : (
                line.accountName
              )}
            </td>
            <td className="is-num">{ledgerAmount(line.current, { nilDash: true })}</td>
            {cmp ? <td className="is-num">{ledgerAmount(line.comparative, { nilDash: true })}</td> : null}
            {cmp ? <td className="is-num">{ledgerAmount(line.variance, { nilDash: true })}</td> : null}
          </tr>
        );
      })}
      <tr className="pf-statement-total">
        <td colSpan={2}>{section.totalLabel}</td>
        <td className="is-num">{ledgerAmount(section.current)}</td>
        {cmp ? <td className="is-num">{ledgerAmount(section.comparative)}</td> : null}
        {cmp ? <td className="is-num">{ledgerAmount(section.variance)}</td> : null}
      </tr>
      {props.children}
    </>
  );
}

function comparisonNotes(r: { comparativeUnavailableReason: string | null; comparativeLabel: string | null; comparativeHasActivity: boolean | null }) {
  return (
    <>
      {r.comparativeUnavailableReason ? <Note>Comparative unavailable. {r.comparativeUnavailableReason}</Note> : null}
      {r.comparativeLabel && r.comparativeHasActivity === false ? (
        <Note>No posted accounting activity in {r.comparativeLabel}; its column reflects that, not missing data.</Note>
      ) : null}
    </>
  );
}

// ── Body ─────────────────────────────────────────────────────────────────────────────────────────────────────

export function PlatformFinanceReportBody({ run, drill }: { run: FinanceReportRun; drill: ReportDrillContext }) {
  const p = run.payload;
  const drillTo = (basis: LedgerDrillBasis) => (accountId: string) =>
    drill.period ? ledgerDrillHref({ companyId: drill.companyId, accountId, periods: drill.periods, period: drill.period, basis }) : null;

  switch (p.kind) {
    case "profit-and-loss": {
      const r = p.report;
      if (!r.currentHasActivity && !r.comparativeHasActivity) {
        return <Empty title={`No posted revenue or expense activity for ${r.currentLabel}.`}>Nothing has been posted to revenue or expense accounts in this basis. This is not a zero result for missing data — post the relevant accounting to see it here.</Empty>;
      }
      return (
        <>
          {!r.currentHasActivity ? <Note>No posted revenue or expense activity in {r.currentLabel}.</Note> : null}
          {comparisonNotes(r)}
          <ComparedStatement
            sections={r.sections}
            results={[
              { afterSection: "direct", figure: r.grossProfit },
              { afterSection: "opex", figure: r.netProfit },
            ]}
            currentLabel={r.currentLabel}
            comparativeLabel={r.comparativeLabel}
            drill={drillTo(r.scope === "ytd" ? "ytd" : "period")}
          />
        </>
      );
    }
    case "balance-sheet": {
      const r = p.report;
      if (!r.currentHasActivity && !r.comparativeHasActivity) {
        return <Empty title={`No posted accounting up to ${r.currentLabel.replace(/^As at /, "")}.`}>There are no posted journals on or before this date, so there is no balance sheet to present.</Empty>;
      }
      return (
        <>
          {comparisonNotes(r)}
          {!r.balanced || r.comparativeBalanced === false ? (
            <div className="pf-vb-alert is-danger" role="alert">
              The balance sheet does not balance. Assets differ from liabilities and equity by {ledgerAmount(r.current.difference)}. Review opening positions and posted journals.
            </div>
          ) : null}
          <ComparedStatement
            sections={r.sections}
            results={[{ afterSection: "equity", figure: r.totalLiabilitiesAndEquity }]}
            currentLabel={r.currentLabel}
            comparativeLabel={r.comparativeLabel}
            drill={drillTo("cumulative")}
          />
          <Note>Unclosed Earnings is derived from posted revenue and expense activity that has not been closed to retained earnings. It is not a posted account.</Note>
        </>
      );
    }
    case "trial-balance": {
      const r = p.report;
      if (!r.hasActivity) return <Empty title={`No posted accounting up to ${r.periodLabel}.`}>No account has a posted balance or movement through this period.</Empty>;
      const t = r.totals;
      return (
        <>
          {!r.balanced ? <div className="pf-vb-alert is-danger" role="alert">Debits and credits do not agree. Review posted journals.</div> : null}
          <div className="pf-journal-table-wrap pf-report-table-wrap">
            <table className="pf-journal-table pf-report-table pf-report-tb">
              <thead>
                <tr>
                  <th rowSpan={2} className="pf-report-col-code">Code</th>
                  <th rowSpan={2}>Account</th>
                  <th colSpan={2} className="is-group">Opening</th>
                  <th colSpan={2} className="is-group">Movement · {r.periodLabel}</th>
                  <th colSpan={2} className="is-group">Closing</th>
                </tr>
                <tr>
                  {["Debit", "Credit", "Debit", "Credit", "Debit", "Credit"].map((h, i) => (
                    <th key={i} className="is-num">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.rows.map((row) => {
                  const href = drillTo("period")(row.accountId);
                  return (
                    <tr key={row.accountId}>
                      <td className="pf-journal-code">{row.accountCode}</td>
                      <td>{href ? <Link className="pf-report-drill" href={href}>{row.accountName}</Link> : row.accountName}</td>
                      <td className="is-num">{ledgerAmount(row.openingDebit, { nilDash: true })}</td>
                      <td className="is-num">{ledgerAmount(row.openingCredit, { nilDash: true })}</td>
                      <td className="is-num">{ledgerAmount(row.periodDebit, { nilDash: true })}</td>
                      <td className="is-num">{ledgerAmount(row.periodCredit, { nilDash: true })}</td>
                      <td className="is-num">{ledgerAmount(row.closingDebit, { nilDash: true })}</td>
                      <td className="is-num">{ledgerAmount(row.closingCredit, { nilDash: true })}</td>
                    </tr>
                  );
                })}
                <tr className="pf-statement-result">
                  <td colSpan={2}>Totals</td>
                  <td className="is-num">{ledgerAmount(t.openingDebit)}</td>
                  <td className="is-num">{ledgerAmount(t.openingCredit)}</td>
                  <td className="is-num">{ledgerAmount(t.periodDebit)}</td>
                  <td className="is-num">{ledgerAmount(t.periodCredit)}</td>
                  <td className="is-num">{ledgerAmount(t.closingDebit)}</td>
                  <td className="is-num">{ledgerAmount(t.closingCredit)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <Note>Closing balances are identical to the Accounting Trial Balance {r.asAtLabel.toLowerCase()}.</Note>
        </>
      );
    }
    case "general-ledger": {
      const r = p.report;
      if (!r.hasActivity) return <Empty title={`No posted lines for ${r.rangeLabel}.`}>No account has an opening balance or posted activity in this range.</Empty>;
      return (
        <>
          <p className="pf-report-kpis">
            <span>{r.accounts.length} account{r.accounts.length === 1 ? "" : "s"}</span>
            <span>{r.lineCount} posted line{r.lineCount === 1 ? "" : "s"}</span>
            <span>Debits {ledgerAmount(r.totalDebit)}</span>
            <span>Credits {ledgerAmount(r.totalCredit)}</span>
          </p>
          {r.accounts.map((account) => (
            <section key={account.accountId} className="pf-report-block">
              <h3 className="pf-report-block-title">
                <span className="pf-journal-code">{account.accountCode}</span> {account.accountName}
              </h3>
              <div className="pf-journal-table-wrap pf-report-table-wrap">
                <table className="pf-journal-table pf-report-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Reference</th>
                      <th>Description</th>
                      <th className="is-num">Debit</th>
                      <th className="is-num">Credit</th>
                      <th className="is-num">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="pf-report-subtle">
                      <td colSpan={5}>Opening balance</td>
                      <td className="is-num">{balance(account.openingBalance)}</td>
                    </tr>
                    {account.lines.map((line) => (
                      <tr key={line.journalLineId}>
                        <td>{day(line.entryDate)}</td>
                        <td>
                          <Link className="pf-report-drill" href={journalEntryHref(line.journalEntryId)}>{line.reference}</Link>
                        </td>
                        <td className="pf-report-desc">{line.description}</td>
                        <td className="is-num">{ledgerAmount(line.debit, { nilDash: true })}</td>
                        <td className="is-num">{ledgerAmount(line.credit, { nilDash: true })}</td>
                        <td className="is-num">{balance(line.runningBalance)}</td>
                      </tr>
                    ))}
                    <tr className="pf-statement-total">
                      <td colSpan={3}>Closing balance</td>
                      <td className="is-num">{ledgerAmount(account.totalDebit)}</td>
                      <td className="is-num">{ledgerAmount(account.totalCredit)}</td>
                      <td className="is-num">{balance(account.closingBalance)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </>
      );
    }
    case "journal": {
      const r = p.report;
      if (!r.hasActivity) return <Empty title={`No posted journal entries for ${r.rangeLabel}.`} />;
      return (
        <>
          <p className="pf-report-kpis">
            <span>{r.entries.length} posted entr{r.entries.length === 1 ? "y" : "ies"}</span>
            {r.bySource.map((s) => (
              <span key={s.label}>{s.label}: {s.count}</span>
            ))}
          </p>
          <div className="pf-journal-table-wrap pf-report-table-wrap">
            <table className="pf-journal-table pf-report-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Reference / source</th>
                  <th className="pf-report-col-code">Code</th>
                  <th>Account</th>
                  <th className="is-num">Debit</th>
                  <th className="is-num">Credit</th>
                </tr>
              </thead>
              <tbody>
                {r.entries.map((entry) => (
                  <JournalEntryRows key={entry.journalEntryId} entry={entry} />
                ))}
                <tr className="pf-statement-result">
                  <td colSpan={4}>Totals</td>
                  <td className="is-num">{ledgerAmount(r.totalDebit)}</td>
                  <td className="is-num">{ledgerAmount(r.totalCredit)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      );
    }
    case "accounting-completeness": {
      const r = p.report;
      if (!r.rows.length) return <Empty title="Nothing is awaiting accounting.">Every supported supplier bill and payment for this company has been posted.</Empty>;
      return (
        <>
          <GroupSummary groups={r.groups.map((g) => ({ label: g.label, count: g.count, totals: g.totals }))} />
          {r.blockedCount ? <Note>{r.blockedCount} item{r.blockedCount === 1 ? " is" : "s are"} blocked and cannot be posted until the stated reason is resolved.</Note> : null}
          <SimpleTable
            head={["Source", "Counterparty", "Reference", "Accounting date", "Amount", "State"]}
            numeric={[4]}
            rows={r.rows.map((row) => [
              <Link key="s" className="pf-report-drill" href={row.sourceHref}>{row.sourceLabel}</Link>,
              row.counterparty,
              row.reference ?? "—",
              day(row.accountingDate),
              currencyAmount(row.amount, row.currency),
              row.state === "blocked" ? <span key="b" className="pf-report-state is-blocked" title={row.blockingReason ?? undefined}>Blocked — {row.blockingReason}</span> : row.state === "draft" ? "Draft prepared" : "Not started",
            ])}
          />
        </>
      );
    }
    case "receivables-ageing": {
      const r = p.report;
      if (!r.rows.length) return <Empty title="No outstanding receivables.">{r.settledExcluded ? `${r.settledExcluded} settled receivable${r.settledExcluded === 1 ? " is" : "s are"} excluded.` : "This company has no receivables recorded."}</Empty>;
      return (
        <>
          <AgeingSummary summary={r.summary} extra={[{ label: "Ledger-recognised (invoices)", totals: r.ledgerRecognisedTotals }, { label: "Off-ledger client billing", totals: r.offLedgerTotals }, { label: "Total outstanding", totals: r.totals }]} />
          <SimpleTable
            head={["Reference", "Counterparty", "Ledger", "Due", "Overdue", "Original", "Outstanding"]}
            numeric={[4, 5, 6]}
            rows={r.rows.map((row) => [
              <Link key="r" className="pf-report-drill" href={row.href}>{row.reference}</Link>,
              row.counterparty,
              row.ledgerRecognised ? "Recognised" : "Off-ledger",
              row.dueDate ? day(row.dueDate) : "No due date",
              row.daysOverdue === null ? "—" : row.daysOverdue === 0 ? "Not due" : `${row.daysOverdue} d`,
              currencyAmount(row.original, row.currency),
              currencyAmount(row.outstanding, row.currency),
            ])}
          />
        </>
      );
    }
    case "payables-outstanding": {
      const r = p.report;
      return (
        <>
          {r.awaitingApproval.count ? (
            <Note>
              {r.awaitingApproval.count} obligation{r.awaitingApproval.count === 1 ? " is" : "s are"} awaiting approval ({r.awaitingApproval.totals.map((t) => currencyAmount(t.amount, t.currency)).join(", ")}) and not included below.
            </Note>
          ) : null}
          {!r.rows.length ? (
            <Empty title="No approved obligations are outstanding." />
          ) : (
            <>
              <AgeingSummary summary={r.summary} extra={[...r.bySource.map((s) => ({ label: `From ${s.source}s`, totals: s.totals })), { label: "Total outstanding", totals: r.totals }]} />
              <SimpleTable
                head={["Payee", "Source", "Status", "Due", "Overdue", "Payable", "Paid", "Outstanding"]}
                numeric={[4, 5, 6, 7]}
                rows={r.rows.map((row) => [
                  <Link key="p" className="pf-report-drill" href={row.href}>{row.payee}</Link>,
                  row.source,
                  row.status.replace(/_/g, " "),
                  row.dueDate ? day(row.dueDate) : "No due date",
                  row.daysOverdue === null ? "—" : row.daysOverdue === 0 ? "Not due" : `${row.daysOverdue} d`,
                  currencyAmount(row.payable, row.currency),
                  currencyAmount(row.paid, row.currency),
                  currencyAmount(row.outstanding, row.currency),
                ])}
              />
            </>
          )}
        </>
      );
    }
    case "collections": {
      const r = p.report;
      if (!r.rows.length) return <Empty title="No confirmed receipts in this date range.">{r.draftsExcluded ? `${r.draftsExcluded} draft receipt${r.draftsExcluded === 1 ? " is" : "s are"} excluded.` : null}</Empty>;
      return (
        <>
          <GroupSummary groups={[{ label: "Total collected", count: r.rows.length, totals: r.totals }, { label: "Posted to the ledger", count: r.rows.filter((x) => x.status === "posted").length, totals: r.postedTotals }, { label: "Confirmed, not yet posted", count: r.rows.filter((x) => x.status === "confirmed").length, totals: r.awaitingPostingTotals }]} />
          {r.draftsExcluded ? <Note>{r.draftsExcluded} draft receipt{r.draftsExcluded === 1 ? " is" : "s are"} excluded.</Note> : null}
          <SimpleTable
            head={["Receipt date", "Reference", "Counterparty", "Allocated to", "Destination", "Amount", "Status"]}
            numeric={[5]}
            rows={r.rows.map((row) => [
              day(row.receiptDate),
              row.journalEntryId ? <Link key="j" className="pf-report-drill" href={journalEntryHref(row.journalEntryId)}>{row.reference}</Link> : row.reference,
              row.counterparty,
              row.allocatedTo,
              row.destination,
              currencyAmount(row.amount, row.currency),
              row.status === "posted" ? "Posted" : "Confirmed · not posted",
            ])}
          />
        </>
      );
    }
    case "supplier-payments": {
      const r = p.report;
      if (!r.rows.length) return <Empty title="No confirmed payments in this date range." />;
      return (
        <>
          <GroupSummary groups={[{ label: "Total paid", count: r.rows.length, totals: r.totals }, { label: "Posted to the ledger", count: r.rows.filter((x) => x.accountingStatus === "posted").length, totals: r.postedTotals }, { label: "Awaiting accounting", count: r.rows.filter((x) => x.accountingStatus === "awaiting").length, totals: r.awaitingTotals }]} />
          <SimpleTable
            head={["Payment date", "Reference", "Payee", "Treatment", "Amount", "Accounting"]}
            numeric={[4]}
            rows={r.rows.map((row) => [
              day(row.paymentDate),
              <Link key="p" className="pf-report-drill" href={row.href}>{row.reference}</Link>,
              row.payee,
              row.treatment,
              currencyAmount(row.amount, row.currency),
              row.accountingStatus === "posted" && row.journalEntryId ? (
                <Link key="j" className="pf-report-drill" href={journalEntryHref(row.journalEntryId)}>Posted</Link>
              ) : row.blockingReason ? (
                <span key="b" className="pf-report-state is-blocked">Blocked — {row.blockingReason}</span>
              ) : (
                "Awaiting Review & Post"
              ),
            ])}
          />
        </>
      );
    }
    case "vendor-bill-pipeline":
    case "financial-request-pipeline": {
      const r = p.report;
      if (!r.rows.length) return <Empty title="Nothing was submitted in this date range.">{r.draftsExcluded ? `${r.draftsExcluded} unsubmitted draft${r.draftsExcluded === 1 ? " is" : "s are"} excluded.` : null}</Empty>;
      return (
        <>
          <div className="pf-journal-table-wrap pf-report-table-wrap">
            <table className="pf-journal-table pf-report-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th className="is-num">Count</th>
                  {r.amountLabels.map((l) => (
                    <th key={l} className="is-num">{l}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.statuses.map((s) => (
                  <tr key={s.status}>
                    <td>{s.label}</td>
                    <td className="is-num">{s.count}</td>
                    {s.amounts.map((a) => (
                      <td key={a.label} className="is-num">{currencyTotals(a.totals)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {r.draftsExcluded ? <Note>{r.draftsExcluded} unsubmitted draft{r.draftsExcluded === 1 ? " is" : "s are"} excluded.</Note> : null}
          <SimpleTable
            head={["Submitted", "Party", "Reference", "Status", ...r.amountLabels]}
            numeric={r.amountLabels.map((_, i) => 4 + i)}
            rows={r.rows.map((row) => [
              day(row.submittedOn),
              <Link key="l" className="pf-report-drill" href={row.href}>{row.party}</Link>,
              row.reference,
              row.statusLabel,
              ...row.amounts.map((a) => currencyAmount(a, row.currency)),
            ])}
          />
        </>
      );
    }
  }
}

function JournalEntryRows({ entry }: { entry: JournalReportEntry }) {
  return (
    <>
      <tr className="pf-report-entry-head">
        <td>{day(entry.entryDate)}</td>
        <td colSpan={5}>
          <Link className="pf-report-drill" href={journalEntryHref(entry.journalEntryId)}>{entry.reference}</Link>
          <span className="pf-report-entry-desc"> · {entry.description}</span>
          <span className="pf-report-entry-source">
            {entry.sourceHref ? <Link href={entry.sourceHref}>{entry.sourceLabel}</Link> : entry.sourceLabel}
          </span>
        </td>
      </tr>
      {entry.lines.map((line) => (
        <tr key={line.journalLineId}>
          <td />
          <td className="pf-report-desc">{line.description ?? ""}</td>
          <td className="pf-journal-code">{line.accountCode}</td>
          <td>{line.accountName}</td>
          <td className="is-num">{ledgerAmount(line.debit, { nilDash: true })}</td>
          <td className="is-num">{ledgerAmount(line.credit, { nilDash: true })}</td>
        </tr>
      ))}
    </>
  );
}

function GroupSummary({ groups }: { groups: Array<{ label: string; count: number; totals: readonly CurrencyTotal[] }> }) {
  return (
    <dl className="pf-report-summary">
      {groups.map((g) => (
        <div key={g.label}>
          <dt>{g.label}</dt>
          <dd>
            {currencyTotals(g.totals)}
            <span className="pf-report-summary-count">{g.count} item{g.count === 1 ? "" : "s"}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function AgeingSummary({ summary, extra }: { summary: readonly AgeingSummaryRow[]; extra: Array<{ label: string; totals: readonly CurrencyTotal[] }> }) {
  return (
    <div className="pf-report-ageing">
      <div className="pf-journal-table-wrap pf-report-table-wrap">
        <table className="pf-journal-table pf-report-table">
          <thead>
            <tr>
              <th>Ageing (by due date)</th>
              <th className="is-num">Count</th>
              <th className="is-num">Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((s) => (
              <tr key={s.bucket} className={s.count === 0 ? "pf-report-subtle" : undefined}>
                <td>{s.label}</td>
                <td className="is-num">{s.count}</td>
                <td className="is-num">{s.count ? currencyTotals(s.totals) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="pf-report-summary is-stacked">
        {extra.map((e) => (
          <div key={e.label}>
            <dt>{e.label}</dt>
            <dd>{currencyTotals(e.totals)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function SimpleTable({ head, rows, numeric }: { head: string[]; rows: ReactNode[][]; numeric: number[] }) {
  return (
    <div className="pf-journal-table-wrap pf-report-table-wrap">
      <table className="pf-journal-table pf-report-table">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={h} className={numeric.includes(i) ? "is-num" : undefined}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, r) => (
            <tr key={r}>
              {cells.map((cell, i) => (
                <td key={i} className={numeric.includes(i) ? "is-num" : undefined}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
