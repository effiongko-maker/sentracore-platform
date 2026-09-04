"use client";

import Link from "next/link";
import { FINANCE_UI_LIST_LIMIT } from "../constants";
import type { FinanceSubmissionSnapshot } from "../types";
import { formatFinancialAmount } from "../utils/formatFinancialAmount";
import { SUBMISSION_LIFECYCLE_LABELS } from "../utils/submissionLifecycle";

function statusTone(
  status: string
): "neutral" | "info" | "warn" | "ok" {
  if (status === "queried") return "warn";
  if (status === "submitted") return "info";
  if (status === "draft") return "neutral";
  if (status === "cancelled") return "neutral";
  return "ok";
}

export function FinanceSubmissionsSection({
  snapshot,
  loading,
  error,
}: {
  snapshot: FinanceSubmissionSnapshot | null;
  loading: boolean;
  error?: string | null;
}) {
  const submissions = (snapshot?.preview ?? []).slice(0, FINANCE_UI_LIST_LIMIT);
  const total = snapshot?.total ?? 0;

  return (
    <section className="fin-v13-panel">
      <div className="fin-v13-section-head">
        <div>
          <h2 className="fin-v13-section-title">Reimbursement claims</h2>
          <p className="fin-v13-section-lede">Latest claims in view.</p>
        </div>
        <Link href="/finance/submissions" className="fin-v13-text-action">
          View all →
        </Link>
      </div>

      {error ? (
        <p className="fin-v13-empty">{error}</p>
      ) : loading ? (
        <div className="fin-v13-skel-block" />
      ) : total === 0 ? (
        <p className="fin-v13-empty">No claims yet.</p>
      ) : (
        <table className="fin-v13-table fin-v13-table--compact">
          <thead>
            <tr>
              <th>Claim</th>
              <th>Status</th>
              <th className="fin-v13-num">Amount</th>
              <th className="fin-v13-num">Outstanding</th>
              <th className="fin-v13-action-col" />
            </tr>
          </thead>
          <tbody>
            {submissions.map((submission) => (
              <tr key={submission.submissionId}>
                <td>
                  <Link
                    href={`/finance/submissions/${submission.submissionId}`}
                    className="fin-v13-item-link"
                  >
                    {submission.submissionId}
                  </Link>
                </td>
                <td>
                  <span
                    className={`fin-v13-pill fin-v13-pill--${statusTone(submission.status)}`}
                  >
                    {SUBMISSION_LIFECYCLE_LABELS[submission.status]}
                  </span>
                </td>
                <td className="fin-v13-num">
                  {formatFinancialAmount(
                    submission.claimAmount,
                    submission.currency
                  )}
                </td>
                <td className="fin-v13-num">
                  {formatFinancialAmount(
                    submission.outstandingAmount,
                    submission.currency
                  )}
                </td>
                <td className="fin-v13-action-col">
                  <Link
                    href={`/finance/submissions/${submission.submissionId}`}
                    className="fin-v13-text-action"
                  >
                    Open →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
