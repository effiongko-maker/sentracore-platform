"use client";

import "@/styles/finance.css";

import { useState } from "react";
import { Banknote } from "lucide-react";
import { ModeFrame } from "@/components/platform";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatFinancialAmount } from "../utils/formatFinancialAmount";
import { useFinanceOverview } from "../hooks/useFinanceOverview";
import { CostRecordFormModal } from "./CostRecordFormModal";
import { FinanceCoverageSection } from "./FinanceCoverageSection";
import { FinanceFlowRail } from "./FinanceFlowRail";
import { FinanceHeader, FinanceSummaryRow } from "./FinanceHeader";
import { FinanceIntelligencePreview } from "./FinanceIntelligencePreview";
import { FinanceOperationalCostSection } from "./FinanceOperationalCostSection";
import { FinancePendingActionSection } from "./FinancePendingActionSection";
import { FinancePositionSection } from "./FinancePositionSection";
import { FinanceSubmissionsSection } from "./FinanceSubmissionsSection";

export function FinancePage() {
  const { overview, loading, error, reload } = useFinanceOverview();
  const [costModalOpen, setCostModalOpen] = useState(false);

  if (error && !loading && !overview) {
    return (
      <ModeFrame mode="understand">
        <EmptyState
          icon={Banknote}
          title="Unable to load Finance"
          description={error}
          actionLabel="Retry"
          onAction={() => void reload()}
        />
      </ModeFrame>
    );
  }

  const awaitingDecision =
    overview?.clientAuthorisationStages.find(
      (stage) => stage.id === "awaiting_decision"
    )?.count ?? 0;

  const costTotal = overview?.meta.costRecordsTotal ?? 0;
  const submissionTotal = overview?.meta.submissionsTotal ?? 0;
  const approvalsInView = overview?.meta.approvalsInView ?? 0;
  const summary = overview?.operationalCostSummary ?? null;
  const spendLabel =
    summary && summary.totalCount > 0
      ? formatFinancialAmount(summary.sampleAmount, summary.currency)
      : "—";
  const draftCount = overview?.submissions.draftCount;
  const reimbursementsInPreparation =
    draftCount != null
      ? String(draftCount)
      : submissionTotal > 0
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
        />

        <FinanceSummaryRow
          operationalSpendLabel={loading ? "—" : spendLabel}
          spendIsSample={Boolean(summary?.truncated)}
          costRecordsTotal={costTotal}
          reimbursementsInPreparation={
            loading ? "—" : reimbursementsInPreparation
          }
          clientAuthorisationsTotal={overview?.meta.totalApprovals ?? 0}
          loading={loading}
        />

        <FinancePendingActionSection
          items={overview?.pendingActions ?? []}
          loading={loading}
        />

        <FinanceFlowRail
          authorisationCount={approvalsInView}
          awaitingDecisionCount={awaitingDecision}
          costRecordedCount={costTotal}
          costLive={overview?.availability.costRecords ?? false}
          submissionCount={submissionTotal}
          submissionLive={overview?.availability.costSubmissions ?? false}
          paymentStatusSignal={
            overview?.payments.statusSignal ?? "Not yet recorded"
          }
          loading={loading}
        />

        <div className="fin-v13-main">
          <FinanceOperationalCostSection
            lenses={overview?.operationalCostLenses ?? []}
            summary={overview?.operationalCostSummary ?? null}
            recentCosts={overview?.recentCosts ?? []}
            loading={loading}
          />
          <FinanceSubmissionsSection
            snapshot={overview?.submissions ?? null}
            loading={loading}
          />
        </div>

        <FinancePositionSection
          metrics={overview?.position ?? []}
          loading={loading}
          totalAuthorisations={overview?.meta.totalApprovals ?? 0}
          awaitingDecisionCount={awaitingDecision}
        />

        <div className="fin-v13-footer">
          <FinanceCoverageSection
            operationalCostsStatus={
              costTotal > 0 ? `${costTotal} recorded` : "Not yet recorded"
            }
            reimbursementsStatus={
              submissionTotal > 0
                ? `${submissionTotal} recorded`
                : "None recorded yet"
            }
            clientAuthorisationsStatus={
              (overview?.meta.totalApprovals ?? 0) > 0
                ? `${overview?.meta.totalApprovals} recorded`
                : "Not yet recorded"
            }
            paymentsStatus={
              overview?.payments.coverageStatus ?? "Not yet recorded"
            }
          />
          <FinanceIntelligencePreview />
        </div>

        <CostRecordFormModal
          open={costModalOpen}
          onClose={() => setCostModalOpen(false)}
          onSaved={() => void reload()}
        />
      </div>
    </ModeFrame>
  );
}
