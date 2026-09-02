import Link from "next/link";
import { Clock3 } from "lucide-react";
import { FINANCE_UI_LIST_LIMIT } from "../constants";
import type { FinancePendingActionItem } from "../types";

const KIND_LABEL: Record<FinancePendingActionItem["kind"], string> = {
  submission_queried: "Submission",
  submission_awaiting_payment: "Submission",
  submission_draft: "Submission",
  cost_needs_classification: "Cost",
  cost_awaiting_submission: "Cost",
  client_authorisation_awaiting: "Client authorisation",
  client_authorisation_returned: "Client authorisation",
  client_authorisation_draft: "Client authorisation",
};

function actionLabel(kind: FinancePendingActionItem["kind"]): string {
  if (kind === "submission_queried") return "Review →";
  if (kind === "submission_awaiting_payment") return "Open →";
  if (kind === "submission_draft") return "Continue →";
  return "Open →";
}

export function FinancePendingActionSection({
  items,
  loading,
}: {
  items: FinancePendingActionItem[];
  loading: boolean;
}) {
  const visible = items.slice(0, FINANCE_UI_LIST_LIMIT);
  const hasMore = items.length > FINANCE_UI_LIST_LIMIT;

  return (
    <section className="fin-v13-attention">
      <div className="fin-v13-section-head">
        <div>
          <h2 className="fin-v13-section-title">Needs attention</h2>
          <p className="fin-v13-section-lede">
            Exceptions and review work across costs, submissions, and client
            authorisation.
          </p>
        </div>
        {hasMore ? (
          <div className="fin-v13-view-all-group">
            <span className="fin-v13-muted">
              Showing {FINANCE_UI_LIST_LIMIT} of {items.length}
            </span>
            <Link href="/finance/costs" className="fin-v13-text-action">
              View all →
            </Link>
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="fin-v13-skel">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="fin-v13-skel-row" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="fin-v13-empty-inline">
          <Clock3 className="h-3.5 w-3.5" />
          <span>Nothing needs action right now</span>
        </div>
      ) : (
        <>
          <table className="fin-v13-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Item</th>
                <th className="fin-v13-num">Amount</th>
                <th>Status</th>
                <th className="fin-v13-action-col" />
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => (
                <tr key={item.id}>
                  <td className="fin-v13-type">{KIND_LABEL[item.kind]}</td>
                  <td>
                    <p className="fin-v13-item-title">{item.title}</p>
                    <p className="fin-v13-item-meta">
                      {item.workOrderId ? (
                        <>
                          <Link
                            href={`/work-orders?id=${encodeURIComponent(item.workOrderId)}`}
                            className="fin-v13-text-action"
                          >
                            {item.workOrderId}
                          </Link>
                          {item.facilityId ? ` · ${item.facilityId}` : null}
                        </>
                      ) : item.costId ? (
                        <>
                          {item.costId}
                          {item.facilityId ? ` · ${item.facilityId}` : null}
                        </>
                      ) : item.submissionId ? (
                        item.submissionId
                      ) : null}
                      {item.ageLabel ? ` · ${item.ageLabel}` : null}
                    </p>
                  </td>
                  <td className="fin-v13-num">{item.amountLabel ?? "—"}</td>
                  <td className="fin-v13-status">{item.stageLabel}</td>
                  <td className="fin-v13-action-col">
                    <Link href={item.href} className="fin-v13-text-action">
                      {actionLabel(item.kind)}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {hasMore ? (
            <div className="fin-v13-table-footer">
              <Link href="/finance/costs" className="fin-v13-text-action">
                Costs
              </Link>
              <span className="fin-v13-dot" aria-hidden="true">
                ·
              </span>
              <Link href="/finance/submissions" className="fin-v13-text-action">
                Submissions
              </Link>
              <span className="fin-v13-dot" aria-hidden="true">
                ·
              </span>
              <Link href="/approvals" className="fin-v13-text-action">
                Authorisations
              </Link>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
