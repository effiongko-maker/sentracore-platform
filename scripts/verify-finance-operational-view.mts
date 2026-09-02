/**
 * Finance operational view — mapping and UI contracts (V1.1 + payment state).
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-finance-operational-view.mts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Approval } from "../src/modules/approvals/types";
import type {
  CostRecord,
  CostSubmission,
  ReimbursementPayment,
} from "../src/lib/operational/finance";
import { FINANCIAL_DOMAIN_IMPLEMENTED } from "../src/lib/operational/finance";
import {
  FINANCE_RECENT_COSTS_LIMIT,
  FINANCE_UI_LIST_LIMIT,
  OPERATIONAL_COST_LENSES,
} from "../src/modules/finance/constants";
import { deriveFinanceOverview } from "../src/modules/finance/utils/deriveFinanceOverview";
import { formatFinancialAmount } from "../src/modules/finance/utils/formatFinancialAmount";
import { deriveCostWorkflow } from "../src/modules/finance/utils/costWorkflow";
import { summarizeSubmissionPayments } from "../src/modules/finance/utils/submissionPayment";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function read(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

function fixtureApprovals(): Approval[] {
  const now = "2026-09-01T10:00:00.000Z";
  return [
    {
      id: "APR-1",
      title: "Generator remedial works",
      type: "variation",
      workOrderId: "WO-2026-000073",
      facilityId: "FAC-0001",
      status: "awaiting_decision",
      approvalAmount: 250000,
      currency: "NGN",
      submittedAt: "2026-08-28T09:00:00.000Z",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "APR-2",
      title: "Diesel top-up",
      type: "standard_maintenance",
      workOrderId: "WO-2026-000072",
      facilityId: "FAC-0001",
      status: "approved",
      approvalAmount: 180000,
      approvedAmount: 175000,
      currency: "NGN",
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function fixtureCosts(): CostRecord[] {
  return [
    {
      costId: "COST-1",
      recordedAt: "2026-09-01T12:00:00.000Z",
      facilityId: "FAC-0001",
      location: "Plant room",
      description: "Diesel",
      category: "diesel_fuel",
      actualAmount: 100000,
      currency: "NGN",
      reimbursability: "reimbursable",
      evidence: { reference: "INV-1" },
      recordedBy: "USR-1",
    },
    {
      costId: "COST-2",
      recordedAt: "2026-09-01T11:00:00.000Z",
      facilityId: "FAC-0001",
      location: "Lobby",
      description: "Cleaning materials",
      category: "consumables",
      actualAmount: 40000,
      currency: "NGN",
      reimbursability: "unknown",
      evidence: { reference: "INV-2" },
      recordedBy: "USR-1",
    },
    {
      costId: "COST-3",
      recordedAt: "2026-09-01T10:00:00.000Z",
      facilityId: "FAC-0001",
      location: "Roof",
      description: "Labour",
      category: "labour",
      actualAmount: 80000,
      currency: "NGN",
      reimbursability: "reimbursable",
      evidence: { reference: "INV-3" },
      recordedBy: "USR-1",
    },
    {
      costId: "COST-4",
      recordedAt: "2026-08-30T10:00:00.000Z",
      facilityId: "FAC-0001",
      location: "Store",
      description: "Parts",
      category: "spare_parts",
      actualAmount: 20000,
      currency: "NGN",
      reimbursability: "non_reimbursable",
      evidence: { reference: "INV-4" },
      recordedBy: "USR-1",
    },
    {
      costId: "COST-5",
      recordedAt: "2026-08-29T10:00:00.000Z",
      facilityId: "FAC-0001",
      location: "Gate",
      description: "Transport",
      category: "transportation",
      actualAmount: 15000,
      currency: "NGN",
      reimbursability: "reimbursable",
      evidence: { reference: "INV-5" },
      recordedBy: "USR-1",
    },
    {
      costId: "COST-6",
      recordedAt: "2026-08-28T10:00:00.000Z",
      facilityId: "FAC-0001",
      location: "Annex",
      description: "Extra",
      category: "other",
      actualAmount: 5000,
      currency: "NGN",
      reimbursability: "reimbursable",
      evidence: { reference: "INV-6" },
      recordedBy: "USR-1",
    },
  ];
}

function fixtureSubmissions(): CostSubmission[] {
  return [
    {
      submissionId: "SUB-2026-000001",
      costRecordIds: ["COST-1"],
      status: "draft",
      currency: "NGN",
      claimAmount: 115000,
      createdAt: "2026-09-01T09:00:00.000Z",
      createdBy: "USR-1",
    },
    {
      submissionId: "SUB-2026-000002",
      costRecordIds: ["COST-5"],
      status: "queried",
      currency: "NGN",
      claimAmount: 15000,
      createdAt: "2026-08-20T09:00:00.000Z",
      createdBy: "USR-1",
      submittedAt: "2026-08-21T09:00:00.000Z",
      submittedBy: "USR-1",
      queriedAt: "2026-08-22T09:00:00.000Z",
      queryNotes: "Need receipt",
    },
  ];
}

function staticChecks() {
  const page = read("src/modules/finance/components/FinancePage.tsx");
  assert(page.includes("FinancePositionSection"), "position section");
  assert(page.includes("FinanceSubmissionsSection"), "submissions section");
  assert(page.includes("FinanceFlowRail"), "financial flow rail");
  assert(page.includes("CostRecordFormModal"), "cost entry modal");
  assert(page.includes("submissionLive"), "submission live wiring");
  assert(page.includes("paymentStatusSignal"), "payment signal wiring");
  assert(page.includes("paymentsStatus"), "coverage payments wiring");
  assert(!page.includes("Available Cash"), "no treasury concepts");
  assert(!page.includes("bank balance"), "no bank balance");

  const header = read("src/modules/finance/components/FinanceHeader.tsx");
  assert(header.includes("Record cost"), "record cost action");
  assert(header.includes("In view"), "header not APR-period framed");
  assert(!header.includes("client authorisation records"), "header not APR-centric period");

  const constants = read("src/modules/finance/constants.ts");
  assert(
    constants.includes("FINANCE_RECENT_COSTS_LIMIT = 5"),
    "recent costs limit is 5"
  );
  assert(
    constants.includes("FINANCE_UI_LIST_LIMIT = 5"),
    "ui list limit is 5"
  );
  assert(
    !constants.includes("REIMBURSEMENT_SUBMISSION_STAGES"),
    "deprecated reimbursement pipeline stages removed from Finance constants"
  );
  assert(!constants.includes("By WO / JO"), "Job Order not presented as live lens");
  assert(constants.includes("By work order"), "WO lens without JO");

  assert(FINANCE_RECENT_COSTS_LIMIT === 5, "limit constant equals 5");
  assert(FINANCE_UI_LIST_LIMIT === 5, "ui list limit equals 5");
  assert(
    !OPERATIONAL_COST_LENSES.some((lens) => /JO|Job Order/i.test(lens.label)),
    "no JO in lenses"
  );

  const derive = read("src/modules/finance/utils/deriveFinanceOverview.ts");
  assert(!derive.includes("REIMBURSEMENT_SUBMISSION_STAGES"), "no deprecated stages in derive");
  assert(!derive.includes("approved_awaiting_payment"), "no approved_awaiting_payment");
  assert(derive.includes("submission_queried"), "queried submission attention");
  assert(derive.includes("submission_awaiting_payment"), "payment attention");
  assert(derive.includes("cost_needs_classification"), "unknown classification attention");
  assert(derive.includes("Client authorisation"), "client authorisation wording");
  assert(derive.includes("buildFinancePaymentOverviewState"), "payment overview util");
  assert(derive.includes("summarizeSubmissionPayments"), "reuse payment summary");

  const types = read("src/modules/finance/types.ts");
  assert(!types.includes("CostSubmissionStatus"), "overview types avoid deprecated status");
  assert(types.includes("reimbursementPayments"), "reimbursement payments availability");
  assert(types.includes("FinanceSubmissionPreviewRow"), "enriched submission preview");

  const position = read(
    "src/modules/finance/components/FinancePositionSection.tsx"
  );
  assert(position.includes("Client authorisation"), "position separates APR");
  assert(position.includes("not reimbursement approval"), "APR boundary copy");

  const flow = read("src/modules/finance/components/FinanceFlowRail.tsx");
  assert(flow.includes("submissionLive"), "submission live prop");
  assert(flow.includes("paymentStatusSignal"), "payment status prop");
  assert(flow.includes("Not yet recorded"), "empty payment fallback");
  assert(flow.includes("not reimbursement authority"), "APR boundary on rail");

  const coverage = read(
    "src/modules/finance/components/FinanceCoverageSection.tsx"
  );
  assert(coverage.includes("Reimbursement submissions"), "coverage submissions live label");
  assert(coverage.includes("paymentsStatus"), "coverage payments from overview");

  const submissionsUi = read(
    "src/modules/finance/components/FinanceSubmissionsSection.tsx"
  );
  assert(submissionsUi.includes("Claim"), "claim column");
  assert(submissionsUi.includes("Outstanding"), "outstanding column");
  assert(submissionsUi.includes("paymentStatusLabel"), "payment status column");
  assert(submissionsUi.includes("FINANCE_UI_LIST_LIMIT"), "max-5 submissions");

  const pendingUi = read(
    "src/modules/finance/components/FinancePendingActionSection.tsx"
  );
  assert(pendingUi.includes("FINANCE_UI_LIST_LIMIT"), "max-5 attention");

  const costsUi = read(
    "src/modules/finance/components/FinanceOperationalCostSection.tsx"
  );
  assert(costsUi.includes("FINANCE_UI_LIST_LIMIT"), "max-5 recent costs");

  const intel = read(
    "src/modules/finance/components/FinanceIntelligencePreview.tsx"
  );
  assert(!/tracks payments/i.test(intel), "intelligence does not claim payment tracking");

  const hook = read("src/modules/finance/hooks/useFinanceOverview.ts");
  assert(hook.includes("CostSubmissionService"), "overview loads submissions");
  assert(hook.includes("ReimbursementPaymentService"), "overview loads payments");
  assert(hook.includes("listPayments"), "payments list call");
  assert(hook.includes("listCostSubmissions"), "submissions list call");
  assert(hook.includes("listCostRecords"), "cost list call");
  assert(hook.includes("listApprovals"), "approvals list call");
  assert(hook.includes("FINANCE_OVERVIEW_FETCH_SIZE"), "bounded fetch size");

  console.log("PASS static finance view contracts (V1.1 + payment)");
}

function mappingChecks() {
  const costs = fixtureCosts();
  const submissions = fixtureSubmissions();
  const overview = deriveFinanceOverview({
    approvals: fixtureApprovals(),
    totalApprovals: 2,
    costRecords: costs,
    totalCostRecords: costs.length,
    submissions,
    totalSubmissions: submissions.length,
    payments: [],
    totalPayments: 0,
  });

  assert(FINANCIAL_DOMAIN_IMPLEMENTED.ui === true, "finance ui flag");
  assert(FINANCIAL_DOMAIN_IMPLEMENTED.costRecords === true, "cost records live");
  assert(FINANCIAL_DOMAIN_IMPLEMENTED.costSubmissions === true, "submissions live");
  assert(FINANCIAL_DOMAIN_IMPLEMENTED.paymentProcessing === true, "reimbursement payments available");
  assert(FINANCIAL_DOMAIN_IMPLEMENTED.jobOrder === false, "job order not implemented");

  assert(overview.availability.costSubmissions === true, "availability submissions live");
  assert(overview.availability.reimbursementPayments === true, "reimbursement payments live");
  assert(overview.availability.contractPayments === false, "contract payments unavailable");
  assert(overview.recentCosts.length === 5, "exactly 5 recent costs");
  assert(overview.recentCosts[0]?.costId === "COST-1", "newest first for recent");
  assert(overview.pendingActions.length <= FINANCE_UI_LIST_LIMIT, "attention capped at 5");

  assert(
    overview.pendingActions.some((a) => a.kind === "submission_queried"),
    "queried submission attention"
  );
  assert(
    overview.pendingActions.some((a) => a.kind === "cost_needs_classification"),
    "unknown cost attention"
  );
  assert(
    overview.pendingActions.some((a) => a.kind === "client_authorisation_awaiting"),
    "client authorisation awaiting attention"
  );
  assert(
    overview.pendingActions.some((a) => a.kind === "cost_awaiting_submission"),
    "reimbursable awaiting submission when pool complete"
  );
  assert(
    !overview.pendingActions.some((a) => a.kind === "cost_awaiting_submission" && a.costId === "COST-1"),
    "cost already on a submission is not awaiting"
  );

  assert(overview.submissions.draftCount === 1, "draft count");
  assert(overview.submissions.queriedCount === 1, "queried count");
  assert(overview.submissions.submittedCount === 0, "submitted count");
  assert(overview.submissions.preview[0]?.paymentStatusLabel === "Unpaid", "preview unpaid");

  const paymentMetric = overview.position.find((m) => m.id === "payment");
  assert(paymentMetric?.available === true, "payment capability available");
  assert(paymentMetric?.detail === "Not yet recorded", "no payment → not recorded");
  assert(overview.payments.coverageStatus === "Not yet recorded", "coverage empty");
  assert(overview.payments.statusSignal === "Not yet recorded", "rail empty");

  const authMetric = overview.position.find((m) => m.id === "client_auth_awaiting");
  assert(
    authMetric?.label.includes("Client authorisation"),
    "client authorisation label not bare Approved"
  );

  assert(
    formatFinancialAmount(250000) === "NGN 250,000",
    "currency formatting"
  );

  const truncated = deriveFinanceOverview({
    approvals: [],
    totalApprovals: 0,
    costRecords: costs.slice(0, 3),
    totalCostRecords: 50,
    submissions: submissions.slice(0, 1),
    totalSubmissions: 40,
    payments: [],
    totalPayments: 0,
  });
  assert(truncated.meta.costRecordsTruncated === true, "cost truncated flag");
  assert(truncated.meta.submissionsTruncated === true, "submission truncated flag");
  assert(truncated.submissions.draftCount === null, "no fake global draft count when truncated");
  assert(
    !truncated.pendingActions.some((a) => a.kind === "cost_awaiting_submission"),
    "no awaiting-submission attention when submissions truncated"
  );
  assert(
    truncated.operationalCostSummary?.truncated === true,
    "cost summary marks sample amount"
  );

  console.log("PASS finance overview derivation (empty payments)");
}

function paymentStateChecks() {
  const cost: CostRecord = {
    costId: "COST-P1",
    recordedAt: "2026-09-01T12:00:00.000Z",
    facilityId: "FAC-0001",
    location: "Plant",
    description: "Parts",
    category: "spare_parts",
    actualAmount: 80000,
    currency: "NGN",
    reimbursability: "reimbursable",
    evidence: { reference: "INV-P1" },
    recordedBy: "USR-1",
  };
  const submitted: CostSubmission = {
    submissionId: "SUB-PAY-1",
    costRecordIds: ["COST-P1"],
    status: "submitted",
    currency: "NGN",
    claimAmount: 100000,
    createdAt: "2026-09-01T09:00:00.000Z",
    createdBy: "USR-1",
    submittedAt: "2026-09-01T10:00:00.000Z",
    submittedBy: "USR-1",
  };

  const none = deriveFinanceOverview({
    approvals: [],
    totalApprovals: 0,
    costRecords: [cost],
    totalCostRecords: 1,
    submissions: [submitted],
    totalSubmissions: 1,
    payments: [],
    totalPayments: 0,
  });
  assert(none.payments.available === true, "payments capability live");
  assert(none.payments.positionDetail === "Not yet recorded", "1. no payment");
  assert(
    none.pendingActions.some((a) => a.kind === "submission_awaiting_payment"),
    "unpaid submitted needs payment attention"
  );
  assert(
    none.submissions.preview[0]?.outstandingAmount === 100000,
    "full claim outstanding"
  );

  const partialPayments: ReimbursementPayment[] = [
    {
      paymentId: "PAY-1",
      submissionId: "SUB-PAY-1",
      receivedAmount: 40000,
      currency: "NGN",
      receivedAt: "2026-09-02T10:00:00.000Z",
      recordedAt: "2026-09-02T10:00:00.000Z",
      recordedBy: "USR-1",
    },
  ];
  const partial = deriveFinanceOverview({
    approvals: [],
    totalApprovals: 0,
    costRecords: [cost],
    totalCostRecords: 1,
    submissions: [submitted],
    totalSubmissions: 1,
    payments: partialPayments,
    totalPayments: 1,
  });
  assert(partial.payments.paymentCount === 1, "2. payment recorded");
  assert(
    /outstanding remains/i.test(partial.payments.positionDetail),
    "partial → outstanding remains"
  );
  assert(partial.submissions.preview[0]?.amountPaid === 40000, "paid amount");
  assert(partial.submissions.preview[0]?.outstandingAmount === 60000, "outstanding");
  assert(
    partial.submissions.preview[0]?.paymentStatusLabel === "Partially paid",
    "partial label"
  );
  assert(
    partial.pendingActions.some((a) => a.kind === "submission_awaiting_payment"),
    "partial still awaiting payment"
  );
  const partialWorkflow = deriveCostWorkflow(cost, submitted, {
    paymentRecorded: summarizeSubmissionPayments(submitted, partialPayments)
      .fullyPaid,
  });
  assert(
    partialWorkflow.eligibility === "submitted",
    "7. partial payment must not mark cost Reimbursed"
  );

  const fullPayments: ReimbursementPayment[] = [
    ...partialPayments,
    {
      paymentId: "PAY-2",
      submissionId: "SUB-PAY-1",
      receivedAmount: 60000,
      currency: "NGN",
      receivedAt: "2026-09-03T10:00:00.000Z",
      recordedAt: "2026-09-03T10:00:00.000Z",
      recordedBy: "USR-1",
    },
  ];
  const full = deriveFinanceOverview({
    approvals: [],
    totalApprovals: 0,
    costRecords: [cost],
    totalCostRecords: 1,
    submissions: [submitted],
    totalSubmissions: 1,
    payments: fullPayments,
    totalPayments: 2,
  });
  assert(full.payments.paymentCount === 2, "4. multiple receipts counted");
  assert(
    /fully paid/i.test(full.payments.positionDetail),
    "3. full payment → fully paid"
  );
  assert(full.submissions.preview[0]?.outstandingAmount === 0, "zero outstanding");
  assert(
    full.submissions.preview[0]?.paymentStatusLabel === "Fully paid",
    "fully paid label"
  );
  assert(
    !full.pendingActions.some((a) => a.kind === "submission_awaiting_payment"),
    "fully paid is not awaiting payment"
  );
  const fullWorkflow = deriveCostWorkflow(cost, submitted, {
    paymentRecorded: summarizeSubmissionPayments(submitted, fullPayments)
      .fullyPaid,
  });
  assert(
    fullWorkflow.eligibility === "reimbursed",
    "8. fully paid linked submission → Reimbursed"
  );

  const manyPending = deriveFinanceOverview({
    approvals: fixtureApprovals(),
    totalApprovals: 2,
    costRecords: fixtureCosts(),
    totalCostRecords: 6,
    submissions: [
      submitted,
      ...Array.from({ length: 8 }, (_, i) => ({
        submissionId: `SUB-DRAFT-${i}`,
        costRecordIds: [] as string[],
        status: "draft" as const,
        currency: "NGN",
        claimAmount: 1000,
        createdAt: "2026-09-01T09:00:00.000Z",
        createdBy: "USR-1",
      })),
    ],
    totalSubmissions: 9,
    payments: [],
    totalPayments: 0,
  });
  assert(
    manyPending.pendingActions.length <= FINANCE_UI_LIST_LIMIT,
    "6. no Finance attention list > 5"
  );
  assert(
    manyPending.submissions.preview.length <= FINANCE_UI_LIST_LIMIT,
    "6. submission preview ≤ 5"
  );
  assert(manyPending.recentCosts.length <= FINANCE_UI_LIST_LIMIT, "6. recent costs ≤ 5");

  console.log("PASS finance overview payment state + max-5");
}

function main() {
  staticChecks();
  mappingChecks();
  paymentStateChecks();
  console.log("VERIFY_FINANCE_OPERATIONAL_VIEW: PASS");
}

main();
