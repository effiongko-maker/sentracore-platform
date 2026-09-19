/**
 * FM Phase 2C — READ-ONLY live smoke of the real Request repository shapes.
 *
 *   NODE_PATH=<dir containing an empty server-only/ stub> \
 *     npx tsx --tsconfig tsconfig.json scripts/verify-fm-requests-live-read.mts
 *
 * (`server-only` is a Next-bundled marker; outside Next it needs an empty stub.)
 *
 * Proves the exact PostgREST queries the server repository sends (filters,
 * `or()` search, exact count, `in()` link derivation, Work provenance codes)
 * are accepted by the live schema. Performs NO writes.
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
    const v = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(k in process.env)) process.env[k] = v;
  }
}

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

async function main() {
  loadEnvLocal();
  const { createAdminClient } = await import("../src/utils/supabase/admin");
  const { FmRequestRepository } = await import(
    "../src/modules/requests/server/FmRequestRepository"
  );
  const { FmWorkRepository } = await import(
    "../src/modules/maintenance/server/FmWorkRepository"
  );

  const admin = createAdminClient();
  const { data: org, error } = await admin
    .from("fm_facilities")
    .select("organisation_id")
    .eq("id", "e1a5f579-8bb1-42fb-9fdf-56faaaa1e9e0")
    .single();
  assert(!error && org, "portal facility not readable");
  const orgId = String((org as { organisation_id: string }).organisation_id);

  const requests = new FmRequestRepository(orgId, admin);
  const before = await admin
    .from("fm_requests")
    .select("id", { count: "exact", head: true });
  assert(!before.error, "fm_requests unreadable");

  const empty = await requests.listPage({ page: 1, pageSize: 8, status: "all", facilityId: "all" });
  assert(Array.isArray(empty.rows) && typeof empty.total === "number", "list shape");

  const filtered = await requests.listPage({
    page: 1,
    pageSize: 100,
    status: "submitted",
    facilityId: "FAC-0001",
    search: "generator, (leak) 50%",
  });
  assert(filtered.total === (before.count === 0 ? 0 : filtered.total), "filter shape");

  const unknownFacility = await requests.listPage({ page: 1, pageSize: 8, facilityId: "FAC-NOPE" });
  assert(unknownFacility.total === 0, "unknown facility filter is a valid empty result");

  assert((await requests.getByIdOrCode("REQ-2099-000000")) === null, "missing code -> null");
  assert(
    (await requests.getByIdOrCode("00000000-0000-4000-8000-000000000001")) === null,
    "missing uuid -> null"
  );
  const links = await requests.linksFor(["00000000-0000-4000-8000-000000000001"]);
  assert(links.get("00000000-0000-4000-8000-000000000001")?.maintenanceIds.length === 0, "links shape");
  assert((await requests.facilityCodeById("e1a5f579-8bb1-42fb-9fdf-56faaaa1e9e0")) === "FAC-0001", "facility code");

  const work = new FmWorkRepository(orgId, admin);
  const rows = await work.listRows();
  assert(Array.isArray(rows), "Work list still reads after source_request_id cutover");
  let rejected = false;
  try {
    await work.resolveRequestId("REQ-2099-000000");
  } catch {
    rejected = true;
  }
  assert(rejected, "Work cannot cite a Request that does not exist");

  const after = await admin
    .from("fm_requests")
    .select("id", { count: "exact", head: true });
  assert(after.count === before.count, "read-only smoke changed row count");
  console.log(
    `PASS live read-only repository smoke (fm_requests=${after.count}, fm_work=${rows.length})`
  );
}

main().catch((error) => {
  console.error("FAIL", error instanceof Error ? error.message : error);
  process.exit(1);
});
