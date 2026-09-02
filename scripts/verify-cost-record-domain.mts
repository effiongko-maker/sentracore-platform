/**
 * CostRecord domain foundation verification.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-cost-record-domain.mts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getAuthoritativeAmount,
  hasOperationalReference,
  isCostRecordReimbursable,
  validateCostRecord,
  type CostRecord,
} from "../src/lib/operational/finance";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function baseRecord(overrides: Partial<CostRecord> = {}): CostRecord {
  return {
    costId: "COST-2026-000001",
    recordedAt: "2026-01-10T12:00:00.000Z",
    facilityId: "FAC-0001",
    location: "Generator house",
    description: "Diesel purchase for generator",
    category: "diesel_fuel",
    actualAmount: 50000,
    currency: "NGN",
    reimbursability: "unknown",
    evidence: { reference: "INV-2026-0042", vendorOrSource: "Total Energies" },
    recordedBy: "USR-001",
    ...overrides,
  };
}

/** Keys that must never appear on CostRecord (lifecycle / claim concerns). */
const FORBIDDEN_COST_RECORD_KEYS = [
  "markup",
  "markupAmount",
  "markupPercentage",
  "markupRatePercent",
  "reimbursableAmount",
  "claimAmount",
  "submittedAmount",
  "approvedAmount",
  "receivedAmount",
  "submissionStatus",
  "approvalStatus",
  "paymentStatus",
  "costSubmissionId",
  "reimbursementEligible",
  "costClass",
  "estimatedAmount",
] as const;

function main() {
  const results: string[] = [];
  const typesSrc = readFileSync(
    resolve("src/lib/operational/finance/types.ts"),
    "utf8"
  );

  // A. Valid standalone facility cost (no Work / WO / JO)
  const standalone = baseRecord();
  assert(validateCostRecord(standalone).valid === true, "A: standalone valid");
  assert(!hasOperationalReference(standalone), "A: no operational refs");
  results.push("PASS A — valid standalone facility cost");

  // B. Valid Work-linked cost
  const workLinked = baseRecord({ workId: "MNT-001", category: "labour" });
  assert(validateCostRecord(workLinked).valid === true, "B: work-linked valid");
  assert(hasOperationalReference(workLinked), "B: has work ref");
  results.push("PASS B — valid Work-linked cost");

  // C. Valid WO-linked cost
  const woLinked = baseRecord({
    workOrderId: "WO-001",
    category: "spare_parts",
  });
  assert(validateCostRecord(woLinked).valid === true, "C: WO-linked valid");
  results.push("PASS C — valid WO-linked cost");

  // D. Valid JO-linked cost
  const joLinked = baseRecord({ jobOrderId: "JO-001", category: "service" });
  assert(validateCostRecord(joLinked).valid === true, "D: JO-linked valid");
  results.push("PASS D — valid JO-linked cost");

  // E. Missing operational reference still valid
  assert(
    validateCostRecord(baseRecord()).valid === true,
    "E: no refs still valid"
  );
  results.push("PASS E — missing operational reference is valid");

  // F. Missing evidence → invalid
  const noEvidence = baseRecord();
  // @ts-expect-error — intentional domain violation for test
  noEvidence.evidence = undefined;
  const fResult = validateCostRecord(noEvidence);
  assert(fResult.valid === false, "F: missing evidence invalid");
  results.push("PASS F — missing evidence invalid");

  // G. Invalid reimbursability → invalid
  const badReimb = baseRecord();
  // @ts-expect-error — intentional domain violation for test
  badReimb.reimbursability = "maybe_reimbursable";
  assert(validateCostRecord(badReimb).valid === false, "G: bad reimbursability");
  results.push("PASS G — invalid reimbursability invalid");

  // H. Invalid category → invalid
  const badCategory = baseRecord();
  // @ts-expect-error — intentional domain violation for test
  badCategory.category = "maintenance";
  assert(validateCostRecord(badCategory).valid === false, "H: bad category");
  results.push("PASS H — invalid category invalid");

  // I. Negative actual amount → invalid
  assert(
    validateCostRecord(baseRecord({ actualAmount: -1 })).valid === false,
    "I: negative actual"
  );
  results.push("PASS I — negative actual amount invalid");

  // J. Negative budgeted amount → invalid
  assert(
    validateCostRecord(baseRecord({ budgetedAmount: -100 })).valid === false,
    "J: negative budgeted"
  );
  results.push("PASS J — negative budgeted amount invalid");

  // K. Actual amount is authoritative
  const withBudget = baseRecord({ budgetedAmount: 100000, actualAmount: 95000 });
  assert(
    getAuthoritativeAmount(withBudget) === 95000,
    "K: authoritative is actualAmount"
  );
  assert(
    getAuthoritativeAmount(withBudget) !== withBudget.budgetedAmount,
    "K: not budgeted"
  );
  results.push("PASS K — actualAmount is authoritative");

  // L. Markup absent from CostRecord
  for (const key of FORBIDDEN_COST_RECORD_KEYS) {
    if (key.startsWith("markup") || key === "reimbursableAmount" || key === "claimAmount") {
      assert(!(key in standalone), `L: ${key} absent`);
    }
  }
  results.push("PASS L — markup fields absent from CostRecord");

  // M. Submission / approval / payment status absent from CostRecord
  const lifecycleKeys = [
    "submittedAmount",
    "approvedAmount",
    "receivedAmount",
    "submissionStatus",
    "approvalStatus",
    "paymentStatus",
    "costSubmissionId",
    "reimbursementEligible",
    "costClass",
    "status",
  ] as const;
  for (const key of lifecycleKeys) {
    assert(!(key in standalone), `M: ${key} absent`);
  }
  results.push("PASS M — submission/approval/payment lifecycle absent");

  // budgetedAmount accepted
  assert(
    validateCostRecord(baseRecord({ budgetedAmount: 48000 })).valid === true,
    "budgeted accepted"
  );
  results.push("PASS — budgetedAmount accepted");

  // estimatedAmount absent from canonical domain type
  const costRecordTypeStart = typesSrc.indexOf("export type CostRecord = {");
  const costRecordTypeEnd = typesSrc.indexOf("\n};", costRecordTypeStart);
  const costRecordTypeBody = typesSrc.slice(costRecordTypeStart, costRecordTypeEnd);
  assert(
    !costRecordTypeBody.includes("estimatedAmount"),
    "estimatedAmount absent from CostRecord type"
  );
  assert(costRecordTypeBody.includes("budgetedAmount"), "budgetedAmount on type");
  results.push("PASS — estimatedAmount absent; budgetedAmount on domain type");

  // budgetedAmount optional
  const noBudget = baseRecord();
  delete (noBudget as { budgetedAmount?: number }).budgetedAmount;
  assert(validateCostRecord(noBudget).valid === true, "budgeted optional");
  results.push("PASS — budgetedAmount optional");

  // location required
  assert(
    validateCostRecord(baseRecord({ location: "" })).valid === false,
    "empty location invalid"
  );
  assert(
    validateCostRecord(baseRecord({ location: "   " })).valid === false,
    "whitespace location invalid"
  );
  results.push("PASS — location required; whitespace rejected");

  // Facility required
  assert(
    validateCostRecord(baseRecord({ facilityId: "" })).valid === false,
    "facility required"
  );
  results.push("PASS — facility remains required");

  // Reimbursability helper (explicit only)
  assert(
    isCostRecordReimbursable({ reimbursability: "reimbursable" }) === true,
    "reimbursable helper true"
  );
  assert(
    isCostRecordReimbursable({ reimbursability: "unknown" }) === false,
    "unknown not reimbursable"
  );

  console.log("\n=== CostRecord domain verify ===");
  for (const line of results) console.log(line);
  console.log("RESULT: PASS");
}

main();
