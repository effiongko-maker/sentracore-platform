import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { postToAppsScriptData } from "../src/services/api/appsScriptProxy";
import { MaintenanceService } from "../src/services/maintenance/MaintenanceService";

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

const stamp = Date.now();
const created = await MaintenanceService.createMaintenance({
  title: `P29 filter ${stamp}`,
  description: "filter verify",
  facilityId: "FAC-0001",
  type: "corrective",
  source: "manual",
  priority: "medium",
  status: "in_progress",
  reportedAt: new Date().toISOString(),
  requiresWorkOrder: true,
});
const reloaded = await MaintenanceService.getMaintenance(created.id);
console.log("CREATE_RELOAD", {
  id: created.id,
  createReqWo: created.requiresWorkOrder,
  reloadReqWo: reloaded?.requiresWorkOrder,
  wo: reloaded?.workOrderId,
});

const allActive = (await postToAppsScriptData(
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
  "active-count"
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
)) as { data?: Array<{ id?: string }>; total?: number };

const idemMaint = "MNT-2026-000501";
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

console.log(
  JSON.stringify(
    {
      activeTotal: allActive.total,
      woSearchIds: woSearch.data?.map((r) => r.id),
      woSearchTotal: woSearch.total,
      idempotency: {
        first: {
          created: idem1.created,
          wo: (idem1.workOrder as { id?: string })?.id,
        },
        second: {
          created: idem2.created,
          wo: (idem2.workOrder as { id?: string })?.id,
        },
      },
    },
    null,
    2
  )
);
