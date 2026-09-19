/** Golden, non-mutating equivalence check for Command Centre FM aggregates. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import {
  buildOperationalPictureMetrics,
  buildOperationalPictureMetricsFromAggregate,
} from "../src/modules/workspace/operationalPicture";
import { buildAssignedWorkDomains } from "../src/services/workspace/WorkspaceService";
import {
  parseOperationalPictureSummary,
} from "../src/services/workspace/CommandCentreFmSummaryService";
import type { Approval } from "../src/modules/approvals/types";
import type { Incident } from "../src/modules/incidents/types";
import type { Maintenance } from "../src/modules/maintenance/types";
import type { WorkOrder } from "../src/modules/work-orders/types";

const source = readFileSync(
  new URL("../apps-script/CommandCentreFmSummaryService.gs", import.meta.url),
  "utf8"
);
const context = vm.createContext({ Date, isNaN });
vm.runInContext(`${source}\nthis.fm = CommandCentreFmSummaryService;`, context);
const fm = (context as unknown as { fm: Record<string, (...args: unknown[]) => unknown> }).fm;

const asOf = "2026-09-17T00:00:00.000Z";
const mnt = (id: string, status: string, extra = {}) =>
  ({ id, status, priority: "normal", ...extra }) as unknown as Maintenance;
const wo = (id: string, status: string, extra = {}) =>
  ({ id, status, ...extra }) as unknown as WorkOrder;
const apr = (id: string, status: string) =>
  ({ id, status }) as unknown as Approval;
const inc = (id: string, status: string, assignedToUserId?: string) =>
  ({ id, status, assignedToUserId }) as unknown as Incident;

const maintenance: Maintenance[] = [
  mnt("M-requested", "requested", { priority: "high", dueAt: "2026-09-16T23:59:59-01:00" }),
  mnt("M-triaged", "triaged", { priority: "critical", dueAt: "2026-09-16T23:59:59Z" }),
  mnt("M-scheduled", "scheduled", { requiresWorkOrder: true }),
  mnt("M-in-progress", "in_progress", { dueAt: "2026-09-17T23:59:59Z" }),
  mnt("M-hold", "on_hold", { dueAt: "2026-09-18T00:00:00Z" }),
  mnt("M-linked-one", "requested", { requiresWorkOrder: true, workOrderId: "WO-X" }),
  mnt("M-linked-many", "requested", { requiresWorkOrder: true, workOrderIds: ["WO-Y"] }),
  mnt("M-completed", "completed", { priority: "critical", dueAt: "2026-09-01T00:00:00Z" }),
];
const workOrders: WorkOrder[] = [
  wo("WO-draft", "draft", { dueAt: "2026-09-01T00:00:00Z" }),
  wo("WO-open", "open", { dueAt: "2026-09-16T23:59:59Z" }),
  wo("WO-assigned", "assigned", { dueAt: "2026-09-17T00:00:00Z" }),
  wo("WO-progress", "in_progress", { dueAt: "2026-09-18T00:00:00Z" }),
  wo("WO-hold", "on_hold", { slaDueAt: "2026-09-16T23:00:00Z" }),
  wo("WO-completed", "completed", { dueAt: "2026-09-01T00:00:00Z" }),
  wo("WO-closed", "closed", { dueAt: "2026-09-01T00:00:00Z" }),
];
const approvals = [
  "awaiting_decision",
  "awaiting_submission",
  "submitted",
  "awaiting_response",
  "returned",
  "approved",
  "rejected",
].map((status, index) => apr(`APR-${index}`, status));

const appsMaintenance = fm.summarizeMaintenanceForRows(maintenance, asOf) as Record<string, number | string>;
const appsWorkOrders = fm.summarizeWorkOrdersForRows(workOrders, asOf) as Record<string, number | string>;
const appsApprovals = fm.summarizeApprovalsForRows(approvals) as Record<string, number | string>;

const canonicalMaintenance = buildOperationalPictureMetrics({
  asOf,
  criticalWork: maintenance.filter(
    (row) =>
      ["requested", "triaged", "scheduled", "in_progress", "on_hold"].includes(row.status) &&
      ["high", "critical"].includes(String(row.priority).toLowerCase())
  ).length,
  maintenance,
  workOrders: [],
  approvals: [],
});
const canonicalWorkOrders = buildOperationalPictureMetrics({
  asOf,
  criticalWork: 0,
  maintenance: [],
  workOrders,
  approvals: [],
});
const canonicalApprovals = buildOperationalPictureMetrics({
  asOf,
  criticalWork: 0,
  maintenance: [],
  workOrders: [],
  approvals,
});

assert.equal(appsMaintenance.critical, canonicalMaintenance.critical);
assert.equal(appsMaintenance.inProgress, canonicalMaintenance.inProgress);
assert.equal(appsMaintenance.awaitingAction, canonicalMaintenance.awaitingAction);
assert.equal(appsMaintenance.overdue, canonicalMaintenance.overdue);
assert.equal(appsWorkOrders.awaitingAction, canonicalWorkOrders.awaitingAction);
assert.equal(appsWorkOrders.overdue, canonicalWorkOrders.overdue);
assert.equal(appsApprovals.awaitingAction, canonicalApprovals.awaitingAction);
assert.equal(appsWorkOrders.overdue, 2, "draft excluded and slaDueAt fallback included");
assert.equal(appsMaintenance.overdue, 1, "UTC day boundary is deterministic");

const actor = "USR-0002";
maintenance[0]!.assignedToUserId = actor;
maintenance[7]!.assignedToUserId = actor;
workOrders[0]!.assignedToUserId = actor;
workOrders[1]!.assignedToUserId = actor;
workOrders[2]!.assignedToUserId = "USR-OTHER";
const incidents = [
  inc("INC-reported", "reported", actor),
  inc("INC-triaged", "triaged", actor),
  inc("INC-investigating", "investigating", actor),
  inc("INC-contained", "contained", actor),
  inc("INC-closed", "closed", actor),
  inc("INC-other", "reported", "USR-OTHER"),
];
const canonicalAssignments = buildAssignedWorkDomains(actor, {
  maintenance,
  workOrders,
  incidents,
});
const activeMnt = {
  requested: true,
  triaged: true,
  scheduled: true,
  in_progress: true,
  on_hold: true,
};
const activeWo = { open: true, assigned: true, in_progress: true, on_hold: true };
const activeInc = { reported: true, triaged: true, investigating: true, contained: true };
assert.equal(
  (fm.countAssignmentsForRows(maintenance, actor, activeMnt) as { active: number }).active,
  canonicalAssignments[0]?.count
);
assert.equal(
  (fm.countAssignmentsForRows(workOrders, actor, activeWo) as { active: number }).active,
  canonicalAssignments[1]?.count
);
assert.equal(
  (fm.countAssignmentsForRows(incidents, actor, activeInc) as { active: number }).active,
  canonicalAssignments[2]?.count
);

const parsedPicture = parseOperationalPictureSummary(
  {
    contractVersion: "operational-picture.v1",
    asOf,
    maintenance: appsMaintenance,
    workOrders: appsWorkOrders,
    approvals: appsApprovals,
  },
  asOf
);
assert.deepEqual(
  buildOperationalPictureMetricsFromAggregate(parsedPicture),
  buildOperationalPictureMetrics({
    asOf,
    criticalWork: canonicalMaintenance.critical,
    maintenance,
    workOrders,
    approvals,
  })
);
assert.throws(() =>
  parseOperationalPictureSummary(
    { contractVersion: "unsupported", asOf },
    asOf
  )
);
assert.throws(() =>
  parseOperationalPictureSummary(
    { contractVersion: "operational-picture.v1", asOf: "wrong" },
    asOf
  )
);
// Phase 2E: the Apps Script Assignment Summary contract is retired. Work, Work
// Instructions and Incidents are all Supabase (profile UUID); no summary parser remains.

console.log("Command Centre FM aggregate golden contract verification passed.");
