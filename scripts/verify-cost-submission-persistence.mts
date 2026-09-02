/**
 * CostSubmission persistence verification.
 *
 * Static mapping + validation always run.
 * Live GAS round-trip runs when APPS_SCRIPT_URL / .env.local is configured.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-cost-submission-persistence.mts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  COST_SUBMISSION_SHEET_HEADERS,
  FORBIDDEN_COST_SUBMISSION_SHEET_HEADERS,
  costSubmissionToRow,
  mapRemoteCostSubmission,
  rowToCostSubmission,
  validateCostSubmission,
  type CostSubmission,
} from "../src/lib/operational/finance";
import { CostSubmissionService } from "../src/services/finance/CostSubmissionService";

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

function baseSubmission(overrides: Partial<CostSubmission> = {}): CostSubmission {
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

const FORBIDDEN_PERSISTENCE_KEYS = [
  "approvedAmount",
  "approvalStatus",
  "paymentStatus",
  "paidAmount",
  "receivedAmount",
  "authorityRoles",
  "actualAmount",
  "budgetedAmount",
] as const;

function staticChecks() {
  const results: string[] = [];

  assert(COST_SUBMISSION_SHEET_HEADERS.includes("Cost Record IDs"), "Cost Record IDs");
  assert(COST_SUBMISSION_SHEET_HEADERS.includes("Claim Amount"), "Claim Amount");
  assert(COST_SUBMISSION_SHEET_HEADERS.includes("Approval ID"), "Approval ID link");
  assert(COST_SUBMISSION_SHEET_HEADERS.length === 34, "34 columns");
  assert(
    !(COST_SUBMISSION_SHEET_HEADERS as readonly string[]).includes(
      "Approved Amount"
    ),
    "no Approved Amount column"
  );
  for (const forbidden of FORBIDDEN_COST_SUBMISSION_SHEET_HEADERS) {
    assert(
      !(COST_SUBMISSION_SHEET_HEADERS as readonly string[]).includes(forbidden),
      `forbidden header absent: ${forbidden}`
    );
  }
  results.push("PASS schema — COST_SUBMISSIONS headers without approval/payment duplication");

  const draft = baseSubmission();
  const row = costSubmissionToRow(draft);
  const roundTrip = rowToCostSubmission(row);
  assert(roundTrip.submissionId === draft.submissionId, "round-trip submissionId");
  assert(roundTrip.costRecordIds.length === 1, "round-trip costRecordIds");
  assert(roundTrip.status === "draft", "round-trip status");
  results.push("PASS — draft submission row mapping round-trip");

  const multi = baseSubmission({
    submissionId: "SUB-2026-000002",
    costRecordIds: ["COST-2026-000001", "COST-2026-000002", "COST-2026-000003"],
    claimAmount: 920000,
    markup: { markupAmount: 120000 },
    facilityId: "FAC-0001",
    approvalId: "APR-0001",
    submissionPackage: {
      reference: "PKG-2026-01",
      packageType: "cover_sheet",
    },
  });
  const multiRow = costSubmissionToRow(multi);
  assert(
    String(multiRow["Cost Record IDs"]).includes("COST-2026-000002"),
    "multi cost ids serialized"
  );
  const multiMapped = rowToCostSubmission(multiRow);
  assert(multiMapped.costRecordIds.length === 3, "multi cost ids deserialized");
  assert(multiMapped.claimAmount === 920000, "claim amount");
  assert(multiMapped.markup?.markupAmount === 120000, "markup amount");
  assert(multiMapped.approvalId === "APR-0001", "approval link only");
  results.push("PASS — multiple CostRecord references + claim/markup mapping");

  const submitted = baseSubmission({
    status: "submitted",
    submittedAt: "2026-01-16T10:00:00.000Z",
    submittedBy: "USR-002",
    claimAmount: 250000,
  });
  assert(validateCostSubmission(submitted).valid === true, "submitted valid");
  assert(
    rowToCostSubmission(costSubmissionToRow(submitted)).status === "submitted",
    "submitted lifecycle persisted"
  );
  results.push("PASS — submitted lifecycle mapping");

  const queried = baseSubmission({
    status: "queried",
    submittedAt: "2026-01-15T10:00:00.000Z",
    submittedBy: "USR-002",
    queriedAt: "2026-01-20T14:00:00.000Z",
    queryNotes: "Attach cover sheet",
  });
  assert(validateCostSubmission(queried).valid === true, "queried valid");
  results.push("PASS — queried lifecycle mapping");

  const emptySubmitted = baseSubmission({
    costRecordIds: [],
    status: "submitted",
    submittedAt: "2026-01-16T10:00:00.000Z",
    submittedBy: "USR-002",
  });
  assert(validateCostSubmission(emptySubmitted).valid === false, "empty costs rejected");
  results.push("PASS — empty CostRecord references rejected when submitted");

  const badStatus = baseSubmission();
  // @ts-expect-error intentional
  badStatus.status = "approved";
  assert(validateCostSubmission(badStatus).valid === false, "pipeline status rejected");
  results.push("PASS — deprecated pipeline status not valid domain lifecycle");

  const remote = mapRemoteCostSubmission({
    submissionId: "SUB-2026-000010",
    status: "draft",
    currency: "NGN",
    costRecordIds: "COST-2026-000010, COST-2026-000011",
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: "USR-010",
  });
  assert(remote.costRecordIds.length === 2, "remote id list parsed");
  assert(!("approvedAmount" in remote), "no approvedAmount on mapped record");
  results.push("PASS — remote mapping parses Cost Record IDs list");

  const serviceSrc = readFileSync(
    resolve("src/services/finance/CostSubmissionService.ts"),
    "utf8"
  );
  assert(!serviceSrc.includes("ApprovalService"), "no ApprovalService import");
  assert(!serviceSrc.includes("CostRecordService"), "no CostRecordService import");
  for (const key of FORBIDDEN_PERSISTENCE_KEYS) {
    assert(!serviceSrc.includes(`${key}:`), `service has no ${key}`);
  }
  results.push("PASS — persistence service scoped to CostSubmission only");

  const repoSrc = readFileSync(
    resolve("apps-script/CostSubmissionRepository.gs"),
    "utf8"
  );
  assert(repoSrc.includes('"Cost Record IDs"'), "GAS cost record ids column");
  assert(repoSrc.includes("COST_SUBMISSIONS"), "GAS sheet name");
  assert(!repoSrc.includes("Approved Amount"), "GAS no approved amount");
  assert(!repoSrc.includes("Payment Status"), "GAS no payment status");
  assert(repoSrc.includes('return "SUB-"'), "GAS SUB id generation");
  results.push("PASS — Apps Script repository scoped to COST_SUBMISSIONS");

  const routerSrc = readFileSync(
    resolve("apps-script/deployment/ROUTER.gs"),
    "utf8"
  );
  assert(routerSrc.includes('"cost-submissions"'), "router resource registered");
  assert(
    routerSrc.includes("CostSubmissionsController.handle"),
    "router controller wired"
  );
  results.push("PASS — ROUTER registers cost-submissions resource");

  const apiSrc = readFileSync(
    resolve("src/app/api/cost-submissions/route.ts"),
    "utf8"
  );
  assert(apiSrc.includes("cost-submissions"), "api route resource");
  assert(!apiSrc.includes("approve"), "no workflow endpoints");
  assert(!apiSrc.includes("mark-paid"), "no payment endpoints");
  results.push("PASS — Next.js API route exposes persistence proxy only");

  const gasServiceSrc = readFileSync(
    resolve("apps-script/CostSubmissionService.gs"),
    "utf8"
  );
  assert(!gasServiceSrc.includes("SUB-PENDING"), "GAS create omits SUB-PENDING");
  assert(
    gasServiceSrc.includes('if (context === "update")'),
    "GAS submissionId format check scoped to update"
  );
  results.push("PASS — GAS create validation does not inject fake submissionId");

  const createDraft = {
    costRecordIds: ["COST-2026-000001"],
    status: "draft" as const,
    currency: "NGN",
    createdAt: "2026-01-15T09:00:00.000Z",
    createdBy: "USR-001",
  };
  assert(
    validateCostSubmission(createDraft, { serverGeneratedId: true }).valid === true,
    "create payload without submissionId valid"
  );
  assert(
    validateCostSubmission(createDraft).valid === false,
    "create payload requires submissionId without serverGeneratedId"
  );
  assert(
    validateCostSubmission(baseSubmission()).valid === true,
    "update shape requires valid SUB-YYYY-NNNNNN"
  );
  const badUpdateId = baseSubmission();
  badUpdateId.submissionId = "SUB-PENDING";
  assert(validateCostSubmission(badUpdateId).valid === false, "invalid update id fails");
  results.push("PASS — create omits submissionId; update enforces SUB-YYYY-NNNNNN");

  console.log("\n=== CostSubmission persistence verify (static) ===");
  for (const line of results) console.log(line);
}

async function liveChecks(): Promise<"passed" | "skipped"> {
  const url =
    process.env.APPS_SCRIPT_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "";
  if (!url.trim()) {
    console.log("\nSKIP live GAS round-trip — APPS_SCRIPT_URL not configured");
    console.log(
      "MANUAL DEPLOYMENT REQUIRED: Deploy Apps Script v0.8.4 before live verification."
    );
    return "skipped";
  }

  const stamp = Date.now();
  const results: string[] = [];

  try {
    const created = await CostSubmissionService.createCostSubmission({
      costRecordIds: [`COST-VERIFY-${stamp}`],
      status: "draft",
      createdBy: "USR-VERIFY",
      notes: `Persistence verify ${stamp}`,
    });
    assert(created.submissionId.startsWith("SUB-"), "live create id");
    assert(created.status === "draft", "live draft status");
    results.push("PASS live — create draft CostSubmission");

    const fetched = await CostSubmissionService.getCostSubmission(
      created.submissionId
    );
    assert(fetched?.submissionId === created.submissionId, "live getById");
    results.push("PASS live — getById");

    const listed = await CostSubmissionService.listCostSubmissions({
      page: 1,
      pageSize: 5,
      search: String(stamp),
    });
    assert(listed.data.length >= 1, "live list");
    results.push("PASS live — getAll with pagination");

    const updated = await CostSubmissionService.updateCostSubmission(
      created.submissionId,
      {
        claimAmount: 150000,
        periodLabel: `Verify ${stamp}`,
      }
    );
    assert(updated.claimAmount === 150000, "live update claim");
    assert(updated.submissionId === created.submissionId, "live id preserved");
    results.push("PASS live — update preserves Submission ID");

    console.log("\n=== CostSubmission persistence verify (live GAS) ===");
    for (const line of results) console.log(line);
    return "passed";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("\n=== Live GAS round-trip diagnostic ===");
    console.error(message);
    if (/unknown module:\s*cost-submissions/i.test(message)) {
      console.log("\nSKIP live GAS round-trip — cost-submissions not deployed yet");
      console.log(
        "MANUAL DEPLOYMENT REQUIRED:\nDeploy CostSubmissionRepository.gs, CostSubmissionService.gs, CostSubmissionsController.gs, and updated ROUTER.gs from apps-script/deployment/.\nCreate a new Web App version before running live verification."
      );
      return "skipped";
    }
    throw error;
  }
}

async function main() {
  staticChecks();
  const liveResult = await liveChecks();
  console.log(
    liveResult === "passed"
      ? "\nRESULT: PASS"
      : "\nRESULT: STATIC PASS; LIVE NOT VERIFIED (MANUAL DEPLOYMENT REQUIRED)"
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
