"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useFinancialPosition } from "@/modules/finance/hooks/useFinancialPosition";

/**
 * Compact executive Financial Position for Facility Management Home.
 * Finance page remains the operational workspace.
 */
export function FinancialPositionSection() {
  const { snapshot, loading, error, reload } = useFinancialPosition();

  const isSample = Boolean(snapshot?.isSample);
  const spent = snapshot?.spentLabel ?? "—";
  const reimbursement = snapshot?.expectedLabel ?? "—";
  const outstanding = snapshot?.outstandingLabel ?? "—";

  return (
    <section
      className="sc-fm-finance"
      aria-labelledby="sc-fm-finance-heading"
      aria-busy={loading}
    >
      <div className="sc-fm-finance-header">
        <div>
          <h2 id="sc-fm-finance-heading" className="sc-fm-panel-title">
            Financial Position
          </h2>
          <p className="sc-fm-panel-lede">
            {loading
              ? "Loading operational spend and reimbursement figures"
              : error
                ? "Financial position could not be loaded. Open Finance for the full record, or try again."
                : isSample
                  ? "In-view sample from the current Finance pool"
                  : "Operational costs and open reimbursement claims"}
          </p>
        </div>
        <div className="sc-fm-finance-header-actions">
          {error && !loading ? (
            <button
              type="button"
              className="sc-fm-view-all"
              onClick={() => void reload()}
            >
              Try again
            </button>
          ) : null}
          <Link href="/finance" className="sc-fm-view-all">
            Open Finance
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </div>

      <div className="sc-fm-finance-metrics" role="list">
        <div className="sc-fm-finance-metric" role="listitem">
          <p className="sc-fm-finance-label">
            Spent
            {!loading && isSample && snapshot?.costsTruncated ? " (sample)" : ""}
          </p>
          <MetricValue loading={loading} error={Boolean(error)} value={spent} />
        </div>
        <div className="sc-fm-finance-metric" role="listitem">
          <p className="sc-fm-finance-label">
            Reimbursement
            {!loading &&
            isSample &&
            (snapshot?.submissionsTruncated ||
              snapshot?.authorizationsTruncated)
              ? " (in view)"
              : ""}
          </p>
          <MetricValue
            loading={loading}
            error={Boolean(error)}
            value={reimbursement}
          />
        </div>
        <div className="sc-fm-finance-metric" role="listitem">
          <p className="sc-fm-finance-label">
            Outstanding reimbursement
            {!loading &&
            isSample &&
            (snapshot?.submissionsTruncated ||
              snapshot?.paymentsTruncated ||
              snapshot?.authorizationsTruncated)
              ? " (in view)"
              : ""}
          </p>
          <MetricValue
            loading={loading}
            error={Boolean(error)}
            value={outstanding}
          />
        </div>
      </div>
    </section>
  );
}

function MetricValue({
  loading,
  error,
  value,
}: {
  loading: boolean;
  error: boolean;
  value: string;
}) {
  if (loading) {
    return (
      <span
        className="sc-fm-finance-skel"
        aria-hidden
      />
    );
  }
  if (error) {
    return (
      <p className="sc-fm-finance-value sc-fm-finance-value--fallback">
        Unavailable
      </p>
    );
  }
  return <p className="sc-fm-finance-value">{value}</p>;
}
