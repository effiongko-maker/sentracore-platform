import Image from "next/image";
import Link from "next/link";
import { FileText, Plus, RefreshCw, Send, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";

const SPEND_VISUAL_SRC = "/finance/finance-hero.jpg";

export function FinanceHeader({
  derivedAt,
  loading,
  onRefresh,
  onRecordCost,
  canMutateFinance = true,
}: {
  derivedAt?: string;
  loading: boolean;
  onRefresh: () => void;
  onRecordCost: () => void;
  /** When false, hide Record cost / Create claim (view-only actors). */
  canMutateFinance?: boolean;
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
          <h1 className="fin-title fin-title--compact">Costs &amp; Claims</h1>
          <p className="fin-lede fin-lede--compact">
            Record FM execution costs, claim reimbursement from the client, and
            track the client&apos;s authorisation and the payment reference.
          </p>
          {asOf ? (
            <p className="fin-v13-asof">Last updated {asOf}</p>
          ) : null}
        </div>
        <div className="fin-v13-actions">
          {canMutateFinance ? (
            <>
              <Button
                type="button"
                size="sm"
                className="fin-v13-btn-primary"
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
            </>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
            aria-label="Refresh costs and claims"
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
  costRecordsTotal: number | string;
  reimbursementsInPreparation: string;
  clientAuthorisationsTotal: number | string;
  loading: boolean;
}) {
  // Zero is data, but it is only the SentraCore™ record: earlier (historical) execution costs are not loaded here.
  const supportCopy = spendIsSample
    ? "Sample of costs recorded in SentraCore™ currently in view."
    : "Costs recorded in SentraCore™ so far. Historical costs from before SentraCore™ are not loaded here — NGN 0 means none recorded yet, not that none were incurred.";

  return (
    <div className="fin-v13-overview">
      <section className="fin-v13-hero" aria-label="Operational spend">
        <div className="fin-v13-hero-body">
          <div className="fin-v13-hero-metric">
            <p className="fin-v13-metric-label">
              Operational spend{spendIsSample ? " (sample)" : ""}
            </p>
            <p className="fin-v13-hero-value">
              {loading ? "—" : operationalSpendLabel}
            </p>
          </div>
          <div className="fin-v13-hero-support">
            <p className="fin-v13-hero-copy">{supportCopy}</p>
            <Link href="/finance/costs" className="fin-v13-text-action">
              View details →
            </Link>
          </div>
        </div>
        <div className="fin-v13-hero-visual" aria-hidden>
          <Image
            src={SPEND_VISUAL_SRC}
            alt=""
            fill
            sizes="(min-width: 1024px) 28vw, 100vw"
            className="fin-v13-hero-image"
            priority
          />
        </div>
      </section>

      <section
        className="fin-v13-support-metrics"
        aria-label="Supporting finance metrics"
      >
        <div className="fin-v13-support-card">
          <span className="fin-v13-support-icon" aria-hidden>
            <FileText className="h-4 w-4" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <p className="fin-v13-metric-label">Costs recorded in SentraCore™</p>
            <p className="fin-v13-support-value">
              {loading ? "—" : costRecordsTotal}
            </p>
          </div>
        </div>
        <div className="fin-v13-support-card">
          <span className="fin-v13-support-icon" aria-hidden>
            <Send className="h-4 w-4" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <p className="fin-v13-metric-label">Reimbursement claims</p>
            <p className="fin-v13-support-value">
              {loading ? "—" : reimbursementsInPreparation}
            </p>
          </div>
        </div>
        <div className="fin-v13-support-card">
          <span className="fin-v13-support-icon" aria-hidden>
            <Users className="h-4 w-4" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <p className="fin-v13-metric-label">Work Order approvals</p>
            <p className="fin-v13-support-value">
              {loading ? "—" : clientAuthorisationsTotal}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
