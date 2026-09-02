"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type {
  FinanceOperationalCostLens,
  FinanceOperationalCostSummary,
  FinanceRecentCostRow,
} from "../types";
import { formatFinancialAmount } from "../utils/formatFinancialAmount";

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
  lenses,
  summary,
  recentCosts,
  loading,
}: {
  lenses: FinanceOperationalCostLens[];
  summary: FinanceOperationalCostSummary | null;
  recentCosts: FinanceRecentCostRow[];
  loading: boolean;
}) {
  const hasCosts = (summary?.count ?? 0) > 0;

  return (
    <section className="fin-quiet-panel">
      <div>
        <div>
          <h2 className="fin-section-title">Operational cost</h2>
          <p className="fin-section-lede">
            {hasCosts
              ? "Recorded operational spend across facilities and work."
              : "Record operational costs as they are incurred — facility spend, materials, labour, and related expenses."}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="fin-lens-grid mt-4">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="fin-lens h-16 animate-pulse bg-muted/15" />
          ))}
        </div>
      ) : hasCosts && summary ? (
        <>
          <div className="fin-cost-summary mt-4">
            <div>
              <p className="fin-metric-kicker">Total recorded</p>
              <p className="fin-cost-summary-value">
                {formatFinancialAmount(summary.totalAmount, summary.currency)}
              </p>
            </div>
            <div>
              <p className="fin-metric-kicker">Costs recorded</p>
              <p className="fin-cost-summary-value">{summary.count}</p>
            </div>
          </div>

          <div className="fin-lens-grid mt-4">
            {lenses.map((lens) => (
              <div key={lens.id} className="fin-lens fin-lens--live">
                <p className="fin-lens-label">{lens.label}</p>
                <p className="fin-lens-note">{lens.detail ?? "Recorded"}</p>
              </div>
            ))}
          </div>

          {recentCosts.length > 0 ? (
            <div className="fin-cost-table-wrap mt-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="fin-metric-kicker">Recent costs</h3>
                <Link
                  href="/finance/costs"
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  View all costs <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              <table className="fin-cost-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Category</th>
                    <th>Facility</th>
                    <th>Amount</th>
                    <th>Reimbursement</th>
                  </tr>
                </thead>
                <tbody>
                  {recentCosts.map((row) => (
                    <tr key={row.costId}>
                      <td>{formatRecordedAt(row.recordedAt)}</td>
                      <td>
                        <span className="fin-cost-desc">{row.description}</span>
                        <span className="fin-cost-id">{row.costId}</span>
                      </td>
                      <td>{row.categoryLabel}</td>
                      <td>{row.facilityId}</td>
                      <td className="fin-cost-amount">{row.amountLabel}</td>
                      <td>{row.reimbursabilityLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      ) : (
        <div className="fin-lens-grid mt-4">
          {lenses.map((lens) => (
            <div key={lens.id} className="fin-lens">
              <p className="fin-lens-label">{lens.label}</p>
              <p className="fin-lens-note">No cost records yet</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
