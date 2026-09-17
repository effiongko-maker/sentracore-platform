/** Non-mutating verification for the final Command Centre v1 truthfulness pass. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildOperationalPictureMetrics } from "../src/modules/workspace/operationalPicture";
import { loadOperationalMaintenancePages } from "../src/services/workspace/WorkspaceService";
import { composeFinanceDecisionQueue } from "../src/modules/command-centre/server/composeFinanceDecisionQueue";
import type { Maintenance } from "../src/modules/maintenance/types";
import type { WorkOrder } from "../src/modules/work-orders/types";
import type { Approval } from "../src/modules/approvals/types";
import type { FinancialRequest } from "../src/modules/platform-finance/types";
import type { FinanceVendorBill } from "../src/modules/platform-finance/domain/vendorBills";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
  console.log(`PASS ${message}`);
}

const asOf = "2026-09-17T12:00:00.000Z";
const maintenance = Array.from({ length: 135 }, (_, index) => ({
  id: `MNT-${index}`,
  status: "in_progress",
  dueAt: index < 121 ? "2026-09-15T00:00:00.000Z" : "2026-09-20T00:00:00.000Z",
  requiresWorkOrder: index < 125,
  workOrderId: undefined,
  workOrderIds: [],
})) as unknown as Maintenance[];
maintenance.push({ id: "MNT-DONE", status: "completed", dueAt: "2026-09-01T00:00:00.000Z" } as Maintenance);

const maintenancePageCalls: Array<{
  page: number;
  includeCriticalWorkTotal: boolean;
}> = [];
const walkedMaintenance = await loadOperationalMaintenancePages(
  async (page, pageSize, includeCriticalWorkTotal) => {
    maintenancePageCalls.push({ page, includeCriticalWorkTotal });
    const start = (page - 1) * pageSize;
    const data = maintenance.slice(start, start + pageSize);
    return {
      data,
      page,
      pageSize,
      total: maintenance.length,
      totalPages: Math.ceil(maintenance.length / pageSize),
      ...(page === 1 ? { criticalWorkTotal: 17 } : {}),
    };
  },
  100
);
assert(
  maintenancePageCalls.length === 2 &&
    maintenancePageCalls[0]?.includeCriticalWorkTotal === true &&
    maintenancePageCalls[1]?.includeCriticalWorkTotal === false,
  "Maintenance page 1 alone requests criticalWorkTotal"
);
assert(
  walkedMaintenance.data.length === maintenance.length,
  "Maintenance walk exhausts datasets larger than 100"
);
assert(
  walkedMaintenance.criticalWork === 17,
  "Maintenance walk preserves returned criticalWorkTotal"
);
assert(
  walkedMaintenance.criticalWork !==
    walkedMaintenance.data.filter(
      (row) => row.priority === "critical" || row.priority === "high"
    ).length,
  "Critical is not derived from walked priority counts"
);

const missingCritical = await loadOperationalMaintenancePages(
  async (page, pageSize) => ({
    data: maintenance.slice((page - 1) * pageSize, page * pageSize),
    page,
    pageSize,
    total: maintenance.length,
    totalPages: Math.ceil(maintenance.length / pageSize),
  }),
  100
);
assert(
  missingCritical.criticalWork === null,
  "missing criticalWorkTotal remains unavailable"
);
const invalidCritical = await loadOperationalMaintenancePages(
  async (page, pageSize) => ({
    data: maintenance.slice((page - 1) * pageSize, page * pageSize),
    page,
    pageSize,
    total: maintenance.length,
    totalPages: Math.ceil(maintenance.length / pageSize),
    ...(page === 1
      ? { criticalWorkTotal: "17" as unknown as number }
      : {}),
  }),
  100
);
assert(
  invalidCritical.criticalWork === null,
  "invalid criticalWorkTotal remains unavailable"
);

let failedWalkRejected = false;
try {
  await loadOperationalMaintenancePages(async (page, pageSize) => {
    if (page === 2) throw new Error("simulated page failure");
    return {
      data: maintenance.slice(0, pageSize),
      page,
      pageSize,
      total: maintenance.length,
      totalPages: 2,
      criticalWorkTotal: 17,
    };
  }, 100);
} catch {
  failedWalkRejected = true;
}
assert(
  failedWalkRejected,
  "Maintenance walk failure rejects the coupled rows and KPI result"
);

const workOrders = Array.from({ length: 130 }, (_, index) => ({
  id: `WO-${index}`,
  status: index < 115 ? "on_hold" : "in_progress",
  dueAt: index < 123 ? "2026-09-14T00:00:00.000Z" : "2026-09-20T00:00:00.000Z",
})) as unknown as WorkOrder[];
workOrders.push({ id: "WO-CLOSED", status: "closed", dueAt: "2026-09-01T00:00:00.000Z" } as WorkOrder);

const approvals = Array.from({ length: 110 }, (_, index) => ({
  id: `APR-${index}`,
  status: "submitted",
})) as unknown as Approval[];

const metrics = buildOperationalPictureMetrics({
  asOf,
  criticalWork: 17,
  maintenance,
  workOrders,
  approvals,
});
assert(metrics.inProgress === 135, "exact In Progress exceeds 100");
assert(metrics.awaitingAction === 350, "exact Awaiting Action exceeds source page sizes");
assert(metrics.overdue === 244, "exact Overdue exceeds source page sizes");
assert(metrics.critical === 17, "Critical preserves the authoritative KPI");
assert(Number(metrics.overdue) !== 246, "completed and closed rows are excluded from Overdue");

const failedMaintenance = buildOperationalPictureMetrics({
  asOf,
  criticalWork: null,
  maintenance: null,
  workOrders,
  approvals,
});
assert(failedMaintenance.inProgress === null, "Maintenance failure is not numeric zero");
assert(failedMaintenance.awaitingAction === null, "Awaiting Action is unavailable when a required source fails");
assert(failedMaintenance.overdue === null, "Overdue is unavailable when a required source fails");

const request = (id: string, status: string, companyId: string) => ({
  id,
  status,
  companyId,
  currency: "NGN",
  requestedAmount: 100,
  updatedAt: asOf,
}) as FinancialRequest;
const bill = (id: string, status: string, companyId: string) => ({
  id,
  status,
  companyId,
  currency: "NGN",
  billedAmount: 200,
  updatedAt: asOf,
}) as FinanceVendorBill;
const queue = composeFinanceDecisionQueue({
  requests: [request("FR-CEO", "pending_ceo_approval", "A"), request("FR-REVIEW", "under_review", "B")],
  vendorBills: [bill("VB-CEO", "pending_ceo_approval", "B"), bill("VB-SUBMITTED", "submitted", "A")],
  categories: [],
});
assert(queue.items.some((item) => item.source === "finance_request"), "FR pending CEO contributes");
assert(queue.items.some((item) => item.source === "vendor_bill"), "VB pending CEO contributes");
assert(queue.items.length === 2, "review-stage FR and VB do not contribute");

const service = readFileSync(resolve("src/modules/command-centre/server/CommandCentreServerService.ts"), "utf8");
const finance = readFileSync(resolve("src/modules/platform-finance/server/PlatformFinanceServerService.ts"), "utf8");
const workspace = readFileSync(resolve("src/services/workspace/WorkspaceService.ts"), "utf8");
assert(workspace.includes("loadAllPages("), "Operations exact path walks pagination instead of enlarging one page");
const operationsLoader = workspace.slice(
  workspace.indexOf("export async function loadOperationalPictureMetrics"),
  workspace.indexOf("export async function loadAssignedWorkSummary")
);
assert(
  !operationsLoader.includes("settleMaintenanceHome") &&
    (operationsLoader.match(/MaintenanceService\.listMaintenance/g) ?? []).length === 1,
  "Operations has no separate Maintenance-home KPI request"
);
assert(
  operationsLoader.includes("includeCriticalWorkTotal: true"),
  "Operations page-1 walk requests criticalWorkTotal"
);
assert(finance.includes("organisationWide") && finance.includes("PlatformFinanceVendorBillsRepository"), "Finance Pulse projection is organisation-wide and includes Vendor Bills");
assert(service.includes("listApprovalQueue(actor)"), "Your Decisions remains actor/company scoped");
assert(service.includes("overview.pendingCeoDecisions.count"), "Pulse and Decisions use intentionally different scopes");
assert((service.match(/if \(!canApprove \|\| !canDecide\) return \{ state: \"restricted\"/g) ?? []).length >= 1, "missing decision authority is restricted, not empty");
assert(!service.includes("isSuperAdmin && canDecide"), "Super Admin does not bypass business decision grants");
assert(service.includes('state: items.length === 0 ? "empty" : "healthy"'), "authorised zero combined queue remains truthfully empty");

console.log("\nCommand Centre truthfulness verification passed.");
