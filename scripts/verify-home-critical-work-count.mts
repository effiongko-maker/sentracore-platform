/**
 * Home Critical Work — exact register total from one Maintenance getAll
 * (includeCriticalWorkTotal), not newest-100 sample and not a second count HTTP.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-home-critical-work-count.mts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildAttentionModel, countCriticalWork } from "../src/modules/workspace/attention";
import {
  composeWorkspaceSnapshot,
  mapHomeMaintenancePageResult,
  parseHomeCriticalWorkTotal,
} from "../src/services/workspace/WorkspaceService";
import type { Maintenance } from "../src/modules/maintenance/types";
import { WORKSPACE_ASSIGNED_WORK_ORDER_STATUSES } from "../src/lib/operational/workload";
import type { WorkOrder } from "../src/modules/work-orders/types";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function read(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

function mnt(
  id: string,
  priority: Maintenance["priority"],
  status: Maintenance["status"] = "requested"
): Maintenance {
  return {
    id,
    title: id,
    type: "corrective",
    source: "manual",
    status,
    priority,
    facilityId: "FAC-0001",
    reportedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

/** Mirror Apps Script high/critical tokens used for Critical Work. */
function matchesHighOrCritical(priority: string): boolean {
  const token = String(priority || "").toLowerCase();
  return token === "high" || token === "critical";
}

/** Mirror Apps Script countCriticalWorkTotal_ on an already-filtered active set. */
function countCriticalWorkTotalBeforePagination(
  filteredActive: Maintenance[]
): number {
  return filteredActive.filter((row) => matchesHighOrCritical(row.priority))
    .length;
}

function main() {
  const results: string[] = [];

  const apps = read("apps-script/MaintenanceService.gs");
  assert(
    apps.includes("includeCriticalWorkTotal") &&
      apps.includes("countCriticalWorkTotal_") &&
      apps.includes("criticalWorkTotal"),
    "Apps Script Home flag returns criticalWorkTotal"
  );
  assert(
    apps.indexOf("countCriticalWorkTotal_(filtered)") <
      apps.indexOf("paginate_(sorted, payload)"),
    "criticalWorkTotal counted on filtered rows before pagination"
  );
  // high_or_critical filter retained for non-Home callers
  assert(
    apps.includes('priority === "high_or_critical"'),
    "Apps Script high_or_critical filter retained"
  );
  results.push("PASS Apps Script single-pass criticalWorkTotal before pagination");

  const types = read("src/modules/maintenance/types.ts");
  assert(
    types.includes("includeCriticalWorkTotal"),
    "MaintenanceListParams allows includeCriticalWorkTotal"
  );

  const ws = read("src/services/workspace/WorkspaceService.ts");
  assert(
    ws.includes("includeCriticalWorkTotal: true") &&
      ws.includes("settleMaintenanceHome") &&
      ws.includes("criticalWorkTotal"),
    "Home uses one Maintenance request with includeCriticalWorkTotal"
  );
  assert(
    !ws.includes('priority: "high_or_critical"') &&
      !ws.includes("settleCount") &&
      !/pageSize:\s*1/.test(ws),
    "Home no longer issues separate high_or_critical pageSize:1 count request"
  );
  assert(
    (ws.match(/MaintenanceService\.listMaintenance/g) || []).length === 1,
    "Home core path calls listMaintenance exactly once"
  );
  assert(
    ws.includes("pageSize: poolSize") && ws.includes('status: "active"'),
    "Home still loads active Maintenance pool (pageSize pool)"
  );
  assert(
    !/countCriticalWork\(maintenance\)/.test(ws),
    "Home does not sample-count the Maintenance pool for Critical Work"
  );
  assert(
    !/criticalWorkCount\s*=\s*[^;]*attention/.test(ws) &&
      !/criticalWork:\s*attention/.test(ws),
    "pulse Critical Work not sourced from attention.criticalCount"
  );
  results.push("PASS Home single Maintenance request + exact criticalWorkTotal");

  // settle mapping: Critical Work KPI only when criticalWorkTotal is finite
  assert(parseHomeCriticalWorkTotal(21) === 21, "21 → 21");
  assert(parseHomeCriticalWorkTotal(0) === 0, "0 is a valid exact total");
  assert(parseHomeCriticalWorkTotal(undefined) === null, "missing → null");
  assert(parseHomeCriticalWorkTotal("21") === null, "non-numeric string → null");
  assert(parseHomeCriticalWorkTotal(Number.NaN) === null, "NaN → null");

  const poolRows = [
    mnt("M1", "critical"),
    mnt("M2", "high"),
    ...Array.from({ length: 98 }, (_, i) => mnt(`M-MED-${i}`, "medium")),
  ];
  assert(poolRows.length === 100, "fixture is a 100-row pool");

  const mapped21 = mapHomeMaintenancePageResult({
    data: poolRows,
    criticalWorkTotal: 21,
  });
  assert(mapped21.maintenance.ok && mapped21.maintenance.data.length === 100, "pool kept");
  assert(mapped21.criticalWork.ok && mapped21.criticalWork.total === 21, "21 → ok total 21");

  const mapped0 = mapHomeMaintenancePageResult({
    data: poolRows,
    criticalWorkTotal: 0,
  });
  assert(mapped0.criticalWork.ok && mapped0.criticalWork.total === 0, "0 → ok total 0");

  const mappedMissing = mapHomeMaintenancePageResult({ data: poolRows });
  assert(mappedMissing.maintenance.ok, "missing total still keeps pool");
  assert(!mappedMissing.criticalWork.ok, "missing total → criticalWork not ok");

  const mappedBad = mapHomeMaintenancePageResult({
    data: poolRows,
    criticalWorkTotal: "21" as unknown as number,
  });
  assert(!mappedBad.criticalWork.ok, "non-numeric total → criticalWork not ok");

  const snap21 = composeWorkspaceSnapshot("2026-09-07T08:00:00.000Z", null, {
    workOrders: { ok: true, data: [] },
    incidents: { ok: true, data: [] },
    maintenance: mapped21.maintenance,
    criticalWork: mapped21.criticalWork,
    approvals: { ok: true, data: [] },
    facilities: { ok: true, data: [] },
  });
  assert(snap21.pulse.criticalWork === 21, "compose: criticalWorkTotal 21 → pulse 21");
  assert(snap21.pulse.openWork === 100, "compose: open work from pool");

  const snap0 = composeWorkspaceSnapshot("2026-09-07T08:00:00.000Z", null, {
    workOrders: { ok: true, data: [] },
    incidents: { ok: true, data: [] },
    maintenance: mapped0.maintenance,
    criticalWork: mapped0.criticalWork,
    approvals: { ok: true, data: [] },
    facilities: { ok: true, data: [] },
  });
  assert(snap0.pulse.criticalWork === 0, "compose: criticalWorkTotal 0 → pulse 0");

  const snapMissing = composeWorkspaceSnapshot("2026-09-07T08:00:00.000Z", null, {
    workOrders: { ok: true, data: [] },
    incidents: { ok: true, data: [] },
    maintenance: mappedMissing.maintenance,
    criticalWork: mappedMissing.criticalWork,
    approvals: { ok: true, data: [] },
    facilities: { ok: true, data: [] },
  });
  assert(snapMissing.pulse.criticalWork === null, "compose: missing total → null");
  assert(snapMissing.pulse.criticalWork !== 0, "missing total is not 0");
  assert(snapMissing.pulse.openWork === 100, "Open Work remains when Critical Work unavailable");
  assert(
    countCriticalWork(poolRows) === 2 && snapMissing.pulse.criticalWork === null,
    "100-row pool must never determine Critical Work when total missing"
  );
  results.push("PASS settle mapping: 21 / 0 / missing / non-numeric; pool never samples KPI");

  const mntService = read("src/services/maintenance/MaintenanceService.ts");
  assert(
    mntService.includes("criticalWorkTotal") &&
      mntService.includes("includeCriticalWorkTotal"),
    "MaintenanceService maps criticalWorkTotal through"
  );
  results.push("PASS frontend Maintenance mapping preserves criticalWorkTotal");

  // Definition: high + critical active; exclude medium/low/completed
  const register: Maintenance[] = [
    mnt("M-CRIT-OLD", "critical"),
    mnt("M-HIGH-OLD", "high"),
    mnt("M-MED", "medium"),
    mnt("M-LOW", "low"),
    mnt("M-CRIT-DONE", "critical", "completed"),
  ];
  const active = register.filter((row) =>
    ["requested", "triaged", "scheduled", "in_progress", "on_hold"].includes(
      row.status
    )
  );
  const exact = countCriticalWorkTotalBeforePagination(active);
  assert(exact === 2, "high + critical open rows counted (not medium/low/completed)");
  assert(
    countCriticalWork(active) === 2,
    "definition still matches isCriticalOpenWork population"
  );
  results.push("PASS high + critical both included in Critical Work definition");

  // >100 active: page slice would miss older critical; total from full filtered set
  const olderCritical = [
    mnt("M-CRIT-OLD", "critical"),
    mnt("M-HIGH-OLD", "high"),
  ];
  const newestPool: Maintenance[] = [
    ...Array.from({ length: 100 }, (_, i) => mnt(`M-NEW-${i + 1}`, "medium")),
    ...olderCritical,
  ];
  assert(newestPool.length === 102, "register has >100 active rows");
  const pageSlice = newestPool.slice(0, 100);
  assert(countCriticalWork(pageSlice) === 0, "newest-100 page has 0 critical");
  assert(
    countCriticalWorkTotalBeforePagination(newestPool) === 2,
    "exact total from full filtered set is 2 (>100 register)"
  );

  const snapshot = composeWorkspaceSnapshot("2026-09-07T08:00:00.000Z", null, {
    workOrders: { ok: true, data: [] },
    incidents: { ok: true, data: [] },
    maintenance: { ok: true, data: pageSlice },
    criticalWork: { ok: true, total: 2 },
    approvals: { ok: true, data: [] },
    facilities: { ok: true, data: [] },
  });
  assert(
    snapshot.pulse.criticalWork === 2,
    "exact total used even when pool sample would show 0"
  );
  assert(snapshot.pulse.openWork === 100, "open work still derived from pool");
  results.push(
    "PASS >100 active Maintenance: Critical Work uses register total not sample"
  );

  const small = composeWorkspaceSnapshot("2026-09-07T08:00:00.000Z", null, {
    workOrders: { ok: true, data: [] },
    incidents: { ok: true, data: [] },
    maintenance: {
      ok: true,
      data: [mnt("M1", "critical"), mnt("M2", "high"), mnt("M3", "medium")],
    },
    criticalWork: { ok: true, total: 2 },
    approvals: { ok: true, data: [] },
    facilities: { ok: true, data: [] },
  });
  assert(small.pulse.criticalWork === 2, "<100 critical items → exact count");
  results.push("PASS fewer than 100 Critical Work records → exact count");

  const attention = buildAttentionModel({
    asOf: "2026-09-07T08:00:00.000Z",
    incidents: [],
    workOrders: [],
    maintenance: pageSlice,
    approvals: [],
    facilityNameById: new Map([["FAC-0001", "NCC Annex"]]),
  });
  assert(
    snapshot.pulse.criticalWork === 2 &&
      attention.criticalCount !== snapshot.pulse.criticalWork,
    "Attention criticalCount remains independent of Critical Work KPI"
  );
  results.push("PASS Attention critical count remains independent");

  // One request: failure → both pool metrics and Critical Work unavailable
  const failedHome = composeWorkspaceSnapshot("2026-09-07T08:00:00.000Z", null, {
    workOrders: { ok: true, data: [] },
    incidents: { ok: true, data: [] },
    maintenance: { ok: false, data: [] },
    criticalWork: { ok: false, total: 0 },
    approvals: { ok: true, data: [] },
    facilities: { ok: true, data: [] },
  });
  assert(failedHome.pulse.criticalWork === null, "Maintenance failure → criticalWork null");
  assert(failedHome.pulse.criticalWork !== 0, "unavailable is not 0");
  assert(failedHome.pulse.openWork === null, "Maintenance failure → openWork null");

  // Success with missing criticalWorkTotal (undeployed AS) → null KPI, pool still usable
  const missingTotal = composeWorkspaceSnapshot("2026-09-07T08:00:00.000Z", null, {
    workOrders: { ok: true, data: [] },
    incidents: { ok: true, data: [] },
    maintenance: { ok: true, data: [mnt("M1", "critical")] },
    criticalWork: { ok: false, total: 0 },
    approvals: { ok: true, data: [] },
    facilities: { ok: true, data: [] },
  });
  assert(missingTotal.pulse.criticalWork === null, "missing exact total → null");
  assert(missingTotal.pulse.openWork === 1, "pool success still drives openWork");
  results.push("PASS Maintenance failure/missing total → criticalWork null, never 0");

  // Work Orders: successful settle survives progressive complete enrichment
  const woRows: WorkOrder[] = [
    {
      id: "WO-1",
      title: "Open",
      type: "corrective",
      source: "manual",
      status: "open",
      priority: "medium",
      facilityId: "FAC-0001",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    },
    {
      id: "WO-2",
      title: "In progress",
      type: "corrective",
      source: "manual",
      status: "in_progress",
      priority: "medium",
      facilityId: "FAC-0001",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    },
    {
      id: "WO-3",
      title: "Done",
      type: "corrective",
      source: "manual",
      status: "completed",
      priority: "medium",
      facilityId: "FAC-0001",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    },
  ];
  const expectedOpenWo = woRows.filter((r) =>
    WORKSPACE_ASSIGNED_WORK_ORDER_STATUSES.has(r.status)
  ).length;
  assert(expectedOpenWo === 2, "fixture open WO count");

  const coreWoLists = {
    workOrders: { ok: true as const, data: woRows },
    incidents: { ok: true as const, data: [] },
    maintenance: { ok: true as const, data: [mnt("M1", "medium")] },
    criticalWork: { ok: true as const, total: 0 },
    approvals: { ok: true as const, data: [] },
    facilities: { ok: true as const, data: [] },
  };
  const coreSnap = composeWorkspaceSnapshot(
    "2026-09-07T08:00:00.000Z",
    null,
    coreWoLists
  );
  assert(
    coreSnap.pulse.openWorkOrders === expectedOpenWo,
    "successful WO response → correct openWorkOrders"
  );

  const completeSnap = composeWorkspaceSnapshot("2026-09-07T08:00:00.000Z", null, {
    ...coreWoLists,
    // Simulate progressive enrich: same core WO lists + non-core facilities/approvals.
    approvals: { ok: true, data: [] },
    facilities: { ok: true, data: [{ id: "FAC-0001", name: "NCC Annex" }] },
  });
  assert(
    completeSnap.pulse.openWorkOrders === coreSnap.pulse.openWorkOrders,
    "progressive complete enrichment preserves openWorkOrders"
  );

  const woFailed = composeWorkspaceSnapshot("2026-09-07T08:00:00.000Z", null, {
    workOrders: { ok: false, data: [] },
    incidents: { ok: true, data: [] },
    maintenance: { ok: true, data: [mnt("M1", "medium")] },
    criticalWork: { ok: true, total: 0 },
    approvals: { ok: true, data: [] },
    facilities: { ok: true, data: [] },
  });
  assert(woFailed.pulse.openWorkOrders === null, "WO timeout/fail → openWorkOrders null");
  assert(woFailed.pulse.openWorkOrders !== 0, "WO unavailable is not 0");

  const wsSrc = read("src/services/workspace/WorkspaceService.ts");
  assert(
    wsSrc.includes("...coreLists") &&
      wsSrc.includes("...nonCoreLists") &&
      wsSrc.includes("mapHomeMaintenancePageResult"),
    "complete reuses coreLists; Maintenance settle uses explicit Critical Work mapper"
  );
  results.push("PASS WO openWorkOrders: success / complete preserve / fail → null");

  // List UI must not require the Home flag
  const workHook = read("src/modules/work/hooks/useWork.ts");
  assert(
    !workHook.includes("includeCriticalWorkTotal"),
    "Work list UI does not pass Home-only flag"
  );
  results.push("PASS Maintenance list/UI path unchanged (no Home flag)");

  const financeHook = read("src/modules/finance/hooks/useFinancialPosition.ts");
  assert(
    !financeHook.includes("includeCriticalWorkTotal") &&
      !financeHook.includes("high_or_critical"),
    "Finance hook unchanged"
  );
  const bell = read("src/components/platform/GlobalNotificationBell.tsx");
  assert(
    !bell.includes("includeCriticalWorkTotal") &&
      !bell.includes("high_or_critical"),
    "Notifications unchanged"
  );
  results.push("PASS Finance and Notifications remain unchanged");

  for (const line of results) console.log(line);
  console.log("verify-home-critical-work-count: PASS");
}

main();
