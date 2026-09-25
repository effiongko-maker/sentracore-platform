"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Download, FileSpreadsheet, Printer } from "lucide-react";
import { inputClassName } from "@/components/forms/FormField";
import { PlatformFinanceReportsService } from "@/services/platform-finance/PlatformFinanceReportsService";
import { PlatformFinanceService } from "@/services/platform-finance/PlatformFinanceService";
import {
  FINANCE_REPORT_FAMILY_LABELS,
  financeReportById,
  type FinanceReportDefinition,
} from "@/modules/platform-finance/reports/catalogue";
import type { FinanceReportParams, FinanceReportRun } from "@/modules/platform-finance/reports/types";
import { financeReportCsv } from "@/modules/platform-finance/reports/csv";
import { reportQuery } from "@/modules/platform-finance/reports/drill";
import { financePeriodLabel, periodOrdinal, selectDefaultFinancePeriod } from "@/modules/platform-finance/domain/periods";
import type { FinanceAccount, FinanceCompany, FinancePeriod } from "@/modules/platform-finance/types";
import { downloadBlob } from "@/modules/reports/export/filename";
import { downloadInvoicePdf } from "@/modules/platform-finance/export/downloadInvoicePdf";
import { PlatformFinanceReportBody } from "@/modules/platform-finance/components/PlatformFinanceReportBody";

const PERIOD_KINDS = new Set(["period-scope-comparison", "period-comparison", "period", "period-range"]);

function monthStart(today: string): string {
  return `${today.slice(0, 7)}-01`;
}

function generatedLabel(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fileBase(run: FinanceReportRun): string {
  return `${run.title} ${run.companyName} ${run.basisLabel}`.replace(/[^a-zA-Z0-9-_ ]+/g, "").trim().replace(/\s+/g, "_");
}

export function PlatformFinanceReportPage({ reportId }: { reportId: string }) {
  const report = financeReportById(reportId) as FinanceReportDefinition;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const documentRef = useRef<HTMLDivElement>(null);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const [companies, setCompanies] = useState<FinanceCompany[] | null>(null);
  const [calendar, setCalendar] = useState<{ companyId: string; periods: FinancePeriod[] } | null>(null);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [run, setRun] = useState<FinanceReportRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const usesPeriods = PERIOD_KINDS.has(report.parameters);
  const param = (key: string) => searchParams.get(key) ?? "";
  const companyId = param("company");
  // The calendar belongs to one company; another company's periods are never shown or sent.
  const periods = calendar && calendar.companyId === companyId ? calendar.periods : null;
  const periodId = param("period");
  const fromPeriodId = param("from");
  const toPeriodId = param("to");
  const scope = param("scope") === "ytd" ? "ytd" : "period";
  const comparison = param("compare") === "prior_period" || param("compare") === "prior_year" ? param("compare") : "none";
  const accountId = param("account");
  const dateFrom = param("dfrom") || monthStart(today);
  const dateTo = param("dto") || today;

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next: Record<string, string | null> = Object.fromEntries(searchParams.entries());
      Object.assign(next, patch);
      router.replace(`${pathname}${reportQuery(next)}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  // Companies the viewer can report on.
  useEffect(() => {
    let cancelled = false;
    PlatformFinanceReportsService.getCatalogue()
      .then((data) => {
        if (cancelled) return;
        setCompanies(data.companies);
        const entry = data.entries.find((e) => e.id === report.id);
        if (entry && entry.availability !== "available") setError("You do not have access to this report. It requires an existing Finance grant for its area.");
      })
      .catch((cause: unknown) => !cancelled && setError(cause instanceof Error ? cause.message : "Unable to load report."));
    return () => {
      cancelled = true;
    };
  }, [report.id]);

  useEffect(() => {
    if (companies && companies[0] && !companies.some((c) => c.id === companyId)) setParams({ company: companies[0].id });
  }, [companies, companyId, setParams]);

  // Company calendar (periods are company-scoped).
  useEffect(() => {
    if (!usesPeriods || !companyId) return;
    let cancelled = false;
    PlatformFinanceReportsService.listPeriods(companyId)
      .then((list) => !cancelled && setCalendar({ companyId, periods: list }))
      .catch((cause: unknown) => !cancelled && setError(cause instanceof Error ? cause.message : "Unable to load periods."));
    return () => {
      cancelled = true;
    };
  }, [companyId, usesPeriods]);

  useEffect(() => {
    if (report.id !== "general-ledger") return;
    PlatformFinanceService.listAccounts().then(setAccounts).catch(() => setAccounts([]));
  }, [report.id]);

  // Default period selections from the company calendar.
  useEffect(() => {
    if (!periods || !periods.length) return;
    const has = (id: string) => periods.some((p) => p.id === id);
    const fallback = selectDefaultFinancePeriod(periods) ?? periods[0];
    if (report.parameters === "period-range") {
      if (has(fromPeriodId) && has(toPeriodId)) return;
      const to = has(toPeriodId) ? periods.find((p) => p.id === toPeriodId)! : fallback;
      const firstOfYear = periods
        .filter((p) => p.year === to.year && p.month <= to.month)
        .reduce((min, p) => (p.month < min.month ? p : min), to);
      setParams({ from: has(fromPeriodId) ? fromPeriodId : firstOfYear.id, to: to.id });
    } else if (!has(periodId)) {
      setParams({ period: fallback.id });
    }
  }, [periods, periodId, fromPeriodId, toPeriodId, report.parameters, setParams]);

  const params: FinanceReportParams | null = useMemo(() => {
    if (!companyId) return null;
    if (usesPeriods) {
      // Wait for this company's calendar so a stale period from another company is never sent.
      const known = (id: string) => Boolean(periods?.some((p) => p.id === id));
      const ready = report.parameters === "period-range" ? known(fromPeriodId) && known(toPeriodId) : known(periodId);
      if (!ready) return null;
    }
    switch (report.parameters) {
      case "period-scope-comparison":
        return periodId ? { companyId, periodId, scope, comparison: comparison as FinanceReportParams["comparison"] } : null;
      case "period-comparison":
        return periodId ? { companyId, periodId, comparison: comparison as FinanceReportParams["comparison"] } : null;
      case "period":
        return periodId ? { companyId, periodId } : null;
      case "period-range":
        return fromPeriodId && toPeriodId ? { companyId, fromPeriodId, toPeriodId, accountId: accountId || null } : null;
      case "date-range":
        return { companyId, from: dateFrom, to: dateTo };
      case "as-at-today":
        return { companyId };
    }
  }, [accountId, comparison, companyId, dateFrom, dateTo, fromPeriodId, periodId, periods, report.parameters, scope, toPeriodId, usesPeriods]);

  useEffect(() => {
    if (!params) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      PlatformFinanceReportsService.runReport(report.id, params)
        .then((next) => !cancelled && setRun(next))
        .catch((cause: unknown) => {
          if (cancelled) return;
          setRun(null);
          setError(cause instanceof Error ? cause.message : "Unable to run report.");
        })
        .finally(() => !cancelled && setLoading(false));
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [params, reloadKey, report.id]);

  const sortedPeriods = useMemo(
    () => [...(periods ?? [])].sort((a, b) => periodOrdinal(b.year, b.month) - periodOrdinal(a.year, a.month)),
    [periods]
  );
  const drillPeriod = useMemo(() => (periods ?? []).find((p) => p.id === periodId) ?? null, [periods, periodId]);

  async function downloadPdf() {
    if (!run || !documentRef.current) return;
    setExporting(true);
    try {
      await downloadInvoicePdf(fileBase(run), documentRef.current);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Unable to prepare PDF.");
    } finally {
      setExporting(false);
    }
  }

  function downloadCsv() {
    if (!run) return;
    downloadBlob(new Blob([`﻿${financeReportCsv(run)}`], { type: "text/csv;charset=utf-8" }), `${fileBase(run)}.csv`);
  }

  const periodOptions = sortedPeriods.map((p) => (
    <option key={p.id} value={p.id}>
      {financePeriodLabel(p.year, p.month)}
      {p.status === "closed" ? " (closed)" : ""}
    </option>
  ));
  const noCompanies = companies !== null && companies.length === 0;
  const noPeriods = usesPeriods && periods !== null && periods.length === 0;

  return (
    <div className="pf-reports pf-report">
      <nav className="pf-report-crumb print:hidden" aria-label="Breadcrumb">
        <Link href="/platform-finance/reports">
          <ChevronLeft className="h-4 w-4" aria-hidden /> Reports
        </Link>
      </nav>

      <header className="pf-report-header print:hidden">
        <div>
          <p className="pf-ov-eyebrow">{FINANCE_REPORT_FAMILY_LABELS[report.family]}</p>
          <h1 className="pf-reports-title">{report.title}</h1>
          <p className="pf-reports-desc">
            {report.summary} <span className="pf-report-basis">{report.basis} · Source: {report.source}</span>
          </p>
        </div>
        <div className="pf-report-actions">
          <button type="button" className="pf-btn-secondary" disabled={!run || loading} onClick={() => window.print()}>
            <Printer className="h-4 w-4" aria-hidden /> Print
          </button>
          <button type="button" className="pf-btn-secondary" disabled={!run || loading || exporting} onClick={() => void downloadPdf()}>
            <Download className="h-4 w-4" aria-hidden /> {exporting ? "Preparing…" : "PDF"}
          </button>
          <button type="button" className="pf-btn-secondary" disabled={!run || loading} onClick={downloadCsv}>
            <FileSpreadsheet className="h-4 w-4" aria-hidden /> CSV
          </button>
        </div>
      </header>

      <div className="pf-journal-filters pf-report-params print:hidden">
        <select className={`${inputClassName} pf-journal-filter-control`} aria-label="Company" value={companyId} disabled={!companies?.length} onChange={(e) => setParams({ company: e.target.value, period: null, from: null, to: null, account: null })}>
          {!companies ? <option value="">Loading companies…</option> : null}
          {(companies ?? []).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        {report.parameters === "period-scope-comparison" || report.parameters === "period-comparison" || report.parameters === "period" ? (
          <select className={`${inputClassName} pf-journal-filter-control`} aria-label={report.parameters === "period-comparison" ? "As at period end" : "Period"} value={periodId} disabled={!sortedPeriods.length} onChange={(e) => setParams({ period: e.target.value })}>
            {periodOptions}
          </select>
        ) : null}

        {report.parameters === "period-scope-comparison" ? (
          <div className="pf-statement-scope" role="group" aria-label="Scope">
            <button type="button" aria-pressed={scope === "period"} onClick={() => setParams({ scope: null })}>Period</button>
            <button type="button" aria-pressed={scope === "ytd"} onClick={() => setParams({ scope: "ytd" })}>YTD</button>
          </div>
        ) : null}

        {report.parameters === "period-scope-comparison" || report.parameters === "period-comparison" ? (
          <select className={`${inputClassName} pf-journal-filter-control`} aria-label="Compare with" value={comparison} onChange={(e) => setParams({ compare: e.target.value === "none" ? null : e.target.value })}>
            <option value="none">No comparison</option>
            <option value="prior_period">Compare: prior period</option>
            <option value="prior_year">Compare: same period last year</option>
          </select>
        ) : null}

        {report.parameters === "period-range" ? (
          <>
            <label className="pf-report-param">
              <span>From</span>
              <select className={`${inputClassName} pf-journal-filter-control`} value={fromPeriodId} disabled={!sortedPeriods.length} onChange={(e) => setParams({ from: e.target.value })}>
                {periodOptions}
              </select>
            </label>
            <label className="pf-report-param">
              <span>To</span>
              <select className={`${inputClassName} pf-journal-filter-control`} value={toPeriodId} disabled={!sortedPeriods.length} onChange={(e) => setParams({ to: e.target.value })}>
                {periodOptions}
              </select>
            </label>
          </>
        ) : null}

        {report.id === "general-ledger" ? (
          <select className={`${inputClassName} pf-journal-filter-control`} aria-label="Account" value={accountId} onChange={(e) => setParams({ account: e.target.value || null })}>
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
            ))}
          </select>
        ) : null}

        {report.parameters === "date-range" ? (
          <>
            <label className="pf-report-param">
              <span>From</span>
              <input type="date" className={`${inputClassName} pf-journal-filter-control`} value={dateFrom} max={dateTo} onChange={(e) => e.target.value && setParams({ dfrom: e.target.value })} />
            </label>
            <label className="pf-report-param">
              <span>To</span>
              <input type="date" className={`${inputClassName} pf-journal-filter-control`} value={dateTo} min={dateFrom} onChange={(e) => e.target.value && setParams({ dto: e.target.value })} />
            </label>
          </>
        ) : null}

        {report.parameters === "as-at-today" ? <span className="pf-report-param-note">Current position as at today</span> : null}
      </div>

      {error ? (
        <div className="pf-vb-alert is-danger print:hidden" role="alert">
          {error}{" "}
          {params ? (
            <button type="button" className="pf-link-btn" onClick={() => setReloadKey((k) => k + 1)}>
              Retry
            </button>
          ) : null}
        </div>
      ) : null}

      {noCompanies ? (
        <div className="pf-report-empty" role="status">
          <p className="pf-report-empty-title">No finance company is assigned to you.</p>
          <p className="pf-report-empty-copy">Reports are company-scoped. Company access is granted by a Finance administrator.</p>
        </div>
      ) : noPeriods ? (
        <div className="pf-report-empty" role="status">
          <p className="pf-report-empty-title">No accounting periods exist for this company.</p>
          <p className="pf-report-empty-copy">
            Accounting reports are prepared per accounting period. Nothing can be reported until a period is created in{" "}
            <Link href="/platform-finance/accounting/periods">Periods</Link>.
          </p>
        </div>
      ) : loading && !run ? (
        <p className="pf-state-message">Preparing report…</p>
      ) : run ? (
        <div ref={documentRef} className={`pf-report-document${loading ? " is-refreshing" : ""}`} aria-busy={loading}>
          <header className="pf-report-doc-head">
            <div>
              <p className="pf-report-doc-company">{run.companyName}</p>
              <h2 className="pf-report-doc-title">{run.title}</h2>
              <p className="pf-report-doc-basis">{run.basisLabel}</p>
            </div>
            <dl className="pf-report-doc-meta">
              <div>
                <dt>Type</dt>
                <dd>{FINANCE_REPORT_FAMILY_LABELS[run.family]}</dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>{run.source}</dd>
              </div>
              <div>
                <dt>Generated</dt>
                <dd>{generatedLabel(run.generatedAt)}</dd>
              </div>
            </dl>
          </header>
          <div className="pf-report-doc-body">
            <PlatformFinanceReportBody run={run} drill={{ companyId: run.companyId, periods: periods ?? [], period: drillPeriod }} />
          </div>
          <footer className="pf-report-doc-foot">
            {run.disclosures.map((d) => (
              <p key={d}>{d}</p>
            ))}
            <p className="pf-report-doc-mark">SentraCore™ Platform Finance · {run.companyName} · Generated {generatedLabel(run.generatedAt)}</p>
          </footer>
        </div>
      ) : null}
    </div>
  );
}
