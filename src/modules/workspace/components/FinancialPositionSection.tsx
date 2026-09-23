"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  HOME_FINANCIAL_POSITION_YEAR,
  useFinancialPosition,
} from "@/modules/finance/hooks/useFinancialPosition";

/**
 * Compact executive Financial Position for Facility Management Home.
 * Finance page remains the operational workspace.
 */
export function FinancialPositionSection() {
  const { snapshot, loading, error, reload } = useFinancialPosition();

  const spent = snapshot?.spentLabel ?? null;
  const reimbursement = snapshot?.expectedLabel ?? null;
  const outstanding = snapshot?.outstandingLabel ?? null;
  const allUnavailable =
    !loading &&
    !snapshot?.spentAvailable &&
    !snapshot?.expectedAvailable &&
    !snapshot?.outstandingAvailable;

  return (
    <section
      className="sc-fm-finance"
      aria-labelledby="sc-fm-finance-heading"
      aria-busy={loading}
    >
      <div className="sc-fm-finance-header">
        <div>
          <h2 id="sc-fm-finance-heading" className="sc-fm-panel-title">
            Financial Position · {HOME_FINANCIAL_POSITION_YEAR}
          </h2>
          <p className="sc-fm-panel-lede">
            {loading
              ? "Loading operational spend and reimbursement figures"
              : allUnavailable || error
                ? "Financial position could not be loaded. Open Costs & Claims for the full record, or try again."
                : !snapshot?.spentAvailable ||
                    !snapshot?.expectedAvailable ||
                    !snapshot?.outstandingAvailable
                  ? "Some figures are temporarily unavailable. Open Costs & Claims for the full record."
                  : `${HOME_FINANCIAL_POSITION_YEAR} operating year — costs from the ${HOME_FINANCIAL_POSITION_YEAR} Job/Work Order registers and reimbursement claims`}
          </p>
        </div>
        <div className="sc-fm-finance-header-actions">
          {(allUnavailable || error) && !loading ? (
            <button
              type="button"
              className="sc-fm-view-all"
              onClick={() => void reload()}
            >
              Try again
            </button>
          ) : null}
          <Link href="/finance" className="sc-fm-view-all">
            Open Costs & Claims
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </div>

      <div className="sc-fm-finance-metrics" role="list">
        <div className="sc-fm-finance-metric" role="listitem">
          <p className="sc-fm-finance-label">
            Spent ({HOME_FINANCIAL_POSITION_YEAR})
          </p>
          <MetricValue
            loading={loading}
            unavailable={!snapshot?.spentAvailable}
            value={spent}
          />
        </div>
        <div className="sc-fm-finance-metric" role="listitem">
          <p className="sc-fm-finance-label">
            Reimbursement ({HOME_FINANCIAL_POSITION_YEAR})
          </p>
          <MetricValue
            loading={loading}
            unavailable={!snapshot?.expectedAvailable}
            value={reimbursement}
          />
        </div>
        <div className="sc-fm-finance-metric" role="listitem">
          <p className="sc-fm-finance-label">
            Outstanding reimbursement ({HOME_FINANCIAL_POSITION_YEAR})
          </p>
          <MetricValue
            loading={loading}
            unavailable={!snapshot?.outstandingAvailable}
            value={outstanding}
          />
        </div>
      </div>
    </section>
  );
}

function MetricValue({
  loading,
  unavailable,
  value,
}: {
  loading: boolean;
  unavailable: boolean;
  value: string | null;
}) {
  if (loading) {
    return (
      <span
        className="sc-fm-finance-skel"
        aria-hidden
      />
    );
  }
  if (unavailable || value == null) {
    return (
      <p className="sc-fm-finance-value sc-fm-finance-value--fallback">
        Unavailable
      </p>
    );
  }
  return <p className="sc-fm-finance-value">{value}</p>;
}
