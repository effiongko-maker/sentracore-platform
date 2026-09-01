/**
 * Phase 29 — requiresWorkOrder persistence + projection contract.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-requires-work-order-roundtrip.mts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { MaintenanceService } from "../src/services/maintenance/MaintenanceService";

function loadEnvLocal() {
  const path = resolve(".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (!(k in process.env)) process.env[k] = v;
  }
}

loadEnvLocal();

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

async function main() {
  const stamp = Date.now();

  const created = await MaintenanceService.createMaintenance({
    title: `Phase29 requiresWo ${stamp}`,
    description: "requiresWorkOrder round-trip verify",
    facilityId: "FAC-0001",
    type: "corrective",
    source: "manual",
    priority: "medium",
    status: "in_progress",
    reportedAt: new Date().toISOString(),
    requiresWorkOrder: true,
  });

  assert(created.requiresWorkOrder === true, "create response requiresWorkOrder=true");
  assert(!created.workOrderId, "no WO yet on create");

  const reloaded = await MaintenanceService.getMaintenance(created.id);
  assert(reloaded, "reload after create");
  assert(
    reloaded!.requiresWorkOrder === true,
    "persisted requiresWorkOrder=true without linked WO"
  );
  assert(!reloaded!.workOrderId, "no WO on reload");

  const listed = await MaintenanceService.listMaintenance({
    page: 1,
    pageSize: 10,
    search: created.id,
    status: "all",
    priority: "all",
    type: "all",
    facilityId: "all",
    assignedToUserId: "all",
    requiresWorkOrder: true,
    sort: "newest",
  });
  assert(
    listed.data.some((row) => row.id === created.id),
    "requiresWorkOrder=true filter includes flagged row"
  );

  const excluded = await MaintenanceService.listMaintenance({
    page: 1,
    pageSize: 10,
    search: created.id,
    status: "all",
    priority: "all",
    type: "all",
    facilityId: "all",
    assignedToUserId: "all",
    requiresWorkOrder: false,
    sort: "newest",
  });
  assert(
    !excluded.data.some((row) => row.id === created.id),
    "requiresWorkOrder=false filter excludes flagged row"
  );

  const cleared = await MaintenanceService.updateMaintenance(created.id, {
    requiresWorkOrder: false,
  });
  assert(cleared.requiresWorkOrder === false, "update clears requiresWorkOrder");

  const reloadedFalse = await MaintenanceService.getMaintenance(created.id);
  assert(
    reloadedFalse?.requiresWorkOrder === false,
    "persisted requiresWorkOrder=false"
  );

  console.log("PASS requiresWorkOrder round-trip");
  console.log("FIXTURE", created.id);
  console.log("PHASE_29_REQUIRES_WORK_ORDER_ROUNDTRIP: PASS");
}

main().catch((err) => {
  console.error("PHASE_29_REQUIRES_WORK_ORDER_ROUNDTRIP: FAIL", err);
  process.exit(1);
});
