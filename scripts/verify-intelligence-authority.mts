/**
 * Intelligence authority verification (rollback-safe: in-memory only, no DB writes).
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-intelligence-authority.mts
 *
 * Proves that Intelligence reconciles with authoritative FM records:
 * orphaned/legacy ledger events cannot create live Work, Active sites,
 * incidents or risk counts; failure is not zero; the UI cannot claim "live"
 * without evidence; organisations are isolated.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadOrganisationIntelligence,
  type AuthorityLoader,
} from "../src/lib/intelligence/getOrganisationIntelligence";
import {
  emptyAuthorityIndex,
  reconcileEvents,
  type AuthoritySnapshot,
} from "../src/lib/intelligence/authority/reconcileEvents";
import { presentAuthority, statValue } from "../src/modules/intelligence/view-model/authorityPresentation";
import { buildBriefingViewModel } from "../src/modules/intelligence/view-model/buildBriefingViewModel";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}
const readSrc = (p: string) => readFileSync(resolve(p), "utf8");

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";
const FAC = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WORK = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const WORK_OTHER_ORG = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const NOW = new Date("2026-09-20T12:00:00.000Z");

type Row = Record<string, unknown>;
let seq = 0;
const eid = () => `e0000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

function event(over: Partial<Row> & { event_type: string }): Row {
  return {
    id: eid(),
    organisation_id: ORG,
    entity_type: "maintenance_request",
    entity_id: null,
    occurred_at: "2026-09-15T10:00:00.000Z",
    created_at: "2026-09-15T10:00:00.000Z",
    data: {},
    ...over,
  };
}

/** Minimal chainable, awaitable fake of the query-builder calls the loader makes. */
function fakeSupabase(tables: Record<string, Row[]>): SupabaseClient {
  return {
    from(table: string) {
      const filters: Array<(r: Row) => boolean> = [];
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), builder),
        in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), builder),
        gte: (c: string, v: string) => (filters.push((r) => String(r[c]) >= v), builder),
        lte: (c: string, v: string) => (filters.push((r) => String(r[c]) <= v), builder),
        order: () => builder,
        then: (resolveFn: (v: unknown) => unknown) =>
          resolveFn({ data: (tables[table] ?? []).filter((r) => filters.every((f) => f(r))), error: null }),
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

function snapshot(populate: (i: ReturnType<typeof emptyAuthorityIndex>) => void, counts?: Partial<AuthoritySnapshot["counts"]>): AuthoritySnapshot {
  const index = emptyAuthorityIndex(ORG);
  populate(index);
  const c = { work: 0, workInstructions: 0, requests: 0, incidents: 0, approvals: 0, ...counts };
  return { index, counts: c };
}

const loaderOf = (s: AuthoritySnapshot): AuthorityLoader => async () => s;

const HIGH_RISK = {
  status: "succeeded",
  summary: "risk",
  data: { riskLevel: "critical" },
};

async function run(tables: Record<string, Row[]>, loadAuthority: AuthorityLoader) {
  return loadOrganisationIntelligence({
    supabase: fakeSupabase(tables),
    organisationId: ORG,
    facilityManagementEnabled: true,
    now: NOW,
    loadAuthority,
  });
}

async function main() {
  const out: string[] = [];
  const pass = (m: string) => out.push(`PASS ${m}`);

  // ── Legacy ledger residue: display-code identities, verifier facilities ──
  const orphanWork = Array.from({ length: 6 }, (_, i) =>
    event({
      event_type: "facility.maintenance_requested",
      entity_id: `MNT-2026-00062${i}`,
      data: { facilityId: `FAC-VERIFY-V1${i}`, maintenanceId: `MNT-2026-00062${i}` },
    })
  );
  const orphanWo = event({
    event_type: "facility.work_order_created",
    entity_type: "work_order",
    entity_id: "WO-2026-000077",
    data: { facilityId: "FAC-0001" },
  });
  const orphanUuidNoRecord = event({
    event_type: "facility.maintenance_requested",
    entity_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", // canonical UUID, no such record
    data: { facilityId: "FAC-GHOST" },
  });
  const orphanIncident = event({
    event_type: "facility.incident_reported",
    entity_type: "incident",
    entity_id: "INC-2026-000001",
    data: { facilityId: "FAC-V181" },
  });
  const legacy = [...orphanWork, orphanWo, orphanUuidNoRecord, orphanIncident];
  const legacyRuns = [...orphanWork, orphanIncident].map((e) => ({
    id: eid(),
    organisation_id: ORG,
    operational_event_id: e.id,
    action_key: "facility.assess_incident_risk",
    status: "succeeded",
    result: HIGH_RISK,
    created_at: "2026-09-15T10:01:00.000Z",
    completed_at: "2026-09-15T10:01:00.000Z",
  }));

  // 3 + 1 + 2 + 5: authoritative FM is empty (healthy), ledger is orphan-only.
  const emptyAuthority = snapshot(() => undefined);
  {
    const result = await run(
      { operational_events: legacy, action_runs: legacyRuns, recommendation_decisions: [] },
      loaderOf(emptyAuthority)
    );
    const ctx = result.operationalContext;
    assert(ctx.recentWorkCount30d === 0, "1: orphaned events created live Work counts");
    assert(ctx.workOrdersCreatedCount30d === 0 && ctx.maintenanceRequestedCount30d === 0, "1: orphaned lifecycle counts");
    pass("1 orphaned operational_events cannot create live Work counts");
    assert(ctx.facilitiesWithRecentActivity === 0, "2: verifier facility ids created Active sites");
    pass("2 verifier facility IDs (FAC-VERIFY-*, FAC-V*, FAC-GHOST) cannot create Active sites");
    assert(result.status.authority.state === "no_activity", "3: healthy empty authority must be no_activity");
    assert(result.status.state !== "unavailable", "3: empty is not unavailable");
    assert(result.priorities.length === 0 && result.patterns.length === 0 && result.stories.length === 0, "3: no insights from residue");
    assert(ctx.highOrCriticalRiskCount === 0 && ctx.criticalRiskCount === 0 && ctx.recentIncidentCount30d === 0, "7: analytical outcomes created live incidents/risk");
    pass("3 authoritative empty FM produces a truthful no-activity state");
    pass("5 events for nonexistent entities (display codes, unknown UUIDs) are excluded");
    pass("7 analytical outcomes (action_runs) cannot create live incidents/work independently");
    assert(result.status.authority.eventsExcluded === legacy.length, `ledger events must be excluded logically, got ${result.status.authority.eventsExcluded}`);
    pass("4b legacy ledger rows are excluded logically, never deleted or mutated");
    const pres = presentAuthority(result.status.authority);
    assert(!pres.live && !/live/i.test(pres.label), "9: no_activity must not claim live");
    pass("9a UI cannot claim Live intelligence for a no-activity result");
  }

  // ── Legitimate authoritative entity contributes ──────────────────────────
  const legit = snapshot((i) => {
    i.facilities.set(FAC, { id: FAC, code: "FAC-0001" });
    i.records.work.set(WORK, { id: WORK, code: "MNT-2026-000900", facilityId: FAC });
  }, { work: 1 });
  const legitEvent = event({
    event_type: "facility.maintenance_requested",
    entity_id: WORK,
    data: { facilityId: "FAC-STALE-CODE", maintenanceId: "MNT-OLD", assetId: "AST-FAKE" },
  });
  const legitRun = {
    id: eid(),
    organisation_id: ORG,
    operational_event_id: legitEvent.id,
    action_key: "facility.assess_incident_risk",
    status: "succeeded",
    result: { status: "succeeded", summary: "r", data: { riskLevel: "high" } },
    created_at: "2026-09-15T10:01:00.000Z",
    completed_at: "2026-09-15T10:01:00.000Z",
  };
  {
    const result = await run(
      {
        operational_events: [...legacy, legitEvent],
        action_runs: [...legacyRuns, legitRun],
        recommendation_decisions: [],
      },
      loaderOf(legit)
    );
    const ctx = result.operationalContext;
    assert(ctx.recentWorkCount30d === 1, `4: legit Work must count once, got ${ctx.recentWorkCount30d}`);
    assert(ctx.facilitiesWithRecentActivity === 1, "4/6: Active sites must be the one real facility");
    assert(ctx.highOrCriticalRiskCount === 1, "4: legit risk outcome contributes; orphan critical outcomes do not");
    assert(ctx.criticalRiskCount === 0, "6: orphan critical outcomes leaked");
    assert(result.status.authority.state === "live", "4: authority must be live");
    assert(result.status.authority.eventsReconciled === 1, "reconciled count");
    assert(result.status.authority.eventsExcluded === legacy.length, "excluded count");
    pass("4 a legitimate authoritative entity contributes to Intelligence");
    pass("6 current counts reconcile to authoritative domains (1 Work, 1 site, 1 elevated risk)");
    const pres = presentAuthority(result.status.authority);
    assert(pres.live && pres.showStats, "live state may claim live");
    // event-derived facility is the authoritative code, not the stale event string
    const reconciled = reconcileEvents([legitEvent as never], legit.index);
    const projected = reconciled.kept[0] as unknown as { data: Record<string, unknown>; entity_id: string };
    assert(projected.data.facilityId === "FAC-0001", "facility derived from the authoritative row");
    assert(projected.data.assetId === null, "unresolved asset reference dropped");
    assert(projected.data.entityUuid === WORK && projected.entity_id === "MNT-2026-000900", "identity from authoritative record");
    assert(legitEvent.entity_id === WORK, "source event not mutated");
    pass("6b facility/asset/identity are derived from authoritative rows, not event strings");
  }

  // ── Duplicate events for one Work count once ─────────────────────────────
  {
    const dup = { ...legitEvent, id: eid() };
    const result = await run(
      { operational_events: [legitEvent, dup], action_runs: [legitRun], recommendation_decisions: [] },
      loaderOf(legit)
    );
    assert(result.operationalContext.recentWorkCount30d === 1, "duplicate ledger rows must not inflate Work analysed");
    pass("6c Work analysed counts distinct authoritative Work, not ledger rows");
  }

  // ── Failure is not zero ──────────────────────────────────────────────────
  {
    const result = await run(
      { operational_events: [legitEvent], action_runs: [legitRun], recommendation_decisions: [] },
      async () => {
        throw new Error("fm_work unreadable");
      }
    );
    assert(result.status.state === "unavailable", "8: failed authority must be unavailable");
    assert(result.status.authority.state === "unavailable" && result.status.authority.authoritativeCounts === null, "8: counts must be null, not zero");
    const pres = presentAuthority(result.status.authority);
    assert(!pres.live && !pres.showStats && statValue(pres, 0) === "—", "8: unavailable must not render zero");
    pass("8 failed authoritative source is unavailable — never zero, never live");
  }

  // ── history_insufficient: authoritative work exists, no reconciled history ─
  {
    const result = await run(
      { operational_events: legacy, action_runs: legacyRuns, recommendation_decisions: [] },
      loaderOf(snapshot(() => undefined, { work: 3 }))
    );
    assert(result.status.authority.state === "history_insufficient", "authoritative activity without reconciled history");
    assert(!presentAuthority(result.status.authority).live, "must not claim live");
    pass("9b authoritative activity without reconciled history is 'history insufficient', not live");
  }

  // ── Unreconciled input can never claim live ──────────────────────────────
  {
    const { assembleOrganisationIntelligence } = await import("../src/lib/intelligence/getOrganisationIntelligence");
    const raw = assembleOrganisationIntelligence({
      windowFrom: "2026-08-21T00:00:00.000Z",
      windowTo: NOW.toISOString(),
      facilityManagementEnabled: true,
      workEvents: [],
      incidentEvents: [],
      signalRunsByEventId: new Map(),
      riskRunsByEventId: new Map(),
      patternRuns: [],
      decisions: [],
    });
    assert(raw.status.authority.state === "unavailable", "assemble without authority evidence must not be live");
    assert(!presentAuthority(raw.status.authority).live, "no live claim without evidence");
    assert(!readSrc("src/modules/intelligence/experience/reference/ReferenceHero.tsx").includes("Live intelligence"), "hard-coded ReferenceHero claim removed");
    assert(!readSrc("src/modules/intelligence/components/InsightBriefingViews.tsx").includes("Live intelligence"), "hard-coded InsightHero claim removed");
    assert(!readSrc("src/modules/intelligence/components/InsightBriefingViews.tsx").includes("Updated just now"), "hard-coded freshness removed");
    const vm = buildBriefingViewModel(raw);
    assert(vm.authority.state === "unavailable", "view model carries authority");
    pass("9c the UI cannot claim 'Live intelligence' unless authority is established");
  }

  // ── Organisation isolation ───────────────────────────────────────────────
  {
    const foreign = event({
      organisation_id: OTHER_ORG,
      event_type: "facility.maintenance_requested",
      entity_id: WORK_OTHER_ORG,
      data: { facilityId: "FAC-0001" },
    });
    const idx = emptyAuthorityIndex(ORG);
    idx.facilities.set(FAC, { id: FAC, code: "FAC-0001" });
    idx.records.work.set(WORK_OTHER_ORG, { id: WORK_OTHER_ORG, code: "MNT-X", facilityId: FAC });
    const { kept, summary } = reconcileEvents([foreign as never], idx);
    assert(kept.length === 0 && summary.byReason.wrong_organisation === 1, "10: cross-tenant event must be excluded");
    // the loader itself scopes every read to the session organisation
    const tables = { operational_events: [foreign, legitEvent], action_runs: [], recommendation_decisions: [] };
    const result = await run(tables, loaderOf(legit));
    assert(result.status.authority.eventsConsidered === 1, "10: foreign-org events are never even read");
    pass("10 organisation isolation holds (foreign events excluded and never loaded)");
  }

  // ── Source-level guarantees ──────────────────────────────────────────────
  {
    const loader = readSrc("src/lib/intelligence/authority/loadAuthoritySnapshot.ts");
    assert(loader.includes('import "server-only"'), "authority loader is server-only");
    assert((loader.match(/\.eq\("organisation_id", organisationId\)/g) ?? []).length >= 3, "every authority read is organisation-scoped");
    assert(!/insert\(|update\(|upsert\(|delete\(/.test(loader), "authority loader is read-only");
    const main = readSrc("src/lib/intelligence/getOrganisationIntelligence.ts");
    assert(main.includes("reconcileEvents(rawWorkEvents"), "loader reconciles before analysis");
    assert(main.includes("rootEventIds.has(d.operational_event_id)"), "decisions gated on reconciled root events");
    assert(!/appsScript|spreadsheet/i.test(main), "no Sheet-era source");
    pass("authority loader is server-only, read-only and organisation-scoped; no Sheet-era source");
  }

  console.log(out.join("\n"));
  console.log("VERIFY_INTELLIGENCE_AUTHORITY: PASS");
}

main().catch((error) => {
  console.error("FAIL", error instanceof Error ? error.message : error);
  process.exit(1);
});
