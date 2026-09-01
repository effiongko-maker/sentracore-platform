import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
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

for (const id of ["MNT-2026-000532", "MNT-2026-000533", "MNT-2026-000534"]) {
  const m = await MaintenanceService.getMaintenance(id);
  const listed = await MaintenanceService.listMaintenance({
    page: 1,
    pageSize: 5,
    search: id,
    status: "all",
    priority: "all",
    type: "all",
    facilityId: "all",
    assignedToUserId: "all",
    requiresWorkOrder: "all",
    sort: "newest",
  });
  const row = listed.data.find((r) => r.id === id);
  console.log(id, {
    api: { reqWo: m?.requiresWorkOrder, wo: m?.workOrderId },
    list: { reqWo: row?.requiresWorkOrder, wo: row?.workOrderId },
    wouldShowCreate: Boolean(row?.requiresWorkOrder) && !row?.workOrderId,
  });
}
