/**
 * FM Phase 2J — READ-ONLY live smoke of the real Vendor repository shapes.
 *
 *   NODE_PATH=<dir containing an empty server-only/ stub> \
 *     npx tsx --tsconfig tsconfig.json scripts/verify-fm-vendors-live-read.mts
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
  const { FmVendorRepository } = await import("../src/modules/master-data/server/FmVendorRepository");
  const admin = createAdminClient();
  const { data: org, error } = await admin.from("organisations").select("id").limit(1).single();
  assert(!error && org, "organisation not readable");
  const repo = new FmVendorRepository(String((org as { id: string }).id), admin);

  const page = await repo.list({ page: 1, pageSize: 10 });
  assert(Array.isArray(page.rows) && typeof page.total === "number", "list shape");
  const filtered = await repo.list({ page: 1, pageSize: 100, status: "active", category: "HVAC", search: "cool, (air) 50%" });
  assert(filtered.total === 0, "filter + search shape → valid empty");
  assert((await repo.get("NO-SUCH-CODE")) === null, "missing code → null");
  assert((await repo.get("00000000-0000-4000-8000-0000000000a1")) === null, "missing uuid → null");
  console.log("FM_VENDORS_LIVE_READ: PASS");
}

main().catch((error) => {
  console.error("FM_VENDORS_LIVE_READ: FAIL", error);
  process.exit(1);
});
