/**
 * Home Financial Position — 2026 operating-year snapshot (live read-only + pure + source checks).
 *
 * Asserts that Spent is the 2026 complete-register total, classified ONLY by source-register provenance for
 * imported costs (never an inferred date), that the imported 2026 population is exactly the reconciled
 * 52 records / NGN 426,174,848.25, and that no 2025-register record can be counted in 2026.
 *
 *   NODE_PATH=<dir with empty server-only/> npx tsx --tsconfig tsconfig.json scripts/verify-home-financial-position-2026-live-read.mts
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const p = resolve(".env.local");
  if (!existsSync(p)) return;
  for (const l of readFileSync(p, "utf8").split("\n")) {
    const t = l.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    if (!(k in process.env)) process.env[k] = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, "");
  }
}
const results: string[] = [];
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
const kobo = (n: number) => Math.round(n * 100);

// Reconciled imported 2026 population (2026 JOB ORDERS + 2026 WORK ORDER).
const IMPORTED_2026 = { count: 52, kobo: 42_617_484_825 };

async function main() {
  loadEnvLocal();
  const { COST_SOURCE_REGISTER_YEAR, costRecordOperatingYear } = await import("../src/modules/finance/server/fmCostDomain");
  const { deriveFinancialPositionSnapshot } = await import("../src/modules/finance/utils/deriveFinancialPositionSnapshot");

  // ---- Pure: classification rules --------------------------------------------------------------------------------
  const sheets2026 = Object.entries(COST_SOURCE_REGISTER_YEAR).filter(([, y]) => y === 2026).map(([s]) => s).sort();
  assert(JSON.stringify(sheets2026) === JSON.stringify(["2026 JOB ORDERS", "2026 WORK ORDER"]), `2026 registers are exactly the 2026 Job/Work Order sheets (got ${sheets2026})`);
  assert(Object.keys(COST_SOURCE_REGISTER_YEAR).filter((s) => s.startsWith("2025")).every((s) => COST_SOURCE_REGISTER_YEAR[s] === 2025), "2025 registers classify as 2025");
  assert(costRecordOperatingYear({ imported: true, sourceSheet: "2025 JOB ORDERS", recordedAt: "2026-05-01T00:00:00Z" }) === 2025, "imported year comes from the register, never recorded_at");
  assert(costRecordOperatingYear({ imported: true, sourceSheet: "Unknown sheet" }) === null, "unknown register ⇒ unclassified, not guessed");
  assert(costRecordOperatingYear({ imported: true, sourceSheet: null }) === null, "imported without provenance ⇒ unclassified");
  assert(costRecordOperatingYear({ imported: false, recordedAt: "2025-12-31T23:30:00Z" }) === 2026, "native: WAT year of recorded_at");
  results.push("PASS year classification: provenance register for imports, WAT recorded_at for native, unknown ⇒ unclassified");

  // ---- Pure: no all-year fallback, claims scoped to the year -----------------------------------------------------
  const pool = { available: true as const, data: [{ actualAmount: 999, currency: "NGN" }] as never[], total: 1 };
  const empty = { available: true as const, data: [] as never[], total: 0 };
  const failed = deriveFinancialPositionSnapshot({ costs: pool, submissions: empty, payments: empty, authorizations: empty, costTotals: null, operatingYear: 2026 });
  assert(failed.spentAvailable === false && failed.spentAmount == null, "year-scoped Spent is unavailable (not the all-year pool) when the year total fails");
  const claim = (submittedAt: string) => ({ submissionId: submittedAt, status: "submitted", submittedAt, createdAt: submittedAt, claimAmount: 100 });
  const scoped = deriveFinancialPositionSnapshot({
    costs: empty, payments: empty, authorizations: empty, operatingYear: 2026,
    costTotals: { totalAmount: 1, currency: "NGN" },
    submissions: { available: true, data: [claim("2025-06-01T09:00:00Z"), claim("2026-06-01T09:00:00Z")] as never[], total: 2 },
  });
  assert(scoped.openClaimCount === 1, `only 2026 claims count toward 2026 reimbursement (got ${scoped.openClaimCount})`);
  assert(scoped.operatingYear === 2026, "snapshot carries its operating year");
  results.push("PASS snapshot: no all-year pool fallback; reimbursement claims scoped to 2026");

  // ---- Source: Home is wired to the 2026 snapshot ----------------------------------------------------------------
  const hook = readFileSync("src/modules/finance/hooks/useFinancialPosition.ts", "utf8");
  const constants = readFileSync("src/modules/finance/constants.ts", "utf8");
  assert(/export const FINANCE_OPERATING_YEAR = 2026;/.test(constants), "finance operating year is 2026");
  assert(/HOME_FINANCIAL_POSITION_YEAR = FINANCE_OPERATING_YEAR;/.test(hook), "Home uses the shared operating year");
  assert(hook.includes("getOperatingYearTotals(\n      HOME_FINANCIAL_POSITION_YEAR"), "Home Spent uses the operating-year total");
  assert(!/CostRecordService\.getTotals\(/.test(hook), "Home never uses the all-year register total");
  assert(hook.includes("operatingYear: HOME_FINANCIAL_POSITION_YEAR"), "snapshot is derived year-scoped");
  const section = readFileSync("src/modules/workspace/components/FinancialPositionSection.tsx", "utf8");
  for (const label of ["Financial Position · {HOME_FINANCIAL_POSITION_YEAR}", "Spent · recorded costs ({HOME_FINANCIAL_POSITION_YEAR})", "Payment requests ({HOME_FINANCIAL_POSITION_YEAR})", "Pending payments ({HOME_FINANCIAL_POSITION_YEAR})"]) {
    assert(section.includes(label), `label present: ${label}`);
  }
  results.push("PASS Home wiring + labels: 2026 period explicit on the section and every metric");

  // ---- Source: Costs & Claims headline uses the SAME operating-year total ----------------------------------------
  const overviewHook = readFileSync("src/modules/finance/hooks/useFinanceOverview.ts", "utf8");
  assert(overviewHook.includes("getOperatingYearTotals(FINANCE_OPERATING_YEAR"), "Costs & Claims fetches the operating-year total");
  const financePage = readFileSync("src/modules/finance/components/FinancePage.tsx", "utf8");
  assert(financePage.includes("overview?.operatingYearSpend") && !/summary\.sampleAmount/.test(financePage), "headline uses operatingYearSpend, never the all-year / preview amount");
  const financeHeader = readFileSync("src/modules/finance/components/FinanceHeader.tsx", "utf8");
  assert(financeHeader.includes("Costs recorded · {operatingYear}"), "headline labelled with the operating year");
  assert(!/complete cost register recorded/i.test(financeHeader), "headline copy no longer calls the figure the complete register");
  assert(financeHeader.includes("Payment Approvals") && !financeHeader.includes("Work Order approvals"), "summary card reads Payment Approvals");
  const { deriveFinanceOverview } = await import("../src/modules/finance/utils/deriveFinanceOverview");
  const base = { approvals: [], totalApprovals: 0, costRecords: [], totalCostRecords: 0, submissions: [], totalSubmissions: 0 };
  assert(deriveFinanceOverview({ ...base, operatingYearCostTotals: null }).operatingYearSpend === null, "failed year total ⇒ headline unavailable (null)");
  assert(deriveFinanceOverview({ ...base, operatingYearCostTotals: { year: 2026, totalCount: 52, totalAmount: 426174848.25, currency: "NGN" } }).operatingYearSpend?.totalCount === 52, "year total passes through unchanged");
  results.push("PASS Costs & Claims headline: same 2026 total as Home, labelled 2026, Client Approvals card");

  // ---- Live read-only: the reconciled 2026 population ------------------------------------------------------------
  const { createAdminClient } = await import("../src/utils/supabase/admin");
  const { FmCostRepository } = await import("../src/modules/finance/server/FmCostRepository");
  const admin = createAdminClient();
  const { data: orgs } = await admin.from("organisations").select("id").eq("status", "active");
  assert((orgs ?? []).length === 1, "exactly one active organisation");
  const organisationId = String((orgs![0] as { id: string }).id);
  const repo = new FmCostRepository(organisationId, admin);

  const { data: prov, error: provErr } = await admin.from("fm_migration_provenance")
    .select("target_id, source_sheet").eq("organisation_id", organisationId).eq("target_table", "fm_cost_records");
  assert(!provErr, `provenance read: ${provErr?.message}`);
  const sheetById = new Map((prov ?? []).map((p) => [String((p as { target_id: string }).target_id), String((p as { source_sheet: string }).source_sheet)]));
  const { data: costs, error: costErr } = await admin.from("fm_cost_records")
    .select("id, actual_amount, record_origin, recorded_at").eq("organisation_id", organisationId);
  assert(!costErr, `cost read: ${costErr?.message}`);
  const rows = (costs ?? []) as Array<{ id: string; actual_amount: number; record_origin: string; recorded_at: string | null }>;
  const imported2026 = rows.filter((r) => COST_SOURCE_REGISTER_YEAR[sheetById.get(r.id) ?? ""] === 2026);
  const imported2026Kobo = imported2026.reduce((s, r) => s + kobo(Number(r.actual_amount)), 0);
  assert(imported2026.length === IMPORTED_2026.count, `imported 2026 records = 52 (got ${imported2026.length})`);
  assert(imported2026Kobo === IMPORTED_2026.kobo, `imported 2026 amount = NGN 426,174,848.25 (got ${imported2026Kobo / 100})`);
  const native2026 = rows.filter((r) => !sheetById.has(r.id) && r.record_origin !== "migrated_historical"
    && costRecordOperatingYear({ imported: false, recordedAt: r.recorded_at }) === 2026);
  const native2026Kobo = native2026.reduce((s, r) => s + kobo(Number(r.actual_amount)), 0);

  const y2026 = await repo.aggregateTotalsForYear(2026);
  // Imported WO/JO Cost amounts are execution expenditure, included exactly once.
  assert(y2026.totalCount === native2026.length + IMPORTED_2026.count, "2026 count includes native and source execution costs");
  assert(kobo(y2026.totalAmount) === native2026Kobo + IMPORTED_2026.kobo, "2026 spend includes source execution costs exactly once");
  assert(y2026.orderValueCount === IMPORTED_2026.count && kobo(y2026.orderValueAmount) === IMPORTED_2026.kobo, `2026 WO/JO value = imported 52 / NGN 426,174,848.25 (got ${y2026.orderValueCount} / ${y2026.orderValueAmount})`);
  assert(y2026.unclassifiedCount === 0, `no unclassified cost records (got ${y2026.unclassifiedCount})`);

  const in2026 = new Set(rows.filter((r) => {
    const sheet = sheetById.get(r.id);
    return costRecordOperatingYear({ imported: sheet != null || r.record_origin === "migrated_historical", sourceSheet: sheet, recordedAt: r.recorded_at }) === 2026;
  }).map((r) => r.id));
  const leaked2025 = [...in2026].filter((id) => (sheetById.get(id) ?? "").startsWith("2025"));
  assert(leaked2025.length === 0, `no 2025-register record in the 2026 population (found ${leaked2025.length})`);

  const all = await repo.aggregateTotals();
  const y2025 = await repo.aggregateTotalsForYear(2025);
  assert(y2025.orderValueCount === 84 && kobo(y2025.orderValueAmount) === 71_778_584_285, `2025 records remain intact (as WO/JO value): 84 / NGN 717,785,842.85 (got ${y2025.orderValueCount} / ${y2025.orderValueAmount})`);
  assert(all.orderValueCount === y2025.orderValueCount + y2026.orderValueCount && all.totalCount === y2025.totalCount + y2026.totalCount, "every year is still held: costs and WO/JO values reconcile across years");
  results.push(`PASS live: 2026 = ${y2026.totalCount} records / NGN ${y2026.totalAmount.toLocaleString("en-NG", { minimumFractionDigits: 2 })} (native costs) + WO/JO value ${y2026.orderValueCount} / NGN ${y2026.orderValueAmount}; 2025 = 84 value records kept; 0 unclassified; 0 leaked`);

  for (const line of results) console.log(line);
  console.log("verify-home-financial-position-2026: PASS");
}
main().catch((e) => { console.error("FAIL", e instanceof Error ? e.message : e); process.exit(1); });
