"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { inputClassName } from "@/components/forms/FormField";
import { SearchableSelect } from "@/components/forms/SearchableSelect";
import { PlatformFinanceService } from "@/services/platform-finance/PlatformFinanceService";
import type {
  FinanceProfitAndLossLine,
  FinanceProfitAndLossResult,
  FinanceProfitAndLossScope,
} from "@/modules/platform-finance/domain/profitAndLoss";
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

function AccountRows({ rows }: { rows: FinanceProfitAndLossLine[] }) {
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

export function PlatformFinanceProfitAndLossPage() {
  const [companies, setCompanies] = useState<FinanceCompany[]>([]);
  const [periods, setPeriods] = useState<FinancePeriod[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [periodId, setPeriodId] = useState("");
  const [scope, setScope] = useState<FinanceProfitAndLossScope>("period");
  const [statement, setStatement] = useState<FinanceProfitAndLossResult | null>(
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
      const next = await PlatformFinanceService.getProfitAndLoss({
        companyId,
        periodId,
        scope,
      });
      setStatement(next);
      setError(null);
    } catch (cause: unknown) {
      setError(
        cause instanceof Error ? cause.message : "Unable to load profit and loss."
      );
      setStatement(null);
    } finally {
      setLoading(false);
    }
  }, [companyId, periodId, scope]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return (
    <div className="pf-journal pf-statement">
      <header className="pf-journal-header">
        <div className="pf-journal-header-copy">
          <h1 className="pf-journal-title">Profit & Loss</h1>
          <p className="pf-journal-desc">
            {statement?.subheading ??
              (selectedPeriod
                ? scope === "ytd"
                  ? `Year to ${financePeriodLabel(selectedPeriod.year, selectedPeriod.month)}`
                  : `For ${financePeriodLabel(selectedPeriod.year, selectedPeriod.month)}`
                : "Posted revenue and expense activity")}
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
        <div className="pf-statement-scope" role="group" aria-label="P&L scope">
          <button
            type="button"
            aria-pressed={scope === "period"}
            onClick={() => setScope("period")}
          >
            Period
          </button>
          <button
            type="button"
            aria-pressed={scope === "ytd"}
            onClick={() => setScope("ytd")}
          >
            YTD
          </button>
        </div>
      </div>

      {error ? (
        <div className="pf-vb-alert is-danger" role="alert">
          {error}
        </div>
      ) : null}

      {!companyId || !periodId ? (
        <p className="pf-empty-copy">Select a company and period to view profit and loss.</p>
      ) : loading ? (
        <p className="pf-empty-copy">Loading profit and loss…</p>
      ) : statement ? (
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
                <td colSpan={3}>Project / Operating Revenue</td>
              </tr>
              <AccountRows rows={statement.revenue} />
              <tr className="pf-statement-total">
                <td colSpan={2}>Total Revenue</td>
                <td className="is-num">{formatNairaSigned(statement.totalRevenue)}</td>
              </tr>
              <tr className="pf-statement-section">
                <td colSpan={3}>Direct Costs</td>
              </tr>
              <AccountRows rows={statement.directCosts} />
              <tr className="pf-statement-total">
                <td colSpan={2}>Total Direct Costs</td>
                <td className="is-num">
                  {formatNairaSigned(statement.totalDirectCosts)}
                </td>
              </tr>
              <tr className="pf-statement-result">
                <td colSpan={2}>Gross Profit</td>
                <td className="is-num">{formatNairaSigned(statement.grossProfit)}</td>
              </tr>
              <tr className="pf-statement-section">
                <td colSpan={3}>Other Income</td>
              </tr>
              <AccountRows rows={statement.otherIncome} />
              <tr className="pf-statement-total">
                <td colSpan={2}>Total Other Income</td>
                <td className="is-num">
                  {formatNairaSigned(statement.totalOtherIncome)}
                </td>
              </tr>
              <tr className="pf-statement-section">
                <td colSpan={3}>Operating Expenses</td>
              </tr>
              <AccountRows rows={statement.operatingExpenses} />
              <tr className="pf-statement-total">
                <td colSpan={2}>Total Operating Expenses</td>
                <td className="is-num">
                  {formatNairaSigned(statement.totalOperatingExpenses)}
                </td>
              </tr>
              <tr className="pf-statement-result">
                <td colSpan={2}>Net Profit / (Loss)</td>
                <td className="is-num">{formatNairaSigned(statement.netProfit)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}