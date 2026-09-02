"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { FINANCE_UI_LIST_LIMIT } from "../constants";
import type { FinanceSubmissionSnapshot } from "../types";
import { formatFinancialAmount } from "../utils/formatFinancialAmount";
import { SUBMISSION_LIFECYCLE_LABELS } from "../utils/submissionLifecycle";

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
  const hasMore = total > FINANCE_UI_LIST_LIMIT;

  const statusLine = (() => {
    if (!snapshot || snapshot.truncated) {
      return snapshot?.truncated
        ? "Newest submissions shown · totals not fully aggregated"
        : null;
    }
    const parts: string[] = [];
    if ((snapshot.draftCount ?? 0) > 0) {
      parts.push(
        `${snapshot.draftCount} draft${snapshot.draftCount === 1 ? "" : "s"}`
      );
    }
    if ((snapshot.queriedCount ?? 0) > 0) {
      parts.push(`${snapshot.queriedCount} queried`);
    }
    if ((snapshot.submittedCount ?? 0) > 0) {
      parts.push(`${snapshot.submittedCount} submitted`);
    }
    return parts.length
      ? `Lifecycle · ${parts.join(" · ")}`
      : "Lifecycle · draft → submitted → queried → resubmit";
  })();

  return (
    <section className="fin-v13-panel">
      <div className="fin-v13-section-head">
        <div>
          <h2 className="fin-v13-section-title">Reimbursement submissions</h2>
          <p className="fin-v13-section-lede">
            {statusLine ??
              "Lifecycle · draft → submitted → queried → resubmit"}
          </p>
        </div>
        <div className="fin-v13-actions">
          <Link
            href="/finance/submissions/new"
            className="fin-v13-btn-primary"
          >
            <Plus className="h-3.5 w-3.5" />
            Create submission
          </Link>
          <Link href="/finance/submissions" className="fin-v13-text-action">
            View all submissions →
          </Link>
        </div>
      </div>

      {error ? (
        <p className="fin-v13-empty">{error}</p>
      ) : loading ? (
        <div className="fin-v13-skel-block" />
      ) : total === 0 ? (
        <p className="fin-v13-empty">
          No submissions yet. Select reimbursable costs when ready.
        </p>
      ) : (
        <>
          <p className="fin-v13-muted" style={{ margin: "0 0 0.45rem", fontSize: "0.75rem" }}>
            {total} submission{total === 1 ? "" : "s"}
            {snapshot?.truncated ? " · sample in view" : ""}
          </p>
          <table className="fin-v13-table fin-v13-table--compact">
            <thead>
              <tr>
                <th>Submission</th>
                <th>Status</th>
                <th className="fin-v13-num">Claim</th>
                <th className="fin-v13-num">Paid</th>
                <th className="fin-v13-num">Outstanding</th>
                <th>Payment</th>
                <th className="fin-v13-action-col" />
              </tr>
            </thead>
            <tbody>
              {submissions.map((submission) => (
                <tr key={submission.submissionId}>
                  <td>
                    <p className="fin-v13-item-title">
                      {submission.submissionId}
                    </p>
                    {submission.periodLabel ? (
                      <p className="fin-v13-item-meta">
                        {submission.periodLabel}
                      </p>
                    ) : null}
                  </td>
                  <td className="fin-v13-status">
                    {SUBMISSION_LIFECYCLE_LABELS[submission.status]}
                  </td>
                  <td className="fin-v13-num">
                    {formatFinancialAmount(
                      submission.claimAmount,
                      submission.currency
                    )}
                  </td>
                  <td className="fin-v13-num">
                    {formatFinancialAmount(
                      submission.amountPaid,
                      submission.currency
                    )}
                  </td>
                  <td className="fin-v13-num">
                    {formatFinancialAmount(
                      submission.outstandingAmount,
                      submission.currency
                    )}
                  </td>
                  <td className="fin-v13-status">
                    {submission.paymentStatusLabel}
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
          {hasMore ? (
            <div className="fin-v13-table-footer">
              <Link href="/finance/submissions" className="fin-v13-text-action">
                View all →
              </Link>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
