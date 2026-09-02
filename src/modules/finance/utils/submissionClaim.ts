import { getSubmissionActualCostTotal } from "@/lib/operational/finance/costSubmission";
import type { CostRecord, MarkupRepresentation } from "@/lib/operational/finance/types";

export type MarkupInputs = {
  markupAmount: number;
  markupRatePercent: number;
};

export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

export function computeActualCostTotal(records: CostRecord[]): number {
  return getSubmissionActualCostTotal(records);
}

export function syncMarkupFromAmount(
  actualCost: number,
  markupAmount: number
): MarkupInputs {
  const amount = roundMoney(Math.max(0, markupAmount));
  const rate =
    actualCost > 0 ? roundMoney((amount / actualCost) * 100) : 0;
  return { markupAmount: amount, markupRatePercent: rate };
}

export function syncMarkupFromPercent(
  actualCost: number,
  markupRatePercent: number
): MarkupInputs {
  const rate = roundMoney(Math.max(0, markupRatePercent));
  const amount =
    actualCost > 0 ? roundMoney((actualCost * rate) / 100) : 0;
  return { markupAmount: amount, markupRatePercent: rate };
}

export function computeClaimAmount(
  actualCost: number,
  markupAmount: number
): number {
  return roundMoney(actualCost + Math.max(0, markupAmount));
}

export function buildMarkupRepresentation(
  inputs: MarkupInputs
): MarkupRepresentation {
  return {
    markupAmount: inputs.markupAmount,
    markupRatePercent: inputs.markupRatePercent,
  };
}

export function claimSummaryFromCosts(
  records: CostRecord[],
  markupAmount: number
) {
  const actualCost = computeActualCostTotal(records);
  const synced = syncMarkupFromAmount(actualCost, markupAmount);
  const claimAmount = computeClaimAmount(actualCost, synced.markupAmount);
  return {
    actualCost,
    ...synced,
    claimAmount,
    markup: buildMarkupRepresentation(synced),
  };
}
