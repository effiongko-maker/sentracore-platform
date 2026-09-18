"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { inputClassName } from "@/components/forms/FormField";
import { SearchableSelect } from "@/components/forms/SearchableSelect";
import { PlatformFinanceService } from "@/services/platform-finance/PlatformFinanceService";
import type {
  FinanceBalanceSheetLine,
  FinanceBalanceSheetResult,
} from "@/modules/platform-finance/domain/balanceSheet";
import {
  BALANCE_SHEET_OPENING_DISCLOSURE,
  UNCLOSED_EARNINGS_LABEL,
} from "@/modules/platform-finance/domain/balanceSheet";
import {
  financePeriodLabel,
  selectDefaultFinancePeriod,
} from "@/modules/platform-finance/domain/periods";
import type { FinanceCompany, FinancePeriod } from "@/modules/platform-finance/types";

function formatNairaSigned(amount: number): string {
  if (!Number.isFinite(amount)) return "—";
  const formatted = `₦${Math.abs(amount).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
  return amount < 0 ? `(${formatted})` : formatted;
}

function AccountRows({ rows }: { rows: FinanceBalanceSheetLine[] }) {
  if (rows.length === 0) return null;
  return (
    <>
      {rows.map((row) => (
        <tr key={row.accountId}>
          <td className="pf-journal-code">{row.accountCode}</td>
          <td>{row.accountName}</td>
          <td className="is-num">{formatNairaSigned(row.amount)}</td>
        </tr>
      ))}
    </>
  );
}

export function PlatformFinanceBalanceSheetPage() {
  const [companies, setCompanies] = useState<FinanceCompany[]>([]);
  const [periods, setPeriods] = useState<FinancePeriod[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [periodId, setPeriodId] = useState("");
  const [statement, setStatement] = useState<FinanceBalanceSheetResult | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectedPeriod = useMemo(
    () => periods.find((period) => period.id === periodId) ?? null,
    [periodId, periods]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const nextCompanies = await PlatformFinanceService.listAccessibleCompanies();
        if (cancelled) return;
        setCompanies(nextCompanies);
        if (nextCompanies[0]) setCompanyId(nextCompanies[0].id);
        else setLoading(false);
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
        return;
      }
      try {
        const list = await PlatformFinanceService.listPeriods(companyId);
        if (cancelled) return;
        setPeriods(list);
        const next = selectDefaultFinancePeriod(list);
        setPeriodId(next?.id ?? list[0]?.id ?? "");
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
    if (!companyId || !periodId) {
      setStatement(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const next = await PlatformFinanceService.getBalanceSheet({
        companyId,
        periodId,
      });
      setStatement(next);
      setError(null);
    } catch (cause: unknown) {
      setError(
        cause instanceof Error ? cause.message : "Unable to load balance sheet."
      );
      setStatement(null);
    } finally {
      setLoading(false);
    }
  }, [companyId, periodId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return (
    <div className="pf-journal pf-statement">
      <header className="pf-journal-header">
        <div className="pf-journal-header-copy">
          <h1 className="pf-journal-title">Balance Sheet</h1>
          <p className="pf-journal-desc">
            {statement?.asAtLabel ??
              (selectedPeriod
                ? `As at ${selectedPeriod.endDate}`
                : "As of selected period end")}
          </p>
        </div>
      </header>

      <div className="pf-journal-filters">
        <SearchableSelect
          className="pf-journal-filter-control"
          aria-label="Company"
          value={companyId}
          onChange={(value) => setCompanyId(value)}
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
          onChange={(event) => setPeriodId(event.target.value)}
          aria-label="Period"
        >
          <option value="">
            {companyId ? "Select period" : "Select a company first"}
          </option>
          {periods.map((period) => (
            <option key={period.id} value={period.id}>
              {financePeriodLabel(period.year, period.month)}
              {period.status === "closed" ? " (closed)" : ""}
            </option>
          ))}
        </select>
      </div>

      <p className="pf-statement-disclosure">{BALANCE_SHEET_OPENING_DISCLOSURE}</p>

      {error ? (
        <div className="pf-vb-alert is-danger" role="alert">
          {error}
        </div>
      ) : null}

      {!companyId || !periodId ? (
        <p className="pf-empty-copy">Select a company and period to view the balance sheet.</p>
      ) : loading ? (
        <p className="pf-empty-copy">Loading balance sheet…</p>
      ) : statement ? (
        <>
          <div className="pf-journal-table-wrap">
            <table className="pf-journal-table pf-statement-table">
              <thead>
                <tr>
                  <th>Account Code</th>
                  <th>Account Name</th>
                  <th className="is-num">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr className="pf-statement-section">
                  <td colSpan={3}>Assets</td>
                </tr>
                <AccountRows rows={statement.assets} />
                <tr className="pf-statement-total">
                  <td colSpan={2}>Total Assets</td>
                  <td className="is-num">{formatNairaSigned(statement.totalAssets)}</td>
                </tr>
                <tr className="pf-statement-section">
                  <td colSpan={3}>Liabilities</td>
                </tr>
                <AccountRows rows={statement.liabilities} />
                <tr className="pf-statement-total">
                  <td colSpan={2}>Total Liabilities</td>
                  <td className="is-num">
                    {formatNairaSigned(statement.totalLiabilities)}
                  </td>
                </tr>
                <tr className="pf-statement-section">
                  <td colSpan={3}>Equity</td>
                </tr>
                <AccountRows rows={statement.equity} />
                <tr className="pf-statement-derived">
                  <td></td>
                  <td>{UNCLOSED_EARNINGS_LABEL}</td>
                  <td className="is-num">
                    {formatNairaSigned(statement.unclosedEarnings)}
                  </td>
                </tr>
                <tr className="pf-statement-total">
                  <td colSpan={2}>Total Equity</td>
                  <td className="is-num">{formatNairaSigned(statement.totalEquity)}</td>
                </tr>
                <tr className="pf-statement-result">
                  <td colSpan={2}>Total Liabilities & Equity</td>
                  <td className="is-num">
                    {formatNairaSigned(statement.totalLiabilitiesAndEquity)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div
            className={`pf-journal-balance ${statement.balanced ? "is-ok" : "is-bad"}`}
            role="status"
          >
            <strong>
              {statement.balanced
                ? "Assets equal liabilities and equity"
                : "Balance sheet difference"}
            </strong>
            {statement.balanced ? (
              <p>Assets = Liabilities + Posted Equity + Unclosed Earnings (derived).</p>
            ) : (
              <p>Difference {formatNairaSigned(statement.difference)}</p>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}