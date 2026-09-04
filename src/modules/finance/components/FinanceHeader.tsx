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
          <h1 className="fin-title fin-title--compact">Finance</h1>
          <p className="fin-lede fin-lede--compact">
            Track operational costs, submit reimbursement claims, and record
            client payments.
          </p>
          {asOf ? (
            <p className="fin-v13-asof">In view as of {asOf}</p>
          ) : null}
        </div>
        <div className="fin-v13-actions">
          <Button
            type="button"
            size="sm"
            onClick={onRecordCost}
            disabled={loading}
          >
            <Plus className="h-4 w-4" />
            Record cost
          </Button>
          <Link
            href="/finance/submissions/new"
            className="fin-v13-btn-secondary"
            aria-disabled={loading || undefined}
          >
            <Plus className="h-4 w-4" />
            Create reimbursement claim
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
            aria-label="Refresh finance data"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
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
    <section
      className="fin-v13-glance"
      aria-label="Finance at a glance"
    >
      <div className="fin-v13-section-head fin-v13-section-head--tight">
        <h2 className="fin-v13-section-title">Finance at a glance</h2>
      </div>
      <div className="fin-v13-summary fin-v13-summary--cards">
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
          <p className="fin-v13-metric-label">Reimbursement</p>
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
      </div>
    </section>
  );
}
