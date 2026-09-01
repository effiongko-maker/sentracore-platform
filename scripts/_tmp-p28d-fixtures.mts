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
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadEnv();

const s = Date.now();
const base = {
  description: "P28D browser fixture",
  facilityId: "FAC-0001",
  type: "corrective" as const,
  source: "manual" as const,
  priority: "medium" as const,
  status: "in_progress" as const,
  reportedAt: new Date().toISOString(),
};

const detail = await MaintenanceService.createMaintenance({
  ...base,
  title: `P28D br detail ${s}`,
});
const clean = await MaintenanceService.createMaintenance({
  ...base,
  title: `P28D br clean ${s}`,
});
const dirty = await MaintenanceService.createMaintenance({
  ...base,
  title: `P28D br dirty ${s}`,
});

const fixtures = { detail: detail.id, clean: clean.id, dirty: dirty.id, stamp: s };
writeFileSync("/tmp/phase28d-fixtures.json", JSON.stringify(fixtures, null, 2));
console.log(JSON.stringify(fixtures));
