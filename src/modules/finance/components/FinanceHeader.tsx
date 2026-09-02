import Link from "next/link";
import { Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function FinanceHeader({
  derivedAt,
  totalApprovals,
  approvalsInView,
  truncated,
  loading,
  onRefresh,
  onRecordCost,
}: {
  derivedAt?: string;
  totalApprovals: number;
  approvalsInView: number;
  truncated: boolean;
  loading: boolean;
  onRefresh: () => void;
  onRecordCost: () => void;
}) {
  const asOf = derivedAt
    ? new Date(derivedAt).toLocaleString("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

  const periodLabel = truncated
    ? `First ${approvalsInView} of ${totalApprovals} client authorisation records`
    : totalApprovals > 0
      ? `All ${totalApprovals} client authorisation records`
      : "No client authorisation records yet";

  return (
    <header>
      <p className="fin-eyebrow">Finance</p>
      <h1 className="fin-title">Operational financial position</h1>
      <p className="fin-lede">
        Understand the financial activity, commitments, authorisations and
        reimbursement flow across facility operations. This is not corporate
        treasury or accounting — it is the financial operating view of work.
      </p>

      <div className="fin-context">
        <p className="fin-context-meta">
          <strong>Period:</strong> {periodLabel}
          {asOf ? (
            <>
              {" "}
              · <strong>As of</strong> {asOf}
            </>
          ) : null}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={onRecordCost} disabled={loading}>
            <Plus className="h-4 w-4" />
            Record cost
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Link
            href="/approvals"
            className="text-sm font-medium text-accent hover:underline"
          >
            Client authorisations
          </Link>
        </div>
      </div>
    </header>
  );
}
