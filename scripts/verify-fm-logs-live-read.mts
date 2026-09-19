/**
 * FM Phase 2K — READ-ONLY live smoke of the real operational-log repository shapes.
 *
 *   NODE_PATH=<dir containing an empty server-only/ stub> \
 *     npx tsx --tsconfig tsconfig.json scripts/verify-fm-logs-live-read.mts
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
  const { FmLogRepository } = await import("../src/modules/operational-logs/server/FmLogRepository");
  const { FM_LOG_SPECS, FM_LOG_RESOURCES, parseLogListParams, FmLogNotFoundError } = await import("../src/modules/operational-logs/server/fmLogDomain");
  const admin = createAdminClient();
  const { data: org, error } = await admin.from("organisations").select("id").limit(1).single();
  assert(!error && org, "organisation not readable");
  const orgId = String((org as { id: string }).id);

  for (const resource of FM_LOG_RESOURCES) {
    const spec = FM_LOG_SPECS[resource];
    const repo = new FmLogRepository(spec, orgId, admin);
    const base = await repo.list(parseLogListParams(spec, { page: 1, pageSize: 8 }));
    assert(Array.isArray(base.rows) && typeof base.total === "number", `${resource}: list shape`);
    for (const sort of ["oldest", "date_asc", "date_desc", ...Object.keys(spec.extraSorts ?? {})]) {
      assert(Array.isArray((await repo.list(parseLogListParams(spec, { page: 1, pageSize: 8, sort }))).rows), `${resource}: sort ${sort}`);
    }
    const filtered = await repo.list(
      parseLogListParams(spec, {
        page: 1, pageSize: 100, search: "pump, (main) 50%", dateFrom: "2000-01-01", dateTo: "2099-12-31", facilityId: "FAC-NOPE", status: "completed",
        generator: "G", meter: "M", generatorId: "GEN", wasteType: "General", nextDueFrom: "2000-01-01", nextDueTo: "2099-12-31", itemId: "ITEM-NOPE", itemName: "soap",
      })
    );
    assert(filtered.total === 0, `${resource}: filters → valid empty`);
    let missing = false;
    try {
      await repo.getById("NOPE-2099-000000");
    } catch (e) {
      missing = e instanceof FmLogNotFoundError;
    }
    assert(missing, `${resource}: missing record is a not-found error, not an empty object`);
    let missingUuid = false;
    try {
      await repo.getById(NIL);
    } catch (e) {
      missingUuid = e instanceof FmLogNotFoundError;
    }
    assert(missingUuid, `${resource}: missing uuid`);
  }
  console.log("FM_LOGS_LIVE_READ: PASS");
}

main().catch((error) => {
  console.error("FM_LOGS_LIVE_READ: FAIL", error);
  process.exit(1);
});
