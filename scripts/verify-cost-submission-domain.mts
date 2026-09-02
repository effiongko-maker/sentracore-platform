/**
 * CostSubmission domain foundation verification.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-cost-submission-domain.mts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  FORBIDDEN_MARKUP_RATE_LITERALS,
  assertDistinctClaimAmounts,
  canSubmitCostSubmission,
  getSubmissionActualCostTotal,
  getSubmissionCostCount,
  getSubmissionCostRecordIds,
  isCostSubmissionDraft,
  isCostSubmissionQueried,
  isCostSubmissionSubmitted,
  validateCostSubmission,
  type CostRecord,
  type CostSubmission,
} from "../src/lib/operational/finance";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function readSrc(path: string): string {
  return readFileSync(resolve(path), "utf8");
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

function submissionBase(
  overrides: Partial<CostSubmission> = {}
): CostSubmission {
  return {
    submissionId: "SUB-2026-000001",
    costRecordIds: ["COST-2026-000001"],
    status: "draft",
    currency: "NGN",
    createdAt: "2026-01-15T09:00:00.000Z",
    createdBy: "USR-001",
    ...overrides,
  };
}

/** Keys that must never appear on CostSubmission (approval/payment duplication). */
const FORBIDDEN_SUBMISSION_KEYS = [
  "actualAmount",
  "submittedAmount",
  "approvedAmount",
  "receivedAmount",
  "outstandingAmount",
  "paymentOutcome",
  "paymentStatus",
  "authorityRoles",
] as const;

function main() {
  const results: string[] = [];
  const typesSrc = readSrc("src/lib/operational/finance/types.ts");
  const domainSrc = readSrc("src/lib/operational/finance/costSubmission.ts");

  // A. Valid submission with one CostRecord reference
  const oneCost = submissionBase();
  assert(validateCostSubmission(oneCost).valid === true, "A: one cost valid");
  assert(getSubmissionCostCount(oneCost) === 1, "A: count 1");
  results.push("PASS A — valid submission with one CostRecord reference");

  // B. Valid submission with multiple CostRecord references
  const multi = submissionBase({
    submissionId: "SUB-2026-000002",
    costRecordIds: ["COST-2026-000001", "COST-2026-000002", "COST-2026-000003"],
    claimAmount: 800000,
  });
  assert(validateCostSubmission(multi).valid === true, "B: multi valid");
  assert(getSubmissionCostCount(multi) === 3, "B: count 3");
  results.push("PASS B — valid submission with multiple CostRecord references");

  // C. Submission does not require Work/WO/JO
  const noContext = submissionBase({ costRecordIds: ["COST-2026-000010"] });
  assert(validateCostSubmission(noContext).valid === true, "C: no WO/JO");
  assert(noContext.refs === undefined, "C: no refs required");
  results.push("PASS C — submission does not require Work/WO/JO");

  // D. Standalone CostRecord can be submitted
  const standaloneCost = costRecord({
    costId: "COST-2026-000010",
    reimbursability: "unknown",
  });
  const standaloneSub = submissionBase({
    costRecordIds: [standaloneCost.costId],
    status: "submitted",
    submittedAt: "2026-01-16T10:00:00.000Z",
    submittedBy: "USR-001",
  });
  assert(validateCostSubmission(standaloneSub).valid === true, "D: standalone");
  results.push("PASS D — submission can contain standalone CostRecord");

  // E. Invalid lifecycle state rejected
  const badStatus = submissionBase();
  // @ts-expect-error — intentional domain violation
  badStatus.status = "approved";
  assert(validateCostSubmission(badStatus).valid === false, "E: bad status");
  results.push("PASS E — invalid lifecycle state rejected");

  // F. Empty cost selection rejected when submitted
  const emptySubmitted = submissionBase({
    costRecordIds: [],
    status: "submitted",
    submittedAt: "2026-01-16T10:00:00.000Z",
    submittedBy: "USR-001",
  });
  assert(validateCostSubmission(emptySubmitted).valid === false, "F: empty costs");
  results.push("PASS F — empty cost selection rejected when submitted");

  // G. Valid preparation/draft state
  const draft = submissionBase({ costRecordIds: [], status: "draft" });
  assert(validateCostSubmission(draft).valid === true, "G: draft empty ok");
  assert(isCostSubmissionDraft(draft), "G: draft helper");
  results.push("PASS G — valid preparation/draft state");

  // H. Valid submitted state
  const submitted = submissionBase({
    status: "submitted",
    submittedAt: "2026-01-16T10:00:00.000Z",
    submittedBy: "USR-002",
    claimAmount: 250000,
  });
  assert(validateCostSubmission(submitted).valid === true, "H: submitted");
  assert(isCostSubmissionSubmitted(submitted), "H: submitted helper");
  results.push("PASS H — valid submitted state");

  // I. Valid queried/returned state
  const queried = submissionBase({
    status: "queried",
    submittedAt: "2026-01-15T10:00:00.000Z",
    submittedBy: "USR-002",
    queriedAt: "2026-01-20T14:00:00.000Z",
    queryNotes: "Please attach vendor invoice cover sheet",
  });
  assert(validateCostSubmission(queried).valid === true, "I: queried");
  assert(isCostSubmissionQueried(queried), "I: queried helper");
  results.push("PASS I — valid queried/returned state");

  // J. Valid resubmission path
  assert(canSubmitCostSubmission(queried), "J: can resubmit from queried");
  assert(canSubmitCostSubmission(draft), "J: can submit from draft");
  assert(!canSubmitCostSubmission(submitted), "J: cannot re-submit submitted");
  results.push("PASS J — resubmission path supported conceptually");

  // K. No markup rate hard-coded in domain logic
  const logicSrc = domainSrc.replace(
    /export const FORBIDDEN_MARKUP_RATE_LITERALS[\s\S]*?\] as const;/,
    ""
  );
  for (const literal of FORBIDDEN_MARKUP_RATE_LITERALS) {
    assert(
      !logicSrc.includes(`"${literal}"`) &&
        !typesSrc.includes(`markupRatePercent: ${literal.replace("%", "")}`),
      `K: no hard-coded ${literal}`
    );
  }
  assert(!logicSrc.includes("markupRatePercent: 30"), "K: no default 30%");
  assert(domainSrc.includes("FORBIDDEN_MARKUP_RATE_LITERALS"), "K: guard list present");
  results.push("PASS K — no markup rate hard-coded");

  // L. No approval amount/status duplicated on CostSubmission type
  const submissionTypeStart = typesSrc.indexOf("export type CostSubmission = {");
  const submissionTypeEnd = typesSrc.indexOf("\n};", submissionTypeStart);
  const submissionTypeBody = typesSrc.slice(submissionTypeStart, submissionTypeEnd);
  for (const key of FORBIDDEN_SUBMISSION_KEYS) {
    assert(
      !submissionTypeBody.includes(`${key}:`) &&
        !submissionTypeBody.includes(`${key}?:`),
      `L: ${key} absent from CostSubmission`
    );
  }
  assert(submissionTypeBody.includes("approvalId?: string"), "L: approval link only");
  results.push("PASS L — no approval amount/status duplicated");

  // M. No payment amount/status duplicated
  assert(!typesSrc.includes("paidAmount"), "M: no paidAmount");
  assert(!typesSrc.includes("paymentReference"), "M: no paymentReference");
  results.push("PASS M — no payment amount/status duplicated");

  // N. CostRecord actual distinct from claim-side amount
  const records = [
    costRecord({ costId: "COST-2026-000001", actualAmount: 250000 }),
    costRecord({ costId: "COST-2026-000002", actualAmount: 400000 }),
    costRecord({ costId: "COST-2026-000003", actualAmount: 150000 }),
  ];
  const underlying: number = getSubmissionActualCostTotal(records);
  assert(underlying === 800000, "N: underlying total from CostRecords");
  const claimAmount: number = 920000;
  assertDistinctClaimAmounts({
    underlyingActualTotal: underlying,
    claimAmount,
    markup: { markupAmount: 120000 },
  });
  assert(underlying !== claimAmount, "N: claim distinct from actual");
  results.push("PASS N — actual cost distinct from claim-side amount");

  // O. Reimbursability not automatically inferred
  assert(
    !domainSrc.includes("reimbursability ===") &&
      !domainSrc.includes(".reimbursability"),
    "O: no reimbursability inference in submission domain"
  );
  results.push("PASS O — reimbursability not automatically inferred");

  // P. Multiple CostRecords form one submission
  assert(getSubmissionCostRecordIds(multi).length === 3, "P: three refs");
  results.push("PASS P — multiple CostRecords can form one submission");

  // Q. Domain validation is pure — no fetch/import of services
  assert(!domainSrc.includes("fetch("), "Q: no fetch");
  assert(!domainSrc.includes("ApiClient"), "Q: no API client");
  assert(!domainSrc.includes("MaintenanceService"), "Q: no maintenance service");
  results.push("PASS Q — domain validation remains pure");

  // Legacy single costRecordId compat
  const legacy = submissionBase({
    costRecordIds: [],
    costRecordId: "COST-2026-000099",
  });
  assert(
    getSubmissionCostRecordIds(legacy)[0] === "COST-2026-000099",
    "legacy costRecordId"
  );

  console.log("\n=== CostSubmission domain verify ===");
  for (const line of results) console.log(line);
  console.log("RESULT: PASS");
}

main();
