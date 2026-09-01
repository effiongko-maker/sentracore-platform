import { readFileSync, existsSync, writeFileSync } from "node:fs";
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

const stamp = Date.now();
const base = {
  description: "P29 browser fixture",
  facilityId: "FAC-0001",
  type: "corrective" as const,
  source: "manual" as const,
  priority: "medium" as const,
  status: "in_progress" as const,
  reportedAt: new Date().toISOString(),
};

const requiresWo = await MaintenanceService.createMaintenance({
  ...base,
  title: `P29 br reqWo ${stamp}`,
  requiresWorkOrder: true,
});
const noRequiresWo = await MaintenanceService.createMaintenance({
  ...base,
  title: `P29 br noReq ${stamp}`,
  requiresWorkOrder: false,
});
const treatClean = await MaintenanceService.createMaintenance({
  ...base,
  title: `P29 br clean ${stamp}`,
  requiresWorkOrder: true,
});
const treatDirty = await MaintenanceService.createMaintenance({
  ...base,
  title: `P29 br dirty ${stamp}`,
  requiresWorkOrder: true,
});

const fixtures = {
  requiresWo: requiresWo.id,
  noRequiresWo: noRequiresWo.id,
  treatClean: treatClean.id,
  treatDirty: treatDirty.id,
  stamp,
};
writeFileSync("/tmp/phase29-fixtures.json", JSON.stringify(fixtures, null, 2));
console.log(JSON.stringify(fixtures));
