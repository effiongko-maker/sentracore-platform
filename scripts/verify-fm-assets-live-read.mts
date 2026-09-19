/**
 * FM Phase 2H — READ-ONLY live smoke of the real Asset repository shapes.
 *
 *   NODE_PATH=<dir containing an empty server-only/ stub> \
 *     npx tsx --tsconfig tsconfig.json scripts/verify-fm-assets-live-read.mts
 *
 * Proves the exact PostgREST queries the server repositories send are accepted
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
const NIL = "00000000-0000-4000-8000-0000000000a1";

async function main() {
  loadEnvLocal();
  const { createAdminClient } = await import("../src/utils/supabase/admin");
  const { FmAssetRepository } = await import("../src/modules/assets/server/FmAssetRepository");
  const { FmIncidentRepository } = await import("../src/modules/incidents/server/FmIncidentRepository");
  const { FmWorkRepository } = await import("../src/modules/maintenance/server/FmWorkRepository");
  const { FmWorkInstructionRepository } = await import("../src/modules/work-orders/server/FmWorkInstructionRepository");

  const admin = createAdminClient();
  const { data: org, error } = await admin.from("fm_facilities").select("organisation_id").limit(1).single();
  assert(!error && org, "facility not readable");
  const orgId = String((org as { organisation_id: string }).organisation_id);

  const repo = new FmAssetRepository(orgId, admin);
  const page = await repo.list({ page: 1, pageSize: 8, sort: "newest" });
  assert(Array.isArray(page.rows) && typeof page.total === "number", "asset list shape");
  for (const sort of ["oldest", "name_asc", "name_desc"] as const) {
    assert(Array.isArray((await repo.list({ page: 1, pageSize: 8, sort })).rows), `sort ${sort}`);
  }
  const filtered = await repo.list({
    page: 1, pageSize: 100, sort: "newest", status: "active", category: "hvac", criticality: "high",
    facilityId: "FAC-NOPE", search: "pump, (main) 50%",
  });
  assert(filtered.total === 0, "unknown facility filter → valid empty");
  assert((await repo.list({ page: 1, pageSize: 8, sort: "newest", facilityId: NIL, search: "unit" })).total === 0, "facility uuid + search shape");
  assert((await repo.get("AST-2099-000000")) === null, "missing code → null");
  assert((await repo.get(NIL)) === null, "missing uuid → null");
  assert((await repo.findId("AST-2099-000000")) === null, "missing → no id");
  assert((await repo.relations([])).size === 0, "relations (empty)");

  assert((await new FmIncidentRepository(orgId, admin).activeByAssetIds([NIL, "AST-1"])).size === 0, "incident asset workload");
  assert((await new FmWorkRepository(orgId, admin).activeByAssetIds([NIL])).size === 0, "work asset workload");
  const wi = await new FmWorkInstructionRepository(orgId, admin).activeWorkload({ userIds: [], assetIds: [NIL] });
  assert(wi.byAsset.size === 0, "work instruction asset workload");
  assert((await new FmWorkInstructionRepository(orgId, admin).listPage({ page: 1, pageSize: 8, assetId: NIL })).total === 0, "WI asset filter (uuid)");

  console.log("FM_ASSETS_LIVE_READ: PASS");
}

main().catch((error) => {
  console.error("FM_ASSETS_LIVE_READ: FAIL", error);
  process.exit(1);
});
