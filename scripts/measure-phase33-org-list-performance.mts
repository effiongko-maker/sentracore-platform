/**
 * Phase 33 — measure Assets / People list data-path performance.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/measure-phase33-org-list-performance.mts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { postToAppsScriptData } from "../src/services/api/appsScriptProxy";
import { loadAllPages } from "../src/services/reporting/loadAllPages";

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

async function time<T>(label: string, fn: () => Promise<T>) {
  const s = performance.now();
  const value = await fn();
  return { label, ms: Math.round(performance.now() - s), value };
}

async function listAssetsPage() {
  return postToAppsScriptData(
    {
      resource: "assets",
      action: "getAll",
      payload: {
        page: 1,
        pageSize: 8,
        search: "",
        status: "all",
        category: "all",
        facility: "all",
        sort: "newest",
      },
    },
    { resource: "assets", action: "getAll" },
    "phase33_assets_list"
  );
}

async function listUsersPage() {
  return postToAppsScriptData(
    {
      resource: "users",
      action: "getAll",
      payload: {
        page: 1,
        pageSize: 8,
        search: "",
        status: "all",
        role: "all",
        facility: "all",
      },
    },
    { resource: "users", action: "getAll" },
    "phase33_users_list"
  );
}

async function usersRoleCatalog() {
  return postToAppsScriptData(
    {
      resource: "users",
      action: "getAll",
      payload: {
        page: 1,
        pageSize: 500,
        search: "",
        status: "all",
        role: "all",
        facility: "all",
      },
    },
    { resource: "users", action: "getAll" },
    "phase33_users_catalog"
  );
}

async function boundedWorkload(assetIds: string[], userIds: string[]) {
  return postToAppsScriptData(
    {
      resource: "operational-workload",
      action: "getEntitySummary",
      payload: { assetIds, userIds },
    },
    { resource: "operational-workload", action: "getEntitySummary" },
    "phase33_workload_summary"
  );
}

async function legacyAssetsPath() {
  const t0 = performance.now();
  let gasCalls = 0;

  await postToAppsScriptData(
    { resource: "assets", action: "getAll", payload: { page: 1, pageSize: 500 } },
    { resource: "assets", action: "getAll" },
    "legacy_assets"
  );
  gasCalls += 1;

  await postToAppsScriptData(
    { resource: "facilities", action: "getAll", payload: { page: 1, pageSize: 500 } },
    { resource: "facilities", action: "getAll" },
    "legacy_facilities"
  );
  gasCalls += 1;

  const wo = await loadAllPages((p, ps) => {
    gasCalls += 1;
    return postToAppsScriptData(
      { resource: "work-orders", action: "getAll", payload: { page: p, pageSize: ps } },
      { resource: "work-orders", action: "getAll" },
      `legacy_wo_p${p}`
    ).then((d) => d as never);
  });
  const mnt = await loadAllPages((p, ps) => {
    gasCalls += 1;
    return postToAppsScriptData(
      { resource: "maintenance", action: "getAll", payload: { page: p, pageSize: ps } },
      { resource: "maintenance", action: "getAll" },
      `legacy_mnt_p${p}`
    ).then((d) => d as never);
  });
  const inc = await loadAllPages((p, ps) => {
    gasCalls += 1;
    return postToAppsScriptData(
      { resource: "incidents", action: "getAll", payload: { page: p, pageSize: ps } },
      { resource: "incidents", action: "getAll" },
      `legacy_inc_p${p}`
    ).then((d) => d as never);
  });

  return {
    label: "legacy_assets_critical_path",
    ms: Math.round(performance.now() - t0),
    gasCalls,
    woRows: wo.length,
    mntRows: mnt.length,
    incRows: inc.length,
  };
}

async function main() {
  const assetsList = await time("phase33_assets_list", listAssetsPage);
  const assetsPage = assetsList.value as { data?: Array<{ id?: string }> };
  const assetIds = (assetsPage.data ?? [])
    .map((row) => String(row.id ?? ""))
    .filter(Boolean);

  let assetsWorkloadMs: number | null = null;
  let assetsWorkloadError: string | null = null;
  try {
    const assetsWorkload = await time("phase33_assets_workload_lazy", () =>
      boundedWorkload(assetIds, [])
    );
    assetsWorkloadMs = assetsWorkload.ms;
  } catch (error) {
    assetsWorkloadError = String(error);
  }

  const usersList = await time("phase33_users_list", listUsersPage);
  const usersPage = usersList.value as { data?: Array<{ id?: string }> };
  const userIds = (usersPage.data ?? [])
    .map((row) => String(row.id ?? ""))
    .filter(Boolean);

  const usersCatalog = await time("phase33_users_catalog", usersRoleCatalog);

  let usersWorkloadMs: number | null = null;
  let usersWorkloadError: string | null = null;
  try {
    const usersWorkload = await time("phase33_users_workload_lazy", () =>
      boundedWorkload([], userIds)
    );
    usersWorkloadMs = usersWorkload.ms;
  } catch (error) {
    usersWorkloadError = String(error);
  }

  let legacy = null;
  try {
    legacy = await legacyAssetsPath();
  } catch (e) {
    legacy = { error: String(e) };
  }

  const summary = {
    measuredAt: new Date().toISOString(),
    assets: {
      listMs: assetsList.ms,
      workloadLazyMs: assetsWorkloadMs,
      workloadLazyError: assetsWorkloadError,
      listCriticalPathMs: assetsList.ms,
      totalWithWorkloadMs:
        assetsWorkloadMs != null ? assetsList.ms + assetsWorkloadMs : null,
      rowCount: assetIds.length,
      listGasCalls: 1,
      workloadGasCalls: assetsWorkloadError ? 0 : 1,
    },
    users: {
      listMs: usersList.ms,
      catalogMs: usersCatalog.ms,
      workloadLazyMs: usersWorkloadMs,
      workloadLazyError: usersWorkloadError,
      listCriticalPathMs: Math.max(usersList.ms, usersCatalog.ms),
      totalWithWorkloadMs:
        usersWorkloadMs != null
          ? Math.max(usersList.ms, usersCatalog.ms) + usersWorkloadMs
          : null,
      rowCount: userIds.length,
      listGasCalls: 2,
      workloadGasCalls: usersWorkloadError ? 0 : 1,
    },
    legacyAssetsReference: legacy,
    phase33Architecture: {
      listCriticalPathNoFullWoMntIncFanOut: true,
      workloadLazyNotBlockingList: true,
    },
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error("MEASUREMENT FAILED", err);
  process.exit(1);
});
