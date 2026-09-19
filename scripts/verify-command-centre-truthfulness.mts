/** Non-mutating Command Centre truthfulness and request-shape verification. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildOperationalPictureMetricsFromAggregate } from "../src/modules/workspace/operationalPicture";
import { composeFinanceDecisionQueue } from "../src/modules/command-centre/server/composeFinanceDecisionQueue";
import type { FinancialRequest } from "../src/modules/platform-finance/types";
import type { FinanceVendorBill } from "../src/modules/platform-finance/domain/vendorBills";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
  console.log(`PASS ${message}`);
}

const healthy = buildOperationalPictureMetricsFromAggregate({
  maintenance: { state: "healthy", critical: 17, inProgress: 135, awaitingAction: 125, overdue: 121 },
  workOrders: { state: "healthy", awaitingAction: 115, overdue: 123 },
  approvals: { state: "healthy", awaitingAction: 110 },
});
assert(healthy.critical === 17, "Critical preserves authoritative Maintenance count");
assert(healthy.inProgress === 135, "In Progress preserves Maintenance count");
assert(healthy.awaitingAction === 350, "Awaiting Action composes MNT + WO + APR");
assert(healthy.overdue === 244, "Overdue composes MNT + WO");

const failedMaintenance = buildOperationalPictureMetricsFromAggregate({
  maintenance: { state: "unavailable" },
  workOrders: { state: "healthy", awaitingAction: 1, overdue: 2 },
  approvals: { state: "healthy", awaitingAction: 3 },
});
assert(failedMaintenance.critical === null, "Maintenance failure cannot become Critical zero");
assert(failedMaintenance.inProgress === null, "Maintenance failure cannot become In Progress zero");
assert(failedMaintenance.awaitingAction === null, "Maintenance failure invalidates Awaiting Action");
assert(failedMaintenance.overdue === null, "Maintenance failure invalidates Overdue");

const failedWorkOrders = buildOperationalPictureMetricsFromAggregate({
  maintenance: { state: "healthy", critical: 0, inProgress: 0, awaitingAction: 0, overdue: 0 },
  workOrders: { state: "unavailable" },
  approvals: { state: "healthy", awaitingAction: 0 },
});
assert(failedWorkOrders.critical === 0, "healthy Maintenance zero remains truthful");
assert(failedWorkOrders.awaitingAction === null, "Work Order failure invalidates Awaiting Action");
assert(failedWorkOrders.overdue === null, "Work Order failure invalidates Overdue");

const failedApprovals = buildOperationalPictureMetricsFromAggregate({
  maintenance: { state: "healthy", critical: 1, inProgress: 2, awaitingAction: 3, overdue: 4 },
  workOrders: { state: "healthy", awaitingAction: 5, overdue: 6 },
  approvals: { state: "unavailable" },
});
assert(failedApprovals.awaitingAction === null, "Approval failure invalidates Awaiting Action");
assert(failedApprovals.overdue === 10, "Approval failure does not erase Overdue");

const asOf = "2026-09-17T12:00:00.000Z";
const request = (id: string, status: string, companyId: string) => ({ id, status, companyId, currency: "NGN", requestedAmount: 100, updatedAt: asOf }) as FinancialRequest;
const bill = (id: string, status: string, companyId: string) => ({ id, status, companyId, currency: "NGN", billedAmount: 200, updatedAt: asOf }) as FinanceVendorBill;
const queue = composeFinanceDecisionQueue({
  requests: [request("FR-CEO", "pending_ceo_approval", "A"), request("FR-REVIEW", "under_review", "B")],
  vendorBills: [bill("VB-CEO", "pending_ceo_approval", "B"), bill("VB-SUBMITTED", "submitted", "A")],
  categories: [],
});
assert(queue.items.length === 2, "Finance decision semantics remain unchanged");

const service = readFileSync(resolve("src/modules/command-centre/server/CommandCentreServerService.ts"), "utf8");
const summaryClient = readFileSync(resolve("src/services/workspace/CommandCentreFmSummaryService.ts"), "utf8");
const workspace = readFileSync(resolve("src/services/workspace/WorkspaceService.ts"), "utf8");
const assignmentsComposer = service.slice(service.indexOf("private async composeAssignments"), service.indexOf("private async composeLastVisit"));
assert(service.includes("loadOperationalPictureSummary(asOf)"), "Command Centre requests one Operational Picture summary");
assert(!assignmentsComposer.includes("loadAssignmentSummary"), "Phase 2E: no Apps Script Assignment Summary");
assert(assignmentsComposer.includes("FmWorkInstructionRepository") && assignmentsComposer.includes("FmIncidentRepository") && assignmentsComposer.includes("FmWorkRepository"), "Assignments from Supabase Work, Work Instructions and Incidents");
assert(!assignmentsComposer.includes("operational_identity_links"), "no identity-link hop for assignments");
assert(!service.includes("loadOperationalFmSnapshot"), "full-row OperationalFmSnapshot is superseded");
assert(!service.includes("listMaintenance"), "Command Centre performs no Maintenance getAll/pagination");
assert(!service.includes("listWorkOrders"), "Command Centre performs no Work Order getAll");
assert(!service.includes("listApprovals"), "Command Centre performs no Approval getAll");
assert(!service.includes("listIncidents"), "Command Centre performs no assigned Incident getAll");
assert((summaryClient.match(/postToAppsScriptData\(/g) ?? []).length === 1, "summary client keeps ONE Apps Script call (Approvals only)");
assert(summaryClient.includes("Unsupported Operational Picture contract version"), "Operational Picture version mismatch fails closed");
assert(workspace.includes("buildAssignedWorkDomains"), "Workspace retains canonical assignment predicate projection");
assert(assignmentsComposer.includes('state === "unavailable"'), "Assignment domains preserve unavailable state");
assert(assignmentsComposer.includes("unavailable.length === domains.length"), "all assignment failures produce section error");

console.log("\nCommand Centre truthfulness verification passed.");
