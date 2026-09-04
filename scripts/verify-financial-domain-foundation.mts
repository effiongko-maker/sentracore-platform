/**
 * Phase 12 — financial domain foundation (types/docs only).
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-financial-domain-foundation.mts
 */
import {
  FINANCIAL_DOMAIN_IMPLEMENTED,
  FINANCIAL_OPEN_DECISIONS,
  FINANCIAL_OPERATIONAL_COUPLING,
  assertDistinctClaimAmounts,
  assertDistinctCommercialAmounts,
  deriveOutstandingAmount,
  deriveReimbursementPaymentOutcome,
  getSubmissionActualCostTotal,
  isContractPaymentRecord,
  isCostRecordReimbursable,
  validateCostRecord,
  validateCostSubmission,
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

function costBase(overrides: Partial<CostRecord>): CostRecord {
  return {
    costId: "COST-BASE",
    recordedAt: "2026-01-10T00:00:00.000Z",
    facilityId: "FAC-0001",
    location: "Generator house",
    description: "Base cost",
    category: "other",
    actualAmount: 0,
    currency: "NGN",
    reimbursability: "unknown",
    evidence: { reference: "REF-BASE" },
    recordedBy: "USR-SYSTEM",
    ...overrides,
  };
}

function main() {
  const results: string[] = [];

  assert(ISSUE_MODEL_PHASE === 26, "phase 18");
  assert(FINANCIAL_DOMAIN_IMPLEMENTED.costRecords === true, "cost records persisted");
  assert(FINANCIAL_DOMAIN_IMPLEMENTED.costSubmissions === true, "submission persistence");
  assert(FINANCIAL_DOMAIN_IMPLEMENTED.ui === true, "first finance view");
  assert(FINANCIAL_DOMAIN_IMPLEMENTED.paymentProcessing === true, "reimbursement payments");
  assert(FINANCIAL_DOMAIN_IMPLEMENTED.approvalWorkflows === true, "reimbursement authorization");
  assert(
    FINANCIAL_DOMAIN_IMPLEMENTED.reimbursementAuthorization === true,
    "reimbursementAuthorization flag"
  );
  assert(FINANCIAL_DOMAIN_IMPLEMENTED.jobOrder === false, "no JO");
  results.push("PASS Phase 15; CostRecord + CostSubmission persistence enabled");

  // 1. Non-reimbursable CostRecord
  const labour = costBase({
    costId: "COST-NR-1",
    description: "Generator servicing labour (contractual)",
    category: "labour",
    actualAmount: 45000,
    reimbursability: "non_reimbursable",
    workId: "MNT-FIN-1",
  });
  assert(validateCostRecord(labour).valid === true, "non-reimbursable valid");
  assert(!isCostRecordReimbursable(labour), "not reimbursable");
  results.push("PASS Non-reimbursable CostRecord representable");

  // 2. Reimbursable CostRecord (+ oil / filter under same treatment)
  const oil = costBase({
    costId: "COST-R-1",
    category: "consumables",
    actualAmount: 12000,
    reimbursability: "reimbursable",
    workId: "MNT-FIN-1",
    workOrderId: "WO-FIN-1",
    evidence: { reference: "OIL-INV-1" },
  });
  const filter = costBase({
    costId: "COST-R-2",
    category: "consumables",
    actualAmount: 8000,
    reimbursability: "reimbursable",
    workId: "MNT-FIN-1",
    workOrderId: "WO-FIN-1",
    evidence: { reference: "FILTER-INV-1" },
  });
  assert(validateCostRecord(oil).valid === true, "oil reimbursable");
  assert(validateCostRecord(filter).valid === true, "filter reimbursable");
  assert(isCostRecordReimbursable(oil), "oil is reimbursable class");
  results.push("PASS Reimbursable CostRecord representable");

  // 5. Multiple cost records on one Issue/treatment
  const costsForIssue = [labour, oil, filter];
  assert(costsForIssue.length === 3, "three cost components");
  assert(
    costsForIssue.every((c) => c.workId === "MNT-FIN-1"),
    "same treatment"
  );
  assert(
    costsForIssue.some((c) => c.reimbursability === "non_reimbursable") &&
      costsForIssue.filter((c) => c.reimbursability === "reimbursable").length === 2,
    "mixed reimbursability under one treatment"
  );
  results.push(
    "PASS Multiple CostRecords per Issue/treatment with distinct reimbursability"
  );

  // 3–4. Underlying actual ≠ claim; markup independent; approval/payment separate
  const submissionCosts = [oil, filter];
  const underlyingTotal = getSubmissionActualCostTotal(submissionCosts);
  const submission: CostSubmission = {
    submissionId: "SUB-2026-000001",
    costRecordIds: [oil.costId, filter.costId],
    currency: "NGN",
    claimAmount: 23000,
    markup: { markupAmount: 3000, markupRatePercent: 15 },
    status: "submitted",
    createdAt: "2026-01-12T00:00:00.000Z",
    createdBy: "USR-FIN",
    submittedAt: "2026-01-12T00:00:00.000Z",
    submittedBy: "USR-FIN",
    refs: {
      maintenanceId: "MNT-FIN-1",
      workOrderId: "WO-FIN-1",
      facilityId: "FAC-0001",
    },
    executionKind: "work_order",
    executionId: "WO-FIN-1",
  };
  assert(validateCostSubmission(submission).valid === true, "submission valid");
  assertDistinctClaimAmounts({
    underlyingActualTotal: underlyingTotal,
    claimAmount: submission.claimAmount!,
    markup: submission.markup,
  });
  assertDistinctCommercialAmounts({
    underlyingActualTotal: underlyingTotal,
    claimAmount: submission.claimAmount,
  });
  assert(underlyingTotal === 20000, "actual from CostRecords");
  assert(submission.claimAmount === 23000, "claim distinct");
  assert(submission.markup?.markupAmount === 3000, "markup independent");
  assert(
    deriveOutstandingAmount({
      claimAmount: submission.claimAmount,
      authorizedAmount: 22000,
      receivedAmount: 5000,
    }) === 17000,
    "outstanding from authorized − received"
  );
  assert(
    deriveReimbursementPaymentOutcome({
      claimAmount: submission.claimAmount!,
      authorizedAmount: 22000,
      receivedAmount: 5000,
    }) === "partially_paid",
    "payment outcome from reconciliation"
  );
  results.push(
    "PASS Actual/markup/claim/authorized/received remain distinct"
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
  assert(submission.status === "submitted", "submission lifecycle independent");
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
  assert(!("costId" in monthly), "not a cost record");
  assert(monthly.expectedAmount !== undefined, "expected amount");
  assert(!isContractPaymentRecord(submission as never), "submission not contract");
  results.push("PASS ContractPaymentRecord distinct from reimbursement");

  // 8–9. WO reference; JO unimplemented
  assert(oil.workOrderId === "WO-FIN-1", "WO linked on cost");
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
    deriveReimbursementPaymentOutcome({
      claimAmount: submission.claimAmount!,
      authorizedAmount: 22000,
      receivedAmount: 5000,
    }) === "partially_paid",
    "payment still outstanding while Issue resolved"
  );
  results.push(
    "PASS Financial state cannot resolve Issue; resolution does not imply payment"
  );

  // 12. No persistence flags; CostRecord has no lifecycle fields
  assert(
    typeof (labour as { persist?: unknown }).persist === "undefined",
    "no persist on CostRecord"
  );
  assert(
    typeof (submission as { save?: unknown }).save === "undefined",
    "no save on submission"
  );
  assert(!("status" in labour), "no status on CostRecord");
  assert(!("costSubmissionId" in labour), "no submission link on CostRecord");
  results.push("PASS CostRecord + CostSubmission persistence foundations");

  console.log("\n=== financial domain foundation verify (phase 16) ===");
  for (const line of results) console.log(line);
  console.log("RESULT: PASS");
}

main();
