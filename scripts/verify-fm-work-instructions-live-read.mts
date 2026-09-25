/**
 * FM Phase 2E — READ-ONLY live smoke of the real Work Instruction repository shapes.
 *
 *   NODE_PATH=<dir containing an empty server-only/ stub> \
 *     npx tsx --tsconfig tsconfig.json scripts/verify-fm-work-instructions-live-read.mts
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
  const { FmWorkInstructionRepository } = await import("../src/modules/work-orders/server/FmWorkInstructionRepository");
  const { FmWorkRepository } = await import("../src/modules/maintenance/server/FmWorkRepository");
  const { FmIncidentRepository } = await import("../src/modules/incidents/server/FmIncidentRepository");

  const admin = createAdminClient();
  const { data: org, error } = await admin
    .from("fm_facilities")
    .select("organisation_id")
    .eq("id", "e1a5f579-8bb1-42fb-9fdf-56faaaa1e9e0")
    .single();
  assert(!error && org, "portal facility not readable");
  const orgId = String((org as { organisation_id: string }).organisation_id);

  const before = await admin.from("fm_work_instructions").select("id", { count: "exact", head: true });
  assert(!before.error, "fm_work_instructions unreadable");

  const repo = new FmWorkInstructionRepository(orgId, admin);
  const page = await repo.listPage({ page: 1, pageSize: 8, status: "all", priority: "all", facilityId: "all", type: "all", assetId: "all", maintenanceId: "all", assignedToUserId: "all", dueDate: "all", sort: "newest" });
  assert(Array.isArray(page.rows) && typeof page.total === "number", "list shape");

  const filtered = await repo.listPage({
    page: 1,
    pageSize: 100,
    status: "open",
    priority: "high",
    type: "corrective",
    assetId: "00000000-0000-4000-8000-0000000000a1",
    facilityId: "FAC-0001",
    assignedToUserId: "00000000-0000-4000-8000-000000000001",
    dueDate: "next_7_days",
    sort: "title_desc",
    search: "pump, (leak) 50%",
  });
  assert(filtered.total === 0, "filter shape");
  // The table may be populated (migrated historical rows have no due date): derive the expectation from the
  // authoritative table instead of assuming emptiness. No due date is NOT overdue.
  const noDue = await admin.from("fm_work_instructions").select("id", { count: "exact", head: true }).eq("organisation_id", orgId).is("due_at", null);
  assert(!noDue.error, "no_due expectation unreadable");
  // Full register incl. 2025 history (hidden only by default) — this checks the due-date filter.
  assert((await repo.listPage({ dueDate: "no_due", includeHistory: true })).total === (noDue.count ?? 0), "dueDate no_due matches the rows with a NULL due_at");
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);
  const overdue = await admin.from("fm_work_instructions").select("id", { count: "exact", head: true }).eq("organisation_id", orgId).lt("due_at", startOfToday.toISOString());
  assert(!overdue.error, "overdue expectation unreadable");
  assert((await repo.listPage({ dueDate: "overdue" })).total === (overdue.count ?? 0), "dueDate overdue matches only rows with a known past due_at (a NULL due date is never overdue)");
  assert((await repo.listPage({ maintenanceId: "WRK-2099-000000" })).total === 0, "unknown Work filter → valid empty");
  assert((await repo.listPage({ facilityId: "FAC-NOPE" })).total === 0, "unknown facility → valid empty");
  assert((await repo.listPage({ assignedToUserId: "USR-0001" })).total === 0, "legacy USR assignee → valid empty");

  assert((await repo.getByIdOrCode("WO-2099-000000")) === null, "missing code → null");
  assert((await repo.getByIdOrCode("00000000-0000-4000-8000-000000000001")) === null, "missing uuid → null");
  assert((await repo.relationsFor([])).size === 0, "relations shape (empty)");
  assert(Array.isArray(await repo.operationalPictureRows()), "operational picture rows shape");
  assert((await repo.countAssignedForProfile("00000000-0000-4000-8000-000000000001")) === 0, "assigned count shape");
  const load = await repo.activeWorkload({ userIds: ["00000000-0000-4000-8000-000000000001"], assetIds: ["00000000-0000-4000-8000-0000000000a1"] });
  assert(load.byUser.size === 0 && load.byAsset.size === 0, "workload shape");

  let rejected = false;
  try {
    await repo.resolveWork("WRK-2099-000000");
  } catch {
    rejected = true;
  }
  assert(rejected, "a Work Instruction cannot cite a Work that does not exist");

  const work = new FmWorkRepository(orgId, admin);
  assert(Array.isArray(await work.listRows()), "Work list reads (derives instruction codes)");
  assert((await work.activeByAssetIds(["00000000-0000-4000-8000-0000000000a1"])).size === 0, "asset Work workload shape");
  const incidents = new FmIncidentRepository(orgId, admin);
  assert((await incidents.listPage({ page: 1, pageSize: 8 })).total >= 0, "Incident list reads");

  const after = await admin.from("fm_work_instructions").select("id", { count: "exact", head: true });
  assert(after.count === before.count, "read-only smoke changed row count");
  console.log(`PASS live read-only Work Instruction repository smoke (fm_work_instructions=${after.count})`);
}

main().catch((error) => {
  console.error("FAIL", error instanceof Error ? error.message : error);
  process.exit(1);
});
