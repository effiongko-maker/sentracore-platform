"use client";

import { CostsClaimsNav } from "./CostsClaimsNav";

import "@/styles/finance.css";

import { useState } from "react";
import { Banknote } from "lucide-react";
import { ModeFrame } from "@/components/platform";
import { EmptyState } from "@/components/ui/EmptyState";
import { FINANCE_OPERATING_YEAR } from "../constants";
import { formatFinancialAmount } from "../utils/formatFinancialAmount";
import { useFinanceOverview } from "../hooks/useFinanceOverview";
import { CostRecordFormModal } from "./CostRecordFormModal";
import { FinanceHeader, FinanceSummaryRow } from "./FinanceHeader";
import { FinanceIntelligencePreview } from "./FinanceIntelligencePreview";
import { FinanceOperationalCostSection } from "./FinanceOperationalCostSection";
import { FinancePaymentApprovalsSection } from "./FinancePaymentApprovalsSection";
import { FinanceSubmissionsSection } from "./FinanceSubmissionsSection";
import { useOperatingAccess } from "@/hooks/useOperatingAccess";

export function FinancePage() {
  const { overview, loading, error, reload } = useFinanceOverview();
  const [costModalOpen, setCostModalOpen] = useState(false);
  const { can } = useOperatingAccess();
  const canMutateFinance = can("finance.create");

  if (error && !loading && !overview) {
    return (
      <ModeFrame mode="understand">
        <EmptyState
          icon={Banknote}
          title="Unable to load Costs & Claims"
          description={error}
          actionLabel="Retry"
          onAction={() => void reload()}
        />
      </ModeFrame>
    );
  }

  const submissionsAvailable = overview?.meta.submissionsAvailable !== false;
  const approvalsAvailable = overview?.meta.approvalsAvailable !== false;
  // Headline = the operating year's complete-register spend only. If that total failed it is Unavailable —
  // never the all-year register or the bounded preview pool (either would misstate the year).
  const yearSpend = overview?.operatingYearSpend ?? null;
  const spendLabel = yearSpend
    ? formatFinancialAmount(yearSpend.totalAmount, yearSpend.currency)
    : "Unavailable";
  // Headline KPI = the outstanding amount; the count stays in the Pending Payments area.
  const outstandingAmount = overview?.submissions.outstandingAmount;
  const clientPaymentsOutstanding =
    !submissionsAvailable || outstandingAmount == null
      ? "Unavailable"
      : formatFinancialAmount(outstandingAmount, "NGN");

  return (
    <ModeFrame mode="understand">
      <div className="fin-page fin-page--v13">
        <CostsClaimsNav />
        <FinanceHeader
          derivedAt={overview?.meta.derivedAt}
          loading={loading}
          onRefresh={() => void reload()}
          onRecordCost={() => setCostModalOpen(true)}
          canMutateFinance={canMutateFinance}
        />

        <FinanceSummaryRow
          operationalSpendLabel={loading ? "—" : spendLabel}
          operatingYear={FINANCE_OPERATING_YEAR}
          operatingYearRecordCount={yearSpend?.totalCount ?? null}
          clientPaymentsOutstanding={
            loading ? "—" : clientPaymentsOutstanding
          }
          clientAuthorisationsTotal={
            loading
              ? "—"
              : !approvalsAvailable
                ? "Unavailable"
                : (overview?.meta.totalApprovals ?? 0)
          }
          loading={loading}
        />

        <section
          className="fin-v13-activity"
          aria-labelledby="fin-activity-heading"
        >
          <div className="fin-v13-section-head">
            <div>
              <h2 id="fin-activity-heading" className="fin-v13-section-title">
                Financial activity
              </h2>
              <p className="fin-v13-section-lede">
                Outstanding client actions, then recorded operational costs.
              </p>
            </div>
          </div>
          <div className="fin-v13-main">
            <FinanceSubmissionsSection
              snapshot={overview?.submissions ?? null}
              loading={loading}
              error={
                overview && overview.submissions.available === false
                  ? "Pending payments are temporarily unavailable."
                  : null
              }
            />
            <FinancePaymentApprovalsSection
              items={overview?.paymentApprovals ?? []}
              awaitingCount={
                overview?.clientAuthorisationStages.find((stage) => stage.id === "awaiting_decision")?.count ?? null
              }
              loading={loading}
              available={approvalsAvailable}
            />
          </div>
          <FinanceOperationalCostSection
            lenses={overview?.operationalCostLenses ?? []}
            summary={overview?.operationalCostSummary ?? null}
            recentCosts={overview?.recentCosts ?? []}
            loading={loading}
            available={overview?.meta.costRecordsAvailable !== false}
          />
        </section>

        <div className="fin-v13-footer">
          <FinanceIntelligencePreview summary={overview?.operationalCostSummary ?? null} />
        </div>

        <CostRecordFormModal
          open={costModalOpen && canMutateFinance}
          onClose={() => setCostModalOpen(false)}
          onSaved={() => void reload()}
        />
      </div>
    </ModeFrame>
  );
}
