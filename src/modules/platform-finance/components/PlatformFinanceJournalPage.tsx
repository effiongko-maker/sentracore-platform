"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { inputClassName } from "@/components/forms/FormField";
import { SearchableSelect } from "@/components/forms/SearchableSelect";
import { PlatformFinanceService } from "@/services/platform-finance/PlatformFinanceService";
import {
  PLATFORM_FINANCE_JOURNAL_STATUS_LABELS,
  PLATFORM_FINANCE_TRANSACTION_TYPE_LABELS,
} from "@/modules/platform-finance/constants";
import type { FinanceCompany, FinancePeriod } from "@/modules/platform-finance/types";
import { financePeriodLabel } from "@/modules/platform-finance/domain/periods";

type JournalRow = {
  id: string;
  journalNo: string;
  entryDate: string;
  periodId: string;
  periodLabel: string;
  companyId: string;
  companyName: string;
  description: string;
  sourceType: string | null;
  reference: string;
  totalDebit: number;
  totalCredit: number;
  status: string;
};

const PAGE_SIZE = 25;

function formatNaira(amount: number): string {
  if (!Number.isFinite(amount)) return "—";
  return `₦${amount.toLocaleString("en-NG", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso.includes("T") ? iso : `${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function sourceTypeLabel(value: string | null): string {
  if (!value) return "—";
  const known =
    PLATFORM_FINANCE_TRANSACTION_TYPE_LABELS[
      value as keyof typeof PLATFORM_FINANCE_TRANSACTION_TYPE_LABELS
    ];
  return (known ?? value).toUpperCase();
}

export function PlatformFinanceJournalPage() {
  const router = useRouter();
  const [companies, setCompanies] = useState<FinanceCompany[]>([]);
  const [periods, setPeriods] = useState<FinancePeriod[]>([]);
  const [rows, setRows] = useState<JournalRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [searchApplied, setSearchApplied] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [periodId, setPeriodId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [status, setStatus] = useState("posted");
  const [sourceType, setSourceType] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(true);

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
        pageSize: PAGE_SIZE,
      });
      setRows(result.rows);
      setTotal(result.total);
      setError(null);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Unable to load journals."
      );
      setRows([]);
      setTotal(0);
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
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

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

  return (
    <div className="pf-journal">
      <header className="pf-journal-header">
        <div>
          <h1 className="pf-journal-title">Journal</h1>
          <p className="pf-journal-desc">
            View posted journal entries and their accounting details.
          </p>
        </div>
        <div className="pf-journal-header-actions">
          <div className="pf-journal-search">
            <Search size={16} aria-hidden />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applySearch();
              }}
              placeholder="Search by journal no., description or reference…"
              aria-label="Search journals"
            />
          </div>
          <button
            type="button"
            className="pf-btn-secondary"
            onClick={() => setFiltersOpen((v) => !v)}
          >
            Filters
          </button>
        </div>
      </header>

      {filtersOpen ? (
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
            emptyOptionLabel="All companies"
            placeholder="All companies"
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
      ) : null}

      {error ? (
        <div className="pf-vb-alert is-danger" role="alert">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="pf-empty-copy">Loading journals…</p>
      ) : rows.length === 0 ? (
        <div className="pf-req-empty">
          <p className="pf-empty-title">No journal entries</p>
          <p className="pf-empty-copy">
            Posted journal entries will appear here once financial transactions
            are posted through the accounting engine.
          </p>
        </div>
      ) : (
        <>
          <div className="pf-journal-table-wrap">
            <table className="pf-journal-table">
              <thead>
                <tr>
                  <th>Journal No.</th>
                  <th>Date</th>
                  <th>Period</th>
                  <th>Company</th>
                  <th>Description</th>
                  <th>Source Type</th>
                  <th>Reference</th>
                  <th className="is-num">Debit (₦)</th>
                  <th className="is-num">Credit (₦)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="pf-journal-row"
                    onClick={() =>
                      router.push(
                        `/platform-finance/accounting/journal/${row.id}`
                      )
                    }
                  >
                    <td>
                      <Link
                        href={`/platform-finance/accounting/journal/${row.id}`}
                        className="pf-journal-link"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {row.journalNo}
                      </Link>
                    </td>
                    <td>{formatDate(row.entryDate)}</td>
                    <td>{row.periodLabel}</td>
                    <td>{row.companyName}</td>
                    <td className="pf-journal-desc-cell">{row.description}</td>
                    <td className="pf-journal-source">
                      {sourceTypeLabel(row.sourceType)}
                    </td>
                    <td>{row.reference}</td>
                    <td className="is-num">{formatNaira(row.totalDebit)}</td>
                    <td className="is-num">{formatNaira(row.totalCredit)}</td>
                    <td>
                      <span
                        className={`pf-journal-status is-${row.status}`}
                      >
                        {PLATFORM_FINANCE_JOURNAL_STATUS_LABELS[
                          row.status as keyof typeof PLATFORM_FINANCE_JOURNAL_STATUS_LABELS
                        ] ?? row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <footer className="pf-journal-pager">
            <span>
              Showing {from}–{to} of {total} journal entries
            </span>
            <div className="pf-journal-pager-controls">
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
        </>
      )}
    </div>
  );
}
