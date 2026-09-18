"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { inputClassName } from "@/components/forms/FormField";
import { SearchableSelect } from "@/components/forms/SearchableSelect";
import { PlatformFinanceService } from "@/services/platform-finance/PlatformFinanceService";
import type { FinanceTrialBalanceResult } from "@/modules/platform-finance/domain/trialBalance";
import { TRIAL_BALANCE_OPENING_DISCLOSURE } from "@/modules/platform-finance/domain/trialBalance";
import {
  financePeriodLabel,
  selectDefaultFinancePeriod,
} from "@/modules/platform-finance/domain/periods";
import type { FinanceCompany, FinancePeriod } from "@/modules/platform-finance/types";

function formatNaira(amount: number): string {
  if (!Number.isFinite(amount) || amount === 0) return "";
  return `₦${amount.toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatNairaTotal(amount: number): string {
  if (!Number.isFinite(amount)) return "—";
  return `₦${amount.toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function PlatformFinanceTrialBalancePage() {
  const [companies, setCompanies] = useState<FinanceCompany[]>([]);
  const [periods, setPeriods] = useState<FinancePeriod[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [periodId, setPeriodId] = useState("");
  const [statement, setStatement] = useState<FinanceTrialBalanceResult | null>(
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
      const next = await PlatformFinanceService.getTrialBalance({
        companyId,
        periodId,
      });
      setStatement(next);
      setError(null);
    } catch (cause: unknown) {
      setError(
        cause instanceof Error ? cause.message : "Unable to load trial balance."
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
          <h1 className="pf-journal-title">Trial Balance</h1>
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

      <p className="pf-statement-disclosure">{TRIAL_BALANCE_OPENING_DISCLOSURE}</p>

      {error ? (
        <div className="pf-vb-alert is-danger" role="alert">
          {error}
        </div>
      ) : null}

      {!companyId || !periodId ? (
        <p className="pf-empty-copy">Select a company and period to view the trial balance.</p>
      ) : loading ? (
        <p className="pf-empty-copy">Loading trial balance…</p>
      ) : statement ? (
        <>
          <div className="pf-journal-table-wrap">
            <table className="pf-journal-table pf-statement-table">
              <thead>
                <tr>
                  <th>Account Code</th>
                  <th>Account Name</th>
                  <th className="is-num">Debit</th>
                  <th className="is-num">Credit</th>
                </tr>
              </thead>
              <tbody>
                {statement.rows.length === 0 ? (
                  <tr className="pf-journal-empty-row">
                    <td colSpan={4}>
                      <p className="pf-journal-empty-title">
                        No posted trial balance activity through this period.
                      </p>
                      <p className="pf-journal-empty-copy">
                        Accounts will appear here once posted journal activity
                        exists for this company.
                      </p>
                    </td>
                  </tr>
                ) : (
                  statement.rows.map((row) => (
                    <tr key={row.accountId}>
                      <td className="pf-journal-code">{row.accountCode}</td>
                      <td>{row.accountName}</td>
                      <td className="is-num">{formatNaira(row.debit)}</td>
                      <td className="is-num">{formatNaira(row.credit)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="pf-statement-total">
                  <td colSpan={2}>Total</td>
                  <td className="is-num">{formatNairaTotal(statement.totalDebit)}</td>
                  <td className="is-num">{formatNairaTotal(statement.totalCredit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div
            className={`pf-journal-balance ${statement.balanced ? "is-ok" : "is-bad"}`}
            role="status"
          >
            <strong>
              {statement.balanced ? "Trial balance is balanced" : "Trial balance difference"}
            </strong>
            {statement.balanced ? (
              <p>Total debits equal total credits.</p>
            ) : (
              <p>Difference {formatNairaTotal(statement.difference)}</p>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}