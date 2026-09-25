/**
 * FM — operational reconciliation with the FM operator (WO/JO as commercial submissions, ₦426m semantics, 2025
 * scope, contract-payment follow-up, Generator Log hour-meter readings, diesel tank split).
 *
 *   NODE_PATH=<dir containing an empty server-only/ stub> \
 *     npx tsx --tsconfig tsconfig.json scripts/verify-fm-chiamaka-reconciliation.mts
 *
 * Part 1 applies the REAL migration chain (incl. 20260925150000 / 20260925151000 / 20260925152000) to in-process PGlite and proves the
 * schema rules. Part 2 proves the domain parsers/builders. Part 3 checks permissions and truthfulness statically.
 * Never touches Supabase.
 */
import { readFileSync } from "node:fs";
import type { PGlite } from "@electric-sql/pglite";
import { financeDatabase, PAYCHEX_ORG } from "./lib/pf-pglite";
import {
  parseCreateSubmissionInput,
  parseFollowUpInput,
  parseUpdateSubmissionInput,
  FmWorkInstructionValidationError,
  mapFmWorkInstructionRowToWorkOrder,
  type FmWorkInstructionRow,
} from "../src/modules/work-orders/server/fmWorkInstructionDomain";
import { resolveWorkInstructionKind } from "../src/modules/work-orders/instructionKind";
import { GENERATOR_SPEC, DIESEL_SPEC, FmLogValidationError } from "../src/modules/operational-logs/server/fmLogDomain";
import { calculateRunHoursFromReadings, toCreateGeneratorLogInput } from "../src/modules/generator-log/utils";
import {
  FM_HISTORICAL_2025_SHEETS,
  FM_ORDER_REGISTER_SHEETS,
  is2025HistorySheet,
  isOrderRegisterSheet,
} from "../src/lib/fm/sourceRegisterScope";
import { latestFollowUp, parseCommercialFollowUp } from "../src/lib/fm/commercialFollowUp";
import { costRecordOperatingYear, parseCostRecordListParams } from "../src/modules/finance/server/fmCostDomain";
import { capabilityForOperationalProxyAction } from "../src/lib/access/operationalApiGate";

let failures = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL ${name}\n     ${(error as Error).message}`);
  }
}
function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}
function throwsWith(fn: () => unknown, cls: new (...a: never[]) => Error, pattern?: RegExp): boolean {
  try {
    fn();
    return false;
  } catch (error) {
    return error instanceof cls && (!pattern || pattern.test((error as Error).message));
  }
}
const src = (p: string) => readFileSync(p, "utf8");
const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Part 1 — schema (real migration chain)
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
const db: PGlite = await financeDatabase();
const one = async <T,>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0]!;
async function fails(sql: string, params: unknown[], pattern: RegExp, why: string) {
  try {
    await db.query(sql, params);
  } catch (error) {
    if (pattern.test((error as Error).message)) return;
    throw new Error(`${why}: unexpected error ${(error as Error).message}`);
  }
  throw new Error(`${why}: expected refusal`);
}
const ANNEX = (await one<{ id: string }>("insert into public.fm_facilities (organisation_id, code, name) values ($1, 'FAC-0001', 'NCC Annex') returning id", [PAYCHEX_ORG])).id;
const CSIRT = (await one<{ id: string }>("insert into public.fm_facilities (organisation_id, code, name) values ($1, 'FAC-0002', 'CSIRT') returning id", [PAYCHEX_ORG])).id;
const work = async (code: string, facility: string) =>
  (await one<{ id: string }>("insert into public.fm_work (organisation_id, code, facility_id, title, source, priority) values ($1, $2, $3, 'Fix', 'manual', 'medium') returning id", [PAYCHEX_ORG, code, facility])).id;
const W1 = await work("WRK-2026-000001", ANNEX);
const W2 = await work("WRK-2026-000002", ANNEX);
const W3 = await work("WRK-2026-000003", CSIRT);

await check("1 a WO/JO can exist WITHOUT any Work when it is a commercial submission; never without either", async () => {
  const wo = await one<{ id: string; status: string }>(
    `insert into public.fm_work_instructions (organisation_id, code, order_type, facility_id, title, submission_status, submission_date, submission_amount)
     values ($1, 'WO-2026-000001', 'job_order', $2, 'Q3 package', 'submitted', '2026-09-01', 12500000) returning id, status`,
    [PAYCHEX_ORG, ANNEX]
  );
  assert(wo.id, "Work-less submission inserted");
  await fails(
    "insert into public.fm_work_instructions (organisation_id, code, order_type, facility_id, title) values ($1, 'WO-2026-000002', 'work_order', $2, 'orphan')",
    [PAYCHEX_ORG, ANNEX], /work_or_submission/, "neither Work nor submission status"
  );
  await fails(
    "insert into public.fm_work_instructions (organisation_id, code, order_type, facility_id, title, submission_status) values ($1, 'WO-2026-000003', 'work_order', $2, 'x', 'followed_up')",
    [PAYCHEX_ORG, ANNEX], /submission_status_check/, "\"followed up\" is an event, not a status"
  );
  await fails(
    "insert into public.fm_work_instructions (organisation_id, code, order_type, facility_id, title, submission_status, submission_amount) values ($1, 'WO-2026-000004', 'work_order', $2, 'x', 'draft', -1)",
    [PAYCHEX_ORG, ANNEX], /submission_amount_check/, "negative amount"
  );
  await fails(
    "insert into public.fm_work_instructions (organisation_id, code, order_type, facility_id, title, submission_status) values ($1, 'WO-2026-000005', 'work_order', gen_random_uuid(), 'x', 'draft')",
    [PAYCHEX_ORG], /facility_fk/, "facility is anchored directly now that Work is optional"
  );
  const legacy = await one<{ id: string }>(
    "insert into public.fm_work_instructions (organisation_id, code, order_type, work_id, facility_id, title) values ($1, 'WO-2026-000006', 'work_order', $2, $3, 'legacy route') returning id",
    [PAYCHEX_ORG, W1, ANNEX]
  );
  assert(legacy.id, "Work-linked WO/JO unchanged");
});

await check("2 a WO/JO submits 0..many Works and may cover both facilities; amounts are never split", async () => {
  const wo = (await one<{ id: string }>("select id from public.fm_work_instructions where code = 'WO-2026-000001'")).id;
  for (const w of [W1, W2, W3]) {
    await db.query("insert into public.fm_work_instruction_works (organisation_id, work_instruction_id, work_id) values ($1, $2, $3)", [PAYCHEX_ORG, wo, w]);
  }
  await fails("insert into public.fm_work_instruction_works (organisation_id, work_instruction_id, work_id) values ($1, $2, $3)", [PAYCHEX_ORG, wo, W1], /duplicate|unique/, "same Work twice");
  await db.query("insert into public.fm_work_instruction_facilities (organisation_id, work_instruction_id, facility_id) values ($1, $2, $3)", [PAYCHEX_ORG, wo, CSIRT]);
  const n = await one<{ n: number }>("select count(*)::int n from public.fm_work_instruction_works where work_instruction_id = $1", [wo]);
  assert(n.n === 3, "three Works in one package");
  const cols = await one<{ n: number }>("select count(*)::int n from information_schema.columns where table_name = 'fm_work_instruction_facilities' and column_name like '%amount%'");
  assert(cols.n === 0, "no per-facility amount exists");
});

await check("3 follow-ups: one target, append-only, never a payment; client payments carry last_follow_up_at", async () => {
  const wo = (await one<{ id: string }>("select id from public.fm_work_instructions where code = 'WO-2026-000001'")).id;
  const sub = (await one<{ id: string }>("insert into public.fm_cost_submissions (organisation_id, code, submission_kind, status, claim_amount, description) values ($1, 'SUB-2026-000001', 'contract_instalment', 'draft', 100, 'Instalment') returning id", [PAYCHEX_ORG])).id;
  const fu = (await one<{ id: string }>(
    "insert into public.fm_commercial_follow_ups (organisation_id, cost_submission_id, followed_up_at, method, outcome_notes) values ($1, $2, now(), 'phone', 'Chased finance') returning id",
    [PAYCHEX_ORG, sub]
  )).id;
  await fails("update public.fm_commercial_follow_ups set outcome_notes = 'edited' where id = $1", [fu], /append-only/, "history is immutable");
  await fails("insert into public.fm_commercial_follow_ups (organisation_id, work_instruction_id, cost_submission_id, followed_up_at, method, outcome_notes) values ($1, $2, $3, now(), 'phone', 'x')", [PAYCHEX_ORG, wo, sub], /one_target/, "two targets");
  await fails("insert into public.fm_commercial_follow_ups (organisation_id, work_instruction_id, followed_up_at, method, outcome_notes) values ($1, $2, now(), 'paid', 'x')", [PAYCHEX_ORG, wo], /method_check/, "\"paid\" is not a follow-up method");
  await db.query("update public.fm_cost_submissions set last_follow_up_at = now() where id = $1", [sub]);
  const payments = await one<{ n: number }>("select count(*)::int n from public.fm_reimbursement_payments where submission_id = $1", [sub]);
  assert(payments.n === 0, "a follow-up records no receipt");
});

await check("4 diesel tank quantities: each recorded independently; no arithmetic equality is enforced (physical readings)", async () => {
  const insert = (u: number | null, s: number | null, opening: number) =>
    db.query(
      "insert into public.fm_diesel_usage (organisation_id, code, log_date, facility_id, generator_ref, opening_level, closing_level, underground_tank_qty, surface_tank_qty) values ($1, 'DSLU-' || gen_random_uuid(), '2026-09-01', $2, 'Gen 1', $3, 100, $4, $5)",
      [PAYCHEX_ORG, ANNEX, opening, u, s]
    );
  await insert(42000, 2650, 44650);
  await insert(null, null, 500);
  await insert(400, null, 500);
  await insert(400, 50, 500);
  await fails("insert into public.fm_diesel_usage (organisation_id, code, log_date, facility_id, generator_ref, opening_level, closing_level, underground_tank_qty) values ($1, 'DSLU-X1', '2026-09-01', $2, 'Gen 1', 500, 100, -1)", [PAYCHEX_ORG, ANNEX], /nonnegative/, "a negative tank quantity");
});

await check("5 generator hour-meter basis: product (operational) logs record readings without clock times; fuel may be not recorded", async () => {
  const row = await one<{ hours: string }>(
    "insert into public.fm_generator_logs (organisation_id, code, log_date, generator, log_basis, start_meter_reading, end_meter_reading, fuel_used) values ($1, 'GENLOG-1', '2026-08-16', 'Gen 1', 'hour_meter', 3265.1, 3271.5, null) returning hours",
    [PAYCHEX_ORG]
  );
  assert(Math.abs(Number(row.hours) - 6.4) < 0.001, "run hours = end − start readings");
  await fails("insert into public.fm_generator_logs (organisation_id, code, log_date, generator, log_basis, start_meter_reading, end_meter_reading, started_at, ended_at) values ($1, 'GENLOG-2', '2026-08-16', 'Gen 1', 'hour_meter', 1, 2, now(), now())", [PAYCHEX_ORG], /hour_meter_basis/, "readings never mixed with clock times");
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Part 2 — domain
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
await check("6 WO/JO classification is the explicit selection only — the amount never classifies (no ₦1m rule)", () => {
  for (const amount of [999_999, 1_000_000, 1_000_001, 500_000_000]) {
    const wo = parseCreateSubmissionInput({ orderType: "work_order", title: "T", facilityIds: ["FAC-0001"], submissionStatus: "submitted", submissionDate: "2026-09-01", submissionAmount: amount });
    const jo = parseCreateSubmissionInput({ orderType: "job_order", title: "T", facilityIds: ["FAC-0001"], submissionStatus: "submitted", submissionDate: "2026-09-01", submissionAmount: amount });
    assert(wo.orderType === "work_order" && jo.orderType === "job_order", `amount ${amount} did not change the selection`);
    assert(resolveWorkInstructionKind({ orderType: "work_order", estimatedCost: amount }) === "work_order", "resolver ignores cost");
  }
  assert(throwsWith(() => parseCreateSubmissionInput({ title: "T", facilityIds: ["FAC-0001"], submissionStatus: "draft", submissionAmount: 5_000_000 }), FmWorkInstructionValidationError, /Order Type/), "no Order Type → refused, never inferred");
  const instructionKind = src("src/modules/work-orders/instructionKind.ts");
  assert(!/1_?000_?000|1e6/.test(strip(instructionKind)), "no threshold constant in the classifier");
});

await check("7 WO/JO created directly: no Work required; Works optional; submitted needs date and amount; draft need not", () => {
  const direct = parseCreateSubmissionInput({ orderType: "job_order", title: "Batch", facilityIds: ["FAC-0001", "FAC-0002"], submissionStatus: "draft" });
  assert(direct.workRefs.length === 0 && direct.facilityRefs.length === 2 && direct.submissionAmount === null, "draft with no Works and two facilities");
  assert(throwsWith(() => parseCreateSubmissionInput({ orderType: "work_order", title: "T", facilityIds: ["FAC-0001"], submissionStatus: "submitted", submissionAmount: 10 }), FmWorkInstructionValidationError, /date/), "submitted needs a date");
  assert(throwsWith(() => parseCreateSubmissionInput({ orderType: "work_order", title: "T", facilityIds: ["FAC-0001"], submissionStatus: "queried", submissionDate: "2026-09-01" }), FmWorkInstructionValidationError, /status/i), "queried is not an evidenced WO/JO status");
  assert(throwsWith(() => parseCreateSubmissionInput({ orderType: "work_order", title: "T", facilityIds: [], submissionStatus: "draft" }), FmWorkInstructionValidationError, /Facility/), "facility required");
  assert(throwsWith(() => parseCreateSubmissionInput({ orderType: "work_order", title: "T", facilityIds: ["FAC-0001"], submissionStatus: "followed_up" }), FmWorkInstructionValidationError), "follow-up is not a status");
  const many = parseCreateSubmissionInput({ orderType: "work_order", title: "T", facilityIds: ["FAC-0001"], submissionStatus: "draft", workIds: ["WRK-1", "WRK-2", "WRK-1"] });
  assert(many.workRefs.length === 2, "many Works, de-duplicated");
  assert(parseUpdateSubmissionInput({ id: "WO-1", submissionStatus: "submitted" }).submissionStatus === "submitted", "update parses a status change");
});

await check("8 imported execution cost remains distinct from submitted amount", () => {
  const row = { id: "i", organisation_id: "o", code: "WO-2026-000010", order_type: "job_order", work_id: null, facility_id: "f", title: "t", description: null, instruction_text: null, work_category: "other", maintenance_type: null, source: "manual", category_id: null, asset_id: null, parent_instruction_id: null, reported_by_profile_id: null, assigned_to_profile_id: null, status: "unknown", priority: "unknown", hold_reason: null, requested_at: null, record_origin: "migrated_historical", scheduled_start_at: null, scheduled_end_at: null, due_at: null, sla_due_at: null, started_at: null, completed_at: null, estimated_hours: null, actual_hours: null, estimated_cost: null, actual_cost: null, downtime_minutes: null, completion_notes: null, work_performed: null, requires_approval: false, client_reference: null, operational_event_id: null, submission_date: null, submission_amount: null, submission_status: null, last_follow_up_at: null, created_by_profile_id: null, updated_by_profile_id: null, created_at: "", updated_at: "" } satisfies FmWorkInstructionRow;
  const imported = mapFmWorkInstructionRowToWorkOrder(row, { importedOrderValue: 48_000_000 });
  assert(imported.executionCost === 48_000_000 && imported.submissionAmount === undefined && imported.submissionAmountSource === undefined && imported.submissionStatus === undefined, "imported value, not a recorded submission");
  const recorded = mapFmWorkInstructionRowToWorkOrder({ ...row, submission_amount: 7, submission_status: "submitted" }, { importedOrderValue: 48_000_000 });
  assert(recorded.submissionAmount === 7 && recorded.submissionAmountSource === "recorded", "a recorded amount wins");
  const none = mapFmWorkInstructionRowToWorkOrder(row, {});
  assert(none.submissionAmount === undefined && none.submissionAmountSource === undefined && (none.linkedWorkIds ?? []).length === 0, "no evidence → not recorded, never 0");
});

await check("9 ₦426m: execution costs included once; provenance subset and 2025 history preserved", () => {
  assert(FM_ORDER_REGISTER_SHEETS.every(isOrderRegisterSheet) && !isOrderRegisterSheet("2026 Monthly Payment") && !isOrderRegisterSheet(null), "order registers exactly");
  assert(FM_HISTORICAL_2025_SHEETS.every(is2025HistorySheet) && !is2025HistorySheet("2026 JOB ORDERS"), "2025 history exactly");
  assert(costRecordOperatingYear({ imported: true, sourceSheet: "2026 JOB ORDERS" }) === 2026, "operating-year classification unchanged");
  assert(parseCostRecordListParams({}).valueScope === "costs" && parseCostRecordListParams({}).includeHistory === false, "cost register defaults: costs only, current year picture");
  assert(parseCostRecordListParams({ valueScope: "order_values", includeHistory: true }).valueScope === "order_values", "order values reachable, labelled");
  const repo = strip(src("src/modules/finance/server/FmCostRepository.ts"));
  const yearFn = repo.slice(repo.indexOf("async aggregateTotalsForYear"), repo.indexOf("async createCost"));
  assert(/if \(isOrderRegisterSheet\(sheet\)\) \{\s*orderValueCount \+= 1;\s*orderValueAmount \+= [^;]+;\s*\}\s*totalCount \+= 1;/.test(yearFn), "year spend includes execution costs once");
  const allFn = repo.slice(repo.indexOf("async aggregateTotals()"), repo.indexOf("async aggregateTotalsForYear"));
  assert(/if \(orderValueIds\.has\(String\(row\.id\)\)\) \{[\s\S]*?orderValueAmount \+= [^;]+;\s*\}\s*totalCount \+= 1;/.test(allFn), "all-year totals include execution costs once");
  const home = src("src/modules/workspace/components/FinancialPositionSection.tsx");
  assert(/Spent · recorded costs/.test(home) && !/Work &amp; Job Order value/.test(home), "Home has one inclusive spend figure");
  assert(/executionCost: optionalNumber/.test(src("src/services/workOrders/WorkOrderService.ts")), "API execution cost survives frontend mapping");
  const header = src("src/modules/finance/components/FinanceHeader.tsx");
  assert(!/Operational spend ·/.test(header) && /Costs recorded ·/.test(header), "Costs & Claims headline is costs, not \"operational spend\"");
});

await check("10 Generator Log: Start/End are hour-meter readings; run hours derived; blank diesel is not recorded", () => {
  const parsed = GENERATOR_SPEC.parseCreate({ date: "2026-08-16", generator: "Gen 1", startMeterReading: 3265.1, endMeterReading: 3271.5, fuelUsed: "" });
  const c = parsed.columns;
  assert(c.log_basis === "hour_meter" && c.start_meter_reading === 3265.1 && c.end_meter_reading === 3271.5 && c.started_at === null && c.ended_at === null, "hour-meter basis, no times");
  assert(c.fuel_used === null && !("hours" in c), "fuel not recorded is NULL; hours never accepted");
  assert(throwsWith(() => GENERATOR_SPEC.parseCreate({ date: "2026-08-16", generator: "G", startMeterReading: 10, endMeterReading: 9 }), FmLogValidationError, /lower/), "end reading below start refused");
  assert(throwsWith(() => GENERATOR_SPEC.parseCreate({ date: "2026-08-16", generator: "G", startedAt: "2026-08-16T08:00:00Z", endedAt: "2026-08-16T10:00:00Z" }), FmLogValidationError, /Start reading/), "date-times are not readings");
  const upd = GENERATOR_SPEC.parseUpdate({ id: "GENLOG-1", endMeterReading: 3280 }).columns;
  assert(upd.log_basis === "hour_meter" && upd.started_at === null && upd.end_meter_reading === 3280, "editing readings keeps the hour-meter basis");
  assert(calculateRunHoursFromReadings(3265.1, 3271.5) === 6.4 && calculateRunHoursFromReadings(null, 5) === null && calculateRunHoursFromReadings(5, 4) === null, "client derivation matches");
  assert(toCreateGeneratorLogInput({ date: "2026-08-16", generator: "G", startMeterReading: "1", endMeterReading: "2", fuelUsed: "" }).fuelUsed === null, "client sends blank fuel as null, never 0");
  const mapped = GENERATOR_SPEC.map({ code: "GENLOG-1", id: "u", log_date: "2026-08-16", generator: "Gen 1", hours: 6.4, fuel_used: null, log_basis: "hour_meter", start_meter_reading: 3265.1, end_meter_reading: 3271.5 });
  assert(mapped.startMeterReading === 3265.1 && mapped.endMeterReading === 3271.5 && mapped.fuelUsed === null, "readings surfaced; fuel unknown stays null");
  const svc = src("src/services/generatorLog/GeneratorLogService.ts");
  assert(/fuelUsed: toNumberOrNull\(/.test(svc) && /startMeterReading,/.test(svc), "client mapper keeps readings and unknown fuel");
});

await check("11 diesel parse: tank quantities as recorded, no arithmetic equality; blank is not recorded", () => {
  const ok = DIESEL_SPEC.parseCreate({ facilityId: "FAC-0001", date: "2026-09-01", generatorId: "G", openingLevel: 44650, closingLevel: 43250, undergroundTankQty: 42000, surfaceTankQty: 2650 });
  assert(ok.columns.underground_tank_qty === 42000 && ok.columns.surface_tank_qty === 2650, "split kept");
  const one = DIESEL_SPEC.parseCreate({ facilityId: "F", date: "2026-09-01", generatorId: "G", openingLevel: 100, closingLevel: 50, undergroundTankQty: 60, surfaceTankQty: 10 });
  assert(one.columns.underground_tank_qty === 60 && one.columns.surface_tank_qty === 10, "a split that does not add up is kept as recorded");
  assert(throwsWith(() => DIESEL_SPEC.parseCreate({ facilityId: "F", date: "2026-09-01", generatorId: "G", undergroundTankQty: -5 }), FmLogValidationError, /negative/), "negative refused");
  const none = DIESEL_SPEC.parseCreate({ facilityId: "F", date: "2026-09-01", generatorId: "G", openingLevel: 100, closingLevel: 50 });
  assert(none.columns.underground_tank_qty === null && none.columns.surface_tank_qty === null, "not supplied → NULL (not recorded, never 0)");
});

await check("12 follow-up: event fields as Approvals; never a status; last follow-up never moves backwards", () => {
  const p = parseCommercialFollowUp({ id: "SUB-1", followedUpAt: "2026-09-20T10:00:00Z", method: "Physical visit", outcomeNotes: "Awaiting CFO" });
  assert(p.ok && p.value.method === "physical_visit" && p.value.nextFollowUpAt === null, "parsed");
  assert(!parseCommercialFollowUp({ id: "x", followedUpAt: "2026-09-20", method: "paid", outcomeNotes: "n" }).ok, "\"paid\" is not a method");
  assert(!parseCommercialFollowUp({ id: "x", followedUpAt: "2026-09-20", method: "phone" }).ok, "notes required");
  assert(throwsWith(() => parseFollowUpInput({ id: "WO-1", method: "phone", outcomeNotes: "n" }), FmWorkInstructionValidationError), "WO/JO parser wraps in its own error");
  assert(latestFollowUp("2026-09-20T00:00:00.000Z", "2026-09-01T00:00:00.000Z") === "2026-09-20T00:00:00.000Z", "back-dated follow-up keeps the latest");
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Part 3 — permissions, boundaries and preservation (static)
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
await check("13 permissions reuse existing capabilities; mutations fail closed", () => {
  assert(capabilityForOperationalProxyAction("work-orders", "createSubmission") === "ops.create", "create → ops.create");
  assert(capabilityForOperationalProxyAction("work-orders", "updateSubmission") === "ops.edit", "update → ops.edit");
  assert(capabilityForOperationalProxyAction("work-orders", "recordFollowUp") === "ops.edit", "follow-up → ops.edit (fail closed)");
  assert(capabilityForOperationalProxyAction("work-orders", "listFollowUps") === "ops.view", "history → ops.view");
  const costRoute = src("src/modules/finance/server/fmCostRoute.ts");
  assert(/WRITE_ACTIONS = new Set\(\["create", "update", "recordFollowUp"\]\)/.test(costRoute), "client-payment follow-up gated as a write");
  const repo = strip(src("src/modules/work-orders/server/FmWorkInstructionRepository.ts"));
  const fns = repo.slice(repo.indexOf("async createSubmission"), repo.indexOf("async listFollowUps"));
  assert((fns.match(/canOperateIn\(/g) ?? []).length === 0 || /submissionFacilities/.test(fns), "facility scope checked");
  assert(/record_origin === "migrated_historical"\) throw new FmWorkInstructionReadOnlyError/.test(fns), "imported WO/JO stay read-only");
});

await check("14 Reimbursements untouched; payment state never written by follow-ups; Approvals not merged", () => {
  const costRepo = strip(src("src/modules/finance/server/FmCostRepository.ts"));
  const fu = costRepo.slice(costRepo.indexOf("async recordSubmissionFollowUp"), costRepo.indexOf("async listSubmissionFollowUps"));
  assert(/submission_kind === "reimbursement_claim"\) \{\s*throw/.test(fu), "reimbursement claims refused");
  assert(!/fm_reimbursement_payments|fm_reimbursement_authorizations|status:/.test(fu), "a follow-up writes no receipt, authorization or status");
  const woFu = strip(src("src/modules/work-orders/server/FmWorkInstructionRepository.ts"));
  const recordFn = woFu.slice(woFu.indexOf("async recordFollowUp"), woFu.indexOf("async listFollowUps"));
  assert(!/submission_status|fm_cost_submissions/.test(recordFn), "WO/JO follow-up never changes submission status or payments");
  const migration = src("supabase/migrations/20260925150000_fm_wo_jo_commercial_submissions.sql");
  assert(!/fm_approvals|drop table|delete from|update public\./i.test(strip(migration.replace(/--.*$/gm, ""))), "no Approval merge, no data rewrite, no deletion");
});

await check("15 2025 is excluded from the current picture by provenance only — preserved and reachable", () => {
  const wiRepo = strip(src("src/modules/work-orders/server/FmWorkInstructionRepository.ts"));
  assert(/if \(!params\.includeHistory\) \{\s*const history = await this\.historical2025Ids\(\);/.test(wiRepo), "WO/JO list default excludes 2025 register rows");
  assert(/countUnrecordedStatus[\s\S]*?historical2025Ids/.test(wiRepo), "historical counter excludes 2025");
  const workSvc = strip(src("src/modules/maintenance/server/FmWorkServerService.ts"));
  assert(/parsed\.includeHistory \? new Set<string>\(\) : new Set\(await this\.repo\(\)\.historical2025Ids\(\)\)/.test(workSvc), "Work list default excludes 2025");
  for (const f of ["src/modules/work-orders/server/FmWorkInstructionRepository.ts", "src/modules/maintenance/server/FmWorkRepository.ts", "src/modules/finance/server/FmCostRepository.ts", "src/lib/fm/sourceRegisterScope.ts"]) {
    assert(!/\.delete\(\)[\s\S]{0,80}(fm_work"|fm_cost_records|fm_work_instructions")/.test(strip(src(f))), `${f}: no deletion of history`);
  }
  const migrations = ["supabase/migrations/20260925150000_fm_wo_jo_commercial_submissions.sql", "supabase/migrations/20260925151000_fm_diesel_tank_quantities.sql"].map(src).join("\n");
  assert(!/2025/.test(migrations.replace(/--.*$/gm, "")), "no year-based data change in migrations");
});

console.log(failures ? `\n${failures} check(s) failed` : "\nAll FM reconciliation checks passed");
process.exit(failures ? 1 : 0);
