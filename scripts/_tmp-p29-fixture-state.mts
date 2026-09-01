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

for (const id of [
  "MNT-2026-000507",
  "MNT-2026-000508",
  "MNT-2026-000509",
  "MNT-2026-000510",
  "MNT-2026-000502",
]) {
  const m = await MaintenanceService.getMaintenance(id);
  console.log(id, {
    reqWo: m?.requiresWorkOrder,
    wo: m?.workOrderId ?? null,
    wouldShowCreate: Boolean(m?.requiresWorkOrder) && !m?.workOrderId,
  });
}
