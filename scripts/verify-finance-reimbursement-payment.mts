/**
 * Finance reimbursement payment + submission lifecycle verification.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-finance-reimbursement-payment.mts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertCostSubmissionTransition,
  canTransitionCostSubmission,
  FINANCIAL_DOMAIN_IMPLEMENTED,
  sumPaymentsForSubmission,
  validateReimbursementPayment,
} from "../src/lib/operational/finance";
import {
  deriveCostWorkflow,
} from "../src/modules/finance/utils/costWorkflow";
import {
  buildFinancePaymentOverviewState,
  summarizeSubmissionPayments,
} from "../src/modules/finance/utils/submissionPayment";
import type {
  CostRecord,
  CostSubmission,
  ReimbursementPayment,
} from "../src/lib/operational/finance/types";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function readSrc(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

function main() {
  assert(
    FINANCIAL_DOMAIN_IMPLEMENTED.paymentProcessing === true,
    "payment processing flag"
  );

  assert(canTransitionCostSubmission("draft", "submitted"), "draft→submitted");
  assert(canTransitionCostSubmission("submitted", "queried"), "submitted→queried");
  assert(canTransitionCostSubmission("queried", "submitted"), "queried→resubmit");
  assert(!canTransitionCostSubmission("draft", "queried"), "no draft→queried");
  assert(!canTransitionCostSubmission("cancelled", "submitted"), "no from cancelled");

  try {
    assertCostSubmissionTransition("submitted", "draft");
    throw new Error("expected transition throw");
  } catch (error) {
    assert(
      error instanceof Error && /Invalid submission lifecycle/.test(error.message),
      "transition assert message"
    );
  }

  const paymentDraft = validateReimbursementPayment(
    {
      submissionId: "SUB-2026-000001",
      receivedAmount: 50000,
      currency: "NGN",
      receivedAt: "2026-09-02T10:00:00.000Z",
      recordedAt: "2026-09-02T10:00:00.000Z",
      recordedBy: "USR-1",
    },
    { serverGeneratedId: true }
  );
  assert(paymentDraft.valid, "payment draft validates");

  const invalid = validateReimbursementPayment(
    {
      submissionId: "SUB-2026-000001",
      receivedAmount: 0,
      currency: "NGN",
      receivedAt: "2026-09-02T10:00:00.000Z",
      recordedAt: "2026-09-02T10:00:00.000Z",
      recordedBy: "USR-1",
    },
    { serverGeneratedId: true }
  );
  assert(!invalid.valid, "zero amount rejected");

  const submission: CostSubmission = {
    submissionId: "SUB-2026-000001",
    costRecordIds: ["COST-2026-000001"],
    status: "submitted",
    currency: "NGN",
    claimAmount: 100000,
    createdBy: "USR-1",
    createdAt: "2026-09-01T12:00:00.000Z",
    submittedAt: "2026-09-01T12:00:00.000Z",
    submittedBy: "USR-1",
  };

  const payments: ReimbursementPayment[] = [
    {
      paymentId: "PAY-2026-000001",
      submissionId: "SUB-2026-000001",
      receivedAmount: 40000,
      currency: "NGN",
      receivedAt: "2026-09-02T10:00:00.000Z",
      recordedAt: "2026-09-02T10:00:00.000Z",
      recordedBy: "USR-1",
      reference: "TRX-1",
    },
  ];

  const partial = summarizeSubmissionPayments(submission, payments);
  assert(partial.outcome === "partially_paid", "partial outcome");
  assert(partial.outstandingAmount === 60000, "outstanding");
  assert(!partial.fullyPaid, "not fully paid");

  const fullPayments: ReimbursementPayment[] = [
    ...payments,
    {
      paymentId: "PAY-2026-000002",
      submissionId: "SUB-2026-000001",
      receivedAmount: 60000,
      currency: "NGN",
      receivedAt: "2026-09-03T10:00:00.000Z",
      recordedAt: "2026-09-03T10:00:00.000Z",
      recordedBy: "USR-1",
    },
  ];
  assert(
    sumPaymentsForSubmission(fullPayments, "SUB-2026-000001") === 100000,
    "sum payments"
  );
  const full = summarizeSubmissionPayments(submission, fullPayments);
  assert(full.fullyPaid, "fully paid");
  assert(full.outcome === "fully_paid", "fully paid outcome");

  const cost: CostRecord = {
    costId: "COST-2026-000001",
    recordedAt: "2026-09-01T10:00:00.000Z",
    facilityId: "FAC-0001",
    location: "Plant",
    description: "Parts",
    category: "spare_parts",
    actualAmount: 80000,
    currency: "NGN",
    reimbursability: "reimbursable",
    evidence: { reference: "INV-1" },
    recordedBy: "USR-1",
  };

  const submittedOnly = deriveCostWorkflow(cost, submission, {
    paymentRecorded: false,
  });
  assert(submittedOnly.eligibility === "submitted", "submitted without payment");

  const reimbursed = deriveCostWorkflow(cost, submission, {
    paymentRecorded: true,
  });
  assert(reimbursed.eligibility === "reimbursed", "reimbursed only with payment");

  const detail = readSrc("src/modules/finance/components/SubmissionDetailPage.tsx");
  assert(detail.includes("Record payment"), "payment CTA");
  assert(detail.includes("Mark queried"), "query CTA");
  assert(detail.includes("Resubmit"), "resubmit CTA");
  assert(detail.includes("ReimbursementPaymentService.createPayment"), "persists payment");
  assert(detail.includes("assertCostSubmissionTransition") === false, "no assert in UI");
  assert(
    detail.includes("CostSubmissionService.updateCostSubmission"),
    "lifecycle via update"
  );

  const panel = readSrc("src/modules/finance/components/SubmissionReviewPanel.tsx");
  assert(panel.includes("/finance/costs/"), "cost deep links");
  assert(panel.includes("FINANCE_UI_LIST_LIMIT"), "5-record cap");

  const repo = readSrc("apps-script/ReimbursementPaymentRepository.gs");
  assert(repo.includes("REIMBURSEMENT_PAYMENTS"), "payment sheet");
  assert(repo.includes("PAY-"), "payment id prefix");

  const router = readSrc("apps-script/deployment/ROUTER.gs");
  assert(router.includes("reimbursement-payments"), "router resource");

  const api = readSrc("src/app/api/reimbursement-payments/route.ts");
  assert(api.includes("reimbursement-payments"), "api proxy");

  const costDetail = readSrc("src/modules/finance/components/CostDetailPage.tsx");
  assert(
    costDetail.includes("paymentRecorded: Boolean(paymentSummary?.fullyPaid)"),
    "reimbursed from fully paid payment"
  );
  assert(
    !costDetail.includes("paymentRecorded: false"),
    "no hard-coded unpaid on cost detail"
  );

  const overviewHook = readSrc("src/modules/finance/hooks/useFinanceOverview.ts");
  assert(
    overviewHook.includes("ReimbursementPaymentService"),
    "overview loads reimbursement payments"
  );
  assert(overviewHook.includes("listPayments"), "bounded payment list");

  const derive = readSrc("src/modules/finance/utils/deriveFinanceOverview.ts");
  assert(derive.includes("buildFinancePaymentOverviewState"), "overview uses payment util");
  assert(derive.includes("summarizeSubmissionPayments"), "preview uses payment util");

  const paymentUtil = readSrc("src/modules/finance/utils/submissionPayment.ts");
  assert(
    paymentUtil.includes("buildFinancePaymentOverviewState"),
    "central payment overview state"
  );

  // Overview aggregation: no / partial / full / multi-receipt
  const emptyState = buildFinancePaymentOverviewState({
    submissions: [submission],
    submissionsTruncated: false,
    payments: [],
    totalPayments: 0,
  });
  assert(emptyState.coverageStatus === "Not yet recorded", "overview no payment");

  const partialState = buildFinancePaymentOverviewState({
    submissions: [submission],
    submissionsTruncated: false,
    payments,
    totalPayments: 1,
  });
  assert(/outstanding remains/i.test(partialState.positionDetail), "overview partial");

  const fullState = buildFinancePaymentOverviewState({
    submissions: [submission],
    submissionsTruncated: false,
    payments: fullPayments,
    totalPayments: 2,
  });
  assert(/fully paid/i.test(fullState.positionDetail), "overview full");

  console.log("PASS — Finance reimbursement payment verification");
}

main();
