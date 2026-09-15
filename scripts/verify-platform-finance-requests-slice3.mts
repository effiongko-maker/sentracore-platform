/**
 * Platform Finance — Financial Requests Slice 3 (API boundary) verification.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-platform-finance-requests-slice3.mts
 *
 * Static checks always run.
 * Unauthenticated handler checks run without inventing credentials.
 * Authenticated end-to-end API calls are SKIPPED without a real session cookie.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { GET, POST } from "../src/app/api/platform-finance/requests/route";

type CheckStatus = "PASS" | "FAIL" | "SKIPPED";
type CheckResult = { name: string; status: CheckStatus; detail?: string };

const ROUTE =
  "src/app/api/platform-finance/requests/route.ts";
const CLIENT =
  "src/services/platform-finance/PlatformFinanceRequestsService.ts";
const SERVICE =
  "src/modules/platform-finance/server/PlatformFinanceRequestsServerService.ts";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function readSrc(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

function push(
  results: CheckResult[],
  name: string,
  status: CheckStatus,
  detail?: string
) {
  results.push({ name, status, detail });
  console.log(`${status} ${name}${detail ? ` — ${detail}` : ""}`);
}

function collectTsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectTsFiles(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const EXPECTED_ACTIONS = [
  "getRequest",
  "listMyRequests",
  "listReviewQueue",
  "listApprovalQueue",
  "createRequest",
  "updateDraftRequest",
  "submitRequest",
  "startRequestReview",
  "queryRequest",
  "resubmitRequest",
  "sendRequestToCeo",
  "approveRequest",
  "partiallyApproveRequest",
  "rejectRequest",
] as const;

const ACTION_TO_SERVICE: Record<(typeof EXPECTED_ACTIONS)[number], string> = {
  getRequest: "getRequest",
  listMyRequests: "listMyRequests",
  listReviewQueue: "listReviewQueue",
  listApprovalQueue: "listApprovalQueue",
  createRequest: "createRequest",
  updateDraftRequest: "updateDraftRequest",
  submitRequest: "submitRequest",
  startRequestReview: "startRequestReview",
  queryRequest: "queryRequest",
  resubmitRequest: "resubmitRequest",
  sendRequestToCeo: "sendRequestToCeo",
  approveRequest: "approveRequest",
  partiallyApproveRequest: "partiallyApproveRequest",
  rejectRequest: "rejectRequest",
};

function runStatic(results: CheckResult[]) {
  try {
    assert(existsSync(resolve(ROUTE)), "route missing");
    assert(existsSync(resolve(CLIENT)), "client missing");
    const route = readSrc(ROUTE);
    const client = readSrc(CLIENT);
    const service = readSrc(SERVICE);

    for (const action of EXPECTED_ACTIONS) {
      assert(route.includes(`"${action}"`) || route.includes(`case "${action}"`), `route action ${action}`);
      assert(client.includes(ACTION_TO_SERVICE[action]), `client ${action}`);
      assert(service.includes(`async ${ACTION_TO_SERVICE[action]}`), `service ${action}`);
    }

    assert(!route.includes("updateRequestStatus"), "no generic status action");
    assert(
      !/\.from\(\s*["']finance_requests["']\s*\)\s*\.update/i.test(route),
      "route must not mutate finance_requests"
    );
    assert(
      !/\.from\(\s*["']finance_requests["']\s*\)\s*\.insert/i.test(route),
      "route must not insert finance_requests"
    );
    assert(
      route.includes("PlatformFinanceRequestsServerService"),
      "uses server service"
    );
    assert(
      route.includes("requirePlatformFinanceAccess"),
      "uses finance access helper"
    );
    assert(
      !route.includes("if status ===") && !route.includes('status === "under_review"'),
      "no workflow branching in route"
    );
    assert(
      route.includes("sanitizeClientMessage") ||
        route.includes("finance_request_"),
      "error sanitization present"
    );
    push(results, "static.route_action_map", "PASS");
  } catch (e) {
    push(results, "static.route_action_map", "FAIL", (e as Error).message);
  }

  try {
    const route = readSrc(ROUTE);
    assert(
      route.includes("FINANCIAL_REQUEST_CAPABILITIES.create"),
      "create cap"
    );
    assert(
      route.includes("FINANCIAL_REQUEST_CAPABILITIES.review"),
      "review cap"
    );
    assert(
      route.includes("FINANCIAL_REQUEST_CAPABILITIES.approve"),
      "approve cap"
    );
    assert(
      route.includes("FINANCIAL_REQUEST_CAPABILITIES.view_own"),
      "view_own cap"
    );
    assert(!route.includes("requester_profile_id"), "no client requester authority");
    assert(
      !/organisation_id:\s*input/i.test(route) &&
        !/organisationId:\s*String\(input/i.test(route),
      "no client organisation authority"
    );
    push(results, "static.auth_capabilities", "PASS");
  } catch (e) {
    push(results, "static.auth_capabilities", "FAIL", (e as Error).message);
  }

  try {
    const route = readSrc(ROUTE);
    assert(route.includes("return 401") || route.includes('code === "UNAUTHENTICATED"'), "401");
    assert(route.includes("return 403") || route.includes("FORBIDDEN"), "403");
    assert(route.includes("return 404"), "404");
    assert(route.includes("return 409"), "409");
    assert(route.includes("return 422"), "422");
    push(results, "static.error_status_map", "PASS");
  } catch (e) {
    push(results, "static.error_status_map", "FAIL", (e as Error).message);
  }

  try {
    assert(!existsSync(resolve("src/app/api/finance")), "no /api/finance");
    assert(
      !existsSync(resolve("src/app/api/financial-requests")),
      "no /api/financial-requests"
    );
    const uiDirs = [
      "src/app/(app)/platform-finance/requests",
      "src/modules/platform-finance/components/FinancialRequest",
    ];
    for (const dir of uiDirs) {
      assert(!existsSync(resolve(dir)), `no UI path ${dir}`);
    }
    // Slice 1/2 migrations untouched by this slice (file presence only)
    assert(
      existsSync(
        resolve(
          "supabase/migrations/20260914200000_finance_requests_foundation.sql"
        )
      ),
      "slice1 foundation migration must remain"
    );
    assert(
      existsSync(
        resolve(
          "supabase/migrations/20260914210000_finance_requests_transitions.sql"
        )
      ),
      "slice2 transitions migration must remain"
    );
    push(results, "static.scope_no_ui_no_parallel_api", "PASS");
  } catch (e) {
    push(results, "static.scope_no_ui_no_parallel_api", "FAIL", (e as Error).message);
  }

  try {
    const apiRoot = resolve("src/app/api/platform-finance");
    for (const file of collectTsFiles(apiRoot)) {
      const src = readFileSync(file, "utf8");
      assert(
        !src.includes("updateRequestStatus"),
        `no updateRequestStatus in ${file}`
      );
    }
    push(results, "static.no_generic_status_endpoint", "PASS");
  } catch (e) {
    push(results, "static.no_generic_status_endpoint", "FAIL", (e as Error).message);
  }
}

async function runHandlers(results: CheckResult[]) {
  try {
    const getRes = await GET();
    const getJson = (await getRes.json()) as {
      success?: boolean;
      code?: string;
      message?: string;
    };
    assert(getRes.status === 401, `GET expected 401 got ${getRes.status}`);
    assert(getJson.success === false, "GET success false");
    assert(
      getJson.code === "UNAUTHENTICATED" ||
        /signed in|unauthenticat/i.test(getJson.message ?? ""),
      "GET unauthenticated code/message"
    );
    push(results, "handler.get_unauthenticated", "PASS", `status=${getRes.status}`);
  } catch (e) {
    push(results, "handler.get_unauthenticated", "FAIL", (e as Error).message);
  }

  try {
    const postRes = await POST(
      new Request("http://localhost/api/platform-finance/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "createRequest", input: {} }),
      })
    );
    const postJson = (await postRes.json()) as {
      success?: boolean;
      code?: string;
      message?: string;
    };
    assert(postRes.status === 401, `POST expected 401 got ${postRes.status}`);
    assert(postJson.success === false, "POST success false");
    push(results, "handler.post_unauthenticated", "PASS", `status=${postRes.status}`);
  } catch (e) {
    push(results, "handler.post_unauthenticated", "FAIL", (e as Error).message);
  }

  try {
    const postRes = await POST(
      new Request("http://localhost/api/platform-finance/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
    );
    // Unauthenticated may win before missing action, or missing action 400
    assert(
      postRes.status === 401 || postRes.status === 400,
      `expected 401/400 got ${postRes.status}`
    );
    push(
      results,
      "handler.post_missing_action_or_auth",
      "PASS",
      `status=${postRes.status}`
    );
  } catch (e) {
    push(
      results,
      "handler.post_missing_action_or_auth",
      "FAIL",
      (e as Error).message
    );
  }

  try {
    const postRes = await POST(
      new Request("http://localhost/api/platform-finance/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateRequestStatus",
          input: { status: "approved" },
        }),
      })
    );
    const json = (await postRes.json()) as { message?: string };
    assert(
      postRes.status === 401 || postRes.status === 400,
      `status ${postRes.status}`
    );
    if (postRes.status === 400) {
      assert(
        /unknown action/i.test(json.message ?? ""),
        "unknown action for status patch"
      );
    }
    push(results, "handler.rejects_generic_status_action", "PASS");
  } catch (e) {
    push(
      results,
      "handler.rejects_generic_status_action",
      "FAIL",
      (e as Error).message
    );
  }

  push(
    results,
    "handler.authenticated_e2e",
    "SKIPPED",
    "no authenticated session cookie available; not inventing credentials"
  );
}

async function main() {
  const results: CheckResult[] = [];
  console.log("=== Financial Requests Slice 3 (API) verification ===\n");
  console.log("--- static ---");
  runStatic(results);
  console.log("\n--- handlers ---");
  await runHandlers(results);

  const pass = results.filter((r) => r.status === "PASS").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  const skipped = results.filter((r) => r.status === "SKIPPED").length;
  console.log(`\n${pass} PASS / ${fail} FAIL / ${skipped} SKIPPED`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
