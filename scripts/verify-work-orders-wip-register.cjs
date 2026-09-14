#!/usr/bin/env node
/**
 * Static checks: Work Orders register naming + Order Type UX.
 * Confirms /work remains distinct Work In Progress.
 *
 *   node scripts/verify-work-orders-wip-register.cjs
 */
const fs = require("fs");
const path = require("path");

function read(rel) {
  return fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
}

function assert(cond, message) {
  if (!cond) {
    console.error("FAIL", message);
    process.exit(1);
  }
}

const page = read("src/modules/work-orders/components/WorkOrdersPage.tsx");
const table = read("src/modules/work-orders/components/WorkOrdersTable.tsx");
const hook = read("src/modules/work-orders/hooks/useWorkOrders.ts");
const route = read("src/app/(app)/work-orders/page.tsx");
const workPage = read("src/modules/work/components/WorkPage.tsx");
const workRoute = read("src/app/(app)/work/page.tsx");
const kind = read("src/modules/work-orders/instructionKind.ts");
const form = read("src/modules/work-orders/components/WorkOrderFormModal.tsx");
const types = read("src/modules/work-orders/types.ts");
const layers = read("src/lib/platform/layers.ts");
const nav = read("src/lib/navigation.ts");

assert(page.includes('label: "New Work Order"'), "WO create label");
assert(page.includes('label: "New Job Order"'), "JO create label");
assert(page.includes("createAction"), "contextual create");
assert(page.includes("initialOrderType"), "create preselects Order Type");
assert(
  page.includes("canCreate={Boolean(canCreateOps && createAction)}"),
  "All tab hides create (createAction null)"
);
assert(
  form.includes("initialOrderType") &&
    form.includes('mode === "create" && initialOrderType'),
  "form applies scope preselection"
);
assert(page.includes('title="Work Orders"'), "WO page heading");
assert(
  page.includes("Plan, assign, and track Work Orders and Job Orders."),
  "WO page description"
);
assert(!page.includes('title="Work In Progress"'), "WO page must not be WIP");
assert(route.includes('title: "Work Orders"'), "WO route metadata");
assert(!route.includes("Work In Progress"), "WO route must not be WIP");

assert(workPage.includes('title="Work In Progress"'), "/work remains WIP");
assert(workRoute.includes('title: "Work In Progress"'), "/work route WIP");

assert(page.includes("WORK_ORDER_ORDER_TYPE_SCOPE_OPTIONS"), "scope tabs");
assert(table.includes('header: "Order Type"'), "Order Type column");
assert(table.includes('header: "Work Category"'), "Work Category column");
assert(table.includes("resolveWorkInstructionKind"), "derived Order Type");
assert(!table.includes("reimbursab"), "no reimbursement on WO register table");

assert(hook.includes("orderTypeScope"), "scope in hook");
assert(
  hook.includes("resolveWorkInstructionKind(workOrder) === orderTypeScope"),
  "scope uses classifier"
);
assert(types.includes("orderType?: WorkOrderOrderType"), "persisted orderType on WorkOrder");
assert(types.includes("orderType: WorkOrderOrderType"), "orderType on create input");

assert(
  kind.includes("Does not inspect estimatedCost") ||
    kind.includes("must never classify Order Type"),
  "classifier ignores estimated cost"
);
assert(
  kind.includes('return "work_order"'),
  "legacy missing → work_order"
);
assert(!kind.includes("JOB_ORDER_VALUE_THRESHOLD"), "no ₦1m threshold");
assert(form.includes("validateOrderTypeSelection"), "create/edit validation intact");
assert(form.includes("WORK_INSTRUCTION_KIND_OPTIONS"), "explicit Order Type select intact");
assert(
  form.includes("orderType: orderTypeCheck.kind") ||
    form.includes("orderType: form.orderType"),
  "orderType in payload"
);
assert(!form.includes("isOrderTypeOptionAllowed"), "no cost-based option disable");
assert(
  form.includes("Does not determine Order Type"),
  "estimated cost independent hint"
);

assert(layers.includes('href: "/work"'), "/work in layers");
assert(layers.includes('href: "/work-orders"'), "/work-orders in layers");
assert(nav.includes('href: "/work"'), "/work in nav");
assert(nav.includes('href: "/work-orders"'), "/work-orders in nav");
assert(!fs.existsSync(path.join(__dirname, "../src/app/(app)/job-orders")), "no JO app route");

console.log(
  "PASS Work Orders register naming restored; /work WIP intact; Order Type scope preserved"
);
