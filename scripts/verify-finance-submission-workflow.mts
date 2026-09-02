/**
 * Finance CostSubmission workflow verification (static).
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-finance-submission-workflow.mts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  FORBIDDEN_MARKUP_RATE_LITERALS,
  canSubmitCostSubmission,
} from "../src/lib/operational/finance/costSubmission";
import type { CostRecord } from "../src/lib/operational/finance/types";
import {
  computeActualCostTotal,
  computeClaimAmount,
  syncMarkupFromAmount,
  syncMarkupFromPercent,
} from "../src/modules/finance/utils/submissionClaim";
import {
  isCostEligibleForSubmission,
  partitionCostsForSubmission,
} from "../src/modules/finance/utils/submissionEligibility";
import { canEditSubmission } from "../src/modules/finance/utils/submissionLifecycle";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function readSrc(relativePath: string): string {
  return readFileSync(resolve(relativePath), "utf8");
}

function costRecord(overrides: Partial<CostRecord> = {}): CostRecord {
  return {
    costId: "COST-2026-000001",
    recordedAt: "2026-01-10T12:00:00.000Z",
    facilityId: "FAC-0001",
    location: "Generator house",
    description: "Diesel purchase",
    category: "diesel_fuel",
    actualAmount: 250000,
    currency: "NGN",
    reimbursability: "reimbursable",
    evidence: { reference: "INV-001" },
    recordedBy: "USR-001",
    ...overrides,
  };
}

function main() {
  const results: string[] = [];

  // Eligibility
  assert(
    isCostEligibleForSubmission({ reimbursability: "reimbursable" }),
    "reimbursable should be eligible"
  );
  assert(
    !isCostEligibleForSubmission({ reimbursability: "non_reimbursable" }),
    "non_reimbursable should not be eligible"
  );
  assert(
    !isCostEligibleForSubmission({ reimbursability: "unknown" }),
    "unknown should not be eligible"
  );

  const pool = partitionCostsForSubmission([
    costRecord({ costId: "COST-1", reimbursability: "reimbursable" }),
    costRecord({ costId: "COST-2", reimbursability: "unknown" }),
    costRecord({ costId: "COST-3", reimbursability: "non_reimbursable" }),
  ]);
  assert(pool.eligible.length === 1, "one eligible cost");
  assert(pool.needsClassification.length === 1, "one unknown cost surfaced");
  assert(pool.excluded.length === 1, "one excluded cost");
  results.push("Eligibility partition");

  // Selection total
  const selected = [
    costRecord({ actualAmount: 1_000_000 }),
    costRecord({ costId: "COST-2", actualAmount: 650_000 }),
  ];
  assert(computeActualCostTotal(selected) === 1_650_000, "selected total");
  results.push("Selected actual total");

  // Markup sync — amount → percent
  const fromAmount = syncMarkupFromAmount(1_000_000, 150_000);
  assert(fromAmount.markupAmount === 150_000, "markup amount preserved");
  assert(fromAmount.markupRatePercent === 15, "markup percent derived");
  results.push("Markup amount → percent");

  // Markup sync — percent → amount
  const fromPercent = syncMarkupFromPercent(1_000_000, 15);
  assert(fromPercent.markupAmount === 150_000, "markup amount derived");
  assert(fromPercent.markupRatePercent === 15, "markup percent preserved");
  results.push("Markup percent → amount");

  // Claim = actual + markup
  assert(
    computeClaimAmount(1_000_000, 150_000) === 1_150_000,
    "claim amount formula"
  );
  results.push("Claim amount = actual + markup");

  // Lifecycle helpers
  assert(canEditSubmission("draft"), "draft editable");
  assert(canEditSubmission("queried"), "queried editable");
  assert(!canEditSubmission("submitted"), "submitted not editable");
  assert(canSubmitCostSubmission({ status: "queried" }), "queried can resubmit");
  results.push("Draft / queried / resubmit lifecycle");

  // No hard-coded markup policy in workflow UI source
  const workflowSources = [
    "src/modules/finance/components/SubmissionClaimForm.tsx",
    "src/modules/finance/components/SubmissionWorkflowPage.tsx",
    "src/modules/finance/utils/submissionClaim.ts",
    "src/modules/finance/constants.ts",
  ];
  for (const file of workflowSources) {
    const src = readSrc(file);
    for (const literal of FORBIDDEN_MARKUP_RATE_LITERALS) {
      assert(
        !src.includes(literal),
        `${file} must not hard-code markup policy literal: ${literal}`
      );
    }
  }
  results.push("No hard-coded markup rates in workflow source");

  // Deprecated CostSubmissionStatus not used as persistence lifecycle in workflow
  const componentSources = [
    "src/modules/finance/components/SubmissionsPage.tsx",
    "src/modules/finance/components/SubmissionWorkflowPage.tsx",
    "src/modules/finance/components/SubmissionDetailPage.tsx",
    "src/modules/finance/components/FinanceSubmissionsSection.tsx",
    "src/modules/finance/utils/submissionLifecycle.ts",
  ];
  for (const file of componentSources) {
    const src = readSrc(file);
    assert(
      !src.includes("CostSubmissionStatus"),
      `${file} must not use deprecated CostSubmissionStatus`
    );
    assert(
      src.includes("CostSubmissionLifecycleStatus") ||
        src.includes("SUBMISSION_LIFECYCLE_LABELS") ||
        src.includes("submission.status") ||
        file.includes("SubmissionWorkflowPage"),
      `${file} should use real lifecycle status`
    );
  }
  results.push("Deprecated CostSubmissionStatus not used in workflow UI");

  // Single bounded CostRecord fetch in selection pool hook
  const poolHook = readSrc("src/modules/finance/hooks/useSubmissionCostPool.ts");
  assert(
    poolHook.includes("listCostRecords"),
    "useSubmissionCostPool uses listCostRecords"
  );
  assert(
    (poolHook.match(/listCostRecords/g) ?? []).length === 1,
    "useSubmissionCostPool should call listCostRecords once"
  );
  assert(
    poolHook.includes("FINANCE_OVERVIEW_FETCH_SIZE"),
    "useSubmissionCostPool uses bounded fetch size"
  );
  results.push("Single bounded CostRecord list fetch");

  // CostRecords unchanged — workflow service calls create/update only on submissions
  const workflowPage = readSrc(
    "src/modules/finance/components/SubmissionWorkflowPage.tsx"
  );
  assert(
    !workflowPage.includes("CostRecordService.update") &&
      !workflowPage.includes("CostRecordService.create"),
    "workflow must not mutate CostRecords"
  );
  results.push("CostRecords remain unchanged during workflow");

  // Payment absent from workflow UI
  for (const file of componentSources) {
    const src = readSrc(file);
    assert(!/\bpaymentStatus\b/.test(src), `${file} must not expose payment status`);
    assert(!/\bmarkAsPaid\b/.test(src), `${file} must not expose mark-as-paid`);
  }
  results.push("Payment boundary preserved");

  // Package upload limitation documented
  const detailsForm = readSrc(
    "src/modules/finance/components/SubmissionDetailsForm.tsx"
  );
  assert(
    /not yet supported/i.test(detailsForm),
    "package file upload limitation must be documented"
  );
  results.push("Package evidence limitation documented");

  console.log("PASS — Finance CostSubmission workflow verification");
  for (const line of results) {
    console.log(`  ✓ ${line}`);
  }
}

main();
