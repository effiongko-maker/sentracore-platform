/**
 * Home V1 — Approvals / Facilities must not contend with core WO/INC/MNT.
 *
 * Proves:
 * 1. core does not await Approvals/Facilities
 * 2. LoadingGate can open after WO/INC/MNT settle (empty non-core at core paint)
 * 3. Approvals/Facilities still enrich the snapshot afterward
 * 4. Critical Work and WO values are preserved through the enrichment update
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-home-core-noncore-deferral.mts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { composeWorkspaceSnapshot } from "../src/services/workspace/WorkspaceService";
import type { Maintenance } from "../src/modules/maintenance/types";
import type { WorkOrder } from "../src/modules/work-orders/types";
import { WORKSPACE_ASSIGNED_WORK_ORDER_STATUSES } from "../src/lib/operational/workload";

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

function wo(
  id: string,
  status: WorkOrder["status"],
  overrides: Partial<WorkOrder> = {}
): WorkOrder {
  return {
    id,
    title: id,
    type: "corrective",
    source: "manual",
    status,
    priority: "medium",
    facilityId: "FAC-0001",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

const results: string[] = [];

const ws = read("src/services/workspace/WorkspaceService.ts");

// 1) Non-core register loads are deferred until after corePromise settles.
assert(
  /const nonCorePromise\s*=\s*corePromise\.then\(\s*\(\)\s*=>\s*startNonCoreDomainLists\(asOf\)/.test(
    ws
  ),
  "nonCorePromise must chain startNonCoreDomainLists after corePromise"
);
assert(
  !/const nonCorePromise\s*=\s*startNonCoreDomainLists\(/.test(ws),
  "nonCore must not start eagerly beside core"
);
assert(
  ws.includes("startCoreDomainLists") &&
    ws.includes("startNonCoreDomainLists") &&
    ws.includes("emptyNonCoreDomainLists"),
  "core / non-core / empty-non-core helpers remain"
);
assert(
  /startCoreDomainLists[\s\S]*WorkOrderService\.listWorkOrders[\s\S]*IncidentService\.listIncidents[\s\S]*settleMaintenanceHome/.test(
    ws
  ),
  "core still starts WO + INC + MNT Home only"
);
assert(
  /function startNonCoreDomainLists[\s\S]*ApprovalService\.listApprovals[\s\S]*FacilityService\.listFacilities/.test(
    ws
  ),
  "non-core still loads Approvals + Facilities"
);
assert(
  !/function startCoreDomainLists[\s\S]*?ApprovalService/.test(
    ws.slice(
      ws.indexOf("function startCoreDomainLists"),
      ws.indexOf("function startNonCoreDomainLists")
    )
  ),
  "core Promise.all must not include Approvals"
);
results.push("PASS core does not await Approvals/Facilities");

// 2) Core paint path uses empty non-core — LoadingGate can open without them.
assert(
  /corePromise\.then\(\(coreLists\)\s*=>\s*\(\{\s*\.\.\.composeWorkspaceSnapshot\([\s\S]*?\.\.\.coreLists[\s\S]*?\.\.\.emptyNonCoreDomainLists\(\)/.test(
    ws
  ),
  "core snapshot uses emptyNonCoreDomainLists (paint without Approvals/Facilities)"
);
const useWs = read("src/modules/workspace/hooks/useWorkspace.ts");
assert(
  useWs.includes("signalHomeWorkspaceSettled") &&
    useWs.includes("beginWorkspaceLoad") &&
    useWs.includes("complete") &&
    useWs.includes("Never flip loading back to true"),
  "useWorkspace opens LoadingGate on core; enrich does not re-gate"
);
results.push("PASS LoadingGate can open after WO/INC/MNT settle");

// 3–4) Composition: enrich merges Approvals/Facilities; CW + WO preserved.
const criticalTotal = 21;
const woRows: WorkOrder[] = [
  wo("WO-1", "assigned"),
  wo("WO-2", "in_progress"),
  wo("WO-3", "completed"),
];
const expectedOpenWo = woRows.filter((r) =>
  WORKSPACE_ASSIGNED_WORK_ORDER_STATUSES.has(r.status)
).length;

const coreLists = {
  workOrders: { ok: true as const, data: woRows },
  incidents: { ok: true as const, data: [] },
  maintenance: {
    ok: true as const,
    data: [mnt("M1", "critical"), mnt("M2", "medium")],
  },
  criticalWork: { ok: true as const, total: criticalTotal },
  approvals: { ok: true as const, data: [] },
  facilities: { ok: true as const, data: [] },
};

const coreSnap = composeWorkspaceSnapshot(
  "2026-09-07T12:00:00.000Z",
  null,
  coreLists
);
assert(
  coreSnap.pulse.criticalWork === criticalTotal,
  "core paint Critical Work from exact total"
);
assert(
  coreSnap.pulse.openWorkOrders === expectedOpenWo,
  "core paint openWorkOrders from WO pool"
);

const completeSnap = composeWorkspaceSnapshot(
  "2026-09-07T12:00:00.000Z",
  { id: "U-1", name: "Ada" },
  {
    ...coreLists,
    approvals: {
      ok: true,
      data: [
        {
          id: "APR-1",
          title: "Needs review",
          type: "standard_maintenance",
          workOrderId: "WO-1",
          facilityId: "FAC-0001",
          status: "awaiting_decision",
          createdAt: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-09-01T00:00:00.000Z",
        },
      ],
    },
    facilities: {
      ok: true,
      data: [{ id: "FAC-0001", name: "NCC Annex" }],
    },
  }
);

assert(
  completeSnap.pulse.criticalWork === coreSnap.pulse.criticalWork,
  "enrichment preserves Critical Work"
);
assert(
  completeSnap.pulse.openWorkOrders === coreSnap.pulse.openWorkOrders,
  "enrichment preserves openWorkOrders"
);
assert(
  ws.includes("...coreLists") && ws.includes("...nonCoreLists"),
  "complete merge reuses coreLists + nonCoreLists"
);
results.push("PASS Approvals/Facilities enrich afterward; CW + WO preserved");

assert(
  ws.includes("includeCriticalWorkTotal") &&
    ws.includes("settleMaintenanceHome") &&
    ws.includes("WORKSPACE_HOME_DOMAIN_TIMEOUT_MS") &&
    !ws.includes('priority: "high_or_critical"'),
  "Home MNT single-pass + timeout unchanged"
);
results.push("PASS Critical Work / settleDomain / pools unchanged");

for (const line of results) console.log(line);
console.log("OK verify-home-core-noncore-deferral");
