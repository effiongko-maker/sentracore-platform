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
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadEnv();

const stamp = Date.now();
const m = await MaintenanceService.createMaintenance({
  title: `P28D probe ${stamp}`,
  description: "direct probe",
  facilityId: "FAC-0001",
  type: "corrective",
  source: "manual",
  priority: "medium",
  status: "in_progress",
  reportedAt: new Date().toISOString(),
});

const t0 = performance.now();
const r = (await postToAppsScriptData(
  {
    resource: "work-orders",
    action: "createFromMaintenance",
    payload: { maintenanceId: m.id, actorUserId: "probe" },
  },
  { resource: "work-orders", action: "createFromMaintenance" },
  "p28d-probe"
)) as Record<string, unknown>;
const httpMs = Math.round(performance.now() - t0);

console.log(
  JSON.stringify(
    {
      maintenanceId: m.id,
      httpMs,
      buildMarker: r.buildMarker,
      created: r.created,
      timings: r.timings,
      woId: (r.workOrder as { id?: string })?.id,
    },
    null,
    2
  )
);

const active = (await postToAppsScriptData(
  {
    resource: "maintenance",
    action: "getAll",
    payload: {
      page: 1,
      pageSize: 500,
      status: "active",
      priority: "all",
      type: "all",
      facilityId: "all",
      assignedToUserId: "all",
    },
  },
  { resource: "maintenance", action: "getAll" },
  "multiwo-scan"
)) as { data?: Array<Record<string, unknown>> };

const multi = (active.data ?? []).find(
  (row) =>
    Array.isArray(row.workOrderIds) &&
    (row.workOrderIds as string[]).length > 1
);
console.log(
  "MULTI_WO_FIXTURE",
  multi
    ? { id: multi.id, workOrderIds: multi.workOrderIds }
    : "SKIP none found"
);
