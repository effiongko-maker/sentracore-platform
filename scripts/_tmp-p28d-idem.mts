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

const id = "MNT-2026-000479";
const woId = "WO-2026-000033";

const m = await MaintenanceService.getMaintenance(id);
console.log("reload maint", {
  id: m?.id,
  workOrderId: m?.workOrderId,
  workOrderIds: m?.workOrderIds,
});

const r2 = (await postToAppsScriptData(
  {
    resource: "work-orders",
    action: "createFromMaintenance",
    payload: { maintenanceId: id },
  },
  { resource: "work-orders", action: "createFromMaintenance" },
  "idem"
)) as Record<string, unknown>;
console.log("idem", {
  created: r2.created,
  wo: (r2.workOrder as { id?: string })?.id,
  maintWo: (r2.maintenance as { workOrderId?: string })?.workOrderId,
});

const wo = await WorkOrderService.getWorkOrder(woId);
console.log("wo reload", { id: wo?.id, maintenanceId: wo?.maintenanceId });
