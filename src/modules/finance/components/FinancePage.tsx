"use client";

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
import { MonthlyContractPaymentsSection } from "./MonthlyContractPaymentsSection";
import { FinancePendingActionSection } from "./FinancePendingActionSection";
import { FinancePositionSection } from "./FinancePositionSection";
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

  const costAvailable = overview?.meta.costRecordsAvailable !== false;
  const submissionsAvailable = overview?.meta.submissionsAvailable !== false;
  const approvalsAvailable = overview?.meta.approvalsAvailable !== false;
  const costTotal = costAvailable ? (overview?.meta.costRecordsTotal ?? 0) : null;
  const submissionTotal = submissionsAvailable
    ? (overview?.meta.submissionsTotal ?? 0)
    : null;
  // Headline = the operating year's complete-register spend only. If that total failed it is Unavailable —
  // never the all-year register or the bounded preview pool (either would misstate the year).
  const yearSpend = overview?.operatingYearSpend ?? null;
  const spendLabel = yearSpend
    ? formatFinancialAmount(yearSpend.totalAmount, yearSpend.currency)
    : "Unavailable";
  const draftCount = overview?.submissions.draftCount;
  const reimbursementsInPreparation = !submissionsAvailable
    ? "Unavailable"
    : draftCount != null
      ? String(draftCount)
      : submissionTotal && submissionTotal > 0
        ? `${submissionTotal} total`
        : "0";

  return (
    <ModeFrame mode="understand">
      <div className="fin-page fin-page--v13">
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
          costRecordsTotal={
            loading ? "—" : costTotal == null ? "Unavailable" : costTotal
          }
          reimbursementsInPreparation={
            loading ? "—" : reimbursementsInPreparation
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
                Recent operational costs and reimbursement claims.
              </p>
            </div>
          </div>
          <div className="fin-v13-main">
            <FinanceOperationalCostSection
              lenses={overview?.operationalCostLenses ?? []}
              summary={overview?.operationalCostSummary ?? null}
              recentCosts={overview?.recentCosts ?? []}
              loading={loading}
              available={overview?.meta.costRecordsAvailable !== false}
            />
            <FinanceSubmissionsSection
              snapshot={overview?.submissions ?? null}
              loading={loading}
              error={
                overview && overview.submissions.available === false
                  ? "Reimbursement claims are temporarily unavailable."
                  : null
              }
            />
          </div>
        </section>

        <MonthlyContractPaymentsSection />

        <FinancePositionSection
          approvals={overview?.sourceApprovals ?? []}
          loading={loading}
          totalAuthorisations={overview?.meta.totalApprovals ?? 0}
          available={overview?.meta.approvalsAvailable !== false}
        />

        <FinancePendingActionSection
          items={overview?.pendingActions ?? []}
          loading={loading}
          incomplete={Boolean(overview?.meta.pendingIncomplete)}
        />

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
