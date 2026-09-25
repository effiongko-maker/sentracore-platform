/**
 * CSV export for a report run. Pure: the same rows the screen shows, preceded by the report's identity, basis,
 * generation time and disclosures — a CSV never travels without the truth statements attached to its figures.
 */
import type { FinanceReportRun } from "@/modules/platform-finance/reports/types";
import type { ComparedSection } from "@/modules/platform-finance/reports/statements";
import type { CurrencyTotal } from "@/modules/platform-finance/reports/operational";

type Cell = string | number | null | undefined;

export function csvEscape(value: Cell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? value.toFixed(2) : "";
  // Text that a spreadsheet would read as a formula is neutralised with a leading apostrophe.
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function row(...cells: Cell[]): string {
  return cells.map(csvEscape).join(",");
}

function totals(label: string, list: readonly CurrencyTotal[]): string[] {
  return list.length ? list.map((t) => row(label, t.currency, t.amount)) : [row(label, "", 0)];
}

function comparedSections(sections: readonly ComparedSection[], hasComparative: boolean): string[] {
  const out: string[] = [];
  for (const s of sections) {
    out.push(row(s.label));
    for (const l of s.lines) {
      out.push(hasComparative ? row(l.accountCode, l.accountName, l.current, l.comparative, l.variance) : row(l.accountCode, l.accountName, l.current));
    }
    out.push(hasComparative ? row("", s.totalLabel, s.current, s.comparative, s.variance) : row("", s.totalLabel, s.current));
  }
  return out;
}

export function financeReportCsv(run: FinanceReportRun): string {
  const out: string[] = [
    row("Report", run.title),
    row("Company", run.companyName),
    row("Basis", run.basisLabel),
    row("Source", run.source),
    row("Generated", run.generatedAt),
    ...run.disclosures.map((d) => row("Disclosure", d)),
    "",
  ];
  const p = run.payload;
  switch (p.kind) {
    case "profit-and-loss":
    case "balance-sheet": {
      const r = p.report;
      const cmp = r.comparativeLabel !== null;
      out.push(cmp ? row("Account code", "Account", r.currentLabel, r.comparativeLabel, "Variance") : row("Account code", "Account", r.currentLabel));
      out.push(...comparedSections(r.sections, cmp));
      const figures = p.kind === "profit-and-loss" ? [p.report.grossProfit, p.report.netProfit] : [p.report.totalAssets, p.report.totalLiabilitiesAndEquity];
      for (const f of figures) out.push(cmp ? row("", f.label, f.current, f.comparative, f.variance) : row("", f.label, f.current));
      break;
    }
    case "trial-balance": {
      out.push(row("Account code", "Account", "Opening debit", "Opening credit", "Period debit", "Period credit", "Closing debit", "Closing credit"));
      for (const r of p.report.rows) out.push(row(r.accountCode, r.accountName, r.openingDebit, r.openingCredit, r.periodDebit, r.periodCredit, r.closingDebit, r.closingCredit));
      const t = p.report.totals;
      out.push(row("", "Totals", t.openingDebit, t.openingCredit, t.periodDebit, t.periodCredit, t.closingDebit, t.closingCredit));
      break;
    }
    case "general-ledger": {
      out.push(row("Account code", "Account", "Date", "Period", "Reference", "Description", "Debit", "Credit", "Balance (Dr+/Cr-)"));
      for (const a of p.report.accounts) {
        out.push(row(a.accountCode, a.accountName, "", "", "", "Opening balance", "", "", a.openingBalance));
        for (const l of a.lines) out.push(row(a.accountCode, a.accountName, l.entryDate, l.periodLabel, l.reference, l.description, l.debit, l.credit, l.runningBalance));
        out.push(row(a.accountCode, a.accountName, "", "", "", "Closing balance", a.totalDebit, a.totalCredit, a.closingBalance));
      }
      break;
    }
    case "journal": {
      out.push(row("Reference", "Date", "Period", "Source", "Entry description", "Line", "Account code", "Account", "Line description", "Debit", "Credit"));
      for (const e of p.report.entries) {
        for (const l of e.lines) out.push(row(e.reference, e.entryDate, e.periodLabel, e.sourceLabel, e.description, l.lineNo, l.accountCode, l.accountName, l.description, l.debit, l.credit));
      }
      out.push(row("Totals", "", "", "", "", "", "", "", "", p.report.totalDebit, p.report.totalCredit));
      break;
    }
    case "accounting-completeness": {
      out.push(row("Source", "Counterparty", "Reference", "Accounting date", "Currency", "Amount", "State", "Blocking reason"));
      for (const r of p.report.rows) out.push(row(r.sourceLabel, r.counterparty, r.reference, r.accountingDate, r.currency, r.amount, r.state, r.blockingReason));
      break;
    }
    case "receivables-ageing": {
      out.push(row("Reference", "Counterparty", "Ledger", "Document date", "Due date", "Days overdue", "Bucket", "Currency", "Original", "Outstanding"));
      for (const r of p.report.rows) out.push(row(r.reference, r.counterparty, r.ledgerRecognised ? "Ledger-recognised" : "Off-ledger", r.documentDate, r.dueDate, r.daysOverdue, r.bucket, r.currency, r.original, r.outstanding));
      out.push("", ...totals("Total outstanding", p.report.totals));
      break;
    }
    case "payables-outstanding": {
      out.push(row("Payee", "Source", "Status", "Due date", "Days overdue", "Bucket", "Currency", "Payable", "Paid", "Outstanding"));
      for (const r of p.report.rows) out.push(row(r.payee, r.source, r.status, r.dueDate, r.daysOverdue, r.bucket, r.currency, r.payable, r.paid, r.outstanding));
      out.push("", ...totals("Total outstanding", p.report.totals));
      break;
    }
    case "collections": {
      out.push(row("Reference", "Receipt date", "Counterparty", "Destination", "Allocated to", "Currency", "Amount", "Status"));
      for (const r of p.report.rows) out.push(row(r.reference, r.receiptDate, r.counterparty, r.destination, r.allocatedTo, r.currency, r.amount, r.status));
      out.push("", ...totals("Total collected", p.report.totals));
      break;
    }
    case "supplier-payments": {
      out.push(row("Reference", "Payment date", "Payee", "Treatment", "Currency", "Amount", "Accounting status", "Blocking reason"));
      for (const r of p.report.rows) out.push(row(r.reference, r.paymentDate, r.payee, r.treatment, r.currency, r.amount, r.accountingStatus, r.blockingReason));
      out.push("", ...totals("Total paid", p.report.totals));
      break;
    }
    case "vendor-bill-pipeline":
    case "financial-request-pipeline": {
      out.push(row("Submitted", "Party", "Reference", "Status", "Currency", ...p.report.amountLabels));
      for (const r of p.report.rows) out.push(row(r.submittedOn, r.party, r.reference, r.statusLabel, r.currency, ...r.amounts));
      break;
    }
  }
  return `${out.join("\r\n")}\r\n`;
}
