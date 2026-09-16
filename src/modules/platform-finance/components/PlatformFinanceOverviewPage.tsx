"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileMinus2,
  Info,
  Landmark,
  LineChart,
  Wallet,
} from "lucide-react";
import { PlatformFinanceService } from "@/services/platform-finance/PlatformFinanceService";
import type { FinanceOverviewSnapshot } from "@/modules/platform-finance/overviewTypes";

function formatNairaCompact(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) {
    return `₦${(amount / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
  }
  if (abs >= 1_000) {
    return `₦${(amount / 1_000).toFixed(abs >= 10_000 ? 0 : 1).replace(/\.0$/, "")}k`;
  }
  return `₦${amount.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

function formatAsOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${date} · ${time}`;
}

function formatActivityWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function PlatformFinanceOverviewPage() {
  const [companyId, setCompanyId] = useState<string>("");
  const [periodId, setPeriodId] = useState<string>("");
  const [snapshot, setSnapshot] = useState<FinanceOverviewSnapshot | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (nextCompanyId: string, nextPeriodId: string) => {
    setLoading(true);
    try {
      const data = await PlatformFinanceService.getOverview({
        companyId: nextCompanyId || null,
        periodId: nextPeriodId || null,
      });
      setSnapshot(data);
      setError(null);
      if (!nextPeriodId && data.selectedPeriodId) {
        setPeriodId(data.selectedPeriodId);
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Unable to load Finance Overview."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(companyId, periodId);
  }, [companyId, periodId, load]);

  const attentionTotal = useMemo(
    () =>
      snapshot?.needsAttention.reduce((sum, item) => sum + item.count, 0) ?? 0,
    [snapshot]
  );

  if (error) {
    return (
      <div className="pf-overview">
        <p className="pf-state-message is-error">{error}</p>
      </div>
    );
  }

  if (loading && !snapshot) {
    return (
      <div className="pf-overview">
        <p className="pf-state-message">Loading Finance Overview…</p>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="pf-overview">
        <p className="pf-state-message">No Finance Overview data available.</p>
      </div>
    );
  }

  const requests = snapshot.requests;
  const accounting = snapshot.accounting;

  return (
    <div className="pf-overview">
      <header className="pf-ov-header">
        <div>
          <p className="pf-ov-eyebrow">Finance</p>
          <h1 className="pf-ov-title">Finance Overview</h1>
          <p className="pf-ov-desc">
            Financial position and work requiring attention.
          </p>
        </div>
        <div className="pf-ov-controls">
          <div className="pf-ov-selects">
            <label className="sr-only" htmlFor="pf-company">
              Company
            </label>
            <select
              id="pf-company"
              className="pf-select"
              value={companyId}
              onChange={(e) => {
                setCompanyId(e.target.value);
                setPeriodId("");
              }}
            >
              <option value="">All Companies</option>
              {snapshot.companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="pf-period">
              Period
            </label>
            <select
              id="pf-period"
              className="pf-select"
              value={periodId || snapshot.selectedPeriodId || ""}
              onChange={(e) => setPeriodId(e.target.value)}
              disabled={snapshot.periods.length === 0}
            >
              {snapshot.periods.length === 0 ? (
                <option value="">No periods</option>
              ) : (
                snapshot.periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))
              )}
            </select>
          </div>
          <p className="pf-ov-asof">As of {formatAsOf(snapshot.asOf)}</p>
        </div>
      </header>

      <section className="pf-position-grid" aria-label="Financial position">
        <article className="pf-position-card">
          <div className="pf-position-icon is-green" aria-hidden>
            <Landmark className="h-4 w-4" />
          </div>
          <h2 className="pf-position-title">Actual Cash</h2>
          <p className="pf-position-desc">Total across all bank accounts</p>
          <p className="pf-position-value is-empty">Not available</p>
          <p className="pf-position-meta">Cash &amp; Banks not live yet</p>
          <ChevronRight className="pf-position-chevron h-4 w-4" aria-hidden />
        </article>

        <article className="pf-position-card">
          <div className="pf-position-icon is-red" aria-hidden>
            <FileMinus2 className="h-4 w-4" />
          </div>
          <h2 className="pf-position-title">Payables</h2>
          <p className="pf-position-desc">Approved and due obligations</p>
          <p className="pf-position-value is-empty">Not available</p>
          <p className="pf-position-meta">Payables not live yet</p>
          <ChevronRight className="pf-position-chevron h-4 w-4" aria-hidden />
        </article>

        <article className="pf-position-card">
          <div className="pf-position-icon is-blue" aria-hidden>
            <Wallet className="h-4 w-4" />
          </div>
          <h2 className="pf-position-title">Free Cash</h2>
          <p className="pf-position-desc">After payables</p>
          <p className="pf-position-value is-empty">
            Not available{" "}
            <Info className="inline h-3.5 w-3.5 align-[-2px] text-zinc-400" />
          </p>
          <p className="pf-position-meta">Requires Cash &amp; Payables</p>
          <ChevronRight className="pf-position-chevron h-4 w-4" aria-hidden />
        </article>

        <article className="pf-position-card">
          <div className="pf-position-icon is-purple" aria-hidden>
            <LineChart className="h-4 w-4" />
          </div>
          <h2 className="pf-position-title">Expected Receivables</h2>
          <p className="pf-position-desc">Confirmed and expected inflows</p>
          <p className="pf-position-value is-empty">Not available</p>
          <p className="pf-position-meta">Receivables not live yet</p>
          <ChevronRight className="pf-position-chevron h-4 w-4" aria-hidden />
        </article>
      </section>

      <section className="pf-mid-grid">
        <article className="pf-panel">
          <div className="pf-panel-head">
            <div className="pf-panel-title-row">
              <h2 className="pf-panel-title">Needs attention</h2>
              {attentionTotal > 0 ? (
                <span className="pf-badge is-critical">{attentionTotal}</span>
              ) : null}
            </div>
            <span className="pf-link is-disabled">View all</span>
          </div>
          {snapshot.needsAttention.length === 0 ? (
            <div className="pf-empty-box">
              <CircleHelp className="h-5 w-5 opacity-50" aria-hidden />
              <p>No actionable Finance items for the selected company scope.</p>
            </div>
          ) : (
            <ul className="pf-attention-list">
              {snapshot.needsAttention.map((item) => (
                <li key={item.id} className="pf-attention-item">
                  <span className={`pf-count-dot is-${item.tone}`}>
                    {item.count}
                  </span>
                  <div>
                    <p className="pf-item-label">{item.label}</p>
                    <p className="pf-item-detail">{item.detail}</p>
                  </div>
                  <ChevronRight
                    className="h-4 w-4 text-zinc-300"
                    aria-hidden
                  />
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="pf-panel">
          <div className="pf-panel-head">
            <div className="pf-panel-title-row">
              <h2 className="pf-panel-title">Finance tasks</h2>
              <span className="pf-badge is-muted">0</span>
            </div>
            <span className="pf-link is-disabled">View all</span>
          </div>
          <div className="pf-empty-box">
            <CalendarDays className="h-5 w-5 opacity-50" aria-hidden />
            <p>
              No Finance task system is connected yet. Tasks will appear here
              when available.
            </p>
          </div>
          <button type="button" className="pf-add-task" disabled>
            + Add task
          </button>
        </article>

        <article className="pf-panel">
          <div className="pf-panel-head">
            <h2 className="pf-panel-title">Financial requests</h2>
            <a className="pf-link" href="/platform-finance/requests">
              View all
            </a>
          </div>
          <div className="pf-request-rows">
            <div className="pf-request-row">
              <span className="pf-request-label">Awaiting review</span>
              <span className="pf-request-count">
                {requests.awaitingReview.count}
              </span>
              <span className="pf-request-amount">
                {formatNairaCompact(requests.awaitingReview.totalAmount)}
              </span>
            </div>
            <div className="pf-request-row">
              <span className="pf-request-label">Pending CEO approval</span>
              <span className="pf-request-count">
                {requests.pendingCeoApproval.count}
              </span>
              <span className="pf-request-amount">
                {formatNairaCompact(requests.pendingCeoApproval.totalAmount)}
              </span>
            </div>
            <div className="pf-request-row">
              <span className="pf-request-label">Queried</span>
              <span className="pf-request-count">{requests.queried.count}</span>
              <span className="pf-request-amount">
                {formatNairaCompact(requests.queried.totalAmount)}
              </span>
            </div>
            <div className="pf-request-row">
              <span className="pf-request-label">Approved this month</span>
              <span className="pf-request-count">
                {requests.approvedThisMonth.count}
              </span>
              <span className="pf-request-amount">
                {formatNairaCompact(requests.approvedThisMonth.totalAmount)}
              </span>
            </div>
          </div>
        </article>
      </section>

      <section className="pf-lower-grid">
        <article className="pf-panel">
          <div className="pf-panel-icon is-green" aria-hidden>
            <Landmark className="h-4 w-4" />
          </div>
          <h2 className="pf-panel-title">Cash position</h2>
          <div className="pf-empty-box">
            <ChartNoAxesCombined className="h-5 w-5 opacity-45" aria-hidden />
            <p>Account balances will appear here once Cash &amp; Banks is live.</p>
          </div>
        </article>

        <article className="pf-panel">
          <div className="pf-panel-icon is-blue" aria-hidden>
            <LineChart className="h-4 w-4" />
          </div>
          <h2 className="pf-panel-title">Cash movement</h2>
          <div className="pf-empty-box">
            <ChartNoAxesCombined className="h-5 w-5 opacity-45" aria-hidden />
            <p>
              Movement trends will appear once bank transactions and payments
              are available.
            </p>
          </div>
        </article>

        <article className="pf-panel">
          <div className="pf-panel-icon is-green" aria-hidden>
            <Building2 className="h-4 w-4" />
          </div>
          <h2 className="pf-panel-title">Accounting snapshot</h2>
          <dl className="pf-accounting-rows">
            <div className="pf-accounting-row">
              <dt>Revenue</dt>
              <dd>{formatNairaCompact(accounting.revenue)}</dd>
            </div>
            <div className="pf-accounting-row">
              <dt>Expenses</dt>
              <dd>{formatNairaCompact(accounting.expenses)}</dd>
            </div>
            <div className="pf-accounting-row">
              <dt>Net profit</dt>
              <dd>{formatNairaCompact(accounting.netProfit)}</dd>
            </div>
            <div className="pf-accounting-row">
              <dt>Journal entries</dt>
              <dd>{accounting.journalEntries}</dd>
            </div>
            <div className="pf-accounting-row">
              <dt>Unposted items</dt>
              <dd>{accounting.unpostedItems}</dd>
            </div>
            <div className="pf-accounting-row">
              <dt>Period status</dt>
              <dd>
                <span
                  className={`pf-period-pill is-${accounting.periodStatus}`}
                >
                  {accounting.periodStatus === "none"
                    ? "NONE"
                    : accounting.periodStatus.toUpperCase()}
                </span>
              </dd>
            </div>
          </dl>
          <span className="pf-panel-footer-link" title="Journal UI not live yet">
            Open Journal <ChevronRight className="h-3.5 w-3.5" />
          </span>
        </article>
      </section>

      <section className="pf-lower-grid">
        <article className="pf-panel">
          <div className="pf-panel-icon is-red" aria-hidden>
            <CalendarDays className="h-4 w-4" />
          </div>
          <h2 className="pf-panel-title">Upcoming obligations</h2>
          <div className="pf-empty-box">
            <ChartNoAxesCombined className="h-5 w-5 opacity-45" aria-hidden />
            <p>Due obligations will appear here once Payables is live.</p>
          </div>
        </article>

        <article className="pf-panel">
          <div className="pf-panel-icon is-blue" aria-hidden>
            <Wallet className="h-4 w-4" />
          </div>
          <h2 className="pf-panel-title">Expected inflows</h2>
          <div className="pf-empty-box">
            <ChartNoAxesCombined className="h-5 w-5 opacity-45" aria-hidden />
            <p>Expected inflows will appear here once Receivables is live.</p>
          </div>
        </article>

        <article className="pf-panel">
          <div className="pf-panel-head">
            <div className="pf-panel-title-row">
              <div className="pf-panel-icon is-neutral" aria-hidden>
                <Clock3 className="h-4 w-4" />
              </div>
              <h2 className="pf-panel-title">Recent activity</h2>
            </div>
            <span className="pf-link is-disabled">View all</span>
          </div>
          {snapshot.recentActivity.length === 0 ? (
            <div className="pf-empty-box">
              <Clock3 className="h-5 w-5 opacity-45" aria-hidden />
              <p>No recent Finance activity for this organisation yet.</p>
            </div>
          ) : (
            <ul className="pf-activity-list">
              {snapshot.recentActivity.map((item) => (
                <li key={item.id} className="pf-activity-item">
                  <span className={`pf-activity-dot is-${item.tone}`} />
                  <div>
                    <p className="pf-item-label">{item.label}</p>
                    {item.detail ? (
                      <p className="pf-item-detail">{item.detail}</p>
                    ) : null}
                  </div>
                  <span className="pf-activity-when">
                    {formatActivityWhen(item.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>
    </div>
  );
}
