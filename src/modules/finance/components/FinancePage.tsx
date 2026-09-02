"use client";

import "@/styles/finance.css";

import { useState } from "react";
import { Banknote } from "lucide-react";
import { ModeFrame } from "@/components/platform";
import { EmptyState } from "@/components/ui/EmptyState";
import { useFinanceOverview } from "../hooks/useFinanceOverview";
import { CostRecordFormModal } from "./CostRecordFormModal";
import { FinanceCoverageSection } from "./FinanceCoverageSection";
import { FinanceFlowRail } from "./FinanceFlowRail";
import { FinanceHeader } from "./FinanceHeader";
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

  return (
    <ModeFrame mode="understand">
      <div className="fin-page">
        <FinanceHeader
          derivedAt={overview?.meta.derivedAt}
          totalApprovals={overview?.meta.totalApprovals ?? 0}
          approvalsInView={overview?.meta.approvalsInView ?? 0}
          truncated={overview?.meta.truncated ?? false}
          loading={loading}
          onRefresh={() => void reload()}
          onRecordCost={() => setCostModalOpen(true)}
        />

        <FinanceFlowRail
          authorisationCount={overview?.meta.approvalsInView ?? 0}
          awaitingDecisionCount={awaitingDecision}
          costRecordedCount={overview?.operationalCostSummary?.count ?? 0}
          costLive={overview?.availability.costRecords ?? false}
          loading={loading}
        />

        <FinancePendingActionSection
          items={overview?.pendingActions ?? []}
          loading={loading}
        />

        <FinancePositionSection
          metrics={overview?.position ?? []}
          loading={loading}
        />

        <FinanceCoverageSection
          operationalCostsStatus={
            overview?.operationalCostSummary
              ? `${overview.operationalCostSummary.count} recorded`
              : "Not yet recorded"
          }
        />

        <div className="fin-layout-main">
          <FinanceOperationalCostSection
            lenses={overview?.operationalCostLenses ?? []}
            summary={overview?.operationalCostSummary ?? null}
            recentCosts={overview?.recentCosts ?? []}
            loading={loading}
          />
          <FinanceSubmissionsSection />
        </div>

        <div className="mt-8">
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
