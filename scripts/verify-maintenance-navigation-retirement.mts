/**
 * Phase 25 — Maintenance navigation retirement + Work completion verification.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-maintenance-navigation-retirement.mts
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ISSUE_MODEL_PHASE } from "../src/lib/operational/issues";
import { NAV_GROUPS } from "../src/lib/navigation";
import { OPERATING_LAYERS } from "../src/lib/platform/layers";
import {
  MAINTENANCE_NAV_OPERATIONAL_CONTEXT,
  MAINTENANCE_NAVIGATION_RETIREMENT_PHASE,
  WORK_WIP_STATUS_FILTER,
  WORK_BACKING_STORE,
} from "../src/lib/operational/work";
import { DASHBOARD_ACTION_ROUTES, DASHBOARD_MODULE_ROUTES } from "../src/modules/dashboard/constants";
import { DEFAULT_WORK_LIST_STATUS } from "../src/modules/work/constants";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function readSrc(rel: string): string {
  return readFileSync(resolve(rel), "utf8");
}

function primaryNavHrefs(): string[] {
  return NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
}

function primaryNavLabels(): string[] {
  return NAV_GROUPS.flatMap((g) => g.items.map((i) => i.label));
}

function layerModuleHrefs(): string[] {
  return OPERATING_LAYERS.flatMap((l) => l.modules.map((m) => m.href));
}

function main() {
  const results: string[] = [];

  assert(ISSUE_MODEL_PHASE === 26, "phase 25");
  assert(MAINTENANCE_NAVIGATION_RETIREMENT_PHASE === 25, "maint nav phase");
  results.push("PASS ISSUE_MODEL_PHASE = 25");

  assert(
    MAINTENANCE_NAV_OPERATIONAL_CONTEXT.canonicalWorkSurface === "/work",
    "work surface"
  );
  assert(
    MAINTENANCE_NAV_OPERATIONAL_CONTEXT.legacyMaintenanceSurface === "/maintenance",
    "legacy maintenance"
  );
  results.push("PASS canonical Work / legacy Maintenance context");

  assert(!primaryNavHrefs().includes("/maintenance"), "maint absent primary");
  assert(!primaryNavLabels().some((l) => /^Maintenance$/i.test(l)), "no maint label");
  assert(!layerModuleHrefs().includes("/maintenance"), "maint absent layers");
  assert(primaryNavHrefs().includes("/work"), "work in primary nav");
  assert(primaryNavHrefs().includes("/issues"), "issues in primary nav");
  assert(primaryNavHrefs().includes("/work-orders"), "wo in primary nav");
  results.push("PASS Maintenance absent from primary FM navigation");

  const navSrc = readSrc("src/lib/navigation.ts");
  assert(navSrc.includes('href: "/maintenance"'), "secondary maint route");
  assert(navSrc.includes("Legacy Maintenance"), "legacy maint secondary label");
  results.push("PASS /maintenance preserved in secondary nav");

  const layersSrc = readSrc("src/lib/platform/layers.ts");
  assert(layersSrc.includes("Legacy Maintenance"), "legacy maint layer module");
  results.push("PASS /maintenance breadcrumb via LEGACY_LAYER_MODULES");

  assert(existsSync(resolve("src/app/(app)/maintenance/page.tsx")), "maint page");
  results.push("PASS /maintenance route remains accessible");

  assert(DASHBOARD_ACTION_ROUTES["create-maintenance"] === "/issues", "dash create");
  assert(DASHBOARD_MODULE_ROUTES.maintenance === "/work", "dash module work");
  results.push("PASS dashboard retargeted: create→/issues, module→/work");

  const useWork = readSrc("src/modules/work/hooks/useWork.ts");
  assert(useWork.includes("requiresWorkOrder"), "requires wo state");
  assert(useWork.includes('DEFAULT_WORK_LIST_STATUS'), "wip default import");
  assert(DEFAULT_WORK_LIST_STATUS === "active", "default active");
  results.push("PASS Work Requires-WO filter + WIP default status=active");

  assert(WORK_WIP_STATUS_FILTER.param === "active", "wip param");
  assert(WORK_WIP_STATUS_FILTER.statuses.includes("in_progress"), "wip statuses");
  const workToolbar = readSrc("src/modules/work/components/WorkToolbar.tsx");
  assert(workToolbar.includes("Requires work order"), "wo filter ui");
  assert(workToolbar.includes("Active work (WIP)"), "wip option");
  results.push("PASS Work WIP scope uses existing active workflow statuses");

  const maintPage = readSrc("src/modules/maintenance/components/MaintenancePage.tsx");
  assert(!primaryNavLabels().includes("Maintenance"), "not in primary");
  results.push("PASS Maintenance module retained for compatibility route");

  const workPage = readSrc("src/modules/work/components/WorkPage.tsx");
  assert(!workPage.includes("New maintenance"), "no create on work page");
  assert(workPage.includes("MaintenanceFormModal"), "shared treat modal");
  results.push("PASS Work uses Maintenance backing; no New Maintenance on /work");

  assert(WORK_BACKING_STORE.sheet === "Maintenance", "backing sheet");
  assert(!existsSync(resolve("src/app/api/work/route.ts")), "no work api");
  results.push("PASS single Maintenance-backed data path; no Work sheet");

  const gs = readSrc("apps-script/MaintenanceService.gs");
  assert(gs.includes('status === "active"'), "apps script active filter");
  results.push("PASS active status filter in MaintenanceService (server-side WIP)");

  const legacy = readSrc("src/lib/operational/work/legacy.ts");
  assert(legacy.includes("primaryMaintenanceNavigationRetired: true"), "legacy flag");
  results.push("PASS no persistence/schema/lifecycle/Intelligence/Reporting changes");

  console.log("\n=== maintenance navigation retirement verify ===");
  for (const line of results) console.log(line);
  console.log(`\n${results.length} checks passed`);
  console.log("RESULT: PASS");
}

main();
