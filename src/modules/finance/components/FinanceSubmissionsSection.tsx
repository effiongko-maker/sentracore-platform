"use client";

import Link from "next/link";
import { CLIENT_PAYMENT_KIND_LABELS, FINANCE_UI_LIST_LIMIT } from "../constants";
import type { FinanceSubmissionSnapshot } from "../types";
import { formatFinancialAmount } from "../utils/formatFinancialAmount";
import { SUBMISSION_LIFECYCLE_LABELS } from "../utils/submissionLifecycle";

function statusTone(
  status: string,
  receiptLabel?: string
): "neutral" | "info" | "warn" | "ok" {
  if (receiptLabel === "Received") return "ok";
  if (receiptLabel === "Partially received") return "warn";
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
          <h2 className="fin-v13-section-title">Pending payments</h2>
          <p className="fin-v13-section-lede">
            Amounts requested from the client
            {snapshot?.outstandingCount ? ` · ${snapshot.outstandingCount} outstanding` : ""} · <Link href="/finance/submissions?kind=reimbursement_claim" className="fin-v13-text-action">Reimbursement claims</Link>
          </p>
        </div>
        <Link href="/finance/submissions" className="fin-v13-text-action">
          View all →
        </Link>
      </div>

      {error || snapshot?.available === false ? (
        <p className="fin-v13-empty">
          {error ?? "Pending payments are temporarily unavailable."}
        </p>
      ) : loading ? (
        <div className="fin-v13-skel-block" />
      ) : total === 0 ? (
        <p className="fin-v13-empty">No pending payments recorded in SentraCore™ yet.</p>
      ) : (
        <div className="fin-v13-table-scroll">
        <table className="fin-v13-table fin-v13-table--compact fin-v13-table--client-payments">
          <thead>
            <tr>
              <th>Request</th>
              <th>Status</th>
              <th className="fin-v13-num">Requested</th>
              <th className="fin-v13-num">Received</th>
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
                    {submission.clientReference ?? submission.submissionId}
                  </Link>
                  {/* Overview snapshot: reference + type only (full request text lives on the register/detail pages). */}
                  <p className="fin-v13-muted text-xs">
                    {CLIENT_PAYMENT_KIND_LABELS[submission.kind]}
                  </p>
                </td>
                <td>
                  <span
                    className={`fin-v13-pill fin-v13-pill--${statusTone(submission.status, submission.receiptLabel)}`}
                  >
                    {submission.receiptLabel ?? SUBMISSION_LIFECYCLE_LABELS[submission.status]}
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
        </div>
      )}
    </section>
  );
}
