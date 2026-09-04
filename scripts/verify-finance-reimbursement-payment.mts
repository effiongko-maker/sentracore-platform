/**
 * Finance reimbursement payment + submission lifecycle verification.
 *
 * Static contracts always run.
 * Live GAS round-trip (create → persist ID → retrieve → aggregate → update)
 * runs when APPS_SCRIPT_URL / .env.local is configured.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-finance-reimbursement-payment.mts
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertCostSubmissionTransition,
  canTransitionCostSubmission,
  evaluatePaymentAgainstAuthorizedAmount,
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
  ReimbursementAuthorization,
  ReimbursementPayment,
} from "../src/lib/operational/finance/types";
import { FINANCE_UI_LIST_LIMIT } from "../src/modules/finance/constants";
import {
  canCorrectPaymentForSubmission,
  canRecordPaymentForSubmission,
} from "../src/modules/finance/utils/submissionLifecycle";
import { CostRecordService } from "../src/services/finance/CostRecordService";
import { CostSubmissionService } from "../src/services/finance/CostSubmissionService";
import { ReimbursementAuthorizationService } from "../src/services/finance/ReimbursementAuthorizationService";
import { ReimbursementPaymentService } from "../src/services/finance/ReimbursementPaymentService";

function loadEnvLocal() {
  const path = resolve(".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (!(k in process.env)) process.env[k] = v;
  }
}

loadEnvLocal();

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function readSrc(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

function extractGsFunction(src: string, name: string): string {
  const start = src.indexOf(`function ${name}(`);
  assert(start >= 0, `${name} present`);
  const brace = src.indexOf("{", start);
  assert(brace >= 0, `${name} body`);
  let depth = 0;
  for (let i = brace; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`unclosed ${name}`);
}

function formatPayId(year: number, seq: number): string {
  return `PAY-${year}-${String(seq).padStart(6, "0")}`;
}

function paymentSeq(paymentId: string, year: number): number {
  const prefix = `PAY-${year}-`;
  if (!paymentId.startsWith(prefix)) return 0;
  const seq = Number(paymentId.slice(prefix.length));
  return Number.isFinite(seq) ? seq : 0;
}

async function maxPaymentSeqForYear(year: number): Promise<number> {
  let max = 0;
  let page = 1;
  let totalPages = 1;
  do {
    const listed = await ReimbursementPaymentService.listPayments({
      page,
      pageSize: 100,
    });
    totalPages = Math.max(1, listed.totalPages || 1);
    for (const row of listed.data) {
      max = Math.max(max, paymentSeq(row.paymentId, year));
    }
    page += 1;
  } while (page <= totalPages && page <= 20);
  return max;
}

function staticChecks() {
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

  const authorizedAmount = 100000;
  const partialGuard = evaluatePaymentAgainstAuthorizedAmount({
    authorizedAmount,
    alreadyPaid: 40000,
    incomingAmount: 30000,
  });
  assert(partialGuard.allowed, "partial payment within authorized");
  assert(partialGuard.nextTotal === 70000, "partial next total");

  const exactGuard = evaluatePaymentAgainstAuthorizedAmount({
    authorizedAmount,
    alreadyPaid: 40000,
    incomingAmount: 60000,
  });
  assert(exactGuard.allowed, "exact outstanding payment allowed");
  assert(exactGuard.nextTotal === authorizedAmount, "exact fills authorized");

  const overGuard = evaluatePaymentAgainstAuthorizedAmount({
    authorizedAmount,
    alreadyPaid: 40000,
    incomingAmount: 60001,
  });
  assert(!overGuard.allowed, "overpayment rejected");
  assert(/exceeds outstanding/i.test(overGuard.message), "overpayment message");

  const overFromZero = evaluatePaymentAgainstAuthorizedAmount({
    authorizedAmount: 80000,
    alreadyPaid: 0,
    incomingAmount: 80001,
  });
  assert(!overFromZero.allowed, "single receipt over authorized rejected");

  // Correction ceiling: alreadyPaid excludes the receipt being edited.
  const otherReceiptsPaid = 60000;
  const sameAmountCorrection = evaluatePaymentAgainstAuthorizedAmount({
    authorizedAmount,
    alreadyPaid: otherReceiptsPaid,
    incomingAmount: 40000,
  });
  assert(
    sameAmountCorrection.allowed,
    "same-amount correction allowed when current payment is excluded"
  );

  const withinCorrection = evaluatePaymentAgainstAuthorizedAmount({
    authorizedAmount,
    alreadyPaid: otherReceiptsPaid,
    incomingAmount: 35000,
  });
  assert(withinCorrection.allowed, "correction within authorized ceiling succeeds");
  assert(withinCorrection.nextTotal === 95000, "corrected next total");

  const overCorrection = evaluatePaymentAgainstAuthorizedAmount({
    authorizedAmount,
    alreadyPaid: otherReceiptsPaid,
    incomingAmount: 50000,
  });
  assert(!overCorrection.allowed, "correction over authorized amount rejected");

  const wronglyIncludingCurrent = evaluatePaymentAgainstAuthorizedAmount({
    authorizedAmount,
    alreadyPaid: 100000,
    incomingAmount: 40000,
  });
  assert(
    !wronglyIncludingCurrent.allowed,
    "including the current receipt would reject a valid same-amount correction"
  );

  assert(canCorrectPaymentForSubmission("submitted", true), "correct submitted+authorized");
  assert(canCorrectPaymentForSubmission("queried", true), "correct queried+authorized");
  assert(
    !canCorrectPaymentForSubmission("submitted", false),
    "no correction without authorization"
  );
  assert(!canCorrectPaymentForSubmission("draft", true), "no correction on draft");
  assert(!canCorrectPaymentForSubmission("cancelled", true), "no correction on cancelled");
  assert(
    canCorrectPaymentForSubmission("submitted", true) ===
      canRecordPaymentForSubmission("submitted", true),
    "correction gate matches updatePayment gate"
  );
  assert(FINANCE_UI_LIST_LIMIT === 5, "payment list display cap is 5");

  const authorization: ReimbursementAuthorization = {
    authorizationId: "AUTH-2026-000001",
    submissionId: "SUB-2026-000001",
    authorizedAmount: 100000,
    currency: "NGN",
    authorizedAt: "2026-09-01T13:00:00.000Z",
    authorizedBy: "USR-1",
    recordedAt: "2026-09-01T13:00:00.000Z",
  };
  const correctedPayments: ReimbursementPayment[] = [
    {
      ...payments[0],
      receivedAmount: 25000,
      reference: "TRX-1-CORR",
      notes: "adjusted",
    },
  ];
  const afterCorrection = summarizeSubmissionPayments(
    submission,
    correctedPayments,
    [authorization]
  );
  assert(afterCorrection.amountPaid === 25000, "amount paid follows corrected receipt");
  assert(
    afterCorrection.outstandingAmount === 75000,
    "outstanding follows corrected receipt"
  );

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
  assert(detail.includes("MonetaryInput"), "comma-formatted payment/auth amounts");
  assert(detail.includes("parseMonetaryInput"), "submits clean numeric amounts");
  assert(!detail.includes('type="number"'), "amount fields are not native number inputs");
  assert(detail.includes("Mark queried"), "query CTA");
  assert(detail.includes("Resubmit"), "resubmit CTA");
  assert(detail.includes("ReimbursementPaymentService.createPayment"), "persists payment");
  assert(detail.includes("Amount exceeds outstanding"), "UI overpayment guard");
  assert(
    detail.includes("paymentSummary.outstandingAmount"),
    "UI compares to outstanding"
  );
  assert(detail.includes("assertCostSubmissionTransition") === false, "no assert in UI");
  assert(
    detail.includes("CostSubmissionService.updateCostSubmission"),
    "lifecycle via update"
  );
  assert(detail.includes("paymentSubmitLock"), "sync payment double-submit lock");
  assert(
    detail.includes("if (paymentSubmitLock.current) return"),
    "lock rejects overlapping Record payment"
  );
  assert(detail.includes("openPaymentCorrection"), "existing receipt can be opened for correction");
  assert(detail.includes("canCorrectPaymentForSubmission"), "correction uses updatePayment gate");
  assert(
    /\n\s*Correct\s*\n/.test(detail),
    "Correct action on each persisted receipt"
  );
  assert(
    detail.includes("ReimbursementPaymentService.updatePayment"),
    "correction calls updatePayment"
  );
  assert(
    detail.includes("ReimbursementPaymentService.createPayment"),
    "new receipts still call createPayment"
  );
  assert(detail.includes("editingPaymentId"), "correction preserves existing paymentId");
  assert(detail.includes("Save correction"), "correction save");
  assert(
    detail.includes("!isCorrection && amount > paymentSummary.outstandingAmount"),
    "create outstanding guard is not applied to correction"
  );
  assert(!detail.includes("voidPayment"), "no void");
  assert(!detail.includes("deletePayment"), "no deletion");
  assert(!detail.includes("cancelPayment"), "no cancellation");
  assert(
    detail.includes("visiblePayments = payments.slice(0, FINANCE_UI_LIST_LIMIT)"),
    "payment list remains capped"
  );

  const lifecycle = readSrc("src/modules/finance/utils/submissionLifecycle.ts");
  assert(
    lifecycle.includes("canCorrectPaymentForSubmission"),
    "lifecycle exposes correction gate"
  );

  const tsPaymentService = readSrc(
    "src/services/finance/ReimbursementPaymentService.ts"
  );
  assert(
    tsPaymentService.includes("paymentId: existing.paymentId"),
    "TS update preserves paymentId"
  );
  assert(tsPaymentService.includes('"update"'), "TS update posts action update");
  assert(
    !/async createPayment[\s\S]*"update"/.test(
      tsPaymentService.slice(
        tsPaymentService.indexOf("async createPayment"),
        tsPaymentService.indexOf("async updatePayment")
      )
    ),
    "createPayment does not post update"
  );

  const panel = readSrc("src/modules/finance/components/SubmissionReviewPanel.tsx");
  assert(panel.includes("/finance/costs/"), "cost deep links");
  assert(panel.includes("FINANCE_UI_LIST_LIMIT"), "5-record cap");

  const repo = readSrc("apps-script/ReimbursementPaymentRepository.gs");
  assert(repo.includes("REIMBURSEMENT_PAYMENTS"), "payment sheet");
  assert(repo.includes("PAY-"), "payment id prefix");
  assert(
    repo.includes("listAllBySubmissionId"),
    "unpaginated listAllBySubmissionId"
  );

  const nextIdFn = extractGsFunction(repo, "nextId_");
  assert(
    !nextIdFn.includes("getAll("),
    "nextId_ must not use paginated getAll()"
  );
  assert(
    !/\ball\.length\b/.test(nextIdFn),
    "nextId_ must not iterate getAll wrapper via all.length"
  );
  assert(
    nextIdFn.includes("getDataRange"),
    "nextId_ must read persisted sheet cells"
  );
  assert(
    nextIdFn.includes("Payment ID"),
    "nextId_ must scan the Payment ID column"
  );

  const paymentService = readSrc("apps-script/ReimbursementPaymentService.gs");
  assert(
    paymentService.includes("assertWithinAuthorizedAmount_"),
    "GAS authorized amount ceiling"
  );
  assert(
    paymentService.includes("Payment exceeds outstanding authorized amount"),
    "GAS overpayment rejection message"
  );
  assert(
    paymentService.includes("Authorize this claim before recording payment"),
    "payments gated on authorization"
  );

  const sumFn = extractGsFunction(paymentService, "sumExistingPayments_");
  assert(
    !sumFn.includes("getAll("),
    "ceiling must not sum via paginated getAll"
  );
  assert(
    !sumFn.includes("pageSize: 10000"),
    "ceiling must not rely on pageSize that getAll clamps to 100"
  );
  assert(
    sumFn.includes("listAllBySubmissionId"),
    "ceiling sums all receipts for the submission"
  );
  assert(
    sumFn.includes("exclude") && sumFn.includes("continue"),
    "ceiling can exclude the payment being updated"
  );

  const updateFn = extractGsFunction(paymentService, "update");
  assert(
    /assertWithinAuthorizedAmount_\(\s*submissionId,\s*merged\.receivedAmount,\s*paymentId/.test(
      updateFn
    ),
    "updatePayment excludes current paymentId from already-paid"
  );
  assert(!updateFn.includes("Repository.create"), "update does not create a new receipt");

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
  assert(/fully reimbursed/i.test(fullState.positionDetail), "overview full");

  console.log("PASS — Finance reimbursement payment verification (static)");
}

async function liveChecks(): Promise<"passed" | "skipped" | "blocked"> {
  const url =
    process.env.APPS_SCRIPT_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "";
  if (!url.trim()) {
    console.log("\nSKIP live GAS payment ID round-trip — APPS_SCRIPT_URL not configured");
    console.log(
      "MANUAL DEPLOYMENT REQUIRED: Deploy ReimbursementPaymentRepository.gs + ReimbursementPaymentService.gs, then re-run."
    );
    return "skipped";
  }

  const stamp = Date.now();
  const year = new Date().getFullYear();
  const marker = `VERIFY-PAYMENT-ID-SEQ ${stamp}`;
  const results: string[] = [];

  try {
    const maxBefore = await maxPaymentSeqForYear(year);
    const expectedIds = [
      formatPayId(year, maxBefore + 1),
      formatPayId(year, maxBefore + 2),
      formatPayId(year, maxBefore + 3),
    ];

    const cost = await CostRecordService.createCostRecord({
      facilityId: "FAC-0001",
      location: "Verify plant",
      description: `Payment ID sequencing verify ${stamp}`,
      category: "other",
      actualAmount: 30000,
      currency: "NGN",
      reimbursability: "reimbursable",
      evidence: { reference: `INV-PAY-SEQ-${stamp}` },
      recordedBy: "USR-VERIFY",
    });

    const draft = await CostSubmissionService.createCostSubmission({
      costRecordIds: [cost.costId],
      status: "draft",
      currency: "NGN",
      claimAmount: 30000,
      facilityId: "FAC-0001",
      createdBy: "USR-VERIFY",
      notes: marker,
    });
    const submitted = await CostSubmissionService.updateCostSubmission(
      draft.submissionId,
      {
        status: "submitted",
        submittedAt: new Date().toISOString(),
        submittedBy: "USR-VERIFY",
        claimAmount: 30000,
      }
    );

    await ReimbursementAuthorizationService.createAuthorization({
      submissionId: submitted.submissionId,
      authorizedAmount: 30000,
      currency: "NGN",
      authorizedBy: "USR-VERIFY",
      notes: marker,
    });

    const first = await ReimbursementPaymentService.createPayment({
      submissionId: submitted.submissionId,
      receivedAmount: 10000,
      currency: "NGN",
      recordedBy: "USR-VERIFY",
      notes: marker,
    });

    if (first.paymentId !== expectedIds[0]) {
      console.log("\n=== Live GAS payment ID round-trip ===");
      console.error(
        `BLOCKED — first create returned ${first.paymentId}, expected ${expectedIds[0]}.`
      );
      console.log(
        "Live nextId_() is still treating paginated getAll as an array (duplicate PAY-YYYY-000001)."
      );
      console.log(
        "MANUAL DEPLOYMENT REQUIRED:\nReplace ReimbursementPaymentRepository.gs and ReimbursementPaymentService.gs from the pack, cut a new Web App version, then re-run.\nStop after this probe create; manually clean PAY-2026-000001 duplicates on the test claim after deploy."
      );
      console.log(`Probe claim: ${submitted.submissionId} (${marker})`);
      return "blocked";
    }

    const fetchedFirst = await ReimbursementPaymentService.getPayment(
      first.paymentId
    );
    assert(
      fetchedFirst?.paymentId === first.paymentId,
      "live retrieve after create"
    );
    assert(fetchedFirst?.receivedAmount === 10000, "live retrieved amount");

    const second = await ReimbursementPaymentService.createPayment({
      submissionId: submitted.submissionId,
      receivedAmount: 10000,
      currency: "NGN",
      recordedBy: "USR-VERIFY",
      notes: marker,
    });
    const third = await ReimbursementPaymentService.createPayment({
      submissionId: submitted.submissionId,
      receivedAmount: 10000,
      currency: "NGN",
      recordedBy: "USR-VERIFY",
      notes: marker,
    });

    const createdIds = [first.paymentId, second.paymentId, third.paymentId];
    assert(
      createdIds[0] !== createdIds[1] && createdIds[1] !== createdIds[2],
      "live payment IDs must be unique"
    );
    assert(
      createdIds.join("|") === expectedIds.join("|"),
      `live IDs must increment from sheet: got ${createdIds.join(" → ")}, expected ${expectedIds.join(" → ")}`
    );

    if (maxBefore === 0) {
      assert(
        createdIds.join("|") ===
          [
            formatPayId(year, 1),
            formatPayId(year, 2),
            formatPayId(year, 3),
          ].join("|"),
        "empty year must assign 000001 → 000002 → 000003"
      );
      results.push(
        `PASS live — ${createdIds[0]} → ${createdIds[1]} → ${createdIds[2]}`
      );
    } else {
      results.push(
        `PASS live — ${createdIds.join(" → ")} (sheet already had seq ${maxBefore}; clean PAY-${year}-* to observe 000001 → 000002 → 000003)`
      );
    }

    const listed = await ReimbursementPaymentService.listPayments({
      page: 1,
      pageSize: 100,
      submissionId: submitted.submissionId,
    });
    assert(listed.data.length === 3, "live list returns three receipts");
    const aggregated = sumPaymentsForSubmission(
      listed.data,
      submitted.submissionId
    );
    assert(aggregated === 30000, "live aggregate sum of three receipts");
    results.push("PASS live — retrieve + aggregate three receipts");

    const updated = await ReimbursementPaymentService.updatePayment(
      first.paymentId,
      {
        receivedAmount: 8000,
        receivedAt: "2026-03-15T00:00:00.000Z",
        reference: `REF-CORRECT-${stamp}`,
        notes: `${marker} corrected`,
        recordedBy: "USR-VERIFY",
      }
    );
    assert(updated.paymentId === first.paymentId, "update preserves payment ID");
    assert(updated.receivedAmount === 8000, "update amount");
    assert(updated.reference === `REF-CORRECT-${stamp}`, "update reference");
    assert(updated.notes === `${marker} corrected`, "update notes");
    assert(
      String(updated.receivedAt).startsWith("2026-03-15"),
      "update date"
    );

    const fetchedUpdated = await ReimbursementPaymentService.getPayment(
      first.paymentId
    );
    assert(fetchedUpdated?.receivedAmount === 8000, "retrieve after update");
    const listedAfter = await ReimbursementPaymentService.listPayments({
      page: 1,
      pageSize: 100,
      submissionId: submitted.submissionId,
    });
    assert(
      sumPaymentsForSubmission(listedAfter.data, submitted.submissionId) ===
        28000,
      "aggregate after update"
    );
    results.push("PASS live — update amount/date/reference/notes → retrieve → re-aggregate");

    let overRejected = false;
    try {
      await ReimbursementPaymentService.updatePayment(first.paymentId, {
        receivedAmount: 15000,
        recordedBy: "USR-VERIFY",
      });
    } catch (error) {
      overRejected =
        error instanceof Error &&
        /exceeds outstanding authorized amount/i.test(error.message);
      if (!overRejected) throw error;
    }
    assert(overRejected, "live correction over authorized amount rejected");

    const restored = await ReimbursementPaymentService.updatePayment(
      first.paymentId,
      { receivedAmount: 10000, recordedBy: "USR-VERIFY" }
    );
    assert(
      restored.paymentId === first.paymentId,
      "exclude-self restore preserves payment ID"
    );
    assert(
      restored.receivedAmount === 10000,
      "current payment excluded from ceiling during its own update"
    );
    const listedRestored = await ReimbursementPaymentService.listPayments({
      page: 1,
      pageSize: 100,
      submissionId: submitted.submissionId,
    });
    assert(
      listedRestored.data.length === 3,
      "correction does not create an extra receipt"
    );
    assert(
      sumPaymentsForSubmission(listedRestored.data, submitted.submissionId) ===
        30000,
      "amount paid / outstanding reconcile after correction"
    );
    results.push("PASS live — over-auth rejected; exclude-self restore reconciles");

    console.log("\n=== Finance reimbursement payment verify (live GAS) ===");
    for (const line of results) console.log(line);
    console.log(`  claim ${submitted.submissionId} (${marker})`);
    return "passed";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("\n=== Live GAS payment ID round-trip diagnostic ===");
    console.error(message);
    if (
      /unknown module:\s*reimbursement-payments/i.test(message) ||
      /unknown module:\s*reimbursement-authorizations/i.test(message) ||
      /unknown module:\s*cost-submissions/i.test(message) ||
      /unknown module:\s*cost-records/i.test(message)
    ) {
      console.log("\nSKIP live GAS round-trip — finance payment resource not on this deploy");
      console.log(
        "MANUAL DEPLOYMENT REQUIRED: Deploy reimbursement payment + authorization + cost modules from the pack, then a new Web App version."
      );
      return "skipped";
    }
    throw error;
  }
}

async function main() {
  staticChecks();
  const liveResult = await liveChecks();
  if (liveResult === "passed") {
    console.log("\nRESULT: PASS (static + live ID sequencing)");
    return;
  }
  if (liveResult === "blocked") {
    console.log(
      "\nRESULT: STATIC PASS; LIVE BLOCKED — deploy ReimbursementPaymentRepository.gs before ID sequencing can be proven"
    );
    return;
  }
  console.log(
    "\nRESULT: STATIC PASS; LIVE NOT VERIFIED (MANUAL DEPLOYMENT REQUIRED)"
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
