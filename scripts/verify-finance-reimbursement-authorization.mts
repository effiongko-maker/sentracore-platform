/**
 * Finance V1.4 — Reimbursement Authorization verification.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-finance-reimbursement-authorization.mts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  evaluatePaymentAgainstAuthorizedAmount,
  FINANCIAL_DOMAIN_IMPLEMENTED,
  findAuthorizationForSubmission,
  validateReimbursementAuthorization,
} from "../src/lib/operational/finance";
import {
  deriveClaimWorkflowStatus,
  summarizeSubmissionPayments,
} from "../src/modules/finance/utils/submissionPayment";
import type {
  CostSubmission,
  ReimbursementAuthorization,
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
    FINANCIAL_DOMAIN_IMPLEMENTED.reimbursementAuthorization === true,
    "reimbursementAuthorization flag"
  );
  assert(
    FINANCIAL_DOMAIN_IMPLEMENTED.approvalWorkflows === true,
    "approvalWorkflows alias for reimbursement auth"
  );

  const draft = validateReimbursementAuthorization(
    {
      submissionId: "SUB-2026-000010",
      authorizedAmount: 80000,
      currency: "NGN",
      authorizedAt: "2026-09-02T10:00:00.000Z",
      authorizedBy: "USR-1",
      authorityReference: "MEMO-FIN-2026-014",
      recordedAt: "2026-09-02T10:00:00.000Z",
    },
    { serverGeneratedId: true }
  );
  assert(draft.valid, "auth draft validates");

  const blankRef = validateReimbursementAuthorization(
    {
      submissionId: "SUB-2026-000010",
      authorizedAmount: 80000,
      currency: "NGN",
      authorizedAt: "2026-09-02T10:00:00.000Z",
      authorizedBy: "USR-1",
      authorityReference: "   ",
      recordedAt: "2026-09-02T10:00:00.000Z",
    },
    { serverGeneratedId: true }
  );
  assert(!blankRef.valid, "blank authorityReference rejected");

  const invalid = validateReimbursementAuthorization(
    {
      submissionId: "SUB-2026-000010",
      authorizedAmount: 0,
      currency: "NGN",
      authorizedAt: "2026-09-02T10:00:00.000Z",
      authorizedBy: "USR-1",
      recordedAt: "2026-09-02T10:00:00.000Z",
    },
    { serverGeneratedId: true }
  );
  assert(!invalid.valid, "zero authorized amount rejected");

  const submission: CostSubmission = {
    submissionId: "SUB-2026-000010",
    costRecordIds: ["COST-2026-000010"],
    status: "submitted",
    currency: "NGN",
    claimAmount: 100000,
    createdBy: "USR-1",
    createdAt: "2026-09-01T12:00:00.000Z",
    submittedAt: "2026-09-01T12:00:00.000Z",
    submittedBy: "USR-1",
  };

  const authorization: ReimbursementAuthorization = {
    authorizationId: "AUTH-2026-000001",
    submissionId: "SUB-2026-000010",
    authorizedAmount: 80000,
    currency: "NGN",
    authorizedAt: "2026-09-02T10:00:00.000Z",
    authorizedBy: "USR-1",
    authorityReference: "MEMO-FIN-2026-014",
    recordedAt: "2026-09-02T10:00:00.000Z",
  };

  assert(
    findAuthorizationForSubmission([authorization], "SUB-2026-000010")
      ?.authorizationId === "AUTH-2026-000001",
    "find auth for submission"
  );
  assert(
    findAuthorizationForSubmission([authorization], "SUB-2026-000010")
      ?.authorityReference === "MEMO-FIN-2026-014",
    "authority reference preserved"
  );

  // Payments >= claim but authorized lower → fully reimbursed against authorized
  const authLower: ReimbursementAuthorization = {
    ...authorization,
    authorizedAmount: 70000,
  };
  const overClaimVsLowerAuth: ReimbursementPayment[] = [
    {
      paymentId: "PAY-2026-000009",
      submissionId: "SUB-2026-000010",
      receivedAmount: 100000,
      currency: "NGN",
      receivedAt: "2026-09-03T09:00:00.000Z",
      recordedAt: "2026-09-03T09:00:00.000Z",
      recordedBy: "USR-1",
    },
  ];
  const fullVsLower = summarizeSubmissionPayments(
    submission,
    overClaimVsLowerAuth,
    [authLower]
  );
  assert(
    fullVsLower.fullyPaid,
    "payments >= authorized (even if claim higher) → fully reimbursed"
  );
  assert(fullVsLower.outstandingAmount === 0, "no outstanding vs lower auth");

  const awaiting = summarizeSubmissionPayments(submission, [], []);
  assert(!awaiting.isAuthorized, "not authorized yet");
  assert(awaiting.outstandingAmount === 100000, "claim outstanding pre-auth");
  assert(
    deriveClaimWorkflowStatus(submission, awaiting) ===
      "awaiting_authorization",
    "workflow awaiting authorization"
  );

  const authorized = summarizeSubmissionPayments(
    submission,
    [],
    [authorization]
  );
  assert(authorized.isAuthorized, "authorized");
  assert(authorized.authorizedAmount === 80000, "authorized amount");
  assert(
    authorized.outstandingAmount === 80000,
    "outstanding uses authorized amount"
  );
  assert(
    deriveClaimWorkflowStatus(submission, authorized) === "authorized",
    "workflow authorized"
  );

  const paymentsPartial: ReimbursementPayment[] = [
    {
      paymentId: "PAY-2026-000010",
      submissionId: "SUB-2026-000010",
      receivedAmount: 50000,
      currency: "NGN",
      receivedAt: "2026-09-03T10:00:00.000Z",
      recordedAt: "2026-09-03T10:00:00.000Z",
      recordedBy: "USR-1",
    },
  ];
  const partial = summarizeSubmissionPayments(
    submission,
    paymentsPartial,
    [authorization]
  );
  assert(partial.outcome === "partially_paid", "partial vs authorized");
  assert(partial.outstandingAmount === 30000, "auth − paid");
  assert(
    deriveClaimWorkflowStatus(submission, partial) === "partially_paid",
    "workflow partial"
  );

  // Payments >= claim but still under authorized → not fully reimbursed
  const underAuth: ReimbursementPayment[] = [
    {
      paymentId: "PAY-2026-000011",
      submissionId: "SUB-2026-000010",
      receivedAmount: 100000,
      currency: "NGN",
      receivedAt: "2026-09-04T10:00:00.000Z",
      recordedAt: "2026-09-04T10:00:00.000Z",
      recordedBy: "USR-1",
    },
  ];
  const authHigher: ReimbursementAuthorization = {
    ...authorization,
    authorizedAmount: 120000,
  };
  const notFull = summarizeSubmissionPayments(submission, underAuth, [
    authHigher,
  ]);
  assert(
    !notFull.fullyPaid,
    "payments >= claim must not fully reimburse when authorized is higher"
  );
  assert(notFull.outstandingAmount === 20000, "remaining vs authorized");
  assert(notFull.outcome === "partially_paid", "partial when under authorized");

  const fullPayments: ReimbursementPayment[] = [
    {
      paymentId: "PAY-2026-000012",
      submissionId: "SUB-2026-000010",
      receivedAmount: 80000,
      currency: "NGN",
      receivedAt: "2026-09-05T10:00:00.000Z",
      recordedAt: "2026-09-05T10:00:00.000Z",
      recordedBy: "USR-1",
    },
  ];
  const full = summarizeSubmissionPayments(submission, fullPayments, [
    authorization,
  ]);
  assert(full.fullyPaid, "fully reimbursed vs authorized");
  assert(
    deriveClaimWorkflowStatus(submission, full) === "fully_reimbursed",
    "workflow fully reimbursed"
  );

  // Authorization revision floor: new authorizedAmount must remain >= receipts.
  const receivedSoFar = 4000000;
  const loweredButSafe = 5000000;
  const exactFloor = 4000000;
  const belowFloor = 3000000;
  assert(
    loweredButSafe >= receivedSoFar,
    "authorization can be revised downward when still >= receipts"
  );
  assert(
    exactFloor >= receivedSoFar,
    "authorization revision equal to receipts is allowed"
  );
  assert(
    belowFloor < receivedSoFar,
    "authorization cannot be revised below received amount"
  );

  const afterAllowedRevision = evaluatePaymentAgainstAuthorizedAmount({
    authorizedAmount: loweredButSafe,
    alreadyPaid: receivedSoFar,
    incomingAmount: 1000000,
  });
  assert(
    afterAllowedRevision.allowed && afterAllowedRevision.nextTotal === loweredButSafe,
    "payment ceiling remains correct after allowed authorization revision"
  );

  const repo = readSrc("apps-script/ReimbursementAuthorizationRepository.gs");
  assert(repo.includes("REIMBURSEMENT_AUTHORIZATIONS"), "auth sheet");
  assert(repo.includes("AUTH-"), "auth id prefix");
  assert(repo.includes("Authority Reference"), "authority reference column");
  assert(repo.includes("authorityReference"), "authorityReference field");

  const rowMap = readSrc("src/lib/operational/finance/authorizationRow.ts");
  assert(
    rowMap.includes("Authority Reference"),
    "row mapping authority reference"
  );
  assert(
    rowMap.includes("authorityReference"),
    "remote mapping authorityReference"
  );
  assert(rowMap.includes("Approval ID"), "forbidden Approval ID header listed");

  const service = readSrc("apps-script/ReimbursementAuthorizationService.gs");
  assert(service.includes("assertSubmissionAuthorizable_"), "only submitted");
  assert(
    service.includes("authorityReference"),
    "service passes authorityReference"
  );
  assert(
    service.includes("assertAuthorizationNotBelowReceived_"),
    "authorization update guards against lowering below receipts"
  );
  assert(
    service.includes("sumReceivedForSubmission_"),
    "authorization update computes paid receipts from payment repository"
  );
  const createIdx = service.indexOf("function create(");
  const updateIdx = service.indexOf("function update(");
  const createFn =
    createIdx >= 0 && updateIdx > createIdx
      ? service.slice(createIdx, updateIdx)
      : "";
  const updateFn = updateIdx >= 0 ? service.slice(updateIdx) : "";
  assert(
    !createFn.includes("assertAuthorizationNotBelowReceived_"),
    "authorization create behavior is unchanged"
  );
  assert(
    updateFn.includes("assertAuthorizationNotBelowReceived_"),
    "authorization floor check applies on update path"
  );
  assert(
    !service.includes("ApprovalsRepository"),
    "not WO approvals repository"
  );

  const paymentService = readSrc("apps-script/ReimbursementPaymentService.gs");
  assert(
    paymentService.includes("Authorize this claim before recording payment"),
    "payments gated on authorization"
  );

  const router = readSrc("apps-script/deployment/ROUTER.gs");
  assert(router.includes("reimbursement-authorizations"), "router resource");

  const api = readSrc("src/app/api/reimbursement-authorizations/route.ts");
  assert(api.includes("reimbursement-authorizations"), "api proxy");

  const detail = readSrc(
    "src/modules/finance/components/SubmissionDetailPage.tsx"
  );
  assert(detail.includes("Authorize claim"), "authorize CTA");
  assert(detail.includes("Authorized amount"), "authorized amount UI");
  assert(detail.includes("MonetaryInput"), "authorized amount uses grouped input");
  assert(detail.includes("Authority reference"), "authority reference UI");
  assert(
    detail.includes("authorityReference"),
    "persists authorityReference field"
  );
  assert(
    detail.includes("ReimbursementAuthorizationService.createAuthorization"),
    "persists authorization"
  );
  assert(
    detail.includes("canRecordPaymentForSubmission"),
    "payment gated in UI"
  );

  const overviewHook = readSrc(
    "src/modules/finance/hooks/useFinanceOverview.ts"
  );
  assert(
    overviewHook.includes("ReimbursementAuthorizationService"),
    "overview loads authorizations"
  );

  const derive = readSrc(
    "src/modules/finance/utils/deriveFinanceOverview.ts"
  );
  assert(
    derive.includes("submission_awaiting_authorization"),
    "auth attention kind"
  );

  console.log("PASS — Finance reimbursement authorization verification");
}

main();
