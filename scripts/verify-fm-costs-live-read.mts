/**
 * FM Phase 2G — READ-ONLY live smoke of the real Cost repository shapes.
 *
 *   NODE_PATH=<dir containing an empty server-only/ stub> \
 *     npx tsx --tsconfig tsconfig.json scripts/verify-fm-costs-live-read.mts
 *
 * Proves the exact PostgREST queries the server repository sends are accepted
 * by the live schema. Performs NO writes.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const path = resolve(".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    if (!(k in process.env)) process.env[k] = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, "");
  }
}
function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

async function main() {
  loadEnvLocal();
  const { createAdminClient } = await import("../src/utils/supabase/admin");
  const { FmCostRepository } = await import("../src/modules/finance/server/FmCostRepository");

  const admin = createAdminClient();
  const { data: org, error } = await admin
    .from("fm_facilities")
    .select("organisation_id")
    .eq("id", "e1a5f579-8bb1-42fb-9fdf-56faaaa1e9e0")
    .single();
  assert(!error && org, "portal facility not readable");
  const orgId = String((org as { organisation_id: string }).organisation_id);
  const repo = new FmCostRepository(orgId, admin);

  const costs = await repo.listCosts({ page: 1, pageSize: 8 });
  assert(Array.isArray(costs.rows) && typeof costs.total === "number", "cost list shape");
  const filtered = await repo.listCosts({
    page: 1, pageSize: 100, category: "materials", reimbursability: "reimbursable",
    facilityId: "FAC-0001", workId: "WRK-2099-000000", workOrderId: "WO-2099-000000", search: "pump, (leak) 50%",
  });
  assert(filtered.total === 0, "cost filter shape → valid empty");
  assert((await repo.listCosts({ page: 1, pageSize: 8, facilityId: "FAC-NOPE" })).total === 0, "unknown facility → valid empty");
  assert((await repo.getCost("COST-2099-000000")) === null, "missing cost code → null");
  assert((await repo.getCost("00000000-0000-4000-8000-000000000001")) === null, "missing cost uuid → null");
  assert((await repo.costRelations([])).size === 0, "cost relations (empty)");
  assert((await repo.lockingSubmissionCode("00000000-0000-4000-8000-000000000001")) === null, "lock lookup → null");

  const subs = await repo.listSubmissions({ page: 1, pageSize: 8 });
  assert(Array.isArray(subs.rows) && typeof subs.total === "number", "submission list shape");
  const subFiltered = await repo.listSubmissions({
    page: 1, pageSize: 100, status: "submitted", facilityId: "FAC-0001", approvalId: "APR-2099-000000", search: "period, (Q1) 50%",
  });
  assert(subFiltered.total === 0, "submission filter shape → valid empty");
  assert((await repo.getSubmission("SUB-2099-000000")) === null, "missing submission → null");
  assert((await repo.submissionRelations([])).size === 0, "submission relations (empty)");
  assert((await repo.getAuthorizationForSubmission("SUB-2099-000000")) === null, "no claim → null authorization");

  const auths = await repo.listAuthorizations({ page: 1, pageSize: 8 });
  assert(Array.isArray(auths.rows) && typeof auths.total === "number", "authorization list shape");
  assert((await repo.listAuthorizations({ page: 1, pageSize: 8, submissionId: "SUB-2099-000000", search: "ref" })).total === 0, "authorization filter shape");
  assert((await repo.getAuthorization("AUTH-2099-000000")) === null, "missing authorization → null");

  const pays = await repo.listPayments({ page: 1, pageSize: 8 });
  assert(Array.isArray(pays.rows) && typeof pays.total === "number", "payment list shape");
  assert((await repo.listPayments({ page: 1, pageSize: 8, submissionId: "SUB-2099-000000", search: "ref" })).total === 0, "payment filter shape");
  assert((await repo.getPayment("PAY-2099-000000")) === null, "missing payment → null");

  let rejected = false;
  try {
    await repo.resolveFacilityId("FAC-NOPE");
  } catch {
    rejected = true;
  }
  assert(rejected, "unknown facility reference must be rejected, not treated as empty");

  console.log("FM_COSTS_LIVE_READ: PASS");
}

main().catch((error) => {
  console.error("FM_COSTS_LIVE_READ: FAIL", error);
  process.exit(1);
});
