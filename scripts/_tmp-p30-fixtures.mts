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
  description: "Phase30 browser fixture",
  facilityId: "FAC-0001",
  type: "corrective" as const,
  source: "manual" as const,
  priority: "medium" as const,
  status: "in_progress" as const,
  reportedAt: new Date().toISOString(),
  requiresWorkOrder: true,
};

const workCreate = await MaintenanceService.createMaintenance({
  ...base,
  title: `P30 br create ${stamp}`,
});
const treatClean = await MaintenanceService.createMaintenance({
  ...base,
  title: `P30 br clean ${stamp}`,
});
const treatDirty = await MaintenanceService.createMaintenance({
  ...base,
  title: `P30 br dirty ${stamp}`,
});

const fixtures = {
  workCreate: workCreate.id,
  treatClean: treatClean.id,
  treatDirty: treatDirty.id,
  stamp,
};
writeFileSync("/tmp/phase30-fixtures.json", JSON.stringify(fixtures, null, 2));
console.log(JSON.stringify(fixtures));
