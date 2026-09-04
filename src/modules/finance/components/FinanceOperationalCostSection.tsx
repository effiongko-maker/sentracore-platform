"use client";

import Link from "next/link";
import { FINANCE_UI_LIST_LIMIT } from "../constants";
import type {
  FinanceOperationalCostLens,
  FinanceOperationalCostSummary,
  FinanceRecentCostRow,
} from "../types";

function formatRecordedAt(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return iso;
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function FinanceOperationalCostSection({
  lenses: _lenses,
  summary,
  recentCosts,
  loading,
}: {
  /** Kept for call-site compatibility; not rendered on the overview. */
  lenses: FinanceOperationalCostLens[];
  summary: FinanceOperationalCostSummary | null;
  recentCosts: FinanceRecentCostRow[];
  loading: boolean;
}) {
  const hasCosts = (summary?.totalCount ?? 0) > 0;
  const visible = recentCosts.slice(0, FINANCE_UI_LIST_LIMIT);

  return (
    <section className="fin-v13-panel">
      <div className="fin-v13-section-head">
        <div>
          <h2 className="fin-v13-section-title">Operational costs</h2>
          <p className="fin-v13-section-lede">Latest recorded spend.</p>
        </div>
        <Link href="/finance/costs" className="fin-v13-text-action">
          View all →
        </Link>
      </div>

      {loading ? (
        <div className="fin-v13-skel-block" />
      ) : hasCosts && summary ? (
        visible.length > 0 ? (
          <table className="fin-v13-table fin-v13-table--compact">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th className="fin-v13-num">Amount</th>
                <th>Status</th>
                <th className="fin-v13-action-col" />
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.costId}>
                  <td className="fin-v13-muted">
                    {formatRecordedAt(row.recordedAt)}
                  </td>
                  <td>
                    <span className="fin-v13-item-title">{row.description}</span>
                  </td>
                  <td className="fin-v13-num">{row.amountLabel}</td>
                  <td className="fin-v13-muted">{row.reimbursabilityLabel}</td>
                  <td className="fin-v13-action-col">
                    <Link
                      href={`/finance/costs/${encodeURIComponent(row.costId)}`}
                      className="fin-v13-text-action"
                    >
                      Open →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="fin-v13-empty">No recent costs in view.</p>
        )
      ) : (
        <p className="fin-v13-empty">No cost records yet.</p>
      )}
    </section>
  );
}
