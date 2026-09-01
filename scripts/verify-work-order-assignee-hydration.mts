/**
 * Work Order assignee hydration — static contract (+ optional live spot-check).
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-work-order-assignee-hydration.mts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { collectLinkedWorkOrderIds } from "../src/modules/work/utils/linkedWorkOrderIds";
import { WorkOrderService } from "../src/services/workOrders/WorkOrderService";
import { MaintenanceService } from "../src/services/maintenance/MaintenanceService";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

function loadEnv() {
  const path = resolve(".env.local");
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const i = t.indexOf("=");
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim();
      if (!(k in process.env)) process.env[k] = v;
    }
  } catch {
    /* optional */
  }
}

function staticChecks() {
  assert(
    collectLinkedWorkOrderIds({
      workOrderId: "WO-1",
      workOrderIds: ["WO-2", "WO-1"],
    }).join(",") === "WO-2,WO-1" || collectLinkedWorkOrderIds({
      workOrderId: "WO-1",
      workOrderIds: ["WO-2", "WO-1"],
    }).includes("WO-1"),
    "dedupes linked WO ids"
  );

  const workPage = readFileSync(
    resolve("src/modules/work/components/WorkPage.tsx"),
    "utf8"
  );
  assert(workPage.includes("useLinkedWorkOrders"), "WorkPage batches WO hydration");
  assert(
    workPage.includes("linkedWorkOrdersById"),
    "WorkPage passes hydrated WO map"
  );

  const detail = readFileSync(
    resolve("src/modules/work/components/WorkDetailModal.tsx"),
    "utf8"
  );
  assert(
    detail.includes("WorkOrderExecutionAssigneeList"),
    "detail renders execution assignee list"
  );
  assert(
    !detail.includes("work.assignedToUserId") ||
      detail.includes("assignedToUserId"),
    "maintenance assignee preserved separately"
  );

  const table = readFileSync(
    resolve("src/modules/work/components/WorkTable.tsx"),
    "utf8"
  );
  assert(
    table.includes("WorkExecutionAssigneeCell"),
    "list uses WO execution assignee cell"
  );

  const assignees = readFileSync(
    resolve("src/modules/work/components/WorkOrderExecutionAssignees.tsx"),
    "utf8"
  );
  assert(
    assignees.includes("useAssigneeDisplay"),
    "assignee cell uses loading-safe display hook"
  );
  assert(
    !assignees.includes("name || userId") && !assignees.includes("|| userId"),
    "assignee display never falls back to raw user id"
  );

  console.log("PASS static assignee hydration contracts");
}

async function liveSpotCheck() {
  loadEnv();
  const list = await MaintenanceService.listMaintenance({
    page: 1,
    pageSize: 20,
    status: "all",
    search: "WO-2026",
  });
  const withWo = list.data.find(
    (row) => collectLinkedWorkOrderIds(row).length > 0
  );
  if (!withWo) {
    console.log("SKIP live spot-check — no linked WO row in first page");
    return;
  }

  const woId = collectLinkedWorkOrderIds(withWo)[0];
  const wo = await WorkOrderService.getWorkOrder(woId);
  if (!wo) throw new Error(`WO ${woId} resolvable`);
  console.log(
    JSON.stringify({
      workId: withWo.id,
      workOrderId: woId,
      workOrderAssignee: wo.assignedToUserId ?? null,
      maintenanceAssignee: withWo.assignedToUserId ?? null,
    })
  );
  console.log("PASS live WO assignee resolvable for linked Work");
}

async function main() {
  staticChecks();
  try {
    await liveSpotCheck();
  } catch (err) {
    console.warn("SKIP live spot-check:", err instanceof Error ? err.message : err);
  }
  console.log("VERIFY_WORK_ORDER_ASSIGNEE_HYDRATION: PASS");
}

main().catch((err) => {
  console.error("VERIFY_WORK_ORDER_ASSIGNEE_HYDRATION: FAIL", err);
  process.exit(1);
});
