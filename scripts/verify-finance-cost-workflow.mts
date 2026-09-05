/**
 * Finance operational cost workflow verification.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-finance-cost-workflow.mts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CostRecord, CostSubmission } from "../src/lib/operational/finance/types";
import {
  canEditCostRecord,
  costRecordLockReason,
  deriveCostWorkflow,
  findSubmissionForCost,
} from "../src/modules/finance/utils/costWorkflow";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function readSrc(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

function baseCost(overrides: Partial<CostRecord> = {}): CostRecord {
  return {
    costId: "COST-2026-000099",
    recordedAt: "2026-09-01T10:00:00.000Z",
    facilityId: "FAC-0001",
    location: "Plant room",
    description: "Filter replacement",
    category: "spare_parts",
    actualAmount: 120000,
    currency: "NGN",
    reimbursability: "unknown",
    evidence: { reference: "INV-99" },
    recordedBy: "USR-1",
    ...overrides,
  };
}

function main() {
  const detail = readSrc("src/modules/finance/components/CostDetailPage.tsx");
  const route = readSrc("src/app/(app)/finance/costs/[costId]/page.tsx");
  const derive = readSrc("src/modules/finance/utils/deriveFinanceOverview.ts");
  const recent = readSrc(
    "src/modules/finance/components/FinanceOperationalCostSection.tsx"
  );
  const register = readSrc("src/modules/finance/components/CostRecordsPage.tsx");

  assert(route.includes("CostDetailPage"), "cost detail route");
  assert(detail.includes("CostRecordService.getCostRecord"), "loads cost by id");
  assert(detail.includes("CostRecordService.updateCostRecord"), "persists update");
  assert(detail.includes("Save classification"), "classification save CTA");
  assert(detail.includes("Eligible"), "eligible label");
  assert(detail.includes("Not eligible"), "not eligible label");
  assert(detail.includes("Submitted"), "submitted eligibility copy");
  assert(detail.includes("Reimbursed"), "reimbursed eligibility copy");
  assert(
    detail.includes("not automatically eligible"),
    "explicit non-inference of eligibility"
  );
  assert(
    detail.includes("Reimbursed only when a payment is recorded"),
    "payment boundary on cost detail"
  );

  assert(
    derive.includes("`/finance/costs/${encodeURIComponent(record.costId)}`") ||
      derive.includes("/finance/costs/${encodeURIComponent(record.costId)}"),
    "attention deep-links to cost detail"
  );
  assert(recent.includes("/finance/costs/${encodeURIComponent(row.costId)}"), "recent Open link");
  assert(register.includes("/finance/costs/${encodeURIComponent(record.costId)}"), "register Open link");
  assert(!detail.includes("jobOrderId"), "no fake JO edit field");

  const unknown = deriveCostWorkflow(baseCost(), null);
  assert(unknown.needsClassification, "unknown needs classification");
  assert(unknown.stage === "needs_classification", "unknown stage");
  assert(unknown.eligibilityLabel === "Needs classification", "unknown eligibility");

  const notEligible = deriveCostWorkflow(
    baseCost({ reimbursability: "non_reimbursable" }),
    null
  );
  assert(notEligible.eligibility === "not_eligible", "not eligible");
  assert(
    notEligible.stage === "classified_not_reimbursable",
    "classified not reimbursable"
  );
  assert(!notEligible.canStartSubmission, "not eligible cannot submit");

  const eligible = deriveCostWorkflow(
    baseCost({ reimbursability: "reimbursable" }),
    null
  );
  assert(eligible.eligibility === "eligible", "eligible");
  assert(eligible.canStartSubmission, "eligible can start submission");
  assert(
    eligible.stage === "eligible_for_reimbursement",
    "eligible stage"
  );

  const submission: CostSubmission = {
    submissionId: "SUB-2026-000001",
    costRecordIds: ["COST-2026-000099"],
    status: "submitted",
    currency: "NGN",
    claimAmount: 120000,
    createdBy: "USR-1",
    createdAt: "2026-09-01T12:00:00.000Z",
  };
  const linked = findSubmissionForCost("COST-2026-000099", [submission]);
  assert(linked?.submissionId === "SUB-2026-000001", "find linked submission");

  const submitted = deriveCostWorkflow(
    baseCost({ reimbursability: "reimbursable" }),
    linked
  );
  assert(submitted.eligibility === "submitted", "submitted eligibility");
  assert(submitted.stage === "submitted", "submitted stage");
  assert(!submitted.canStartSubmission, "submitted cannot re-start");
  assert(!submitted.reimbursementPaymentRecorded, "payment not recorded");

  const reimbursed = deriveCostWorkflow(
    baseCost({ reimbursability: "reimbursable" }),
    linked,
    { paymentRecorded: true }
  );
  assert(reimbursed.eligibility === "reimbursed", "reimbursed when payment true");

  // G1 — cost edit lock once on a non-draft claim
  assert(
    canEditCostRecord(null),
    "unlinked cost remains editable"
  );
  assert(
    canEditCostRecord({ status: "draft" }),
    "draft claim does not lock cost"
  );
  assert(
    !canEditCostRecord({ status: "submitted" }),
    "submitted claim locks cost"
  );
  assert(
    !canEditCostRecord({ status: "queried" }),
    "queried (non-draft) claim locks cost"
  );
  assert(
    !canEditCostRecord(linked),
    "linked submitted claim locks cost via findSubmissionForCost"
  );
  assert(
    costRecordLockReason(linked)?.includes("SUB-2026-000001"),
    "lock reason cites claim id"
  );

  const draftLinked = findSubmissionForCost("COST-2026-000099", [
    { ...submission, status: "draft" },
  ]);
  assert(
    canEditCostRecord(draftLinked),
    "draft-linked cost remains editable"
  );

  assert(detail.includes("canEditCostRecord"), "detail uses edit lock");
  assert(detail.includes("costRecordLockReason"), "detail shows lock reason");
  assert(
    !detail.includes("Edit classification") || detail.includes("canEdit"),
    "edit CTA gated by canEdit"
  );

  const costService = readSrc("src/services/finance/CostRecordService.ts");
  assert(
    costService.includes("canEditCostRecord") &&
      costService.includes("409"),
    "CostRecordService rejects locked updates"
  );
  const gs = readSrc("apps-script/CostRecordService.gs");
  assert(
    gs.includes("assertCostRecordEditable_") &&
      gs.includes("CostSubmissionRepository.getAll"),
    "Apps Script enforces cost edit lock"
  );

  console.log("PASS — Finance cost workflow verification");
}

main();
