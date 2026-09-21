/**
 * FM historical dataset — READ-ONLY live application reconciliation.
 *
 * Drives the REAL server-side readers (Work, Work Instruction, Incident, Request, Asset) against the linked
 * database, then feeds the SAME pure composition used by Reporting, Home/Workspace, notifications and the Command
 * Centre FM attention, and asserts that migrated historical records are represented honestly: unknown stays unknown,
 * historical rows never become current/open/critical/overdue, and import time is never shown as business time.
 * Performs NO writes.
 *
 *   NODE_PATH=<dir containing an empty server-only/ stub> \
 *     npx tsx --tsconfig tsconfig.json scripts/verify-fm-historical-application-live-read.mts
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const p = resolve(".env.local");
  if (!existsSync(p)) return;
  for (const l of readFileSync(p, "utf8").split("\n")) {
    const t = l.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    if (!(k in process.env)) process.env[k] = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, "");
  }
}
function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}
const FAC = "e1a5f579-8bb1-42fb-9fdf-56faaaa1e9e0";

async function main() {
  loadEnvLocal();
  const out: string[] = [];
  const pass = (m: string) => out.push(`PASS ${m}`);
  const { createAdminClient } = await import("../src/utils/supabase/admin");
  const admin = createAdminClient();
  const { data: fac, error: facErr } = await admin.from("fm_facilities").select("organisation_id").eq("id", FAC).single();
  assert(!facErr && fac, "FAC-0001 not readable");
  const organisationId = String((fac as { organisation_id: string }).organisation_id);
  const { data: prof } = await admin.from("profiles").select("id").limit(1).single();
  const ctx = { organisationId, profileId: String((prof as { id: string }).id) } as never;

  const count = async (table: string, window?: { gte: string; lte: string }) => {
    const base = admin.from(table).select("id", { count: "exact", head: true }).eq("organisation_id", organisationId);
    const q = window ? base.gte("created_at", window.gte).lte("created_at", window.lte) : base;
    const { count: c, error } = await q;
    assert(!error, `${table} count unreadable`);
    return c ?? 0;
  };
  const hist = await count("fm_migration_provenance");
  if (hist === 0) {
    console.log("SKIPPED — no migrated historical dataset in the linked database");
    return;
  }

  type Maintenance = import("../src/modules/maintenance/types").Maintenance;
  type WorkOrder = import("../src/modules/work-orders/types").WorkOrder;
  type Incident = import("../src/modules/incidents/types").Incident;
  type RequestRecord = import("../src/modules/requests/types").RequestRecord;
  type Asset = import("../src/modules/assets/types").Asset;
  const { FmWorkRepository } = await import("../src/modules/maintenance/server/FmWorkRepository");
  const { mapFmWorkRowToMaintenance, summarizeWorkOperationalPicture } = await import("../src/modules/maintenance/server/fmWorkDomain");
  const { FmWorkInstructionServerService } = await import("../src/modules/work-orders/server/FmWorkInstructionServerService");
  const { FmIncidentServerService } = await import("../src/modules/incidents/server/FmIncidentServerService");
  const { FmRequestServerService } = await import("../src/modules/requests/server/FmRequestServerService");
  const { FmAssetServerService } = await import("../src/modules/assets/server/FmAssetServerService");
  const paged = async <T,>(fn: (page: number) => Promise<{ data: T[]; totalPages: number }>) => {
    const rows: T[] = [];
    for (let page = 1; ; page++) { const r = await fn(page); rows.push(...r.data); if (page >= r.totalPages) return rows; }
  };
  const maintenance: Maintenance[] = (await new FmWorkRepository(organisationId).listRows()).map(mapFmWorkRowToMaintenance);
  const wiSvc = new FmWorkInstructionServerService(ctx);
  const workOrders = await paged<WorkOrder>((page) => wiSvc.list({ page, pageSize: 100 } as never));
  const incidents = await paged<Incident>((page) => new FmIncidentServerService(ctx).list({ page, pageSize: 100 } as never));
  const requests = await paged<RequestRecord>((page) => new FmRequestServerService(ctx).list({ page, pageSize: 100 } as never));
  const assets = await paged<Asset>((page) => new FmAssetServerService(ctx).list({ page, pageSize: 100 } as never));

  // ── 1. FM surfaces reconcile to the authoritative tables ───────────────────────
  {
    const dbWork = await count("fm_work"), dbWi = await count("fm_work_instructions"), dbInc = await count("fm_incidents"), dbReq = await count("fm_requests"), dbAst = await count("fm_assets");
    assert(maintenance.length === dbWork && workOrders.length === dbWi && incidents.length === dbInc && requests.length === dbReq && assets.length === dbAst, `readers return every authoritative row (Work ${maintenance.length}/${dbWork}, WI ${workOrders.length}/${dbWi}, incidents ${incidents.length}/${dbInc}, requests ${requests.length}/${dbReq}, assets ${assets.length}/${dbAst})`);
    const histWork = maintenance.filter((m) => m.recordOrigin === "migrated_historical");
    const histWi = workOrders.filter((w) => w.recordOrigin === "migrated_historical");
    assert(histWork.every((m) => m.status === "unknown" || m.status === "completed") && histWork.every((m) => m.priority === "unknown") && histWork.every((m) => m.reportedAt === undefined), "historical Work: priority unknown, status unknown/completed, NO reportedAt (never a fake date)");
    assert(histWi.every((w) => w.status === "unknown" && w.priority === "unknown" && w.requestedAt === undefined && w.completedAt === undefined), "historical Work Instructions: status/priority unknown, no requested/completed date");
    assert(incidents.every((i) => i.recordOrigin === "migrated_historical" && i.status === "unknown" && i.severity === "unknown" && !!i.reportedAt), "historical incidents: status/severity unknown, real reported date, historical origin");
    assert(assets.every((a) => a.condition === "unknown"), "assets: condition unknown (never good)");
    // relationships: only proven ones
    const workByCode = new Map(maintenance.map((m) => [m.id, m]));
    assert(workOrders.every((w) => workByCode.get(w.maintenanceId ?? "")?.workOrderIds?.includes(w.id)), "every Work Instruction ↔ its Work relationship is mutual and proven");
    const executed = maintenance.filter((m) => m.recordOrigin === "migrated_historical" && m.status === "completed");
    assert(executed.length === 2 && executed.every((m) => (m.workOrderIds ?? []).length === 0 && !m.requiresWorkOrder), "the 2 completed Work records have no Work Instruction and are not flagged as missing one");
    assert(requests.every((r) => (r.maintenanceIds ?? []).length === 0 && (r.incidentIds ?? []).length === 0 && (r.workOrderIds ?? []).length === 0), "no Request ↔ Work/Incident relationship was invented");
    assert(incidents.every((i) => (i.maintenanceIds ?? []).length === 0 && (i.workOrderIds ?? []).length === 0), "no Incident ↔ Work relationship was invented");
    const blob = JSON.stringify([maintenance, workOrders, incidents, requests, assets]);
    assert(!/csirt/i.test(blob), "no CSIRT data in any surface");
    assert(![maintenance, workOrders, incidents, assets].some((rows) => (rows as unknown as Array<Record<string, unknown>>).some((r) => r.assignedToUserId || r.createdByUserId || r.reportedByUserId)), "no invented actor/profile attribution on Work / WI / Incident / Asset");
    assert(!/paid|pending payment|payment advice|income/i.test(JSON.stringify([maintenance.map((m) => m.status), workOrders.map((w) => w.status)])), "no commercial Paid/Pending semantics in any FM status");
    pass(`FM surfaces: ${maintenance.length} Work, ${workOrders.length} WI, ${incidents.length} incidents, ${requests.length} requests, ${assets.length} assets reconcile to the tables; unknown stays unknown; relationships proven only; no CSIRT / actors / commercial state`);
  }

  // ── 2. Reporting ───────────────────────────────────────────────────────────────
  const { normalizeReportingEntities } = await import("../src/services/reporting/normalizeEntities");
  const { computeReportingKpis, computeReportingHealth, kpiInsightLabels } = await import("../src/services/reporting/kpis");
  const { computeReportingProjections } = await import("../src/services/reporting/projections");
  const { unrecordedStateNotes, closureRateLabel, riskBullets } = await import("../src/services/reporting/documents/builders/shared");
  const asOf = new Date().toISOString();
  const draft = { asOf, users: [], facilities: [{ id: FAC, name: "NCC Annex", status: "active", createdAt: "2026-09-18T00:00:00Z" }], assets, incidents, maintenance, workOrders } as never;
  const n = normalizeReportingEntities(draft);
  const kpis = computeReportingKpis({ asOf, facilities: n.facilities, assets: n.assets, incidents: n.incidents, maintenance: n.maintenance, workOrders: n.workOrders, users: n.users });
  {
    const historicalOnly = maintenance.every((m) => m.recordOrigin === "migrated_historical" || !["requested", "triaged", "scheduled", "in_progress", "on_hold"].includes(m.status));
    assert(historicalOnly, "precondition: no live-open Work exists (only the historical dataset is loaded)");
    assert(kpis.workOrdersCreatedToday === 0, `Reporting: historical Work Instructions are NOT "created today" (import time ≠ business time) — got ${kpis.workOrdersCreatedToday}`);
    assert(kpis.openWorkOrders === 0 && kpis.maintenanceBacklog === 0 && kpis.overdueWorkOrders === 0 && kpis.overdueMaintenance === 0 && kpis.criticalWork === 0 && kpis.criticalIncidents === 0 && kpis.incidentsNeedingWorkOrder === 0 && kpis.workNeedingWorkOrder === 0 && kpis.maintenanceOnHold === 0 && kpis.workOrdersOnHold === 0, "Reporting: historical unknown rows contribute nothing to open / backlog / overdue / critical / needs-work-order / on-hold");
    assert(kpis.assetsOperationalPercent === null && kpis.activeAssets === 0 && kpis.assetsInPoorCondition === 0, "Reporting: 9 unassessed assets are NOT '0% operational' and NOT poor — availability is unknown (null)");
    assert((kpis.assetsConditionUnknown ?? 0) === assets.length && (kpis.workLifecycleUnknown ?? 0) === maintenance.filter((m) => m.status === "unknown").length + workOrders.length, "Reporting: unknown-state counts are disclosed explicitly");
    const labels = kpiInsightLabels(kpis);
    assert(labels.activeAssets === "Operational status not recorded", `Reporting label: assets '${labels.activeAssets}'`);
    assert(/None recorded open/.test(labels.openWorkOrders) && /None recorded open/.test(labels.maintenanceBacklog) && !/All clear|Nothing requiring attention/.test(labels.openWorkOrders + labels.maintenanceBacklog), "Reporting labels: a zero says what it excludes — never 'All clear' over unrecorded records");
    const proj = computeReportingProjections({ asOf, incidents: n.incidents, maintenance: n.maintenance, workOrders: n.workOrders });
    assert(Object.values(proj).every((v) => (v as unknown[]).length === 0), "Reporting projections: no historical record appears as critical / overdue / blocked / active");
    assert(closureRateLabel({ workOrders: n.workOrders } as never) === "—", "Reports: closure rate is '—' when no Work Instruction has a recorded lifecycle (never 0%)");
    const notes = unrecordedStateNotes(n as never).join(" ");
    assert(/9 asset\(s\) have no recorded condition/.test(notes) && /incident record\(s\) have no recorded status/.test(notes), "Reports: unrecorded state is disclosed");
    assert(!riskBullets({ ...n, kpis, projections: proj, health: computeReportingHealth(kpis) } as never).some((b) => b === "No major risks identified in the current reporting snapshot."), "Reports: 'no major risks' is qualified when records carry no recorded state");
    pass("Reporting: authoritative counts, no fake 'created today', no historical open/overdue/critical, availability unknown (not 0%), zeros qualified, closure rate not 0%, unrecorded state disclosed");
  }

  // ── 3. Home / Workspace, notifications, Command Centre FM attention ───────────
  {
    const { composeWorkspaceSnapshot } = await import("../src/services/workspace/WorkspaceService");
    const pictureMnt = summarizeWorkOperationalPicture(maintenance, asOf);
    const pictureWo = await wiSvc.operationalPicture(asOf);
    assert(pictureMnt.critical === 0 && pictureMnt.inProgress === 0 && pictureMnt.awaitingAction === 0 && pictureMnt.overdue === 0 && pictureWo.awaitingAction === 0 && pictureWo.overdue === 0, "Operational Picture: Work and Work Instruction aggregates are exactly zero — 115 Work / 113 WI are NOT active, awaiting action or overdue");
    const snap = composeWorkspaceSnapshot(asOf, { id: "u", name: "x", operationalUserId: null }, {
      workOrders: { ok: true, data: workOrders, pictureWorkOrders: { present: true, healthy: true, value: pictureWo } },
      incidents: { ok: true, data: incidents },
      maintenance: { ok: true, data: maintenance },
      criticalWork: { ok: true, total: pictureMnt.critical },
      pictureMaintenance: { present: true, healthy: true, value: pictureMnt },
      approvals: { ok: true, data: [] },
      facilities: { ok: true, data: [{ id: FAC, name: "NCC Annex" }] },
      pictureApprovals: { present: true, healthy: true, value: { state: "healthy", awaitingAction: 0 } },
    } as never);
    const p = snap.pulse as unknown as Record<string, number>;
    assert(p.openWork === 0 && p.openWorkOrders === 0 && p.openMaintenance === 0 && p.legacyOpenIncidents === 0 && p.legacyCriticalIncidents === 0 && p.criticalWork === 0, "Home pulse: no historical open Work / WI / incident / critical");
    assert((snap.attention as unknown as { total: number }).total === 0, "Home attention: historical records raise no attention matter");
    const importMs = Date.parse(String((await admin.from("fm_migration_batches").select("created_at").eq("organisation_id", organisationId).limit(1).single()).data?.created_at));
    assert(snap.activity.every((a) => Math.abs(Date.parse(a.at) - importMs) > 60_000), "Home activity: no entry is stamped with the import time");
    assert(snap.activity.every((a) => a.kind === "incident_reported"), "Home activity: only records with a REAL business date (the 3 dated incidents) appear; historical Work / WI (no known date) do not");
    assert(snap.schedule.length === 0, "Home schedule: nothing scheduled or 'due today' from historical rows");
    const { deriveOperationalNotifications } = await import("../src/modules/workspace/utils/deriveOperationalNotifications");
    const notif = deriveOperationalNotifications({ asOf, requests, maintenance, workOrders, incidents } as never);
    assert(notif.items.every((i) => Math.abs(Date.parse(i.at) - importMs) > 60_000), "Notifications: timestamps are the request's own occurrence time, never the import time");
    assert(notif.items.every((i) => i.kind === "new_issue") && notif.total === requests.filter((r) => r.status === "submitted" || r.status === "under_review").length, "Notifications: only genuinely open (submitted / under review) Requests notify — no Work / WI / incident / deadline noise");
    const { fmAttentionFromPicture } = await import("../src/modules/command-centre/server/composeExecutiveAttention");
    const attention = fmAttentionFromPicture({ maintenance: pictureMnt as never, workOrders: pictureWo as never, approvals: { state: "healthy", awaitingAction: 0 } } as never);
    assert(attention.status === "loaded" && attention.items.length === 0, "Command Centre FM attention: loaded with NO items — no 115 active Work, 113 outstanding instructions or fake overdue");
    const failed = fmAttentionFromPicture({ maintenance: { state: "unavailable" }, workOrders: { state: "unavailable" }, approvals: { state: "unavailable" } } as never);
    assert(failed.status !== "loaded", "Command Centre FM attention: unavailable data is never rendered as an all-clear");
    pass("Home / Command Centre: Operational Picture and FM attention are exactly zero for historical rows; no import-time activity; notifications use real dates; unavailable ≠ clear");
  }

  // ── 4. Intelligence consumes authoritative counts, not analytical events ──────
  {
    const { loadAuthoritySnapshot } = await import("../src/lib/intelligence/authority/loadAuthoritySnapshot");
    const snap = await (loadAuthoritySnapshot as unknown as (o: unknown) => Promise<{ counts: Record<string, number> }>)({ supabase: admin, organisationId, events: [] });
    assert(snap.counts.work === maintenance.length && snap.counts.workInstructions === workOrders.length && snap.counts.requests === requests.length && snap.counts.incidents === incidents.length, "Intelligence authority: population counts equal the authoritative FM tables");
    const batchAt = Date.parse(String((await admin.from("fm_migration_batches").select("created_at").eq("organisation_id", organisationId).limit(1).single()).data?.created_at));
    const around = await count("operational_events", { gte: new Date(batchAt - 10 * 60_000).toISOString(), lte: new Date(batchAt + 10 * 60_000).toISOString() });
    assert(around === 0, "Intelligence: the import created NO analytical events (operational_events untouched around the import)");
    pass("Intelligence: consumes authoritative FM population; imported records emit no events and therefore create no current signals");
  }

  // ── 5. Product reconciliation against the real dataset ────────────────────────
  {
    const { FmLogRepository } = await import("../src/modules/operational-logs/server/FmLogRepository");
    const { FM_LOG_SPECS, parseLogListParams } = await import("../src/modules/operational-logs/server/fmLogDomain");
    const readAll = async (resource: keyof typeof FM_LOG_SPECS) => {
      const repo = new FmLogRepository(FM_LOG_SPECS[resource], organisationId);
      const rows: Record<string, unknown>[] = [];
      for (let page = 1; ; page++) {
        const r = await repo.list(parseLogListParams(FM_LOG_SPECS[resource], { page, pageSize: 100 }));
        rows.push(...r.rows);
        if (rows.length >= r.total || r.rows.length === 0) return { rows, total: r.total, repo };
      }
    };
    const gen = await readAll("generator-log");
    const diesel = await readAll("diesel-usage");
    const cons = await readAll("consumables-update");
    const dbItems = await count("fm_consumables_items");
    const dbEntries = await count("fm_consumables_register_entries");
    assert(maintenance.length === 115 && workOrders.length === 113 && requests.length === 29 && incidents.length === 3 && assets.length === 9 && gen.total === 67 && diesel.total === 14 && dbItems === 31 && dbEntries === 31, `authoritative readers: 115 Work / 113 WI / 29 Requests / 3 Incidents / 9 Assets / 67 generator logs / 14 diesel / 31 items / 31 register entries (got ${maintenance.length}/${workOrders.length}/${requests.length}/${incidents.length}/${assets.length}/${gen.total}/${diesel.total}/${dbItems}/${dbEntries})`);
    assert(cons.total === 0, "consumables updates (dated transactions) stay empty: the register evidence was not turned into fake transactions");

    // identity
    assert(assets.every((a) => /^AST-\d{4}-\d{6}$/.test(a.code) && a.facility === "NCC Annex" && a.facilityId === FAC), "assets: canonical AST- codes and the facility NAME are available to the UI (UUIDs stay internal)");
    // asset status semantics
    const { assetStatusPresentation } = await import("../src/modules/assets/utils");
    assert(assets.every((a) => a.recordOrigin === "migrated_historical" && a.status === "unknown" && a.condition === "unknown" && a.criticality === "unassessed"), "assets: all 9 are migrated_historical (record_origin) with status 'unknown', condition 'unknown', criticality 'unassessed' — the DATABASE is authoritative");
    assert(assets.every((a) => assetStatusPresentation(a).label === "Status not recorded"), "assets: the stored 'unknown' reads 'Status not recorded'; Condition Unknown and Criticality Unassessed are shown as stored");
    assert(!assets.some((a) => a.status === "pending"), "assets: no imported asset carries the importer-default 'pending'");
    // diesel semantics
    const { getDieselUsageFlagLabels, dieselGeneratorPresentation } = await import("../src/modules/diesel-usage/utils");
    assert(diesel.rows.every((r) => r.recordOrigin === "migrated_historical" && r.generatorId === null), "diesel: all 14 rows are migrated_historical (record_origin) with NO generator — the source sheet name is provenance, not identity");
    const { data: dprov } = await admin.from("fm_migration_provenance").select("source_sheet").eq("organisation_id", organisationId).eq("target_table", "fm_diesel_usage");
    assert((dprov ?? []).length === 14 && (dprov ?? []).every((p) => (p as { source_sheet: string }).source_sheet === "MBORA DIESEL Checklist"), "diesel: the source label is preserved as provenance (source_sheet) on all 14 rows");
    assert(diesel.rows.every((r) => getDieselUsageFlagLabels(Number(r.consumption), r.recordOrigin as never).length === 0) && diesel.rows.some((r) => Number(r.consumption) > 100), "diesel: NO row is labelled 'High usage' (the 100 L per-generator threshold does not apply to whole-site tank rows)");
    assert(diesel.rows.every((r) => dieselGeneratorPresentation(r as never).primary === "Whole-site tank"), "diesel: the UI presents a whole-site tank, not a generator identity");
    assert(gen.rows.every((r) => r.assetId !== null && r.recordOrigin === "migrated_historical" && r.startedAt === null && r.endedAt === null), "generator logs: hour-meter rows keep their proven asset link and have no invented clock times");
    // consumables register
    const reg = (await cons.repo.listRegisterEntries()) as Array<Record<string, unknown>>;
    assert(reg.length === 31 && reg.every((e) => e.snapshotDate === null && e.recordOrigin === "migrated_historical" && e.itemName), "consumables register: all 31 entries are readable through the real reader, undated, with item names");
    const q = (e: Record<string, unknown>, k: string) => e[k] as { quantity: number | null; unit: string | null; raw: string | null };
    assert(reg.every((e) => ["opening", "received", "issued", "closing", "reorderLevel"].every((k) => (q(e, k).quantity === null) === (q(e, k).unit === null))), "consumables register: a quantity and its unit always travel together; a missing one is null, never 0");
    assert(reg.every((e) => q(e, "closing").quantity === null && q(e, "reorderLevel").quantity === null), "consumables register: closing and reorder level were not stated by the register and are NOT derived");
    assert(reg.some((e) => q(e, "opening").quantity !== null && q(e, "opening").unit) && reg.some((e) => q(e, "issued").quantity === null), "consumables register: recorded quantities keep their own unit and unrecorded ones stay null");
    const { formatRegisterQuantity } = await import("../src/modules/consumables-update/components/ConsumablesRegisterEvidence");
    assert(reg.every((e) => q(e, "issued").quantity !== null || formatRegisterQuantity(q(e, "issued")) === "Not recorded"), "consumables register: an unrecorded quantity renders 'Not recorded'");
    // Issues
    const { buildUnifiedIssueList, originLabel } = await import("../src/modules/issues/lib/buildUnifiedIssueList");
    const unified = buildUnifiedIssueList({ requests: [], maintenances: maintenance, incidents });
    assert(unified.length === maintenance.length + incidents.length, `Issues: the list is COMPLETE — ${maintenance.length} Work + ${incidents.length} incidents = ${unified.length} (the old first-100 cap showed 103)`);
    assert(unified.every((u) => originLabel(u.issue) === "Imported record"), "Issues: every imported record is labelled as imported (not 'FM logged')");
    assert(unified.filter((u) => u.issue.status === "unknown").length === 113 + 3 && unified.filter((u) => u.issue.status === "resolved").length === 2, "Issues: 116 show an unknown lifecycle; only the 2 explicitly 'Executed' Work records read as resolved");
    // Why the Issues lens shows 118, not 147: Requests are gated by the EXPLICIT capability requests.view
    const withRequests = buildUnifiedIssueList({ requests, maintenances: maintenance, incidents });
    assert(withRequests.length === 115 + 3 + 29 && withRequests.filter((u) => u.issue.id.startsWith("issue:request:")).length === 29, "Issues: with requests.view the lens is 147 = 115 Work + 3 incidents + ALL 29 Requests (no deduplication removes any Request)");
    assert(requests.every((r) => (r.maintenanceIds ?? []).length === 0 && (r.incidentIds ?? []).length === 0 && (r.workOrderIds ?? []).length === 0) && maintenance.every((m) => !m.sourceRequestId) && incidents.every((i) => !i.sourceRequestId), "Issues: no Request is linked to any Work/Incident (none was invented), so nothing is collapsed under a Request");
    // requests.view is an explicit grant that gates the Request-derived part of the lens (the 118 / 147 split). The
    // canonical Facility Manager package now carries it, so an active FM sees all 147 (verify-fm-operating-visibility).
    assert(/const canReadRequests = can\("requests\.view"\)/.test(readFileSync("src/modules/issues/components/IssuesPage.tsx", "utf8")), "Issues: the page never reads Requests without requests.view (documented gating)");
    // imported incident-derived Issue rows are read-only evidence
    const { deriveIssueActions } = await import("../src/lib/operational/issues/actions");
    const incidentIssues = unified.filter((u) => u.issue.rootIncidentId);
    assert(incidentIssues.length === 3 && incidentIssues.every((u) => u.issue.treatments.length === 0 && deriveIssueActions(u.issue).map((a) => a.id).join() === "view" && !deriveIssueActions(u.issue).some((a) => a.href) && u.issue.historicalSource?.reference === u.issue.rootIncidentId), "Issues: the 3 imported incident rows offer NO link at all (nothing routes to /incidents) and carry their source evidence inline");
    assert(unified.filter((u) => u.issue.rootMaintenanceId).every((u) => deriveIssueActions(u.issue).filter((a) => a.href).every((a) => a.href!.startsWith("/work"))), "Issues: all 115 Work-root rows route only to /work");
    // period correctness on the real data
    const { scopeSnapshotToPeriod, periodCoverageNotes } = await import("../src/services/reporting/periodScope");
    const snapshotLike = { ...n, kpis, projections: {}, health: {} } as never;
    const aug = scopeSnapshotToPeriod(snapshotLike, { kind: "month", year: 2026, month: 8 }, { timeZone: "Africa/Lagos" });
    const sep = scopeSnapshotToPeriod(snapshotLike, { kind: "month", year: 2026, month: 9 }, { timeZone: "Africa/Lagos" });
    assert(aug.incidents.length === incidents.filter((i) => (i.reportedAt ?? "").startsWith("2026-08")).length && aug.incidents.length > 0, "reporting period: August contains exactly the incidents dated in August");
    assert(aug.maintenance.length === 0 && aug.workOrders.length === 0 && sep.maintenance.length === 0 && sep.workOrders.length === 0 && sep.incidents.length === 0, "reporting period: the 115 Work / 113 WI (no recorded date) belong to NO period — not August, not the import month (September)");
    assert(aug.periodCoverage!.undated.maintenance === 115 && aug.periodCoverage!.undated.workOrders === 113 && /carry no recorded date/.test(periodCoverageNotes(aug).join(" ")), "reporting period: 115 + 113 undated records are counted and disclosed, never zero or all-clear");
    pass("Product reconciliation (live): nine-domain audit, asset code + 'Status not recorded', diesel label + no false 'High usage', consumables register readable with null/unit semantics, Issues complete + labelled, report periods honest");
  }

  console.log(out.join("\n"));
  console.log(`\n${out.length} groups passed — read-only`);
}

main().catch((e) => {
  console.error("FAIL", e instanceof Error ? e.message : e);
  process.exit(1);
});
