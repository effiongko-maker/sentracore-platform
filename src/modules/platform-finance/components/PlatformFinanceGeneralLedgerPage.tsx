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
import type { FinanceAccount, FinanceCompany } from "@/modules/platform-finance/types";

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

function formatNairaSigned(amount: number): string {
  if (!Number.isFinite(amount)) return "—";
  const formatted = formatNaira(Math.abs(amount));
  return amount < 0 ? `(${formatted})` : formatted;
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

export function PlatformFinanceGeneralLedgerPage() {
  const [companies, setCompanies] = useState<FinanceCompany[]>([]);
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

  const [search, setSearch] = useState("");
  const [searchApplied, setSearchApplied] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [accountId, setAccountId] = useState("");

  const activeAccounts = useMemo(
    () => accounts.filter((account) => account.status === "active"),
    [accounts]
  );

  const selectedAccount = useMemo(
    () => activeAccounts.find((account) => account.id === accountId) ?? null,
    [accountId, activeAccounts]
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
        if (nextCompanies[0]) {
          setCompanyId(nextCompanies[0].id);
        }
        setLoading(false);
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

  const load = useCallback(async () => {
    if (!companyId || !accountId) {
      setRows([]);
      setTotal(0);
      setTotalDebit(0);
      setTotalCredit(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await PlatformFinanceService.listGeneralLedger({
        companyId,
        accountId,
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
  }, [accountId, companyId, page, pageSize, searchApplied]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const showPager = total > pageSize;
  const netMovement = totalDebit - totalCredit;

  function applySearch() {
    setSearchApplied(search.trim());
    setPage(1);
  }

  function clearSearch() {
    setSearch("");
    setSearchApplied("");
    setPage(1);
  }

  return (
    <div className="pf-journal">
      <header className="pf-journal-header">
        <div className="pf-journal-header-copy">
          <h1 className="pf-journal-title">General Ledger</h1>
          <p className="pf-journal-desc">
            Posted activity for a selected company and GL account.
          </p>
        </div>
      </header>

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
        <SearchableSelect
          className="pf-journal-filter-control"
          aria-label="GL account"
          value={accountId}
          onChange={(value) => {
            setAccountId(value);
            setPage(1);
          }}
          placeholder="Select GL account"
          options={activeAccounts.map((account) => ({
            value: account.id,
            label: `${account.code} — ${account.name}`,
            searchText: `${account.code} ${account.name}`,
          }))}
          searchPlaceholder="Search accounts…"
        />
      </div>

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
            placeholder="Search reference or description..."
            aria-label="Search reference or description"
            disabled={!accountId}
          />
        </div>
        {searchApplied ? (
          <button
            type="button"
            className="pf-link-btn pf-journal-clear"
            onClick={clearSearch}
          >
            Clear search
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="pf-vb-alert is-danger" role="alert">
          {error}
        </div>
      ) : null}

      {!companyId ? (
        <p className="pf-empty-copy">Select a company to view the general ledger.</p>
      ) : !accountId ? (
        <p className="pf-empty-copy">Select a GL account to view posted activity.</p>
      ) : loading ? (
        <p className="pf-empty-copy">Loading general ledger…</p>
      ) : (
        <>
          {selectedAccount ? (
            <p className="pf-gl-account-context">
              {selectedAccount.code} — {selectedAccount.name}
            </p>
          ) : null}

          <div className="pf-journal-register-totals pf-gl-totals" aria-live="polite">
            <div>
              <span>Total Debits</span>
              <strong>{formatNaira(totalDebit)}</strong>
            </div>
            <div>
              <span>Total Credits</span>
              <strong>{formatNaira(totalCredit)}</strong>
            </div>
            <div>
              <span>Net Movement</span>
              <strong>{formatNairaSigned(netMovement)}</strong>
            </div>
          </div>

          <div className="pf-journal-table-wrap">
            <table className="pf-journal-table pf-journal-register-table pf-gl-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Journal Ref</th>
                  <th>Description</th>
                  <th className="is-num">Debit (₦)</th>
                  <th className="is-num">Credit (₦)</th>
                  <th>Prepared By</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr className="pf-journal-empty-row">
                    <td colSpan={6}>
                      <p className="pf-journal-empty-title">
                        No posted ledger activity for this account.
                      </p>
                      <p className="pf-journal-empty-copy">
                        Posted journal activity for the selected company and
                        account will appear here.
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
                      <td className="is-num">{formatNairaCell(row.debit)}</td>
                      <td className="is-num">{formatNairaCell(row.credit)}</td>
                      <td>{row.preparedByName ?? "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
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