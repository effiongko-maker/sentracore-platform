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

  console.log(out.join("\n"));
  console.log(`\n${out.length} groups passed — read-only`);
}

main().catch((e) => {
  console.error("FAIL", e instanceof Error ? e.message : e);
  process.exit(1);
});
