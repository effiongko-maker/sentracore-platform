import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { postToAppsScriptData } from "../src/services/api/appsScriptProxy";
import { MaintenanceService } from "../src/services/maintenance/MaintenanceService";
import { WorkOrderService } from "../src/services/workOrders/WorkOrderService";

function loadEnv() {
  const p = resolve(".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    process.env[t.slice(0, i).trim()] ??= t.slice(i + 1).trim();
  }
}
loadEnv();

const activeAll = (await postToAppsScriptData(
  {
    resource: "maintenance",
    action: "getAll",
    payload: {
      page: 1,
      pageSize: 1,
      status: "active",
      priority: "all",
      type: "all",
      facilityId: "all",
      assignedToUserId: "all",
      requiresWorkOrder: "all",
    },
  },
  { resource: "maintenance", action: "getAll" },
  "active-all"
)) as { total?: number };

const woSearch = (await postToAppsScriptData(
  {
    resource: "maintenance",
    action: "getAll",
    payload: {
      page: 1,
      pageSize: 10,
      search: "WO-2026-000014",
      status: "active",
      priority: "all",
      type: "all",
      facilityId: "all",
      assignedToUserId: "all",
      requiresWorkOrder: "all",
    },
  },
  { resource: "maintenance", action: "getAll" },
  "wo-search"
)) as { data?: Array<{ id?: string; workOrderId?: string }>; total?: number };

const stamp = Date.now();
const reqTrue = await MaintenanceService.createMaintenance({
  title: `P29 filt true ${stamp}`,
  description: "filter",
  facilityId: "FAC-0001",
  type: "corrective",
  source: "manual",
  priority: "medium",
  status: "in_progress",
  reportedAt: new Date().toISOString(),
  requiresWorkOrder: true,
});
const reqFalse = await MaintenanceService.createMaintenance({
  title: `P29 filt false ${stamp}`,
  description: "filter",
  facilityId: "FAC-0001",
  type: "corrective",
  source: "manual",
  priority: "medium",
  status: "in_progress",
  reportedAt: new Date().toISOString(),
  requiresWorkOrder: false,
});

const listTrue = await MaintenanceService.listMaintenance({
  page: 1,
  pageSize: 50,
  search: String(stamp),
  status: "all",
  priority: "all",
  type: "all",
  facilityId: "all",
  assignedToUserId: "all",
  requiresWorkOrder: true,
  sort: "newest",
});
const listFalse = await MaintenanceService.listMaintenance({
  page: 1,
  pageSize: 50,
  search: String(stamp),
  status: "all",
  priority: "all",
  type: "all",
  facilityId: "all",
  assignedToUserId: "all",
  requiresWorkOrder: false,
  sort: "newest",
});
const listAll = await MaintenanceService.listMaintenance({
  page: 1,
  pageSize: 50,
  search: String(stamp),
  status: "all",
  priority: "all",
  type: "all",
  facilityId: "all",
  assignedToUserId: "all",
  requiresWorkOrder: "all",
  sort: "newest",
});

const idemMaint = reqTrue.id;
const idem1 = (await postToAppsScriptData(
  {
    resource: "work-orders",
    action: "createFromMaintenance",
    payload: { maintenanceId: idemMaint },
  },
  { resource: "work-orders", action: "createFromMaintenance" },
  "idem1"
)) as Record<string, unknown>;
const idem2 = (await postToAppsScriptData(
  {
    resource: "work-orders",
    action: "createFromMaintenance",
    payload: { maintenanceId: idemMaint },
  },
  { resource: "work-orders", action: "createFromMaintenance" },
  "idem2"
)) as Record<string, unknown>;

const woId = (idem1.workOrder as { id?: string })?.id;
const reloadedMaint = await MaintenanceService.getMaintenance(idemMaint);
const reloadedWo = woId ? await WorkOrderService.getWorkOrder(woId) : null;

console.log(
  JSON.stringify(
    {
      activeTotal: activeAll.total,
      woSearch: {
        ids: woSearch.data?.map((r) => r.id),
        total: woSearch.total,
        expectedMNT: "MNT-2026-000020",
      },
      filters: {
        trueIds: listTrue.data.map((r) => r.id),
        falseIds: listFalse.data.map((r) => r.id),
        allIds: listAll.data.map((r) => r.id),
        reqTrue: reqTrue.id,
        reqFalse: reqFalse.id,
      },
      idempotency: {
        firstCreated: idem1.created,
        secondCreated: idem2.created,
        wo1: (idem1.workOrder as { id?: string })?.id,
        wo2: (idem2.workOrder as { id?: string })?.id,
      },
      reciprocal: {
        maintWo: reloadedMaint?.workOrderId,
        woMaint: reloadedWo?.maintenanceId,
        maintWoIds: reloadedMaint?.workOrderIds,
      },
    },
    null,
    2
  )
);
