"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { inputClassName } from "@/components/forms/FormField";
import { SearchableSelect } from "@/components/forms/SearchableSelect";
import { PlatformFinanceNewJournalDrawer } from "@/modules/platform-finance/components/PlatformFinanceNewJournalPage";
import { PlatformFinanceService } from "@/services/platform-finance/PlatformFinanceService";
import {
  PLATFORM_FINANCE_JOURNAL_REGISTER_PAGE_SIZE_DEFAULT,
  PLATFORM_FINANCE_JOURNAL_REGISTER_PAGE_SIZES,
  PLATFORM_FINANCE_TRANSACTION_TYPE_LABELS,
} from "@/modules/platform-finance/constants";
import type { FinanceJournalRegisterRow } from "@/modules/platform-finance/journalTypes";
import type { FinanceCompany, FinancePeriod } from "@/modules/platform-finance/types";
import { financePeriodLabel } from "@/modules/platform-finance/domain/periods";
import { FinancePaymentApiError, PlatformFinancePaymentsService } from "@/services/platform-finance/PlatformFinancePaymentsService";
import type { PaymentAccountingWorkItem } from "@/modules/platform-finance/domain/paymentAccounting";
import { PlatformFinancePaymentReviewDrawer } from "./PlatformFinancePaymentReviewDrawer";

function formatNaira(amount: number): string {
  if (!Number.isFinite(amount)) return "—";
  return `₦${amount.toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatNairaCell(amount: number): string {
  if (!Number.isFinite(amount) || amount === 0) return "";
  return formatNaira(amount);
}

function formatDate(iso: string): string {
  const d = new Date(iso.includes("T") ? iso : `${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function PlatformFinanceJournalPage() {
  const router = useRouter();
  const [companies, setCompanies] = useState<FinanceCompany[]>([]);
  const [periods, setPeriods] = useState<FinancePeriod[]>([]);
  const [rows, setRows] = useState<FinanceJournalRegisterRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pageDebitTotal, setPageDebitTotal] = useState(0);
  const [pageCreditTotal, setPageCreditTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(
    PLATFORM_FINANCE_JOURNAL_REGISTER_PAGE_SIZE_DEFAULT
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entryOpen, setEntryOpen] = useState(false);
  const [entryBusy, setEntryBusy] = useState(false);
  const [postedNotice, setPostedNotice] = useState<{
    journalEntryId: string;
    reference: string;
  } | null>(null);
  const [paymentWork, setPaymentWork] = useState<PaymentAccountingWorkItem[]>([]);
  const [paymentWorkLoading, setPaymentWorkLoading] = useState(true);
  const [paymentWorkError, setPaymentWorkError] = useState<string | null>(null);
  const [paymentWorkRestricted, setPaymentWorkRestricted] = useState(false);
  const [reviewPaymentId, setReviewPaymentId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [searchApplied, setSearchApplied] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [periodId, setPeriodId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [status, setStatus] = useState("posted");
  const [sourceType, setSourceType] = useState("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cos = await PlatformFinanceService.listAccessibleCompanies();
        if (!cancelled) setCompanies(cos);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Unable to load companies."
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!companyId) {
        setPeriods([]);
        setPeriodId("");
        return;
      }
      try {
        const list = await PlatformFinanceService.listPeriods(companyId);
        if (!cancelled) {
          setPeriods(list);
          setPeriodId("");
        }
      } catch {
        if (!cancelled) setPeriods([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await PlatformFinanceService.listJournals({
        companyId: companyId || null,
        periodId: periodId || null,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
        status: status || "posted",
        sourceType: sourceType === "all" ? null : sourceType,
        search: searchApplied || null,
        page,
        pageSize,
      });
      setRows(result.rows);
      setTotal(result.total);
      setPageDebitTotal(result.pageDebitTotal);
      setPageCreditTotal(result.pageCreditTotal);
      setError(null);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Unable to load journals."
      );
      setRows([]);
      setTotal(0);
      setPageDebitTotal(0);
      setPageCreditTotal(0);
    } finally {
      setLoading(false);
    }
  }, [
    companyId,
    periodId,
    dateFrom,
    dateTo,
    status,
    sourceType,
    searchApplied,
    page,
    pageSize,
  ]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const loadPaymentWork = useCallback(async () => {
    setPaymentWorkLoading(true);
    try {
      setPaymentWork(await PlatformFinancePaymentsService.listPaymentAccountingWork());
      setPaymentWorkError(null);
      setPaymentWorkRestricted(false);
    } catch (cause: unknown) {
      // RESTRICTED (403) is not a failure and not "nothing awaiting".
      setPaymentWork([]);
      setPaymentWorkRestricted(cause instanceof FinancePaymentApiError && cause.status === 403);
      setPaymentWorkError(
        cause instanceof Error
          ? cause.message
          : "Unable to load payment accounting work."
      );
    } finally {
      setPaymentWorkLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadPaymentWork(), 0);
    return () => window.clearTimeout(timer);
  }, [loadPaymentWork]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const showPager = total > pageSize;

  const hasActiveFilters = useMemo(
    () =>
      Boolean(
        companyId ||
          periodId ||
          dateFrom ||
          dateTo ||
          (status && status !== "posted") ||
          (sourceType && sourceType !== "all") ||
          searchApplied
      ),
    [
      companyId,
      periodId,
      dateFrom,
      dateTo,
      status,
      sourceType,
      searchApplied,
    ]
  );

  function clearFilters() {
    setCompanyId("");
    setPeriodId("");
    setDateFrom("");
    setDateTo("");
    setStatus("posted");
    setSourceType("all");
    setSearch("");
    setSearchApplied("");
    setPage(1);
  }

  function applySearch() {
    setSearchApplied(search.trim());
    setPage(1);
  }

  function openJournal(journalEntryId: string) {
    router.push(`/platform-finance/accounting/journal/${journalEntryId}`);
  }

  function closeEntryPanel() {
    if (entryBusy) return;
    setEntryOpen(false);
  }

  async function handleJournalPosted(result: {
    journalEntryId: string;
    reference: string;
  }) {
    setEntryOpen(false);
    setEntryBusy(false);
    setPostedNotice(result);
    setPage(1);
    await load();
  }

  return (
    <div className="pf-journal">
      <header className="pf-journal-header">
        <div className="pf-journal-header-copy">
          <h1 className="pf-journal-title">Journal</h1>
          <p className="pf-journal-desc">
            View posted journal entries and their accounting details.
          </p>
        </div>
      </header>

      {postedNotice ? (
        <p className="pf-journal-posted-notice" role="status">
          Journal <strong>{postedNotice.reference}</strong> posted.{" "}
          <Link
            href={`/platform-finance/accounting/journal/${postedNotice.journalEntryId}`}
            className="pf-journal-new-period-link"
          >
            View entry
          </Link>
        </p>
      ) : null}

      <section className="pf-rev-card" aria-labelledby="payment-accounting-heading">
        <h2 id="payment-accounting-heading">Payments awaiting accounting</h2>
        <p className="pf-journal-desc">
          Confirmed disbursements remain awaiting accounting until their Journal Entry is posted.
        </p>
        {paymentWorkLoading ? (
          <p className="pf-state-message">Loading payment accounting status…</p>
        ) : paymentWorkRestricted ? (
          <p className="pf-state-message">Payment accounting is restricted for your access.</p>
        ) : paymentWorkError ? (
          <div className="pf-vb-alert is-danger" role="alert">
            <p>{paymentWorkError}</p>
            <button type="button" className="pf-link-btn" onClick={() => void loadPaymentWork()}>
              Retry
            </button>
          </div>
        ) : paymentWork.some((item) => item.accountingStatus !== "posted") ? (
          <ul className="pf-payd-pay-history">
            {paymentWork.filter((item) => item.accountingStatus !== "posted").map((item) => (
              <li key={item.paymentId}>
                <strong>{formatNaira(item.amount)}</strong> · {item.payeeName} · {formatDate(item.paymentDate)}
                <br />
                <span className="pf-payd-muted">
                  Payment: Confirmed · Accounting: {item.blockingReason ? "Blocked" : "Awaiting accounting"}
                </span>
                {item.blockingReason ? (
                  <p className="pf-form-error">{item.blockingReason}{/period/i.test(item.blockingReason) ? <> <Link href="/platform-finance/accounting/periods">Manage periods</Link></> : null}</p>
                ) : null}
                <button type="button" className="pf-link-btn" onClick={() => setReviewPaymentId(item.paymentId)}>
                  Review &amp; Post
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="pf-empty-copy">No confirmed payments in the companies you can access are awaiting accounting.</p>
        )}
      </section>

      <div className="pf-journal-toolbar">
        <div className="pf-journal-search">
          <Search size={16} aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applySearch();
            }}
            placeholder="Search by reference or description…"
            aria-label="Search journals"
          />
        </div>
        <button
          type="button"
          className="pf-btn-primary pf-journal-toolbar-cta"
          onClick={() => {
            setPostedNotice(null);
            setEntryOpen(true);
          }}
        >
          New Journal Entry
        </button>
      </div>

      <div className="pf-journal-filters">
          <SearchableSelect
            className="pf-journal-filter-control"
            aria-label="Company"
            value={companyId}
            onChange={(v) => {
              setCompanyId(v);
              setPage(1);
            }}
            allowEmpty
            emptyOptionLabel="All Companies"
            placeholder="All Companies"
            options={companies.map((c) => ({
              value: c.id,
              label: c.name,
              searchText: c.code,
            }))}
            searchPlaceholder="Search companies…"
          />
          <select
            className={`${inputClassName} pf-journal-filter-control`}
            value={periodId}
            disabled={!companyId}
            onChange={(e) => {
              setPeriodId(e.target.value);
              setPage(1);
            }}
            aria-label="Period"
          >
            <option value="">All periods</option>
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {financePeriodLabel(p.year, p.month)}
              </option>
            ))}
          </select>
          <input
            type="date"
            className={`${inputClassName} pf-journal-filter-control`}
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
            aria-label="Date from"
          />
          <input
            type="date"
            className={`${inputClassName} pf-journal-filter-control`}
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
            aria-label="Date to"
          />
          <select
            className={`${inputClassName} pf-journal-filter-control`}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            aria-label="Status"
          >
            <option value="all">All statuses</option>
            <option value="posted">Posted</option>
            <option value="draft">Draft</option>
          </select>
          <select
            className={`${inputClassName} pf-journal-filter-control`}
            value={sourceType}
            onChange={(e) => {
              setSourceType(e.target.value);
              setPage(1);
            }}
            aria-label="Source type"
          >
            <option value="all">All source types</option>
            {Object.entries(PLATFORM_FINANCE_TRANSACTION_TYPE_LABELS).map(
              ([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              )
            )}
          </select>
          {hasActiveFilters ? (
            <button
              type="button"
              className="pf-link-btn pf-journal-clear"
              onClick={clearFilters}
            >
              Clear filters
            </button>
          ) : null}
      </div>

      {error ? (
        <div className="pf-vb-alert is-danger" role="alert">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="pf-empty-copy">Loading journals…</p>
      ) : (
        <>
          <div className="pf-journal-table-wrap">
            <table className="pf-journal-table pf-journal-register-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Ref No</th>
                  <th>Description</th>
                  <th>Code</th>
                  <th>Account Name</th>
                  <th className="is-num">Debit (₦)</th>
                  <th className="is-num">Credit (₦)</th>
                  <th>Prepared By</th>
                  <th>Period</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr className="pf-journal-empty-row">
                    <td colSpan={9}>
                      <p className="pf-journal-empty-title">
                        No posted journal entries yet.
                      </p>
                      <p className="pf-journal-empty-copy">
                        Posted accounting entries will appear here once
                        transactions are posted through the accounting engine.
                      </p>
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr
                      key={row.id}
                      className="pf-journal-row"
                      onClick={() => openJournal(row.journalEntryId)}
                    >
                      <td>{formatDate(row.entryDate)}</td>
                      <td>
                        <Link
                          href={`/platform-finance/accounting/journal/${row.journalEntryId}`}
                          className="pf-journal-link"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {row.reference}
                        </Link>
                      </td>
                      <td className="pf-journal-desc-cell">{row.description}</td>
                      <td className="pf-journal-code">{row.accountCode}</td>
                      <td>{row.accountName}</td>
                      <td className="is-num">
                        {formatNairaCell(row.debit)}
                      </td>
                      <td className="is-num">
                        {formatNairaCell(row.credit)}
                      </td>
                      <td>{row.preparedByName ?? "—"}</td>
                      <td>{row.periodLabel}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="pf-journal-register-totals" aria-live="polite">
            <div>
              <span>Total Debit</span>
              <strong>{formatNaira(pageDebitTotal)}</strong>
            </div>
            <div>
              <span>Total Credit</span>
              <strong>{formatNaira(pageCreditTotal)}</strong>
            </div>
          </div>

          {showPager ? (
            <footer className="pf-journal-pager">
              <span>
                Showing lines {from}–{to} of {total}
              </span>
              <div className="pf-journal-pager-controls">
                <label className="pf-journal-page-size">
                  <span className="sr-only">Rows per page</span>
                  <select
                    className={`${inputClassName} pf-journal-page-size-select`}
                    value={pageSize}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      setPageSize(
                        next === 50
                          ? 50
                          : PLATFORM_FINANCE_JOURNAL_REGISTER_PAGE_SIZE_DEFAULT
                      );
                      setPage(1);
                    }}
                    aria-label="Rows per page"
                  >
                    {PLATFORM_FINANCE_JOURNAL_REGISTER_PAGE_SIZES.map(
                      (size) => (
                        <option key={size} value={size}>
                          {size} rows
                        </option>
                      )
                    )}
                  </select>
                </label>
                <button
                  type="button"
                  className="pf-btn-secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span>
                  {page} / {pageCount}
                </span>
                <button
                  type="button"
                  className="pf-btn-secondary"
                  disabled={page >= pageCount}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </footer>
          ) : null}
        </>
      )}

      <PlatformFinanceNewJournalDrawer
        open={entryOpen}
        onClose={closeEntryPanel}
        onPosted={handleJournalPosted}
        onBusyChange={setEntryBusy}
      />
      {reviewPaymentId ? <PlatformFinancePaymentReviewDrawer paymentId={reviewPaymentId} onClose={() => setReviewPaymentId(null)} onPosted={() => { void load(); void loadPaymentWork(); }} /> : null}
    </div>
  );
}
