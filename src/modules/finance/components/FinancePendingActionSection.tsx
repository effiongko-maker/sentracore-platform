import Link from "next/link";
import { AlertCircle } from "lucide-react";
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
        title: "Payment approval awaiting decision",
        context: item.title,
      };
    case "client_authorisation_returned":
      return {
        title: "Payment approval returned",
        context: item.title,
      };
    case "client_authorisation_draft":
      return {
        title: "Payment approval draft",
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
  incomplete = false,
}: {
  items: FinancePendingActionItem[];
  loading: boolean;
  incomplete?: boolean;
}) {
  const visible = items.slice(0, FINANCE_UI_LIST_LIMIT);
  const hasMore = items.length > FINANCE_UI_LIST_LIMIT;
  const countLabel = incomplete
    ? items.length === 0
      ? "Attention list is incomplete — some finance data is temporarily unavailable."
      : items.length === 1
        ? "1 known item requires action · picture is incomplete."
        : `${items.length} known items require action · picture is incomplete.`
    : items.length === 1
      ? "1 item requires your action."
      : `${items.length} items require your action.`;

  return (
    <section className="fin-v13-attention" aria-labelledby="fin-attention-heading">
      <div className="fin-v13-section-head">
        <div className="fin-v13-attention-heading">
          <span className="fin-v13-attention-icon" aria-hidden>
            <AlertCircle className="h-4 w-4" strokeWidth={1.75} />
          </span>
          <div>
            <h2 id="fin-attention-heading" className="fin-v13-section-title">
              Needs attention
            </h2>
            <p className="fin-v13-section-lede">
              {loading ? "Checking for items that need action…" : countLabel}
            </p>
          </div>
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
                <span className="fin-v13-queue-dot" aria-hidden />
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
