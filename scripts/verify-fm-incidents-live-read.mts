/**
 * FM Phase 2D — READ-ONLY live smoke of the real Incident repository shapes.
 *
 *   NODE_PATH=<dir containing an empty server-only/ stub> \
 *     npx tsx --tsconfig tsconfig.json scripts/verify-fm-incidents-live-read.mts
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

async function main() {
  loadEnvLocal();
  const { createAdminClient } = await import("../src/utils/supabase/admin");
  const { FmIncidentRepository } = await import("../src/modules/incidents/server/FmIncidentRepository");
  const { FmRequestRepository } = await import("../src/modules/requests/server/FmRequestRepository");
  const { FmWorkRepository } = await import("../src/modules/maintenance/server/FmWorkRepository");

  const admin = createAdminClient();
  const { data: org, error } = await admin
    .from("fm_facilities")
    .select("organisation_id")
    .eq("id", "e1a5f579-8bb1-42fb-9fdf-56faaaa1e9e0")
    .single();
  assert(!error && org, "portal facility not readable");
  const orgId = String((org as { organisation_id: string }).organisation_id);

  const before = await admin.from("fm_incidents").select("id", { count: "exact", head: true });
  assert(!before.error, "fm_incidents unreadable");

  const incidents = new FmIncidentRepository(orgId, admin);
  const page = await incidents.listPage({ page: 1, pageSize: 8, status: "all", severity: "all", facilityId: "all" });
  assert(Array.isArray(page.rows) && typeof page.total === "number", "list shape");

  const filtered = await incidents.listPage({
    page: 1,
    pageSize: 100,
    status: "reported",
    severity: "high",
    facilityId: "FAC-0001",
    requiresWorkOrder: true,
    assignedToUserId: "00000000-0000-4000-8000-000000000001",
    search: "pipe, (leak) 50%",
  });
  assert(filtered.total === 0, "filter shape");
  assert((await incidents.listPage({ facilityId: "FAC-NOPE" })).total === 0, "unknown facility → valid empty");
  assert((await incidents.listPage({ assignedToUserId: "USR-0001" })).total === 0, "legacy USR assignee → valid empty");

  assert((await incidents.getByIdOrCode("INC-2099-000000")) === null, "missing code → null");
  assert((await incidents.getByIdOrCode("00000000-0000-4000-8000-000000000001")) === null, "missing uuid → null");
  assert((await incidents.relationsFor([])).size === 0, "relations shape (empty)");
  assert((await incidents.countActiveForProfile("00000000-0000-4000-8000-000000000001")) === 0, "active count shape");
  assert((await incidents.activeByAssetRefs(["AST-NOPE"])).size === 0, "asset workload shape");

  const requests = new FmRequestRepository(orgId, admin);
  const links = await requests.linksFor(["00000000-0000-4000-8000-000000000001"]);
  assert(links.get("00000000-0000-4000-8000-000000000001")?.incidentIds.length === 0, "Request incident derivation shape");

  const work = new FmWorkRepository(orgId, admin);
  assert(Array.isArray(await work.listRows()), "Work list reads after incident_id cutover");
  let rejected = false;
  try {
    await work.resolveIncidentId("INC-2099-000000");
  } catch {
    rejected = true;
  }
  assert(rejected, "Work cannot cite an Incident that does not exist");

  const bridge = await admin.from("fm_request_incident_links").select("id").limit(1);
  assert(bridge.error, "retired bridge table must no longer exist");

  const after = await admin.from("fm_incidents").select("id", { count: "exact", head: true });
  assert(after.count === before.count, "read-only smoke changed row count");
  console.log(`PASS live read-only Incident repository smoke (fm_incidents=${after.count})`);
}

main().catch((error) => {
  console.error("FAIL", error instanceof Error ? error.message : error);
  process.exit(1);
});
