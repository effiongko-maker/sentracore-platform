/**
 * Intelligence authority — READ-ONLY live smoke against the linked database.
 *
 *   NODE_PATH=<dir containing an empty server-only/ stub> \
 *     npx tsx --tsconfig tsconfig.json scripts/verify-intelligence-authority-live-read.mts
 *
 * Runs the real loader (real authority reader) and asserts every headline
 * figure reconciles to the authoritative FM tables. Writes nothing.
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
  const { loadOrganisationIntelligence } = await import("../src/lib/intelligence/getOrganisationIntelligence");
  const admin = createAdminClient();
  const { data: org, error } = await admin.from("organisations").select("id").limit(1).single();
  assert(!error && org, "organisation not readable");
  const organisationId = String((org as { id: string }).id);

  const result = await loadOrganisationIntelligence({
    supabase: admin,
    organisationId,
    facilityManagementEnabled: true,
  });
  const { authority } = result.status;
  const ctx = result.operationalContext;
  const c = authority.authoritativeCounts;
  assert(c, "authoritative counts must be readable");

  const { count: facilityCount } = await admin
    .from("fm_facilities").select("id", { count: "exact", head: true }).eq("organisation_id", organisationId);

  assert(ctx.recentWorkCount30d <= c.work, `Work analysed (${ctx.recentWorkCount30d}) exceeds authoritative Work (${c.work})`);
  assert(ctx.recentIncidentCount30d <= c.incidents, "incidents exceed authoritative incidents");
  assert(ctx.workOrdersCreatedCount30d <= c.workInstructions, "work orders exceed authoritative Work Instructions");
  assert(ctx.facilitiesWithRecentActivity <= (facilityCount ?? 0), "Active sites exceed authoritative facilities");
  const authoritativeTotal = c.work + c.workInstructions + c.requests + c.incidents + c.approvals;
  if (authoritativeTotal === 0) {
    assert(authority.state === "no_activity", `empty FM must be no_activity, got ${authority.state}`);
    assert(ctx.recentWorkCount30d === 0 && ctx.highOrCriticalRiskCount === 0 && ctx.facilitiesWithRecentActivity === 0, "empty FM must show zero live counts");
    assert(result.priorities.length === 0 && result.patterns.length === 0 && result.stories.length === 0, "empty FM must yield no insights");
  }

  console.log("PASS live authority reconciliation", JSON.stringify({
    state: authority.state,
    considered: authority.eventsConsidered,
    reconciled: authority.eventsReconciled,
    excluded: authority.eventsExcluded,
    authoritativeCounts: c,
    facilities: facilityCount,
    workAnalysed: ctx.recentWorkCount30d,
    elevatedRisk: ctx.highOrCriticalRiskCount,
    activeSites: ctx.facilitiesWithRecentActivity,
    priorities: result.priorities.length,
  }));
}

main().catch((e) => { console.error("FAIL", e instanceof Error ? e.message : e); process.exit(1); });
