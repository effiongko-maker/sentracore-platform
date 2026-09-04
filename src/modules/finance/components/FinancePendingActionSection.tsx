import Link from "next/link";
import { FINANCE_UI_LIST_LIMIT } from "../constants";
import type { FinancePendingActionItem } from "../types";

function attentionCopy(item: FinancePendingActionItem): {
  title: string;
  context: string;
} {
  switch (item.kind) {
    case "cost_needs_classification":
      return {
        title: "New cost needs classification",
        context: item.title,
      };
    case "cost_awaiting_submission":
      return {
        title: "Cost ready to claim",
        context: item.title,
      };
    case "submission_queried":
      return {
        title: "Claim queried",
        context: item.title,
      };
    case "submission_awaiting_authorization":
      return {
        title: "Claim awaiting authorization",
        context: item.title,
      };
    case "submission_awaiting_payment":
      return {
        title: "Claim awaiting payment",
        context: item.title,
      };
    case "submission_draft":
      return {
        title: "Draft claim to finish",
        context: item.title,
      };
    case "client_authorisation_awaiting":
      return {
        title: "Client authorisation awaiting decision",
        context: item.title,
      };
    case "client_authorisation_returned":
      return {
        title: "Client authorisation returned",
        context: item.title,
      };
    case "client_authorisation_draft":
      return {
        title: "Client authorisation draft",
        context: item.title,
      };
    default:
      return { title: item.title, context: item.stageLabel };
  }
}

function viewAllHref(items: FinancePendingActionItem[]): string {
  const hasSubmission = items.some((item) =>
    item.kind.startsWith("submission_")
  );
  if (hasSubmission) return "/finance/submissions";
  const hasAuth = items.some((item) =>
    item.kind.startsWith("client_authorisation_")
  );
  if (hasAuth) return "/approvals";
  return "/finance/costs";
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
    <section className="fin-v13-attention" aria-labelledby="fin-attention-heading">
      <div className="fin-v13-section-head">
        <div>
          <h2 id="fin-attention-heading" className="fin-v13-section-title">
            Needs attention
          </h2>
          <p className="fin-v13-section-lede">
            Things that need your action next.
          </p>
        </div>
        {hasMore ? (
          <Link href={viewAllHref(items)} className="fin-v13-text-action">
            View all →
          </Link>
        ) : null}
      </div>

      {loading ? (
        <div className="fin-v13-skel">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="fin-v13-skel-row" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="fin-v13-empty">Nothing needs action right now</p>
      ) : (
        <ul className="fin-v13-queue">
          {visible.map((item) => {
            const copy = attentionCopy(item);
            return (
              <li key={item.id} className="fin-v13-queue-row">
                <div className="fin-v13-queue-main">
                  <p className="fin-v13-queue-title">{copy.title}</p>
                  <p className="fin-v13-queue-context">{copy.context}</p>
                </div>
                <div className="fin-v13-queue-meta">
                  {item.amountLabel ? (
                    <span className="fin-v13-queue-amount">{item.amountLabel}</span>
                  ) : null}
                  {item.ageLabel ? (
                    <span className="fin-v13-queue-age">{item.ageLabel}</span>
                  ) : null}
                  {item.stageLabel ? (
                    <span className="fin-v13-queue-status">{item.stageLabel}</span>
                  ) : null}
                </div>
                <Link href={item.href} className="fin-v13-queue-action">
                  Open →
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
