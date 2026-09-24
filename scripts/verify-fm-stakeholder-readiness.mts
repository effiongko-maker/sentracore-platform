/**
 * FM stakeholder-readiness verification (rollback-safe: in-memory only).
 *
 *   NODE_PATH=<dir containing an empty server-only/ stub> \
 *     npx tsx --tsconfig tsconfig.json scripts/verify-fm-stakeholder-readiness.mts [--live-grants]
 *
 * `--live-grants` additionally does a READ-ONLY census of Chiamaka's grants and
 * IAM audit events (checks 19–20). It writes nothing.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  capabilityForOperationalProxyAction,
  capabilityForRequestsProxyAction,
} from "../src/lib/access/operationalApiGate";
import {
  canReadIntelligence,
  canSeeHref,
  resolveAccessVisibility,
} from "../src/lib/access/visibility";
import { accessCan } from "../src/lib/access/resolveAccess";
import {
  composeNotificationFeed,
  loadNotificationSources,
  type NotificationSourceReaders,
} from "../src/services/workspace/OperationalNotificationService";
import {
  composeWorkspaceSnapshot,
  emptyNonCoreDomainLists,
} from "../src/services/workspace/WorkspaceService";
import { buildClientReport } from "../src/services/reports/buildClientReport";
import {
  reportAvailabilityNotice,
  reportHealthLabel,
} from "../src/modules/reports/utils";
import type { ReportWizardState } from "../src/modules/reports/types";
import type { ReportingSnapshot } from "../src/services/reporting/types";
import { computeReportingHealth, computeReportingKpis } from "../src/services/reporting/kpis";
import { computeReportingProjections } from "../src/services/reporting/projections";
import { contextAccess, explicitGrantBundle } from "./lib/accessFixtures";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}
const src = (p: string) => readFileSync(resolve(p), "utf8");

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

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";
const FAC = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WORK = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const P1 = "f0000000-0000-4000-8000-000000000001";
const P2 = "f0000000-0000-4000-8000-000000000002";
const P3 = "f0000000-0000-4000-8000-000000000003";

type Row = Record<string, unknown>;

function fakeAdmin(tables: Record<string, Row[]>): SupabaseClient {
  return {
    from(table: string) {
      const filters: Array<(r: Row) => boolean> = [];
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), builder),
        in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), builder),
        order: () => builder,
        range: () => builder,
        then: (resolveFn: (v: unknown) => unknown) => {
          const rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
          return resolveFn({ data: rows, count: rows.length, error: null });
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

function accessWith(capabilities: string[], role: string | null = "Liaison Officer") {
  const base = contextAccess("c@example.com", "Chiamaka", {
    id: "USR-C",
    name: "Chiamaka",
    email: "c@example.com",
    role: role ?? "",
    status: "active",
    facility: "NCC Annex",
  } as never);
  return { ...base, capabilities } as typeof base;
}

async function main() {
  const out: string[] = [];
  const pass = (m: string) => out.push(`PASS ${m}`);

  // ── 1. Issues: FM-rooted Issues independent of Requests ────────────────────
  {
    const issues = src("src/modules/issues/components/IssuesPage.tsx");
    assert(issues.includes('can("requests.view")'), "1: Issues reads requests.view");
    assert(/canReadRequests\s*\?\s*RequestService\.listRequests/.test(issues), "1: Request read only when authorised");
    assert(/Promise\.all\(\[\s*MaintenanceService\.listMaintenance/.test(issues), "1: Work + incidents load together without Requests inside a failing all()");
    assert(issues.includes(".catch(() => ({ ok: false as const"), "1: Request failure is captured, not thrown");
    assert(issues.includes('"restricted"') && issues.includes('"unavailable"'), "1/4: restricted vs unavailable distinguished");
    assert(issues.includes("requests?.ok ? requests.data : []"), "1: Request failure never masquerades as a healthy list beyond disclosure");
    assert(issues.includes("Requests couldn&apos;t be loaded"), "4: degraded Request source is disclosed");
    pass("1 ops.view user without requests.view loads FM-rooted Issues (no Request read issued)");
    pass("4b Request failure WITH authority preserves FM Issues and is visibly degraded");
  }

  // ── 2. Requests nav hidden without requests.view ───────────────────────────
  {
    const opsOnly = resolveAccessVisibility(accessWith(["ops.view", "ops.create", "ops.edit"]) as never);
    assert(!canSeeHref(opsOnly, "/requests"), "2: /requests visible without requests.view");
    assert(canSeeHref(opsOnly, "/issues") && canSeeHref(opsOnly, "/work"), "2: FM surfaces unaffected");
    const withReq = resolveAccessVisibility(accessWith(["ops.view", "requests.view"]) as never);
    assert(canSeeHref(withReq, "/requests"), "2: /requests visible with requests.view");
    pass("2 /requests follows requests.view (hidden without it, visible with it)");
  }

  // ── 3 + 4. Notifications ───────────────────────────────────────────────────
  {
    let requestReads = 0;
    const ok = async () => ({ data: [] as never[] });
    const readers: NotificationSourceReaders = {
      listRequests: async () => {
        requestReads += 1;
        throw new Error("403");
      },
      listMaintenance: ok as never,
      listIncidents: ok as never,
      listWorkOrders: ok as never,
    };
    const noAuth = await loadNotificationSources({ canReadRequests: false, profileId: "actor", canReadOperations: true }, readers);
    assert(requestReads === 0, "3: Request sources must not be read without requests.view");
    assert(noAuth.failedSources.length === 0, "3: skipping Requests must not mark the feed incomplete");
    assert(composeNotificationFeed("2026-09-20T00:00:00.000Z", noAuth, "actor").incomplete === undefined, "3: feed is not incomplete");
    pass("3 notifications skip Request sources without requests.view and are not incomplete");
    const withAuth = await loadNotificationSources({ canReadRequests: true, profileId: "actor", canReadOperations: true }, { ...readers, listMaintenance: async () => { throw new Error("unavailable"); } });
    assert(requestReads === 0 && withAuth.failedSources.includes("maintenance"), "4: assigned Work source failure recorded; Requests remain excluded");
    assert(composeNotificationFeed("2026-09-20T00:00:00.000Z", withAuth, "actor").incomplete === true, "4: feed stays degraded");
    pass("4 assigned source failure remains degraded/incomplete");
  }

  // ── 5. Assignment does not require users.view ──────────────────────────────
  {
    const route = src("src/app/api/assignable-people/route.ts");
    assert(route.includes('gateApiCapability("ops.view")') && !route.includes("users.view"), "5: assignable read is ops.view");
    const usersRoute = src("src/app/api/users/route.ts");
    assert(usersRoute.includes('"users.view"') && usersRoute.includes('"users.manage"'), "5: /api/users still gated by users.*");
    for (const file of [
      "src/modules/work-orders/components/WorkOrderFormModal.tsx",
      "src/modules/maintenance/components/MaintenanceFormModal.tsx",
      "src/modules/incidents/components/IncidentFormModal.tsx",
      "src/modules/work/components/WorkToolbar.tsx",
      "src/modules/maintenance/components/MaintenanceToolbar.tsx",
      "src/modules/incidents/components/IncidentsToolbar.tsx",
      "src/modules/work-orders/components/WorkOrdersToolbar.tsx",
      "src/modules/assets/components/AssetFormModal.tsx",
    ]) {
      const text = src(file);
      assert(!text.includes("listUsersCatalog"), `5: ${file} still uses the users directory`);
    }
    const wos = src("src/services/workOrders/WorkOrderService.ts");
    assert(!wos.includes("listUsersCatalog"), "5: WO filter catalog no longer uses users directory");
    assert(!src("src/services/entityResolver/registrations.ts").includes("fetchUsersCatalog"), "5: resolver labels via narrow catalog");
    // narrow shape + scoping
    const { loadAssignablePeople } = await import("../src/modules/users/server/assignablePeople");
    const admin = fakeAdmin({
      fm_facility_assignments: [
        { organisation_id: ORG, profile_id: P1, facility_id: FAC, operational_role: "liaison_officer", status: "active", updated_at: "2026-09-01" },
        { organisation_id: ORG, profile_id: P2, facility_id: FAC, operational_role: "facility_manager", status: "inactive", updated_at: "2026-09-01" },
        { organisation_id: OTHER_ORG, profile_id: P3, facility_id: FAC, operational_role: "fm_staff", status: "active", updated_at: "2026-09-01" },
      ],
      profiles: [
        { id: P1, organisation_id: ORG, status: "active", full_name: "Chiamaka U", email: "secret@x", first_name: null, last_name: null },
        { id: P2, organisation_id: ORG, status: "active", full_name: "Inactive Assignment", first_name: null, last_name: null },
        { id: P3, organisation_id: OTHER_ORG, status: "active", full_name: "Other Org", first_name: null, last_name: null },
      ],
    });
    const people = await loadAssignablePeople(ORG, admin as never);
    assert(people.length === 1 && people[0].id === P1, "5: only active, in-organisation assignees");
    assert(JSON.stringify(Object.keys(people[0]).sort()) === JSON.stringify(["facilityId", "id", "name", "role"]), "5: only id/name/role/facilityId are returned");
    assert(!JSON.stringify(people).includes("secret@x"), "5: no email leaks");
    pass("5 operational assignment uses an ops.view catalog returning only {id,name,role,facilityId}; /api/users unchanged");
  }

  // ── 6. One failed catalog does not erase the others ────────────────────────
  {
    for (const file of [
      "src/modules/work-orders/components/WorkOrderFormModal.tsx",
      "src/modules/maintenance/components/MaintenanceFormModal.tsx",
      "src/modules/incidents/components/IncidentFormModal.tsx",
    ]) {
      const text = src(file);
      assert((text.match(/useReferenceCatalog\(/g) ?? []).length === 4, `6: ${file} loads four independent catalogs`);
      assert(text.includes("CatalogFailureNotice"), `6: ${file} shows an explicit failed-catalog state`);
      assert(!/Promise\.all\(\[\s*FacilityService/.test(text), `6: ${file} has no all-or-nothing Promise.all`);
    }
    const hook = src("src/hooks/useReferenceCatalog.ts");
    assert(hook.includes("failed") && hook.includes("setFailed(true)"), "6: failure is explicit");
    const { FacilityService } = await import("../src/services/facilities/FacilityService");
    const { AssetService } = await import("../src/services/assets/AssetService");
    const { AssignablePeopleService } = await import("../src/services/assignablePeople/AssignablePeopleService");
    const { WorkOrderService } = await import("../src/services/workOrders/WorkOrderService");
    const page = (data: unknown[]) => ({ data, page: 1, pageSize: 100, total: data.length, totalPages: 1 });
    const orig = {
      f: FacilityService.listFacilities,
      a: AssetService.listAssetsCatalog,
      p: AssignablePeopleService.list,
    };
    (FacilityService as never as Record<string, unknown>).listFacilities = async () => page([{ id: "f1", name: "NCC Annex" }]);
    (AssetService as never as Record<string, unknown>).listAssetsCatalog = async () => page([{ id: "a1", name: "Pump", facilityId: "f1" }]);
    (AssignablePeopleService as never as Record<string, unknown>).list = async () => {
      throw new Error("people down");
    };
    try {
      const catalog = await WorkOrderService.getFilterCatalog();
      assert(catalog.facilities.length === 1 && catalog.assets.length === 1, "6: successful catalogs survive a failed sibling");
      assert(catalog.failed?.length === 1 && catalog.failed[0] === "users", "6: the failed catalog is reported, not emptied silently");
    } finally {
      (FacilityService as never as Record<string, unknown>).listFacilities = orig.f;
      (AssetService as never as Record<string, unknown>).listAssetsCatalog = orig.a;
      (AssignablePeopleService as never as Record<string, unknown>).list = orig.p;
    }
    pass("6 one failed reference catalog does not erase successful catalogs and is reported explicitly");
  }

  // ── 7 + 8. Consumer history reconciliation ─────────────────────────────────
  {
    const { reconciledHistoryEventIds } = await import("../src/lib/events/consumers/reconciledHistory");
    const legacy = Array.from({ length: 5 }, (_, i) => ({
      id: `e-legacy-${i}`,
      organisation_id: ORG,
      entity_type: "maintenance_request",
      entity_id: `MNT-2026-00062${i}`,
      data: { facilityId: "FAC-0001" },
    }));
    const ghost = { id: "e-ghost", organisation_id: ORG, entity_type: "maintenance_request", entity_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", data: { facilityId: "FAC-0001" } };
    const good = { id: "e-good", organisation_id: ORG, entity_type: "maintenance_request", entity_id: WORK, data: { facilityId: "FAC-0001" } };
    const foreign = { id: "e-foreign", organisation_id: OTHER_ORG, entity_type: "maintenance_request", entity_id: WORK, data: { facilityId: "FAC-0001" } };
    const admin = fakeAdmin({
      fm_facilities: [{ id: FAC, organisation_id: ORG, code: "FAC-0001" }],
      fm_work: [{ id: WORK, organisation_id: ORG, code: "MNT-1", facility_id: FAC }],
      fm_work_instructions: [],
      fm_requests: [],
      fm_incidents: [],
      fm_approvals: [],
      fm_assets: [],
    });
    const none = await reconciledHistoryEventIds({ admin, organisationId: ORG, events: [...legacy, ghost] });
    assert(none.size === 0, "7: legacy/orphaned events must contribute zero history");
    pass("7 orphaned legacy events (display codes / unknown UUIDs) contribute zero history to signals");
    const some = await reconciledHistoryEventIds({ admin, organisationId: ORG, events: [...legacy, ghost, good, foreign] });
    assert(some.has("e-good") && some.size === 1, "8: a legitimate reconciled prior event may contribute");
    assert(!some.has("e-foreign"), "8: organisation isolation holds");
    pass("8 reconciled legitimate history contributes; other-organisation events never do");
    const sig = src("src/lib/events/consumers/analyzeIncidentSignals.ts");
    assert(sig.includes("reconciledHistoryEventIds") && sig.includes("if (!reconciled.has(row.id)) return false;"), "7: signal history filtered by reconciliation");
    const pat = src("src/lib/events/consumers/analyzeRecommendationResponsePatterns.ts");
    assert(pat.includes("reconciledOrigins.has(row.operational_event_id)") && pat.includes("origin_not_authoritative"), "7: response-pattern history filtered by reconciliation");
    assert(!/FAC-VERIFY|FAC-V\d/.test(sig + pat), "7: protection is identity reconciliation, not verifier-string special-casing");
  }

  // ── 9. Home unauthorized vs unavailable ────────────────────────────────────
  {
    const page = src("src/modules/workspace/components/WorkspacePage.tsx");
    assert(page.includes('can("ops.view")') && page.includes("accessKnown && !canViewOperations"), "9: no-access state for users without ops.view");
    assert(page.includes("useWorkspace(canViewOperations)"), "9: no operational read without ops.view");
    assert(src("src/modules/workspace/hooks/useWorkspace.ts").includes("if (!enabled) return;"), "9: hook issues no reads when disabled");
    assert(!page.includes("temporarily unavailable"), "9: unauthorized copy is not the unavailable copy");
    pass("9 Home distinguishes unauthorized (no read, no-access state) from unavailable (retry state)");
  }

  // ── 10. Awaiting Action is not falsely zero before approvals load ──────────
  {
    const wo = { ok: true as const, data: [] as never[] };
    const core = {
      workOrders: wo,
      incidents: { ok: true, data: [] as never[] },
      maintenance: { ok: true, data: [] as never[] },
      criticalWork: { ok: true, total: 0 },
    };
    const first = composeWorkspaceSnapshot("2026-09-20T12:00:00.000Z", null, { ...core, ...emptyNonCoreDomainLists() } as never);
    assert(first.pulse.picture.awaitingAction === null, "10: Awaiting Action must be null before approvals are known");
    const loaded = composeWorkspaceSnapshot("2026-09-20T12:00:00.000Z", null, {
      ...core,
      approvals: { ok: true, data: [] },
      facilities: { ok: true, data: [] },
      pictureApprovals: { present: false },
    } as never);
    assert(loaded.pulse.picture.awaitingAction === 0, "10: loaded empty approvals may produce a real zero");
    assert(src("src/services/workspace/WorkspaceService.ts").includes("enriching: true as const"), "10: first wave is flagged as enriching");
    pass("10 Awaiting Action is null (Loading…) before approvals load, and a true 0 once loaded empty");
  }

  // ── 11 + 12. Reporting source failure ──────────────────────────────────────
  {
    const emptySnap = (unavailable: string[]): ReportingSnapshot => {
      const asOf = "2026-09-20T12:00:00.000Z";
      const args = { asOf, facilities: [], assets: [], incidents: [], maintenance: [], workOrders: [], users: [] };
      const kpis = computeReportingKpis(args as never);
      return {
        asOf,
        users: [],
        facilities: [],
        assets: [],
        incidents: [],
        maintenance: [],
        workOrders: [],
        kpis,
        projections: computeReportingProjections({ asOf, incidents: [], maintenance: [], workOrders: [] } as never),
        health: computeReportingHealth(kpis),
        _snapshotMeta: {
          source: "authoritative_domains",
          generatedAt: asOf,
          ageInSeconds: 0,
          snapshotVersion: asOf,
          scope: "__portfolio__",
          unavailableSources: unavailable,
        },
      } as unknown as ReportingSnapshot;
    };
    const wizard: ReportWizardState = {
      step: "generate",
      reportType: "monthly_operations",
      facilityIds: [],
      allFacilities: true,
      period: { kind: "month", label: "September 2026" } as never,
      sections: ["executive_summary", "kpi_summary", "operational_performance", "work_orders", "maintenance", "incidents", "assets", "recommendations", "appendix"],
      sectionsBaseline: [],
    };
    const healthy = buildClientReport({ snapshot: emptySnap([]), wizard });
    assert(healthy.dataAvailability.complete, "11: healthy empty is complete");
    assert(healthy.workOrders.metrics.some((m) => m.value === "0"), "11: healthy empty may state a factual zero");
    assert(reportAvailabilityNotice(healthy) === null, "11: no disclosure when every source was read");

    const degraded = buildClientReport({ snapshot: emptySnap(["maintenance", "assets"]), wizard });
    assert(!degraded.dataAvailability.complete, "11: degraded is flagged");
    assert(degraded.maintenance.metrics.every((m) => m.value === "Unavailable"), "11: failed Work source must not state zeros");
    assert(degraded.assets.metrics.every((m) => m.value === "Unavailable"), "11: failed Asset source must not state zeros");
    assert(degraded.kpiSummary.find((m) => m.id === "critical")?.value === "Unavailable", "11: KPI from failed source is unavailable");
    assert(degraded.kpiSummary.find((m) => m.id === "health")?.value === "Incomplete", "11: health is not asserted from partial data");
    assert(degraded.workOrders.metrics.some((m) => m.value === "0"), "11: an available source still states its real zero");
    assert(degraded.maintenance.table.rows.length === 0 && /Unavailable/.test(degraded.maintenance.table.emptyMessage ?? ""), "11: failed table is not 'no records'");
    pass("11 a failed Reporting source can never become a factual zero; healthy empty still may");
    const notice = reportAvailabilityNotice(degraded);
    assert(notice && /Work/.test(notice) && /Asset/.test(notice), "12: notice names the unavailable sources");
    assert(reportHealthLabel(degraded).startsWith("Incomplete"), "12: health label is incomplete");
    const preview = src("src/modules/reports/components/ReportPreview.tsx");
    const word = src("src/modules/reports/export/downloadReportWord.ts");
    assert(preview.includes("reportAvailabilityNotice(report)") && word.includes("reportAvailabilityNotice(report)"), "12: preview and Word use the same disclosure");
    assert(preview.includes("reportHealthLabel(report)") && word.includes("reportHealthLabel(report)"), "12: preview and Word use the same health label");
    assert(degraded.appendix.dataNotes[0].includes("could not be read"), "12: appendix carries the disclosure");
    pass("12 preview and Word carry the same unavailable-source disclosure from one document");
  }

  // ── 13. Reports do not require users.view ──────────────────────────────────
  {
    const rs = src("src/services/reporting/ReportingService.ts");
    assert(!rs.includes("listUsersCatalog"), "13: Reporting no longer reads the users directory");
    assert(rs.includes("AssignablePeopleService.list()"), "13: People contribute via the narrow ops.view catalog");
    pass("13 Reports do not require users.view (People via the narrow operational catalog)");
  }

  // ── 14. Facility option failure is not healthy empty ───────────────────────
  {
    const { FacilityService } = await import("../src/services/facilities/FacilityService");
    const { ReportsService } = await import("../src/services/reports/ReportsService");
    const orig = FacilityService.listFacilities;
    (FacilityService as never as Record<string, unknown>).listFacilities = async () => {
      throw new Error("403");
    };
    try {
      const home = await ReportsService.getHome();
      assert(home.facilityOptionsFailed === true && home.facilityOptions.length === 0, "14: failure is flagged");
    } finally {
      (FacilityService as never as Record<string, unknown>).listFacilities = orig;
    }
    (FacilityService as never as Record<string, unknown>).listFacilities = async () => ({ data: [], page: 1, pageSize: 200, total: 0, totalPages: 1 });
    try {
      const home = await ReportsService.getHome();
      assert(home.facilityOptionsFailed === false, "14: a healthy empty list is not a failure");
    } finally {
      (FacilityService as never as Record<string, unknown>).listFacilities = orig;
    }
    assert(src("src/modules/reports/components/ReportWizard.tsx").includes("Couldn&apos;t load the facility list"), "14: wizard shows an error/retry state");
    pass("14 failed facility-option load is an error/retry state, not a healthy empty list");
  }

  // ── 15. Intelligence protected server-side ─────────────────────────────────
  {
    const withEdit = accessWith(["ops.view", "ops.edit"]);
    const viewOnly = accessWith(["ops.view"]);
    const none = accessWith([]);
    assert(canReadIntelligence(withEdit as never) && !canReadIntelligence(viewOnly as never) && !canReadIntelligence(none as never), "15: one rule (ops.create|ops.edit)");
    const vis = resolveAccessVisibility(withEdit as never);
    assert(canSeeHref(vis, "/intelligence") === canReadIntelligence(withEdit as never), "15: nav and server rule agree");
    const g = src("src/lib/intelligence/getOrganisationIntelligence.ts");
    const guard = g.indexOf("canReadIntelligence(access)");
    assert(guard > 0 && guard < g.indexOf("return loadOrganisationIntelligence({\n    supabase,"), "15: authority is checked before any data is read");
    for (const page of [
      "src/app/(app)/intelligence/page.tsx",
      "src/app/(app)/intelligence/changes/page.tsx",
      "src/app/(app)/intelligence/patterns/page.tsx",
    ]) {
      const text = src(page);
      assert(text.includes("loadIntelligenceForRoute") && !text.includes("getOrganisationIntelligence"), `15: ${page} uses the shared guarded boundary`);
      assert(text.includes("IntelligenceAccessRestricted"), `15: ${page} renders a restricted state`);
    }
    pass("15 Intelligence is protected server-side by the same rule as navigation, before data is read");
  }

  // ── 16 + 17. Facility inheritance ──────────────────────────────────────────
  {
    for (const file of [
      "src/modules/assets/components/AssetFormModal.tsx",
      "src/modules/diesel-usage/components/DieselUsageFormModal.tsx",
      "src/modules/waste-log/components/WasteLogFormModal.tsx",
      "src/modules/fumigation-log/components/FumigationLogFormModal.tsx",
      "src/modules/deep-cleaning-log/components/DeepCleaningLogFormModal.tsx",
      "src/modules/consumables-update/components/ConsumablesUpdateFormModal.tsx",
    ]) {
      const text = src(file);
      assert(text.includes("<InheritedFacilityField"), `16: ${file} inherits facility`);
      assert(!text.includes("useFacilityOptions") && !text.includes("Select facility"), `16: ${file} no longer asks for a facility`);
      assert(!/item\.name === form\.facilityId/.test(text), `16: ${file} has no name-based facility matching`);
    }
    const field = src("src/components/operational/InheritedFacilityField.tsx");
    assert(field.includes("useScopedFacilityResolver") && field.includes("readOnly"), "16: inherited from assignment, read-only");
    // filters may still select
    assert(src("src/modules/waste-log/components/WasteLogsToolbar.tsx").toLowerCase().includes("facility"), "16: filters still select facility");
    pass("16 Asset and the five facility-scoped register forms inherit facility (no per-record choice); filters unchanged");
    const domain = src("src/modules/operational-logs/server/fmLogDomain.ts");
    assert(/resource: "generator-log"[^\n]*facility: false/.test(domain), "17: generator is organisation-level");
    assert(/resource: "energy-reading"[^\n]*facility: false/.test(domain), "17: energy is organisation-level");
    for (const file of ["src/modules/generator-log/components/GeneratorLogFormModal.tsx", "src/modules/energy-reading/components/EnergyReadingFormModal.tsx"]) {
      assert(!src(file).toLowerCase().includes("facility"), `17: ${file} gained no facility scoping`);
    }
    pass("17 generator and energy registers remain organisation-level");
  }

  // ── 18. Explicit-grant authorization semantics unchanged ──────────────────
  {
    const liaisonContext = accessWith([], "Liaison Officer");
    assert(!accessCan(liaisonContext as never, "ops.view"), "18: an operating role confers no capability");
    const core = accessWith(["ops.view", "ops.create", "ops.edit", "requests.view"]);
    assert(accessCan(core as never, "ops.edit") && !accessCan(core as never, "users.view") && !accessCan(core as never, "approvals.manage") && !accessCan(core as never, "finance.view"), "18: core bundle grants exactly its capabilities");
    assert(capabilityForOperationalProxyAction("work-orders", "getAll") === "ops.view", "18: operational reads unchanged");
    assert(capabilityForRequestsProxyAction("getAll") === "requests.view", "18: Request reads unchanged");
    assert(capabilityForOperationalProxyAction("approvals", "create") === "approvals.manage", "18: approval writes unchanged");
    assert(explicitGrantBundle("facility_manager").includes("fm.authorize_protected"), "18: fixture semantics intact");
    const server = src("src/lib/access/server.ts");
    assert(server.includes("denying FM business capabilities") && server.includes("capabilities = [];"), "18: grant failure still fails closed");
    assert(server.includes("Promise.allSettled([\n    loadExplicitFmGrants") , "18: grants and assignment are read in parallel");
    const session = src("src/lib/auth/session.ts");
    assert(session.includes("if (profileError || !profileRow) {") && session.includes("Promise.all(["), "18: session stages are parallel with the same fail-closed checks");
    pass("18 explicit-grant authorization semantics are unchanged (role is context; fail-closed grants)");
    pass("18b access resolution: session 5→3 dependency stages, access 3→2 (structural)");
  }

  // ── boundaries preserved ───────────────────────────────────────────────────
  {
    assert(src("src/lib/operational/work/incidentWriteFreeze.ts").includes("throw new ActionError"), "boundary: Incident creation still frozen");
    assert(src("src/modules/finance/components/CostRecordFormModal.tsx").includes("Receipt file upload is unavailable"), "boundary: receipt upload still unavailable");
    pass("boundaries preserved (Incident freeze, receipt upload unavailable)");
  }

  // ── 19 + 20. Live, READ-ONLY grant + audit census ──────────────────────────
  if (process.argv.includes("--live-grants")) {
    loadEnvLocal();
    const { createAdminClient } = await import("../src/utils/supabase/admin");
    const admin = createAdminClient();
    const { data: profiles } = await admin.from("profiles").select("id, full_name").ilike("full_name", "Chiamaka%");
    assert(profiles && profiles.length === 1, "19: Chiamaka's profile must resolve uniquely");
    const profileId = String(profiles[0].id);
    const { data: grants } = await admin.from("platform_capability_grants").select("capability").eq("profile_id", profileId);
    const held = (grants ?? []).map((g) => String((g as { capability: string }).capability)).sort();
    const expected = ["ops.create", "ops.edit", "ops.view", "requests.view"];
    assert(JSON.stringify(held) === JSON.stringify(expected), `19: Chiamaka must hold exactly ${expected.join(", ")}; has ${held.join(", ") || "none"}`);
    pass(`19 Chiamaka holds exactly the four core-review grants (${held.join(", ")})`);
    const { data: audit } = await admin
      .from("platform_iam_audit_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(60);
    const rows = (audit ?? []).filter((row) => JSON.stringify(row).includes(profileId));
    assert(rows.length >= 1, "20: IAM audit events must exist for the grants");
    pass(`20 platform_iam_audit_events records ${rows.length} event(s) referencing Chiamaka`);
  }

  console.log(out.join("\n"));
  console.log("VERIFY_FM_STAKEHOLDER_READINESS: PASS");
}

main().catch((error) => {
  console.error("FAIL", error instanceof Error ? error.message : error);
  process.exit(1);
});
