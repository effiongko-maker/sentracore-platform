import Link from "next/link";
import { Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function FinanceHeader({
  derivedAt,
  loading,
  onRefresh,
  onRecordCost,
}: {
  derivedAt?: string;
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

  return (
    <header className="fin-v13-header">
      <div className="fin-v13-header-row">
        <div className="min-w-0">
          <p className="fin-eyebrow">Finance</p>
          <h1 className="fin-title fin-title--compact">
            Operational financial position
          </h1>
          <p className="fin-lede fin-lede--compact">
            Operational spend, reimbursement preparation, and client
            authorisation.
          </p>
          {asOf ? (
            <p className="fin-v13-asof">In view as of {asOf}</p>
          ) : null}
        </div>
        <div className="fin-v13-actions">
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
          <Link href="/approvals" className="fin-v13-text-action">
            Client authorisations
          </Link>
        </div>
      </div>
    </header>
  );
}

export function FinanceSummaryRow({
  operationalSpendLabel,
  spendIsSample,
  costRecordsTotal,
  reimbursementsInPreparation,
  clientAuthorisationsTotal,
  loading,
}: {
  operationalSpendLabel: string;
  spendIsSample: boolean;
  costRecordsTotal: number;
  reimbursementsInPreparation: string;
  clientAuthorisationsTotal: number;
  loading: boolean;
}) {
  return (
    <section className="fin-v13-summary" aria-label="Financial summary">
      <div className="fin-v13-summary-item">
        <p className="fin-v13-metric-label">
          Operational spend{spendIsSample ? " (sample)" : ""}
        </p>
        <p className="fin-v13-metric-value">{operationalSpendLabel}</p>
      </div>
      <div className="fin-v13-summary-item">
        <p className="fin-v13-metric-label">Costs recorded</p>
        <p className="fin-v13-metric-value">
          {loading ? "—" : costRecordsTotal}
        </p>
      </div>
      <div className="fin-v13-summary-item">
        <p className="fin-v13-metric-label">Reimbursement in preparation</p>
        <p className="fin-v13-metric-value">
          {loading ? "—" : reimbursementsInPreparation}
        </p>
      </div>
      <div className="fin-v13-summary-item">
        <p className="fin-v13-metric-label">Client authorisations</p>
        <p className="fin-v13-metric-value">
          {loading ? "—" : clientAuthorisationsTotal}
        </p>
      </div>
    </section>
  );
}
