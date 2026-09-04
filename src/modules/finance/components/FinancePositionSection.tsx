import Link from "next/link";
import type { Approval } from "@/modules/approvals/types";
import { labelizeApprovalStatus } from "@/modules/approvals/utils";
import { FINANCE_UI_LIST_LIMIT } from "../constants";
import { formatFinancialAmount } from "../utils/formatFinancialAmount";

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return iso;
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function statusTone(status: string): "neutral" | "info" | "warn" | "ok" {
  if (status === "approved") return "ok";
  if (status === "awaiting_decision" || status === "submitted") return "info";
  if (status === "returned" || status === "rejected") return "warn";
  return "neutral";
}

export function FinancePositionSection({
  approvals,
  loading,
  totalAuthorisations,
}: {
  approvals: Approval[];
  loading: boolean;
  totalAuthorisations: number;
}) {
  const visible = [...approvals]
    .sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt))
    .slice(0, FINANCE_UI_LIST_LIMIT);

  return (
    <section className="fin-v13-auth" aria-labelledby="fin-auth-heading">
      <div className="fin-v13-section-head">
        <div>
          <h2 id="fin-auth-heading" className="fin-v13-section-title">
            Client authorisations
          </h2>
          <p className="fin-v13-section-lede">
            {loading
              ? "Loading authorisations…"
              : totalAuthorisations > 0
                ? "Latest client authorisations in view."
                : "Work Order client authorisation — not reimbursement approval."}
          </p>
        </div>
        <Link href="/approvals" className="fin-v13-text-action">
          View all →
        </Link>
      </div>

      {loading ? (
        <div className="fin-v13-skel-block" />
      ) : visible.length === 0 ? (
        <p className="fin-v13-empty">No client authorisations recorded yet.</p>
      ) : (
        <table className="fin-v13-table fin-v13-table--compact">
          <thead>
            <tr>
              <th>Date</th>
              <th>Reference</th>
              <th>Work order</th>
              <th className="fin-v13-num">Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const amount =
                row.approvedAmount ?? row.approvalAmount ?? null;
              return (
                <tr key={row.id}>
                  <td className="fin-v13-muted">
                    {formatDate(row.updatedAt || row.createdAt)}
                  </td>
                  <td>
                    <Link
                      href={`/approvals?id=${encodeURIComponent(row.id)}`}
                      className="fin-v13-item-link"
                    >
                      {row.id}
                    </Link>
                  </td>
                  <td className="fin-v13-muted">{row.workOrderId}</td>
                  <td className="fin-v13-num">
                    {amount != null
                      ? formatFinancialAmount(amount, row.currency)
                      : "—"}
                  </td>
                  <td>
                    <span
                      className={`fin-v13-pill fin-v13-pill--${statusTone(row.status)}`}
                    >
                      {labelizeApprovalStatus(row.status)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
