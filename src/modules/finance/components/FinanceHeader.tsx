import Image from "next/image";
import Link from "next/link";
import { Plus, RefreshCw, Send, Users } from "lucide-react";
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
            Costs, payment approvals, pending payments and contract follow-ups.
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
              <Link href="/finance/client-payments/new?kind=payment_request" className="fin-v13-btn-secondary">
                <Plus className="h-4 w-4" /> Raise payment request
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
  operatingYear,
  operatingYearRecordCount,
  clientPaymentsOutstanding,
  clientAuthorisationsTotal,
  loading,
}: {
  operationalSpendLabel: string;
  /** Operating year the headline presents (spend is that year's complete-register total only). */
  operatingYear: number;
  /** Records in the operating-year total; null when it could not be loaded. */
  operatingYearRecordCount: number | null;
  /** Outstanding amount of pending payments awaiting receipt (receipt-derived). */
  clientPaymentsOutstanding: string;
  clientAuthorisationsTotal: number | string;
  loading: boolean;
}) {
  const recordCountLabel =
    operatingYearRecordCount == null
      ? null
      : `${operatingYearRecordCount} cost record${operatingYearRecordCount === 1 ? "" : "s"}`;

  return (
    <div className="fin-v13-overview">
      <section className="fin-v13-hero" aria-label="Costs recorded">
        <div className="fin-v13-hero-body">
          <div className="fin-v13-hero-metric">
            <p className="fin-v13-metric-label">
              Costs recorded · {operatingYear}
            </p>
            <p className="fin-v13-hero-value">
              {loading ? "—" : operationalSpendLabel}
            </p>
            {!loading && recordCountLabel ? (
              <p className="fin-v13-hero-copy">{recordCountLabel}</p>
            ) : null}
          </div>
          <div className="fin-v13-hero-support">
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
            <Send className="h-4 w-4" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <p className="fin-v13-metric-label">Pending payments outstanding</p>
            <p className="fin-v13-support-value">
              {loading ? "—" : clientPaymentsOutstanding}
            </p>
          </div>
        </div>
        <div className="fin-v13-support-card">
          <span className="fin-v13-support-icon" aria-hidden>
            <Users className="h-4 w-4" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <p className="fin-v13-metric-label">Payment Approvals</p>
            <p className="fin-v13-support-value">
              {loading ? "—" : clientAuthorisationsTotal}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
