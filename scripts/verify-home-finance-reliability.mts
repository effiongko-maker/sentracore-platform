/**
 * Home Finance reliability — orchestration + per-source availability.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-home-finance-reliability.mts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  CostRecord,
  CostSubmission,
  ReimbursementAuthorization,
  ReimbursementPayment,
} from "../src/lib/operational/finance";
import { deriveFinancialPositionSnapshot } from "../src/modules/finance/utils/deriveFinancialPositionSnapshot";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function read(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

const now = "2026-09-07T06:00:00.000Z";

const costRecords: CostRecord[] = [
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
];

const submissions: CostSubmission[] = [
  {
    submissionId: "SUB-1",
    costRecordIds: ["COST-1"],
    status: "submitted",
    claimAmount: 100_000,
    currency: "NGN",
    createdBy: "USR-1",
    createdAt: now,
    submittedAt: now,
    submittedBy: "USR-1",
  },
];

const authorizations: ReimbursementAuthorization[] = [
  {
    authorizationId: "AUTH-1",
    submissionId: "SUB-1",
    authorizedAmount: 90_000,
    currency: "NGN",
    authorizedAt: now,
    authorizedBy: "USR-2",
    recordedAt: now,
  },
];

const payments: ReimbursementPayment[] = [
  {
    paymentId: "PAY-1",
    submissionId: "SUB-1",
    receivedAmount: 40_000,
    currency: "NGN",
    receivedAt: now,
    recordedAt: now,
    recordedBy: "USR-2",
  },
];

function main() {
  const results: string[] = [];

  // 1. Finance settles independently of notification fan-out
  const ready = read("src/modules/workspace/utils/homeWorkspaceReady.ts");
  assert(
    ready.includes("HOME_FINANCE_SETTLED_EVENT") &&
      ready.includes("signalHomeFinanceSettled") &&
      ready.includes("resetHomeFinanceSettled"),
    "finance settle coordination helpers"
  );

  const bell = read("src/components/platform/GlobalNotificationBell.tsx");
  assert(
    bell.includes("HOME_FINANCE_SETTLED_EVENT") &&
      bell.includes("isHomeFinanceSettled") &&
      bell.includes("resetHomeFinanceSettled") &&
      bell.includes("onHomeSettled") &&
      bell.includes("onFinanceSettled"),
    "bell waits for finance settle after workspace settle"
  );

  const hook = read("src/modules/finance/hooks/useFinancialPosition.ts");
  assert(
    hook.includes("signalHomeFinanceSettled"),
    "Home Finance hook signals settle when load finishes"
  );
  assert(
    hook.includes("HOME_FINANCE_SOURCE_TIMEOUT_MS") &&
      hook.includes("AbortController") &&
      hook.includes("controller.abort()") &&
      hook.includes("loader(controller.signal)"),
    "per-source timeout aborts via AbortController signal"
  );
  assert(
    hook.includes("{ signal }") &&
      hook.includes("listCostRecords") &&
      hook.includes("listCostSubmissions") &&
      hook.includes("listPayments") &&
      hook.includes("listAuthorizations"),
    "each Finance list call receives abort signal"
  );
  assert(
    /finally\s*\{[\s\S]*signalHomeFinanceSettled/.test(hook),
    "signalHomeFinanceSettled fires after all sources settle including timeout"
  );

  // Signal wiring through Finance list services → ApiClient
  for (const [label, path] of [
    ["CostRecordService", "src/services/finance/CostRecordService.ts"],
    ["CostSubmissionService", "src/services/finance/CostSubmissionService.ts"],
    [
      "ReimbursementPaymentService",
      "src/services/finance/ReimbursementPaymentService.ts",
    ],
    [
      "ReimbursementAuthorizationService",
      "src/services/finance/ReimbursementAuthorizationService.ts",
    ],
  ] as const) {
    const src = read(path);
    assert(
      src.includes("options?: { signal?: AbortSignal }") &&
        src.includes("{ signal: options?.signal }"),
      `${label} list methods forward AbortSignal to ApiClient`
    );
  }
  results.push("PASS Finance source timeout/abort settles unavailable");

  const command = read(
    "src/modules/workspace/components/CommandSurface.tsx"
  );
  assert(
    command.includes("signalHomeFinanceSettled") &&
      command.includes("!showFinance"),
    "CommandSurface releases finance gate when Finance is not shown"
  );
  results.push("PASS Finance can settle before notification fan-out");

  // 2. One failed source does not blank unrelated successful metrics
  const paymentsFailed = deriveFinancialPositionSnapshot({
    costs: { available: true, data: costRecords, total: 1 },
    submissions: { available: true, data: submissions, total: 1 },
    payments: { available: false },
    authorizations: { available: true, data: authorizations, total: 1 },
  });
  assert(paymentsFailed.spentAmount === 100_000, "spent survives payments failure");
  assert(
    paymentsFailed.expectedReimbursementAmount === 90_000,
    "expected survives payments failure"
  );
  assert(
    paymentsFailed.outstandingAvailable === false &&
      paymentsFailed.outstandingReimbursementAmount === null,
    "outstanding unavailable without payments"
  );

  const costsFailed = deriveFinancialPositionSnapshot({
    costs: { available: false },
    submissions: { available: true, data: submissions, total: 1 },
    payments: { available: true, data: payments, total: 1 },
    authorizations: { available: true, data: authorizations, total: 1 },
  });
  assert(costsFailed.spentAvailable === false, "spent unavailable without costs");
  assert(costsFailed.spentAmount === null, "spent not zero-filled");
  assert(
    costsFailed.expectedReimbursementAmount === 90_000,
    "expected survives costs failure"
  );
  assert(
    costsFailed.outstandingReimbursementAmount === 50_000,
    "outstanding survives costs failure (90-40)"
  );
  results.push("PASS one failed Finance source does not blank siblings");

  // 3. Failed sources never represented as zero
  assert(costsFailed.spentLabel === null, "unavailable spent has null label");
  assert(
    paymentsFailed.outstandingLabel === null,
    "unavailable outstanding has null label"
  );
  const section = read(
    "src/modules/workspace/components/FinancialPositionSection.tsx"
  );
  assert(
    section.includes("Unavailable") && section.includes("unavailable"),
    "UI shows Unavailable for missing metrics"
  );
  assert(
    hook.includes("settleSource") &&
      hook.includes("available: false"),
    "hook settles each source independently"
  );
  results.push("PASS failed sources are never represented as zero");

  // 4. /finance remains on overview path (unchanged)
  const financePage = read("src/modules/finance/components/FinancePage.tsx");
  const overviewHook = read("src/modules/finance/hooks/useFinanceOverview.ts");
  assert(
    financePage.includes("useFinanceOverview"),
    "Finance page still uses useFinanceOverview"
  );
  assert(
    !financePage.includes("useFinancialPosition"),
    "Finance page must not use Home Finance hook"
  );
  assert(
    overviewHook.includes("Promise.all") &&
      overviewHook.includes("ApprovalService"),
    "Finance overview path unchanged (still Promise.all + Approvals)"
  );
  assert(
    !overviewHook.includes("signalHomeFinanceSettled"),
    "Finance overview must not signal Home finance gate"
  );
  results.push("PASS /finance remains unchanged");

  for (const line of results) console.log(line);
  console.log("verify-home-finance-reliability: PASS");
}

main();
