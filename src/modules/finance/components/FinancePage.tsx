"use client";

import "@/styles/finance.css";

import { useState } from "react";
import { Banknote } from "lucide-react";
import { ModeFrame } from "@/components/platform";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatFinancialAmount } from "../utils/formatFinancialAmount";
import { useFinanceOverview } from "../hooks/useFinanceOverview";
import { CostRecordFormModal } from "./CostRecordFormModal";
import { FinanceHeader, FinanceSummaryRow } from "./FinanceHeader";
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

  const costTotal = overview?.meta.costRecordsTotal ?? 0;
  const submissionTotal = overview?.meta.submissionsTotal ?? 0;
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

        <FinancePendingActionSection
          items={overview?.pendingActions ?? []}
          loading={loading}
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
          approvals={overview?.sourceApprovals ?? []}
          loading={loading}
          totalAuthorisations={overview?.meta.totalApprovals ?? 0}
        />

        <CostRecordFormModal
          open={costModalOpen}
          onClose={() => setCostModalOpen(false)}
          onSaved={() => void reload()}
        />
      </div>
    </ModeFrame>
  );
}
