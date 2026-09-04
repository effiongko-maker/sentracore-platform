/**
 * Facility Management Home — Financial Position snapshot contracts.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-finance-home-position-snapshot.mts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  CostRecord,
  CostSubmission,
  ReimbursementAuthorization,
  ReimbursementPayment,
} from "../src/lib/operational/finance";
import {
  FINANCE_COST_POOL_FETCH_SIZE,
  FINANCE_OVERVIEW_FETCH_SIZE,
} from "../src/modules/finance/constants";
import { deriveFinancialPositionSnapshot } from "../src/modules/finance/utils/deriveFinancialPositionSnapshot";
import { summarizeSubmissionPayments } from "../src/modules/finance/utils/submissionPayment";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function read(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

const now = "2026-09-03T10:00:00.000Z";

function costs(): CostRecord[] {
  return [
    {
      costId: "COST-1",
      recordedAt: now,
      facilityId: "FAC-0001",
      location: "Plant",
      description: "Diesel",
      category: "diesel_fuel",
      actualAmount: 100_000,
      currency: "NGN",
      reimbursability: "reimbursable",
      evidence: { reference: "INV-1" },
      recordedBy: "USR-1",
    },
    {
      costId: "COST-2",
      recordedAt: now,
      facilityId: "FAC-0001",
      location: "Plant",
      description: "Parts",
      category: "spare_parts",
      actualAmount: 50_000,
      currency: "NGN",
      reimbursability: "non_reimbursable",
      evidence: { reference: "INV-2" },
      recordedBy: "USR-1",
    },
  ];
}

function submissions(): CostSubmission[] {
  return [
    {
      submissionId: "SUB-1",
      costRecordIds: ["COST-1"],
      status: "submitted",
      claimAmount: 200_000,
      currency: "NGN",
      createdBy: "USR-1",
      createdAt: now,
      submittedAt: now,
      submittedBy: "USR-1",
    },
    {
      submissionId: "SUB-2",
      costRecordIds: ["COST-2"],
      status: "queried",
      claimAmount: 80_000,
      currency: "NGN",
      createdBy: "USR-1",
      createdAt: now,
      submittedAt: now,
      submittedBy: "USR-1",
      queriedAt: now,
    },
    {
      submissionId: "SUB-DRAFT",
      costRecordIds: [],
      status: "draft",
      claimAmount: 999_000,
      currency: "NGN",
      createdBy: "USR-1",
      createdAt: now,
    },
    {
      submissionId: "SUB-CANCELLED",
      costRecordIds: [],
      status: "cancelled",
      claimAmount: 888_000,
      currency: "NGN",
      createdBy: "USR-1",
      createdAt: now,
    },
  ];
}

function authorizations(): ReimbursementAuthorization[] {
  return [
    {
      authorizationId: "AUTH-1",
      submissionId: "SUB-1",
      authorizedAmount: 180_000,
      currency: "NGN",
      authorizedAt: now,
      authorizedBy: "USR-2",
      recordedAt: now,
    },
  ];
}

function payments(): ReimbursementPayment[] {
  return [
    {
      paymentId: "PAY-1",
      submissionId: "SUB-1",
      receivedAmount: 50_000,
      currency: "NGN",
      receivedAt: now,
      recordedAt: now,
      recordedBy: "USR-2",
    },
  ];
}

function main() {
  assert(
    FINANCE_COST_POOL_FETCH_SIZE === 100,
    "cost pool size must remain 100"
  );
  assert(
    FINANCE_OVERVIEW_FETCH_SIZE === 100,
    "overview pool size must remain 100"
  );

  const costRecords = costs();
  const subs = submissions();
  const auths = authorizations();
  const pays = payments();

  // Complete pool
  const complete = deriveFinancialPositionSnapshot({
    costRecords,
    totalCostRecords: costRecords.length,
    submissions: subs,
    totalSubmissions: subs.length,
    payments: pays,
    totalPayments: pays.length,
    authorizations: auths,
    totalAuthorizations: auths.length,
  });

  assert(complete.spentAmount === 150_000, "Spent = Σ actualAmount");
  assert(complete.openClaimCount === 2, "only submitted|queried open claims");

  const s1 = summarizeSubmissionPayments(subs[0]!, pays, auths);
  const s2 = summarizeSubmissionPayments(subs[1]!, pays, auths);
  const expected =
    (s1.authorizedAmount ?? s1.claimAmount) +
    (s2.authorizedAmount ?? s2.claimAmount);
  const outstanding = s1.outstandingAmount + s2.outstandingAmount;

  assert(
    complete.expectedReimbursementAmount === expected,
    `Expected = Σ (authorizedAmount ?? claimAmount) for open claims; got ${complete.expectedReimbursementAmount} want ${expected}`
  );
  assert(
    complete.expectedReimbursementAmount === 180_000 + 80_000,
    "Expected uses auth basis for SUB-1 and claim for SUB-2"
  );
  assert(
    complete.outstandingReimbursementAmount === outstanding,
    `Outstanding must match reconcile helpers; got ${complete.outstandingReimbursementAmount}`
  );
  assert(
    complete.outstandingReimbursementAmount === 130_000 + 80_000,
    "Outstanding = 130k (180-50) + 80k"
  );
  assert(complete.isSample === false, "complete pool must not be sample");
  assert(complete.costsTruncated === false, "costs not truncated");

  // Truncated pools → honesty flags
  const sample = deriveFinancialPositionSnapshot({
    costRecords,
    totalCostRecords: 250,
    submissions: subs,
    totalSubmissions: 40,
    payments: pays,
    totalPayments: 15,
    authorizations: auths,
    totalAuthorizations: 12,
  });
  assert(sample.isSample === true, "truncated totals must mark isSample");
  assert(sample.costsTruncated === true, "costsTruncated when total > length");
  assert(
    sample.submissionsTruncated === true,
    "submissionsTruncated when total > length"
  );
  assert(
    sample.paymentsTruncated === true,
    "paymentsTruncated when total > length"
  );
  assert(
    sample.authorizationsTruncated === true,
    "authorizationsTruncated when total > length"
  );
  assert(
    sample.spentAmount === 150_000,
    "sample spent still sums loaded rows only"
  );

  // Mount + hook contracts (no Apps Script / Platform Home / Finance page edits)
  const commandSurface = read(
    "src/modules/workspace/components/CommandSurface.tsx"
  );
  assert(
    commandSurface.includes("FinancialPositionSection"),
    "CommandSurface must mount FinancialPositionSection"
  );
  assert(
    /CommandHero[\s\S]*FinancialPositionSection[\s\S]*sc-fm-main/.test(
      commandSurface
    ),
    "Financial Position must sit between CommandHero and sc-fm-main"
  );

  const section = read(
    "src/modules/workspace/components/FinancialPositionSection.tsx"
  );
  assert(section.includes('href="/finance"'), "Open Finance → /finance");
  assert(section.includes("Open Finance"), "Open Finance label");
  assert(section.includes("Spent"), "Spent metric");
  assert(
    section.includes("            Reimbursement"),
    "Reimbursement metric"
  );
  assert(!section.includes("Expected reimbursement"), "not Expected reimbursement");
  assert(!section.includes("Expected Back"), "not Expected Back");
  assert(section.includes("Outstanding reimbursement"), "Outstanding metric");
  assert(section.includes("sc-fm-finance-skel"), "loading skeleton");
  assert(section.includes("Unavailable"), "error fallback copy");
  assert(section.includes("Try again"), "error retry");
  assert(section.includes("Financial position could not be loaded"), "error lede");
  assert(
    !/loading \? "—"/.test(section),
    "loading must not render em dash values"
  );
  assert(
    section.includes("In-view sample") || section.includes("(sample)"),
    "sample honesty copy present"
  );

  const hook = read("src/modules/finance/hooks/useFinancialPosition.ts");
  assert(
    hook.includes("FINANCE_COST_POOL_FETCH_SIZE"),
    "hook uses cost pool size"
  );
  assert(
    hook.includes("FINANCE_OVERVIEW_FETCH_SIZE"),
    "hook uses overview pool size"
  );
  assert(
    !hook.includes("ApprovalService"),
    "Home snapshot must not load Approvals"
  );

  const css = read("src/styles/sentracore-os.css");
  assert(css.includes(".sc-fm-finance"), "finance strip styles present");
  assert(css.includes(".sc-fm-finance-skel"), "loading shimmer styles");

  const platformHome = read("src/app/(app)/page.tsx");
  assert(
    !platformHome.includes("FinancialPosition"),
    "Platform Home must stay unchanged"
  );

  const financePage = read(
    "src/modules/finance/components/FinancePage.tsx"
  );
  assert(
    !financePage.includes("deriveFinancialPositionSnapshot"),
    "Finance page must not switch to Home derive"
  );
  assert(
    financePage.includes("useFinanceOverview"),
    "Finance page still uses overview path"
  );

  console.log("verify-finance-home-position-snapshot: PASS");
  console.log(
    `  spent=${complete.spentAmount} expected=${complete.expectedReimbursementAmount} outstanding=${complete.outstandingReimbursementAmount}`
  );
  console.log(
    `  complete.isSample=${complete.isSample} sample.isSample=${sample.isSample}`
  );
}

main();
