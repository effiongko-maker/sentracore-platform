/**
 * Phase 33 — verify Assets / People list architecture contracts.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-phase33-org-list-performance.mts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

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

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function main() {
  const results: string[] = [];

  const assetSource = readFileSync("src/services/assets/AssetService.ts", "utf8");
  assert(
    !assetSource.includes("OperationalWorkloadService.getMaps()"),
    "AssetService.listAssets must not call getMaps on critical path"
  );
  assert(
    assetSource.includes("fetchAssetsPage"),
    "AssetService must use server-side paginated fetchAssetsPage"
  );
  assert(
    assetSource.includes("enrichAssetsWorkload"),
    "AssetService must expose enrichAssetsWorkload for lazy overlay"
  );
  results.push("PASS AssetService architecture");

  const userSource = readFileSync("src/services/users/UserService.ts", "utf8");
  assert(
    !userSource.includes("OperationalWorkloadService.getMaps()"),
    "UserService must not call getMaps on critical path"
  );
  assert(
    userSource.includes("fetchUsersPage"),
    "UserService must use server-side paginated fetchUsersPage"
  );
  assert(
    userSource.includes("enrichUsersWorkload"),
    "UserService must expose enrichUsersWorkload for lazy overlay"
  );
  results.push("PASS UserService architecture");

  const useAssets = readFileSync("src/modules/assets/hooks/useAssets.ts", "utf8");
  assert(
    useAssets.includes("enrichAssetsWorkload"),
    "useAssets must lazy-load workload after list render"
  );
  results.push("PASS useAssets lazy workload hook");

  const useUsers = readFileSync("src/modules/users/hooks/useUsers.ts", "utf8");
  assert(
    useUsers.includes("enrichUsersWorkload"),
    "useUsers must lazy-load workload after list render"
  );
  results.push("PASS useUsers lazy workload hook");

  const gas = readFileSync("apps-script/OperationalWorkloadService.gs", "utf8");
  assert(
    gas.includes("getEntitySummary"),
    "Apps Script OperationalWorkloadService.getEntitySummary must exist"
  );
  results.push("PASS Apps Script bounded workload service present");

  const router = readFileSync("apps-script/deployment/ROUTER.gs", "utf8");
  assert(
    router.includes("operational-workload"),
    "ROUTER must register operational-workload resource"
  );
  results.push("PASS ROUTER operational-workload route");

  const workHook = readFileSync("src/modules/work/hooks/useWork.ts", "utf8");
  assert(
    workHook.includes("MaintenanceService.listMaintenance"),
    "Work hook must still use listMaintenance"
  );
  assert(
    !workHook.includes("enrichAssetsWorkload"),
    "Work hook must remain unchanged by Phase 33"
  );
  results.push("PASS Work hook unchanged");

  console.log(results.join("\n"));
  console.log("\n=== PHASE_33_VERIFY_OK ===");
}

main().catch((err) => {
  console.error("VERIFY FAILED", err);
  process.exit(1);
});
