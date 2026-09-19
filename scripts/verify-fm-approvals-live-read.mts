/**
 * FM Phase 2F — READ-ONLY live smoke of the real Approval repository shapes.
 *
 *   NODE_PATH=<dir containing an empty server-only/ stub> \
 *     npx tsx --tsconfig tsconfig.json scripts/verify-fm-approvals-live-read.mts
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
  const { FmApprovalRepository } = await import("../src/modules/approvals/server/FmApprovalRepository");
  const { FmWorkInstructionRepository } = await import("../src/modules/work-orders/server/FmWorkInstructionRepository");

  const admin = createAdminClient();
  const { data: org, error } = await admin
    .from("fm_facilities")
    .select("organisation_id")
    .eq("id", "e1a5f579-8bb1-42fb-9fdf-56faaaa1e9e0")
    .single();
  assert(!error && org, "portal facility not readable");
  const orgId = String((org as { organisation_id: string }).organisation_id);

  const before = await admin.from("fm_approvals").select("id", { count: "exact", head: true });
  assert(!before.error, "fm_approvals unreadable");

  const repo = new FmApprovalRepository(orgId, admin);
  const page = await repo.listPage({ page: 1, pageSize: 8, status: "all", type: "all", facilityId: "all", workOrderId: "all", sort: "newest" });
  assert(Array.isArray(page.rows) && typeof page.total === "number", "list shape");

  const filtered = await repo.listPage({
    page: 1,
    pageSize: 100,
    status: "awaiting_decision",
    type: "variation",
    facilityId: "FAC-0001",
    workOrderId: "WO-2099-000000",
    sort: "title_desc",
    search: "pump, (leak) 50%",
  });
  assert(filtered.total === 0, "filter shape");
  assert((await repo.listPage({ facilityId: "FAC-0001", search: "roof", sort: "oldest" })).total === 0, "facility (via instruction) + search shape");
  assert((await repo.listPage({ facilityId: "FAC-NOPE" })).total === 0, "unknown facility → valid empty");
  assert((await repo.getByIdOrCode("APR-2099-000000")) === null, "missing code → null");
  assert((await repo.getByIdOrCode("00000000-0000-4000-8000-000000000001")) === null, "missing uuid → null");
  assert((await repo.relationsFor([])).size === 0, "relations shape (empty)");
  assert(Array.isArray(await repo.operationalPictureStatuses()), "operational picture shape");
  let rejected = false;
  try {
    await repo.resolveWorkInstruction("WO-2099-000000");
  } catch {
    rejected = true;
  }
  assert(rejected, "an Approval cannot cite a Work Instruction that does not exist");

  const instructions = new FmWorkInstructionRepository(orgId, admin);
  assert((await instructions.listPage({ page: 1, pageSize: 8 })).total >= 0, "Work Instruction list reads (derives approval code)");
  assert((await instructions.relationsFor([])).size === 0, "instruction relations shape");

  const after = await admin.from("fm_approvals").select("id", { count: "exact", head: true });
  assert(after.count === before.count, "read-only smoke changed row count");
  console.log(`PASS live read-only Approval repository smoke (fm_approvals=${after.count})`);
}

main().catch((error) => {
  console.error("FAIL", error instanceof Error ? error.message : error);
  process.exit(1);
});
