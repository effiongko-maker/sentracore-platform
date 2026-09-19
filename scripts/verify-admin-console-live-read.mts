/**
 * Admin Console V1 — READ-ONLY live smoke of the real AdminConsoleReader.
 *
 *   NODE_PATH=<dir containing an empty server-only/ stub> \
 *     npx tsx --tsconfig tsconfig.json scripts/verify-admin-console-live-read.mts
 *
 * Proves every Admin Console read shape works against the live schema and
 * returns truthful, internally-consistent data. Performs NO writes.
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
  const { AdminConsoleReader } = await import("../src/modules/platform-admin/server/AdminConsoleReader");
  const { PLATFORM_ADMINISTRABLE_CAPABILITIES } = await import("../src/modules/platform-admin/types");
  const admin = createAdminClient();
  const reader = new AdminConsoleReader(admin);

  const { data: org, error } = await admin.from("organisations").select("id, slug").limit(1).single();
  assert(!error && org, "organisation not readable");
  const orgId = String((org as { id: string }).id);

  const overview = await reader.overview(orgId);
  const people = await reader.listPeople(orgId);
  assert(overview.organisation.id === orgId && overview.modules.length > 0, "overview shape");
  assert(overview.peopleTotal === people.length, "overview people count equals the people list");
  assert(Object.values(overview.peopleByStatus).reduce((a, b) => a + b, 0) === people.length, "status counts sum to the total");
  assert(people.every((p) => p.organisationId === orgId), "tenant scoping");
  assert(people.every((p) => p.capabilities.every((c) => (PLATFORM_ADMINISTRABLE_CAPABILITIES as readonly string[]).includes(c))), "grants are administrable capabilities");

  const detail = await reader.getPerson(orgId, people[0].profileId);
  assert(detail.profileId === people[0].profileId && Array.isArray(detail.financeAccess.capabilities), "person detail shape");
  let missing = false;
  try {
    await reader.getPerson(orgId, "00000000-0000-4000-8000-0000000000aa");
  } catch {
    missing = true;
  }
  assert(missing, "unknown profile must fail, not return empty");

  const modules = await reader.listModules(orgId);
  assert(modules.length >= 5 && modules.every((m) => ["enabled", "disabled", "preparing"].includes(m.status)), "module records");
  assert(Array.isArray(await reader.listFacilities(orgId)), "facilities");

  const page = await reader.listAudit({ organisationId: orgId, limit: 2 });
  assert(page.events.length <= 2 && page.events.every((e) => e.headline && e.actor.name), "audit entries are readable");
  assert(page.events.every((e) => !/[0-9a-f]{8}-[0-9a-f]{4}-/.test(e.headline)), "no raw ids in headlines");
  for (const category of ["people", "access", "modules", "operating_context"] as const) {
    assert(Array.isArray((await reader.listAudit({ organisationId: orgId, category, limit: 1 })).events), `category ${category}`);
  }
  assert(Array.isArray((await reader.listAudit({ organisationId: orgId, profileId: people[0].profileId, limit: 1 })).events), "person filter shape");
  if (page.nextBefore) assert(Array.isArray((await reader.listAudit({ organisationId: orgId, before: page.nextBefore, limit: 1 })).events), "cursor shape");

  let orgMissing = false;
  try {
    await reader.overview("00000000-0000-4000-8000-0000000000bb");
  } catch {
    orgMissing = true;
  }
  assert(orgMissing, "unknown organisation must fail, not return empty");

  console.log("ADMIN_CONSOLE_LIVE_READ: PASS");
}

main().catch((error) => {
  console.error("ADMIN_CONSOLE_LIVE_READ: FAIL", error);
  process.exit(1);
});
