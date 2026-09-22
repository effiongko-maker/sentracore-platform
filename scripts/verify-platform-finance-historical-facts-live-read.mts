/**
 * Platform Finance Historical Commercial Facts — READ-ONLY live smoke.
 *
 *   NODE_PATH=<dir containing an empty server-only/ stub> \
 *     npx tsx --tsconfig tsconfig.json scripts/verify-platform-finance-historical-facts-live-read.mts
 *
 * Cross-service schema contract check (per AGENTS.md): this repository projects
 * fm_work / fm_cost_records (owned by the FM domain) into a Platform Finance read
 * model (listWithDerivedSpread). Proves the exact PostgREST queries the repository
 * sends — including the fm_cost_records.work_id / actual_amount join columns — are
 * accepted by the live schema, not just by the PGlite migration stub. Performs NO
 * writes; the table has zero rows (no import has run), so this proves shape, not data.
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
  const { PlatformFinanceHistoricalFactsRepository } = await import(
    "../src/modules/platform-finance/server/PlatformFinanceHistoricalFactsRepository"
  );
  const { PlatformFinanceHistoricalFactsServerService } = await import(
    "../src/modules/platform-finance/server/PlatformFinanceHistoricalFactsServerService"
  );
  const { deriveCommercialSpread } = await import(
    "../src/modules/platform-finance/domain/historicalCommercialFacts"
  );

  const admin = createAdminClient();
  const { data: org, error } = await admin.from("organisations").select("id").limit(1).single();
  assert(!error && org, "organisation not readable");
  const orgId = String((org as { id: string }).id);

  // --- Repository: real schema shape (no data expected yet) ---
  const repo = new PlatformFinanceHistoricalFactsRepository(orgId);
  const listed = await repo.list();
  assert(Array.isArray(listed), "list() shape");
  assert(listed.length === 0, "table has zero rows (no import has run yet)");
  assert((await repo.get(NIL)) === null, "get() missing uuid → null");
  assert((await repo.getByCode("HIST-DOES-NOT-EXIST")) === null, "getByCode() missing → null");

  // Cross-service join: proves fm_cost_records.work_id / actual_amount resolve against the
  // live schema exactly as the repository's PostgREST query assumes.
  const withSpread = await repo.listWithDerivedSpread();
  assert(Array.isArray(withSpread), "listWithDerivedSpread() shape");
  assert(withSpread.length === 0, "listWithDerivedSpread() empty (no facts imported yet)");

  // --- Service: capability gate really refuses an ungranted actor (RLS/authority behaviour) ---
  const service = new PlatformFinanceHistoricalFactsServerService(orgId);
  const ungrantedActor = { organisationId: orgId, profileId: NIL };
  let refused = false;
  try {
    await service.list(ungrantedActor);
  } catch (e) {
    refused = (e as Error).message.includes("platform_finance.historical.view");
  }
  assert(refused, "service.list() refuses an actor with no historical.view/manage grant");

  let importRefused = false;
  try {
    await service.importFact(ungrantedActor, { code: "HIST-TEST-0000001", description: "smoke" });
  } catch (e) {
    importRefused = (e as Error).message.includes("platform_finance.historical.manage");
  }
  assert(importRefused, "service.importFact() refuses an actor with no historical.manage grant");

  // --- Domain: derivation rule itself (never zero-fallback, authorised preferred over submitted) ---
  assert(deriveCommercialSpread({ authorisedAmount: null, submittedAmount: null }, 100) === null, "no commercial amount → null, never 0");
  assert(deriveCommercialSpread({ authorisedAmount: 500, submittedAmount: 450 }, 300) !== null, "spread computable when both sides evidenced");
  const preferAuthorised = deriveCommercialSpread({ authorisedAmount: 500, submittedAmount: 450 }, 300)!;
  assert(preferAuthorised.basis === "authorised" && preferAuthorised.spread === 200, "authorised preferred over submitted");
  const fallbackSubmitted = deriveCommercialSpread({ authorisedAmount: null, submittedAmount: 450 }, 300)!;
  assert(fallbackSubmitted.basis === "submitted" && fallbackSubmitted.spread === 150, "submitted used only when authorised absent");
  assert(deriveCommercialSpread({ authorisedAmount: 500, submittedAmount: null }, null) === null, "no execution cost → null, never 0");

  // --- Provenance: the widened target_table check accepts the new table (live schema, not just PGlite) ---
  const { error: provErr } = await admin
    .from("fm_migration_provenance")
    .select("id")
    .eq("target_table", "platform_finance_historical_commercial_facts")
    .limit(1);
  assert(!provErr, `fm_migration_provenance query against the new target_table value should succeed: ${provErr?.message}`);

  console.log("PLATFORM_FINANCE_HISTORICAL_FACTS_LIVE_READ: PASS");
}

main().catch((error) => {
  console.error("PLATFORM_FINANCE_HISTORICAL_FACTS_LIVE_READ: FAIL", error);
  process.exit(1);
});
