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
 * writes. Post-import (152 rows, batch platform-finance-historical-facts-bootstrap-1):
 * asserts against the real imported shape, including deriveCommercialSpread() against
 * genuine linked execution costs.
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

  // --- Repository: real schema shape against the imported population -----------------------------------
  const repo = new PlatformFinanceHistoricalFactsRepository(orgId);
  const listed = await repo.list();
  assert(Array.isArray(listed), "list() shape");
  assert(listed.length === 152, `expected exactly 152 imported historical commercial facts, found ${listed.length}`);
  assert(listed.every((f) => f.recordOrigin === "migrated_historical"), "every row is migrated_historical");
  assert(listed.filter((f) => f.paymentDatetime != null).length === 138, "138 rows carry a parsed payment datetime");
  assert(listed.filter((f) => f.fmWorkId != null).length === 110, "110 rows carry a CERTAIN fm_work_id link");
  assert((await repo.get(NIL)) === null, "get() missing uuid → null");
  assert((await repo.getByCode("HIST-DOES-NOT-EXIST")) === null, "getByCode() missing → null");
  const first = await repo.getByCode("HIST-2026-000001");
  assert(first !== null && first.amountReceived === 23460532.79 && first.description === "Cooporative Offices (WRC)", "HIST-2026-000001 (2025 JOB ORDERS r2, first row processed) amount_received matches source Income exactly");

  // Cross-service join: proves fm_cost_records.work_id / actual_amount resolve against the live schema, and
  // that deriveCommercialSpread() only fires when BOTH sides are genuinely evidenced for the same transaction.
  const withSpread = await repo.listWithDerivedSpread();
  assert(Array.isArray(withSpread), "listWithDerivedSpread() shape");
  assert(withSpread.length === 152, "listWithDerivedSpread() returns every fact, spread computed only where evidenced");
  const spreadRows = withSpread.filter((r) => r.spread != null);
  assert(spreadRows.length === 7, `expected 7 rows with a computable spread (8 Group-A-linked open candidates minus the one with no execution cost evidenced), found ${spreadRows.length}`);
  const a5 = withSpread.find((r) => r.fact.commercialReference === "TRV150");
  assert(a5?.spread != null && a5.spread.basis === "authorised" && Math.abs(a5.spread.spread - (1856159.5 - 987000)) < 0.01, "TRV150 (Digital Park roof leak) derived spread = authorised − execution cost, computed correctly");
  const a3NoSpread = withSpread.find((r) => r.fact.commercialReference?.includes("Invoice 0048"));
  assert(a3NoSpread?.spread == null, "the one Group-A candidate with no evidenced execution cost (Tables/Chairs canteen) has spread=null, never 0");

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
