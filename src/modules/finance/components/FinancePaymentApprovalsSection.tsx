import Link from "next/link";
import type { FinancePendingActionItem } from "../types";

function statusTone(kind: FinancePendingActionItem["kind"]): "neutral" | "info" | "warn" {
  if (kind === "client_authorisation_returned") return "warn";
  if (kind === "client_authorisation_awaiting") return "info";
  return "neutral";
}

const STATUS_LABEL: Partial<Record<FinancePendingActionItem["kind"], string>> = {
  client_authorisation_awaiting: "Awaiting decision",
  client_authorisation_returned: "Returned",
  client_authorisation_draft: "Draft",
};

/** Payment Approvals overview: authorisation requested from the client, awaiting decision. Pairs with Pending payments. */
export function FinancePaymentApprovalsSection({
  items,
  awaitingCount,
  loading,
  available,
}: {
  items: FinancePendingActionItem[];
  /** Approvals awaiting a client decision; null when unknown. */
  awaitingCount: number | null;
  loading: boolean;
  available: boolean;
}) {
  return (
    <section className="fin-v13-panel" aria-labelledby="fin-approvals-heading">
      <div className="fin-v13-section-head">
        <div>
          <h2 id="fin-approvals-heading" className="fin-v13-section-title">Payment Approvals</h2>
          <p className="fin-v13-section-lede">
            Authorisation requested from the client
            {awaitingCount != null && available && !loading ? ` · ${awaitingCount} awaiting decision` : ""}
          </p>
        </div>
        <Link href="/approvals" className="fin-v13-text-action">
          View all →
        </Link>
      </div>

      {!available ? (
        <p className="fin-v13-empty">Payment Approvals are temporarily unavailable.</p>
      ) : loading ? (
        <div className="fin-v13-skel-block" />
      ) : items.length === 0 ? (
        <p className="fin-v13-empty">No payment approvals open.</p>
      ) : (
        <div className="fin-v13-table-scroll">
          <table className="fin-v13-table fin-v13-table--compact fin-v13-table--approvals">
            <colgroup>
              <col />
              <col className="fin-v13-approvals-status" />
              <col className="fin-v13-approvals-amount" />
              <col className="fin-v13-approvals-age" />
              <col className="fin-v13-action-col" />
            </colgroup>
            <thead>
              <tr>
                <th>Approval</th>
                <th>Status</th>
                <th className="fin-v13-num">Amount</th>
                <th>Age</th>
                <th className="fin-v13-action-col" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <Link href={item.href} className="fin-v13-item-link fin-v13-approvals-title" title={item.title}>
                      {item.title}
                    </Link>
                  </td>
                  <td>
                    <span className={`fin-v13-pill fin-v13-pill--${statusTone(item.kind)}`}>
                      {STATUS_LABEL[item.kind] ?? item.stageLabel}
                    </span>
                  </td>
                  <td className="fin-v13-num">{item.amountLabel ?? "Not recorded"}</td>
                  <td className="fin-v13-approvals-nowrap">{item.ageLabel ?? "—"}</td>
                  <td className="fin-v13-action-col">
                    <Link href={item.href} className="fin-v13-text-action">
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
