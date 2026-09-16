"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FormField, inputClassName } from "@/components/forms/FormField";
import { SearchableSelect } from "@/components/forms/SearchableSelect";
import { PlatformFinanceService } from "@/services/platform-finance/PlatformFinanceService";
import { PLATFORM_FINANCE_PERIOD_STATUS_LABELS } from "@/modules/platform-finance/constants";
import {
  FINANCE_PERIOD_MONTH_LABELS,
  monthBounds,
} from "@/modules/platform-finance/domain/periods";
import type { FinanceCompany, FinancePeriod } from "@/modules/platform-finance/types";

export function PlatformFinancePeriodsPage() {
  const currentYear = new Date().getUTCFullYear();
  const [companies, setCompanies] = useState<FinanceCompany[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [year, setYear] = useState(currentYear);
  const [periods, setPeriods] = useState<FinancePeriod[]>([]);
  const [managePeriods, setManagePeriods] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [cos, caps] = await Promise.all([
          PlatformFinanceService.listAccessibleCompanies(),
          PlatformFinanceService.getMyAccountingCapabilities(),
        ]);
        if (cancelled) return;
        setCompanies(cos);
        setManagePeriods(caps.managePeriods);
        setCompanyId((prev) => prev || cos[0]?.id || "");
        setError(null);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Unable to load period admin."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadPeriods = useCallback(async (nextCompanyId: string, nextYear: number) => {
    if (!nextCompanyId) {
      setPeriods([]);
      return;
    }
    setBusy(true);
    try {
      const rows = await PlatformFinanceService.listPeriods(nextCompanyId);
      setPeriods(rows.filter((p) => p.year === nextYear));
      setError(null);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Unable to load periods."
      );
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (companyId) {
      void loadPeriods(companyId, year);
    }
  }, [companyId, year, loadPeriods]);

  const months = useMemo(() => {
    const byMonth = new Map(periods.map((p) => [p.month, p]));
    return Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      return {
        month,
        label: FINANCE_PERIOD_MONTH_LABELS[i]!,
        bounds: monthBounds(year, month),
        period: byMonth.get(month) ?? null,
      };
    });
  }, [periods, year]);

  async function handleGenerate() {
    if (!companyId || !managePeriods) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await PlatformFinanceService.generatePeriodCalendar({
        companyId,
        year,
      });
      setNotice(
        `Calendar ${year}: ${result.createdCount} created, ${result.existingCount} already present.`
      );
      setPeriods(result.periods);
      setError(null);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Unable to generate periods."
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleClose(period: FinancePeriod) {
    if (!managePeriods || period.status !== "open") return;
    const label = `${FINANCE_PERIOD_MONTH_LABELS[period.month - 1]} ${period.year}`;
    if (
      !window.confirm(
        `Close ${label}? Closed periods cannot be reopened in this release.`
      )
    ) {
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      await PlatformFinanceService.closePeriod({
        periodId: period.id,
        reason: "Closed from Accounting Periods admin",
      });
      setNotice(`${label} closed.`);
      await loadPeriods(companyId, year);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Unable to close period."
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="pf-empty-copy">Loading periods…</p>;
  }

  if (companies.length === 0) {
    return (
      <div className="pf-req-empty">
        <p className="pf-empty-title">No company access</p>
        <p className="pf-empty-copy">
          You need finance company access before administering periods.
        </p>
      </div>
    );
  }

  return (
    <div className="pf-periods">
      <div className="pf-periods-toolbar">
        <FormField label="Company" htmlFor="pf-period-company" required>
          <SearchableSelect
            id="pf-period-company"
            value={companyId}
            onChange={setCompanyId}
            options={companies.map((c) => ({
              value: c.id,
              label: c.name,
              searchText: c.code,
            }))}
            allowEmpty={false}
            placeholder="Select company"
            searchPlaceholder="Search companies…"
          />
        </FormField>
        <FormField label="Year" htmlFor="pf-period-year" required>
          <input
            id="pf-period-year"
            className={inputClassName}
            type="number"
            min={2000}
            max={2100}
            value={year}
            onChange={(e) => setYear(Number(e.target.value) || currentYear)}
          />
        </FormField>
        {managePeriods ? (
          <button
            type="button"
            className="pf-btn-primary pf-periods-generate"
            disabled={busy || !companyId}
            onClick={() => void handleGenerate()}
          >
            Generate {year} calendar
          </button>
        ) : null}
      </div>

      <p className="pf-periods-hint">
        Periods are company-scoped. Generation is idempotent — existing months
        are left unchanged (including closed periods). Reopen is not available.
      </p>

      {error ? (
        <div className="pf-vb-alert is-danger" role="alert">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="pf-periods-notice" role="status">
          {notice}
        </div>
      ) : null}

      <div className="pf-periods-table-wrap">
        <table className="pf-periods-table">
          <thead>
            <tr>
              <th>Month</th>
              <th>Start</th>
              <th>End</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {months.map((row) => (
              <tr key={row.month}>
                <td>
                  <strong>{row.label}</strong>
                </td>
                <td>{row.period?.startDate ?? row.bounds.startDate}</td>
                <td>{row.period?.endDate ?? row.bounds.endDate}</td>
                <td>
                  {row.period ? (
                    <span
                      className={`pf-periods-status is-${row.period.status}`}
                    >
                      {PLATFORM_FINANCE_PERIOD_STATUS_LABELS[row.period.status]}
                    </span>
                  ) : (
                    <span className="pf-muted">Not generated</span>
                  )}
                </td>
                <td>
                  {row.period?.status === "open" && managePeriods ? (
                    <button
                      type="button"
                      className="pf-link-btn"
                      disabled={busy}
                      onClick={() => void handleClose(row.period!)}
                    >
                      Close period
                    </button>
                  ) : row.period?.status === "closed" ? (
                    <span className="pf-muted">Closed</span>
                  ) : (
                    <span className="pf-muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
