/**
 * FM operational reconciliation — READ-ONLY live smoke against the linked database.
 *
 *   NODE_PATH=<dir containing an empty server-only/ stub> \
 *     npx tsx --tsconfig tsconfig.json scripts/verify-fm-chiamaka-live-read.mts
 *
 * Proves, on real data, that the imported order-register values (the ~₦426m for 2026) are included once in cost/spend, with WO/JO provenance available as a subset; and that 2025 register
 * history is out of the current picture by default yet fully reachable. WO/JO reads need migration
 * 20260925150000_fm_wo_jo_commercial_submissions; they are SKIPPED (not failed) until it is applied. Reads only.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const path = resolve(".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    if (!(k in process.env)) process.env[k] = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, "");
  }
}
function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

async function main() {
  loadEnvLocal();
  const { createAdminClient } = await import("../src/utils/supabase/admin");
  const { FmCostRepository } = await import("../src/modules/finance/server/FmCostRepository");
  const { FmWorkRepository } = await import("../src/modules/maintenance/server/FmWorkRepository");
  const { FM_ORDER_REGISTER_SHEETS, FM_HISTORICAL_2025_SHEETS, loadProvenanceTargetIds } = await import("../src/lib/fm/sourceRegisterScope");
  const admin = createAdminClient();
  const { data: orgs, error: orgError } = await admin.from("organisations").select("id").eq("status", "active");
  assert(!orgError && orgs?.length === 1, "exactly one active organisation; never guess the tenant");
  const organisationId = String(orgs[0].id);

  const orderValueIds = await loadProvenanceTargetIds(admin as never, { organisationId, target: "fm_cost_records", sheets: FM_ORDER_REGISTER_SHEETS });
  const history2025 = await loadProvenanceTargetIds(admin as never, { organisationId, target: "fm_cost_records", sheets: FM_HISTORICAL_2025_SHEETS });
  console.log(`provenance: ${orderValueIds.length} order-register value rows, ${history2025.length} from 2025 registers`);

  const costs = new FmCostRepository(organisationId, admin);
  const year = await costs.aggregateTotalsForYear(2026);
  console.log(`2026: costs ${year.totalCount} rows / ${year.totalAmount}; WO/JO value ${year.orderValueCount} rows / ${year.orderValueAmount}`);
  assert(year.orderValueCount === 52 && Math.abs(year.orderValueAmount - 426_174_848.25) < 0.005, "2026 source execution cost equals ₦426,174,848.25");
  assert(year.totalAmount >= year.orderValueAmount, "source costs included in spend");
  const all = await costs.aggregateTotals();
  assert(all.orderValueCount === orderValueIds.length, "source subset retained");

  const costPage = await costs.listCosts({ page: 1, pageSize: 500 });
  assert(costPage.rows.every((r) => !history2025.includes(r.id)), "default costs exclude 2025");
  assert(costPage.rows.some((r) => orderValueIds.includes(r.id)), "execution costs are in Costs");
  assert(costPage.total === year.totalCount, "cost register count = cost totals count");
  const values = await costs.listCosts({ page: 1, pageSize: 500, valueScope: "order_values" });
  const valuesAll = await costs.listCosts({ page: 1, pageSize: 500, valueScope: "order_values", includeHistory: true });
  assert(values.total === orderValueIds.length - history2025.length && values.rows.every((r) => !history2025.includes(r.id)), "value view excludes 2025 by default");
  assert(valuesAll.total === orderValueIds.length, "2025 history reachable when included");
  console.log(`cost register: ${costPage.total} costs; WO/JO values ${values.total} current, ${valuesAll.total} incl. 2025`);

  const work2025 = await new FmWorkRepository(organisationId, admin).historical2025Ids();
  const workRows = await new FmWorkRepository(organisationId, admin).listRows();
  assert(work2025.length > 0 && work2025.every((id) => workRows.some((w) => w.id === id)), "2025 Work preserved in the register");
  console.log(`Work: ${workRows.length} total, ${work2025.length} are 2025 history (excluded from the current picture by default)`);

  const probe = await admin.from("fm_work_instructions").select("submission_status").limit(1);
  if (probe.error) {
    console.log("SKIP WO/JO list checks: migration 20260925150000_fm_wo_jo_commercial_submissions is not applied yet");
  } else {
    const { FmWorkInstructionRepository } = await import("../src/modules/work-orders/server/FmWorkInstructionRepository");
    const wi = new FmWorkInstructionRepository(organisationId, admin);
    const current = await wi.listPage({ page: 1, pageSize: 500 });
    const withHistory = await wi.listPage({ page: 1, pageSize: 500, includeHistory: true });
    const wi2025 = await wi.historical2025Ids();
    assert(current.total === withHistory.total - wi2025.length, "WO/JO list excludes exactly the 2025 register rows by default");
    const jo = await wi.listPage({ page: 1, pageSize: 500, orderType: "job_order", includeHistory: true });
    assert(jo.rows.every((r) => r.order_type === "job_order"), "Job Orders tab = persisted order_type");
    const relations = await wi.relationsFor(current.rows.slice(0, 60));
    const withValue = [...relations.values()].filter((r) => r.importedOrderValue != null).length;
    console.log(`WO/JO: ${current.total} current, ${withHistory.total} incl. 2025; ${withValue} of the first ${Math.min(60, current.rows.length)} show an imported order value`);
  }
  console.log("FM reconciliation live read-only smoke passed");
}

main().catch((error) => {
  console.error(`FAIL ${(error as Error).message}`);
  process.exit(1);
});
