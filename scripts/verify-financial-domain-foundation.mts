/**
 * Phase 12 — financial domain foundation (types/docs only).
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-financial-domain-foundation.mts
 */
import {
  FINANCIAL_DOMAIN_IMPLEMENTED,
  FINANCIAL_OPEN_DECISIONS,
  FINANCIAL_OPERATIONAL_COUPLING,
  assertDistinctCommercialAmounts,
  deriveOutstandingAmount,
  deriveReimbursementPaymentOutcome,
  isContractPaymentRecord,
  isValidNonReimbursableCost,
  isValidReimbursableCost,
  type ContractPaymentRecord,
  type CostRecord,
  type CostSubmission,
} from "../src/lib/operational/finance";
import {
  ISSUE_EXECUTION_IMPLEMENTATIONS,
  ISSUE_MODEL_PHASE,
  JOB_ORDER_BOUNDARY,
  composeIssueFromMaintenance,
  deriveIssueOutcome,
} from "../src/lib/operational/issues";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function main() {
  const results: string[] = [];

  assert(ISSUE_MODEL_PHASE === 26, "phase 18");
  assert(FINANCIAL_DOMAIN_IMPLEMENTED.persistence === false, "no persistence");
  assert(FINANCIAL_DOMAIN_IMPLEMENTED.ui === false, "no ui");
  assert(FINANCIAL_DOMAIN_IMPLEMENTED.paymentProcessing === false, "no payments");
  assert(FINANCIAL_DOMAIN_IMPLEMENTED.approvalWorkflows === false, "no approvals");
  assert(FINANCIAL_DOMAIN_IMPLEMENTED.jobOrder === false, "no JO");
  results.push("PASS Phase 15; financial foundation still types-only");

  // 1. Non-reimbursable CostRecord
  const labour: CostRecord = {
    id: "COST-NR-1",
    reference: "GEN-LABOUR",
    category: "generator_servicing_labour",
    costClass: "non_reimbursable",
    actualAmount: 45000,
    currency: "NGN",
    incurredAt: "2026-01-10",
    description: "Generator servicing labour (contractual)",
    origin: "contractual_obligation",
    reimbursementEligible: false,
    refs: {
      issueId: "issue:maintenance:MNT-FIN-1",
      maintenanceId: "MNT-FIN-1",
      facilityId: "FAC-0001",
    },
  };
  assert(isValidNonReimbursableCost(labour), "non-reimbursable valid");
  assert(labour.reimbursementEligible === false, "not reimbursable");
  results.push("PASS Non-reimbursable CostRecord representable");

  // 2. Reimbursable CostRecord (+ oil / filter under same treatment)
  const oil: CostRecord = {
    id: "COST-R-1",
    category: "generator_oil",
    costClass: "reimbursable",
    actualAmount: 12000,
    currency: "NGN",
    reimbursementEligible: true,
    origin: "consumable",
    refs: {
      issueId: "issue:maintenance:MNT-FIN-1",
      maintenanceId: "MNT-FIN-1",
      workOrderId: "WO-FIN-1",
      facilityId: "FAC-0001",
    },
  };
  const filter: CostRecord = {
    id: "COST-R-2",
    category: "generator_filter",
    costClass: "reimbursable",
    actualAmount: 8000,
    currency: "NGN",
    reimbursementEligible: true,
    origin: "consumable",
    refs: {
      issueId: "issue:maintenance:MNT-FIN-1",
      maintenanceId: "MNT-FIN-1",
      workOrderId: "WO-FIN-1",
    },
  };
  assert(isValidReimbursableCost(oil), "oil reimbursable");
  assert(isValidReimbursableCost(filter), "filter reimbursable");
  results.push("PASS Reimbursable CostRecord representable");

  // 5. Multiple cost records on one Issue/treatment
  const costsForIssue = [labour, oil, filter];
  assert(costsForIssue.length === 3, "three cost components");
  assert(
    costsForIssue.every((c) => c.refs?.maintenanceId === "MNT-FIN-1"),
    "same treatment"
  );
  assert(
    costsForIssue.some((c) => c.costClass === "non_reimbursable") &&
      costsForIssue.filter((c) => c.costClass === "reimbursable").length === 2,
    "mixed classes under one treatment"
  );
  results.push(
    "PASS Multiple CostRecords per Issue/treatment with distinct classes"
  );

  // 3–4. Actual ≠ submitted; markup independent
  const submission: CostSubmission = {
    id: "SUB-1",
    costRecordId: oil.id,
    currency: "NGN",
    actualAmount: oil.actualAmount,
    markup: { markupAmount: 1800, markupRatePercent: 15 },
    submittedAmount: 13800,
    approvedAmount: 13000,
    receivedAmount: 5000,
    status: "partially_paid",
    refs: oil.refs,
    executionKind: "work_order",
    executionId: "WO-FIN-1",
  };
  assertDistinctCommercialAmounts(submission);
  assert(submission.actualAmount === 12000, "actual preserved");
  assert(submission.submittedAmount === 13800, "submitted distinct");
  assert(submission.markup?.markupAmount === 1800, "markup independent");
  assert(submission.approvedAmount !== submission.submittedAmount, "approved may differ");
  assert(
    deriveOutstandingAmount({
      submittedAmount: submission.submittedAmount,
      approvedAmount: submission.approvedAmount,
      receivedAmount: submission.receivedAmount,
    }) === 8000,
    "outstanding from approved − received"
  );
  assert(
    deriveReimbursementPaymentOutcome(submission) === "partially_paid",
    "payment outcome"
  );
  results.push(
    "PASS Actual/markup/submitted/approved/received remain distinct"
  );

  // 6. CostSubmission separate from operational status
  const issue = composeIssueFromMaintenance({
    maintenance: {
      id: "MNT-FIN-1",
      title: "Generator servicing",
      facilityId: "FAC-0001",
      status: "completed",
      priority: "medium",
      completedAt: "2026-01-11T00:00:00.000Z",
      workOrderId: "WO-FIN-1",
      createdAt: "2026-01-10T00:00:00.000Z",
      updatedAt: "2026-01-11T00:00:00.000Z",
    },
    workOrders: [
      {
        id: "WO-FIN-1",
        title: "Generator service WO",
        status: "completed",
        maintenanceId: "MNT-FIN-1",
      },
    ],
  });
  assert(issue.status === "resolved", "issue resolved from MNT completed");
  assert(submission.status === "partially_paid", "submission still financial");
  assert(
    issue.status !== (submission.status as string),
    "operational ≠ financial status strings"
  );
  results.push("PASS CostSubmission status independent of operational status");

  // 7. Contract payment distinct from reimbursement
  const monthly: ContractPaymentRecord = {
    id: "CP-1",
    contractReference: "FM-CONTRACT-OPEN",
    period: "2026-01",
    currency: "NGN",
    expectedAmount: 1,
    submittedAmount: 1,
    receivedAmount: 0,
    outstandingAmount: 1,
    status: "due",
    notes: "Amount placeholder — contract amount OPEN; not hard-coded product rule",
  };
  assert(isContractPaymentRecord(monthly), "contract payment kind");
  assert(!("costClass" in monthly), "not a cost record");
  assert(monthly.expectedAmount !== undefined, "expected amount");
  assert(!isContractPaymentRecord(submission as never), "submission not contract");
  results.push("PASS ContractPaymentRecord distinct from reimbursement");

  // 8–9. WO reference; JO unimplemented
  assert(oil.refs?.workOrderId === "WO-FIN-1", "WO linked on cost");
  assert(submission.executionKind === "work_order", "WO execution on submission");
  assert(JOB_ORDER_BOUNDARY.implemented === false, "JO unimplemented");
  assert(
    ISSUE_EXECUTION_IMPLEMENTATIONS.job_order.implemented === false,
    "JO execution false"
  );
  assert(
    FINANCIAL_OPEN_DECISIONS.includes("contract_payment_schedule_and_amount"),
    "schedule OPEN"
  );
  results.push("PASS Work Order referenceable; Job Order remains unimplemented");

  // 10–11. Lifecycle decoupling
  assert(
    FINANCIAL_OPERATIONAL_COUPLING.financialStateResolvesIssue === false,
    "finance cannot resolve Issue"
  );
  assert(
    FINANCIAL_OPERATIONAL_COUPLING.issueResolutionImpliesPaymentReceived ===
      false,
    "resolution ≠ payment"
  );
  const outcome = deriveIssueOutcome(issue);
  assert(outcome.kind === "resolved", "outcome resolved");
  assert(
    (submission.receivedAmount ?? 0) < (submission.approvedAmount ?? 0),
    "payment still outstanding while Issue resolved"
  );
  results.push(
    "PASS Financial state cannot resolve Issue; resolution does not imply payment"
  );

  // 12. No persistence flags
  assert(
    typeof (labour as { persist?: unknown }).persist === "undefined",
    "no persist on CostRecord"
  );
  assert(
    typeof (submission as { save?: unknown }).save === "undefined",
    "no save on submission"
  );
  results.push("PASS No persistence/schema introduced on financial types");

  console.log("\n=== financial domain foundation verify (phase 16) ===");
  for (const line of results) console.log(line);
  console.log("RESULT: PASS");
}

main();
