"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { inputClassName } from "@/components/forms/FormField";
import { SearchableSelect } from "@/components/forms/SearchableSelect";
import { PlatformFinanceService } from "@/services/platform-finance/PlatformFinanceService";
import {
  PLATFORM_FINANCE_JOURNAL_REGISTER_PAGE_SIZE_DEFAULT,
  PLATFORM_FINANCE_JOURNAL_REGISTER_PAGE_SIZES,
} from "@/modules/platform-finance/constants";
import type { FinanceGeneralLedgerRow } from "@/modules/platform-finance/domain/generalLedger";
import { financePeriodLabel } from "@/modules/platform-finance/domain/periods";
import type {
  FinanceAccount,
  FinanceCompany,
  FinancePeriod,
} from "@/modules/platform-finance/types";

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

function localIsoDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function datesWithinPeriod(
  period: FinancePeriod,
  dateFrom: string,
  dateTo: string
): string | null {
  if (!dateFrom || !dateTo) {
    return "Date from and date to are required.";
  }
  if (dateFrom > dateTo) {
    return "Date from must be on or before date to.";
  }
  if (dateFrom < period.startDate || dateTo > period.endDate) {
    return "Date range must fall within the selected period.";
  }
  return null;
}

export function PlatformFinanceGeneralLedgerPage() {
  const [companies, setCompanies] = useState<FinanceCompany[]>([]);
  const [periods, setPeriods] = useState<FinancePeriod[]>([]);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [rows, setRows] = useState<FinanceGeneralLedgerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalDebit, setTotalDebit] = useState(0);
  const [totalCredit, setTotalCredit] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(
    PLATFORM_FINANCE_JOURNAL_REGISTER_PAGE_SIZE_DEFAULT
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [searchApplied, setSearchApplied] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [periodId, setPeriodId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [accountId, setAccountId] = useState("");

  const selectedPeriod = useMemo(
    () => periods.find((period) => period.id === periodId) ?? null,
    [periodId, periods]
  );

  const activeAccounts = useMemo(
    () => accounts.filter((account) => account.status === "active"),
    [accounts]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [nextCompanies, nextAccounts] = await Promise.all([
          PlatformFinanceService.listAccessibleCompanies(),
          PlatformFinanceService.listAccounts(),
        ]);
        if (cancelled) return;
        setCompanies(nextCompanies);
        setAccounts(nextAccounts);
        if (nextCompanies.length === 1) {
          setCompanyId(nextCompanies[0]!.id);
        } else if (nextCompanies[0]) {
          setCompanyId(nextCompanies[0].id);
        }
      } catch (cause: unknown) {
        if (!cancelled) {
          setError(
            cause instanceof Error ? cause.message : "Unable to load companies."
          );
          setLoading(false);
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
        setDateFrom("");
        setDateTo("");
        return;
      }
      try {
        const list = await PlatformFinanceService.listPeriods(companyId);
        if (cancelled) return;
        setPeriods(list);
        const today = localIsoDate();
        const covering = list.find(
          (period) =>
            period.status === "open" &&
            period.startDate <= today &&
            period.endDate >= today
        );
        const latestOpen = list.find((period) => period.status === "open");
        const nextPeriod = covering ?? latestOpen ?? null;
        setPeriodId(nextPeriod?.id ?? "");
        setDateFrom(nextPeriod?.startDate ?? "");
        setDateTo(nextPeriod?.endDate ?? "");
        setPage(1);
      } catch {
        if (!cancelled) {
          setPeriods([]);
          setPeriodId("");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const load = useCallback(async () => {
    if (!companyId || !periodId || !selectedPeriod) {
      setRows([]);
      setTotal(0);
      setTotalDebit(0);
      setTotalCredit(0);
      setLoading(false);
      return;
    }
    const rangeError = datesWithinPeriod(selectedPeriod, dateFrom, dateTo);
    if (rangeError) {
      setDateError(rangeError);
      setRows([]);
      setTotal(0);
      setTotalDebit(0);
      setTotalCredit(0);
      setLoading(false);
      return;
    }
    setDateError(null);
    setLoading(true);
    try {
      const result = await PlatformFinanceService.listGeneralLedger({
        companyId,
        periodId,
        dateFrom,
        dateTo,
        accountId: accountId || null,
        search: searchApplied || null,
        page,
        pageSize,
      });
      setRows(result.rows);
      setTotal(result.total);
      setTotalDebit(result.totalDebit);
      setTotalCredit(result.totalCredit);
      setError(null);
    } catch (cause: unknown) {
      setError(
        cause instanceof Error ? cause.message : "Unable to load general ledger."
      );
      setRows([]);
      setTotal(0);
      setTotalDebit(0);
      setTotalCredit(0);
    } finally {
      setLoading(false);
    }
  }, [
    accountId,
    companyId,
    dateFrom,
    dateTo,
    page,
    pageSize,
    periodId,
    searchApplied,
    selectedPeriod,
  ]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const showPager = total > pageSize;

  function applySearch() {
    setSearchApplied(search.trim());
    setPage(1);
  }

  function clearOptionalFilters() {
    setAccountId("");
    setSearch("");
    setSearchApplied("");
    if (selectedPeriod) {
      setDateFrom(selectedPeriod.startDate);
      setDateTo(selectedPeriod.endDate);
    }
    setPage(1);
  }

  const hasOptionalFilters = Boolean(
    accountId ||
      searchApplied ||
      (selectedPeriod &&
        (dateFrom !== selectedPeriod.startDate ||
          dateTo !== selectedPeriod.endDate))
  );

  return (
    <div className="pf-journal">
      <header className="pf-journal-header">
        <div className="pf-journal-header-copy">
          <h1 className="pf-journal-title">General Ledger</h1>
          <p className="pf-journal-desc">
            Posted journal line activity for the selected company and period.
          </p>
        </div>
      </header>

      <div className="pf-journal-toolbar">
        <div className="pf-journal-search">
          <Search size={16} aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") applySearch();
            }}
            placeholder="Search reference, description, or account…"
            aria-label="Search general ledger"
          />
        </div>
      </div>

      <div className="pf-journal-filters">
        <SearchableSelect
          className="pf-journal-filter-control"
          aria-label="Company"
          value={companyId}
          onChange={(value) => {
            setCompanyId(value);
            setPage(1);
          }}
          placeholder="Select company"
          options={companies.map((company) => ({
            value: company.id,
            label: company.name,
            searchText: company.code,
          }))}
          searchPlaceholder="Search companies…"
        />
        <select
          className={`${inputClassName} pf-journal-filter-control`}
          value={periodId}
          disabled={!companyId}
          onChange={(event) => {
            const nextId = event.target.value;
            const nextPeriod = periods.find((period) => period.id === nextId);
            setPeriodId(nextId);
            setDateFrom(nextPeriod?.startDate ?? "");
            setDateTo(nextPeriod?.endDate ?? "");
            setPage(1);
          }}
          aria-label="Period"
        >
          <option value="">{companyId ? "Select period" : "Select a company first"}</option>
          {periods.map((period) => (
            <option key={period.id} value={period.id}>
              {financePeriodLabel(period.year, period.month)}
              {period.status === "closed" ? " (closed)" : ""}
            </option>
          ))}
        </select>
        <input
          type="date"
          className={`${inputClassName} pf-journal-filter-control`}
          value={dateFrom}
          min={selectedPeriod?.startDate}
          max={selectedPeriod?.endDate}
          disabled={!selectedPeriod}
          onChange={(event) => {
            setDateFrom(event.target.value);
            setPage(1);
          }}
          aria-label="Date from"
        />
        <input
          type="date"
          className={`${inputClassName} pf-journal-filter-control`}
          value={dateTo}
          min={selectedPeriod?.startDate}
          max={selectedPeriod?.endDate}
          disabled={!selectedPeriod}
          onChange={(event) => {
            setDateTo(event.target.value);
            setPage(1);
          }}
          aria-label="Date to"
        />
        <SearchableSelect
          className="pf-journal-filter-control"
          aria-label="GL account"
          value={accountId}
          onChange={(value) => {
            setAccountId(value);
            setPage(1);
          }}
          allowEmpty
          emptyOptionLabel="All accounts"
          placeholder="All accounts"
          options={activeAccounts.map((account) => ({
            value: account.id,
            label: `${account.code} — ${account.name}`,
            searchText: `${account.code} ${account.name}`,
          }))}
          searchPlaceholder="Search accounts…"
        />
        {hasOptionalFilters ? (
          <button
            type="button"
            className="pf-link-btn pf-journal-clear"
            onClick={clearOptionalFilters}
          >
            Clear filters
          </button>
        ) : null}
      </div>

      {dateError ? (
        <div className="pf-vb-alert is-danger" role="alert">
          {dateError}
        </div>
      ) : null}
      {error ? (
        <div className="pf-vb-alert is-danger" role="alert">
          {error}
        </div>
      ) : null}

      {!companyId ? (
        <p className="pf-empty-copy">Select a company to view the general ledger.</p>
      ) : loading ? (
        <p className="pf-empty-copy">Loading general ledger…</p>
      ) : (
        <>
          <div className="pf-journal-table-wrap">
            <table className="pf-journal-table pf-journal-register-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Journal Ref</th>
                  <th>Description</th>
                  <th>GL Code</th>
                  <th>Account</th>
                  <th className="is-num">Debit (₦)</th>
                  <th className="is-num">Credit (₦)</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr className="pf-journal-empty-row">
                    <td colSpan={7}>
                      <p className="pf-journal-empty-title">
                        No posted ledger lines for the current filters.
                      </p>
                      <p className="pf-journal-empty-copy">
                        Posted journal activity will appear here once it exists
                        for this company and period.
                      </p>
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id}>
                      <td>{formatDate(row.entryDate)}</td>
                      <td>
                        <Link
                          href={`/platform-finance/accounting/journal/${row.journalEntryId}`}
                          className="pf-journal-link"
                        >
                          {row.reference}
                        </Link>
                      </td>
                      <td className="pf-journal-desc-cell">{row.description}</td>
                      <td className="pf-journal-code">{row.accountCode}</td>
                      <td>{row.accountName}</td>
                      <td className="is-num">{formatNairaCell(row.debit)}</td>
                      <td className="is-num">{formatNairaCell(row.credit)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="pf-journal-register-totals" aria-live="polite">
            <div>
              <span>Total Debit</span>
              <strong>{formatNaira(totalDebit)}</strong>
            </div>
            <div>
              <span>Total Credit</span>
              <strong>{formatNaira(totalCredit)}</strong>
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
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      setPageSize(
                        next === 50
                          ? 50
                          : PLATFORM_FINANCE_JOURNAL_REGISTER_PAGE_SIZE_DEFAULT
                      );
                      setPage(1);
                    }}
                    aria-label="Rows per page"
                  >
                    {PLATFORM_FINANCE_JOURNAL_REGISTER_PAGE_SIZES.map((size) => (
                      <option key={size} value={size}>
                        {size} rows
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="pf-btn-secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
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
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </button>
              </div>
            </footer>
          ) : null}
        </>
      )}
    </div>
  );
}
