/**
 * Phase 28A — Work search operational-reference alignment.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-work-search-operational-reference.mts
 *
 * Static contract checks always run.
 * Live Apps Script checks require deployment of MaintenanceService.gs search change.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { postToAppsScriptData } from "../src/services/api/appsScriptProxy";

/** Deterministic live fixture from Phase 27C diagnostic (bidirectional link). */
const FIXTURE_WO_ID = "WO-2026-000014";
const FIXTURE_WORK_ID = "MNT-2026-000020";

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

type PaginatedMaintenance = {
  data?: Array<Record<string, unknown>>;
  total?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
};

async function searchMaintenance(options: {
  search: string;
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<PaginatedMaintenance> {
  return (await postToAppsScriptData(
    {
      resource: "maintenance",
      action: "getAll",
      payload: {
        page: options.page ?? 1,
        pageSize: options.pageSize ?? 10,
        search: options.search,
        status: options.status ?? "active",
        priority: "all",
        type: "all",
        facilityId: "all",
        assignedToUserId: "all",
      },
    },
    { resource: "maintenance", action: "getAll" },
    "verify-work-search"
  )) as PaginatedMaintenance;
}

function verifyStaticContract(): string[] {
  const results: string[] = [];
  const gsPath = resolve("apps-script/MaintenanceService.gs");
  const gs = readFileSync(gsPath, "utf8");

  assert(gs.includes("function matchesWorkOrderSearch_"), "matchesWorkOrderSearch_ helper");
  assert(gs.includes("matchesWorkOrderSearch_(row, search)"), "WO search wired into applyFilters_");
  assert(gs.includes("row.workOrderId"), "workOrderId in search predicate");
  assert(gs.includes("row.workOrderIds"), "workOrderIds in search predicate");
  results.push("PASS MaintenanceService.gs searches workOrderId + workOrderIds");

  const toolbar = readFileSync(
    resolve("src/modules/work/components/WorkToolbar.tsx"),
    "utf8"
  );
  assert(
    toolbar.includes('searchPlaceholder="Search work, location, Work Order…"'),
    "WorkToolbar placeholder aligned"
  );
  assert(
    !toolbar.includes("assignee, request"),
    "placeholder must not claim assignee/request search"
  );
  results.push("PASS WorkToolbar placeholder aligned (no assignee/request claim)");

  const useWork = readFileSync(resolve("src/modules/work/hooks/useWork.ts"), "utf8");
  assert(
    useWork.includes("MaintenanceService.listMaintenance"),
    "Work list still uses MaintenanceService"
  );
  assert(
    !useWork.includes("WorkOrderService"),
    "Work search must not call WorkOrderService"
  );
  results.push("PASS Work search remains single Maintenance query (no WO lookup)");

  return results;
}

async function verifyLiveContract(): Promise<{ results: string[]; deployed: boolean }> {
  const results: string[] = [];

  const woSearch = await searchMaintenance({
    search: FIXTURE_WO_ID,
    status: "active",
  });
  const woRows = woSearch.data ?? [];
  const woMatch = woRows.find((row) => String(row.id) === FIXTURE_WORK_ID);

  if ((woSearch.total ?? 0) >= 1 && woMatch) {
    results.push(
      `PASS exact WO search returns linked Work (${FIXTURE_WO_ID} → ${FIXTURE_WORK_ID})`
    );
  } else {
    return {
      results: [
        `BLOCKED live WO search — total=${woSearch.total ?? 0}, ids=${woRows.map((r) => r.id).join(",") || "(none)"}`,
        "Redeploy apps-script/MaintenanceService.gs and re-run this script.",
      ],
      deployed: false,
    };
  }

  const mntSearch = await searchMaintenance({
    search: FIXTURE_WORK_ID,
    status: "active",
  });
  assert((mntSearch.total ?? 0) >= 1, "Work ID search still works");
  results.push("PASS Work ID search still works");

  const titleSearch = await searchMaintenance({
    search: "Fix AC switch",
    status: "active",
  });
  assert((titleSearch.total ?? 0) >= 1, "title search still works");
  results.push("PASS title search still works");

  const activeAll = await searchMaintenance({ search: "", status: "active", pageSize: 10 });
  assert((activeAll.total ?? 0) > 0, "active filter still returns WIP");
  results.push(`PASS active/WIP filter still works (total=${activeAll.total})`);

  const page1 = await searchMaintenance({
    search: "",
    status: "active",
    page: 1,
    pageSize: 5,
  });
  const page2 = await searchMaintenance({
    search: "",
    status: "active",
    page: 2,
    pageSize: 5,
  });
  assert((page1.data?.length ?? 0) <= 5, "page 1 respects pageSize");
  assert(Number(page1.totalPages ?? 1) >= 1, "pagination metadata present");
  if ((page1.total ?? 0) > 5) {
    assert((page2.data?.length ?? 0) > 0, "page 2 returns rows when total > pageSize");
  }
  results.push("PASS pagination still works");

  const partial = await searchMaintenance({ search: "000014", status: "active" });
  assert((partial.total ?? 0) >= 1, "partial substring search returns results");
  results.push(
    `PASS partial search returns ${partial.total} row(s) (substring semantics preserved)`
  );

  // workOrderIds[] — find any active Work with multiple WO refs if present.
  const allActive = await searchMaintenance({
    search: "",
    status: "active",
    pageSize: 500,
  });
  const multiWo = (allActive.data ?? []).find(
    (row) => Array.isArray(row.workOrderIds) && row.workOrderIds.length > 1
  );
  if (multiWo && Array.isArray(multiWo.workOrderIds) && multiWo.workOrderIds[1]) {
    const secondaryId = String(multiWo.workOrderIds[1]);
    const secondarySearch = await searchMaintenance({
      search: secondaryId,
      status: "active",
    });
    assert(
      (secondarySearch.total ?? 0) >= 1 &&
        (secondarySearch.data ?? []).some((row) => row.id === multiWo.id),
      "workOrderIds[] secondary id searchable"
    );
    results.push(`PASS workOrderIds[] search (${secondaryId} → ${multiWo.id})`);
  } else {
    results.push("SKIP workOrderIds[] multi-id live row (none in active set)");
  }

  return { results, deployed: true };
}

async function main() {
  const results = verifyStaticContract();
  console.log(results.join("\n"));

  let liveDeployed = false;
  try {
    const live = await verifyLiveContract();
    console.log(live.results.join("\n"));
    liveDeployed = live.deployed;
  } catch (err) {
    console.log(
      "BLOCKED live verification:",
      err instanceof Error ? err.message : String(err)
    );
    console.log("Redeploy apps-script/MaintenanceService.gs and re-run.");
    process.exit(2);
  }

  if (!liveDeployed) {
    process.exit(2);
  }

  console.log("\nPHASE_28A_WORK_SEARCH_OPERATIONAL_REFERENCE_ALIGNMENT: PASS");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
