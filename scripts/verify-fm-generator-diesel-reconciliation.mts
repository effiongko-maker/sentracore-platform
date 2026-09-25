/**
 * FM Generator Log / Diesel Usage reconciliation against the operator's updated workbook (Udated.xlsx).
 *
 *   NODE_PATH=<dir containing an empty server-only/ stub> \
 *     npx tsx --tsconfig tsconfig.json scripts/verify-fm-generator-diesel-reconciliation.mts
 *
 * Part 1: the pure diesel planner's evidence rule (every dated observation as recorded; NULL = not recorded; variance
 * shown, never corrected). Part 2: the planner on the REAL workbook against the pre-write live snapshot (14 imported
 * NCC Annex rows). Part 3: the schema rules on the full migration chain (PGlite): nullable recorded diesel values, one
 * generator diesel total per site and date. Never touches Supabase.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { financeDatabase, PAYCHEX_ORG } from "./lib/pf-pglite";
import { readWorkbook } from "./fm-migration/xlsx";
import {
  DIESEL_SITES,
  excelSerialToIso,
  planDieselReconciliation,
  readDieselSourceRows,
  type DieselInsert,
  type DieselSourceRow,
  type LiveDieselRow,
} from "./fm-migration/dieselReconcile";
import { GENERATOR_SPEC, DIESEL_SPEC, FmLogValidationError } from "../src/modules/operational-logs/server/fmLogDomain";

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
const code = (p: string) => readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const site = { facilityCode: "FAC-X", sheet: "S", semantics: "opening_reading" as const };
const csirt = { facilityCode: "FAC-C", sheet: "C", semantics: "closing_reading" as const };
const r = (row: number, date: string, u: number | null, s: number | null, c: number | "-" | null, b: number | null, sheet = "S"): DieselSourceRow =>
  ({ sheet, row, date, underground: u, surface: s, consumption: c, balance: b });

// ── Part 1 — planner rules (evidence rule: record what the source records; never correct arithmetic) ─────────────
await check("1 every dated observation is represented as recorded; '-' and blanks are NULL, never 0", () => {
  const plan = planDieselReconciliation({
    sites: [site], live: [],
    rows: [r(2, "2026-08-27", 42000, 2650, 1400, 43250), r(3, "2026-08-30", 39000, 2550, "-", 41550), r(4, "2026-09-25", 12500, 1350, null, null)],
  });
  assert(plan.inserts.length === 3 && plan.exceptions.length === 0, "all three dated rows inserted");
  const [a, dash, blank] = plan.inserts;
  assert(a.opening === 44650 && a.closing === 43250 && a.consumption === 1400 && a.underground === 42000 && a.surface === 2650 && a.added === null, "complete row exact; added not recorded");
  assert(dash.consumption === null && dash.closing === 41550 && dash.transformations.some((t) => /"-" ⇒ NULL/.test(t)), "'-' consumption is NULL, recorded balance kept");
  assert(blank.opening === 13850 && blank.closing === null && blank.consumption === null, "incomplete row: observed opening kept, rest NULL");
  assert(plan.coverage["FAC-X"].incomplete === 2, "incomplete cycles counted, not dropped");
});

await check("2 arithmetic disagreement never rewrites a recorded value — it is preserved and shown as a variance", () => {
  const plan = planDieselReconciliation({ sites: [site], live: [], rows: [r(15, "2026-09-09", 25000, 3600, 1850, 26700)] });
  const x = plan.inserts[0];
  assert(x.opening === 28600 && x.closing === 26700 && x.consumption === 1850, "9 Sep: all three recorded values kept");
  assert(plan.variances.length === 1 && plan.variances[0].variance === 50 && x.transformations.some((t) => /preserved, not corrected/.test(t)), "variance 50 L reported, not corrected");
});

await check("3 closing-reading sheet (CSIRT): closing = recorded balance; opening = previous recorded balance, NULL for the first reading", () => {
  const plan = planDieselReconciliation({
    sites: [csirt], live: [],
    rows: [r(2, "2026-08-18", 4400, 4000, "-", 8400, "C"), r(3, "2026-08-19", 4200, 4000, 200, 8200, "C"), r(4, "2026-08-20", 4000, 4000, 300, 8000, "C")],
  });
  assert(plan.inserts.length === 3, "every CSIRT observation inserted");
  const [first, second, third] = plan.inserts;
  assert(first.opening === null && first.closing === 8400 && first.consumption === null, "18 Aug: closing observation kept; opening/consumption not recorded");
  assert(second.opening === 8400 && second.closing === 8200 && second.consumption === 200, "opening carried from the previous recorded balance");
  assert(third.consumption === 300 && plan.variances.some((v) => v.date === "2026-08-20" && v.variance === -100), "a non-reconciling row is kept with its variance");
});

await check("4 live rows: updated to the recorded source values, never duplicated; operator rows untouched; idempotent", () => {
  const live: LiveDieselRow[] = [{ id: "a", code: "DSLU-1", facilityCode: "FAC-X", logDate: "2026-09-13", opening: 21450, closing: 20850, added: 0, consumption: 600, underground: null, surface: null, recordOrigin: "migrated_historical" }];
  const plan = planDieselReconciliation({ sites: [site], live, rows: [r(19, "2026-09-13", 20000, 1450, 600, 20950)] });
  assert(plan.updates.length === 1 && plan.inserts.length === 0, "update, never a second row for the date");
  const fields = plan.updates[0].changes.map((c) => `${c.field}:${c.from}->${c.to}`).join();
  assert(fields === "closing:20850->20950,added:0->null,underground:null->20000,surface:null->1450", `changes ${fields}`);
  const done = planDieselReconciliation({ sites: [site], live: [{ ...live[0], ...plan.updates[0].values }], rows: [r(19, "2026-09-13", 20000, 1450, 600, 20950)] });
  assert(done.unchanged.length === 1 && done.updates.length === 0, "idempotent");
  const operator = planDieselReconciliation({ sites: [site], live: [{ ...live[0], recordOrigin: "operational" }], rows: [r(19, "2026-09-13", 20000, 1450, 600, 20950)] });
  assert(operator.updates.length === 0 && operator.inserts.length === 0 && operator.exceptions.length === 1, "an operator-entered row is never overwritten");
  const dup = planDieselReconciliation({ sites: [site], live: [], rows: [r(5, "2026-09-01", 1, 1, 1, 1), r(6, "2026-09-01", 2, 2, 2, 2)] });
  assert(dup.inserts.length === 0 && dup.exceptions.every((e) => /authoritative/.test(e.reason)), "a duplicated source date is a human choice, not guessed");
  assert(excelSerialToIso(46272) === "2026-09-07" && excelSerialToIso("16/08/26") === null, "exact serial dates only");
});

// ── Part 2 — the real workbook vs the live snapshot ───────────────────────────────────────────────────────────
const SOURCE = resolve(process.env.HOME ?? "", "Developer/sentracore-migration-source/Udated.xlsx");
await check("5 Udated.xlsx vs live snapshot: counts, facilities and coverage", () => {
  if (!existsSync(SOURCE)) throw new Error(`source workbook missing: ${SOURCE}`);
  const wb = readWorkbook(SOURCE);
  const rows = DIESEL_SITES.flatMap((s) => readDieselSourceRows(wb.sheets.find((x) => x.name === s.sheet)!));
  // Live snapshot (read-only query, 2026-09-25, before the reconciliation write): the 14 imported NCC Annex rows.
  const snap: Array<[string, string, number, number]> = [
    ["DSLU-2026-000001", "2026-08-27", 44650, 43250], ["DSLU-2026-000002", "2026-08-28", 43250, 42250], ["DSLU-2026-000003", "2026-08-29", 42250, 41550],
    ["DSLU-2026-000004", "2026-08-31", 41550, 40350], ["DSLU-2026-000005", "2026-09-01", 40350, 38650], ["DSLU-2026-000006", "2026-09-02", 38650, 37550],
    ["DSLU-2026-000007", "2026-09-03", 37550, 36300], ["DSLU-2026-000008", "2026-09-04", 36300, 35350], ["DSLU-2026-000009", "2026-09-05", 35350, 33500],
    ["DSLU-2026-000010", "2026-09-06", 33500, 32550], ["DSLU-2026-000011", "2026-09-11", 23150, 21950], ["DSLU-2026-000012", "2026-09-13", 21450, 20850],
    ["DSLU-2026-000013", "2026-09-14", 20850, 18850], ["DSLU-2026-000014", "2026-09-15", 19000, 18200],
  ];
  const live: LiveDieselRow[] = snap.map(([c, d, o, cl]) => ({ id: c, code: c, facilityCode: "FAC-0001", logDate: d, opening: o, closing: cl, added: 0, consumption: o - cl, underground: null, surface: null, recordOrigin: "migrated_historical" }));
  const plan = planDieselReconciliation({ sites: DIESEL_SITES, rows, live });
  assert(plan.updates.length === 14 && plan.inserts.length === 33 && plan.unchanged.length === 0 && plan.exceptions.length === 0, `plan ${plan.updates.length}/${plan.inserts.length}/${plan.unchanged.length}/${plan.exceptions.length}`);
  assert(plan.inserts.filter((x) => x.facilityCode === "FAC-0002").length === 17 && plan.inserts.filter((x) => x.facilityCode === "FAC-0001").length === 16, "17 CSIRT + 16 Annex");
  assert(plan.updates.filter((u) => u.changes.some((c) => c.field === "closing")).map((u) => u.date).join() === "2026-09-13,2026-09-14,2026-09-15", "only the three revised balances change a closing");
  assert(plan.updates.every((u) => !u.changes.some((c) => c.field === "opening" || c.field === "consumption")), "no stored opening or consumption is rewritten");
  assert(plan.coverage["FAC-0001"].rows === 30 && plan.coverage["FAC-0002"].rows === 17, "coverage: every source observation");
  assert(rows.filter((x) => x.date).length === 47, "47 dated source observations");
  const all = [...plan.inserts.map((x) => `${x.facilityCode}|${x.date}`), ...live.map((l) => `${l.facilityCode}|${l.logDate}`)];
  assert(new Set(all).size === all.length, "no duplicate facility/date");
  assert(plan.inserts.every((x) => x.facilityCode === "FAC-0002" ? x.sheet === "CSIRT DIESEL Checklist" : x.sheet === "MBORA DIESEL Checklist"), "facility identity preserved");
  for (const [date, fac, check] of [
    ["2026-09-09", "FAC-0001", (x: DieselInsert) => x.opening === 28600 && x.closing === 26700 && x.consumption === 1850],
    ["2026-08-30", "FAC-0001", (x: DieselInsert) => x.consumption === null && x.opening === 41550],
    ["2026-08-18", "FAC-0002", (x: DieselInsert) => x.opening === null && x.closing === 8400 && x.consumption === null],
    ["2026-09-25", "FAC-0001", (x: DieselInsert) => x.opening === 13850 && x.closing === null && x.consumption === null],
  ] as const) {
    const x = plan.inserts.find((i) => i.date === date && i.facilityCode === fac);
    assert(x && check(x), `${fac} ${date} represented as recorded`);
  }
});

// ── Part 3 — schema (full migration chain) ────────────────────────────────────────────────────────────────────
const db: PGlite = await financeDatabase();
async function fails(sql: string, params: unknown[], pattern: RegExp, why: string) {
  try {
    await db.query(sql, params);
  } catch (error) {
    if (pattern.test((error as Error).message)) return;
    throw new Error(`${why}: unexpected ${(error as Error).message}`);
  }
  throw new Error(`${why}: expected refusal`);
}
const fac = (await db.query<{ id: string }>("insert into public.fm_facilities (organisation_id, code, name) values ($1, 'FAC-0002', 'CSIRT') returning id", [PAYCHEX_ORG])).rows[0]!.id;

await check("6 diesel schema: every value nullable and recorded; no arithmetic constraint; at least one observation; operator generator rule kept", async () => {
  const ins = (code: string, o: number | null, cl: number | null, c: number | null, u: number | null, s: number | null, origin = "migrated_historical", gen: string | null = null) =>
    db.query("insert into public.fm_diesel_usage (organisation_id, code, log_date, facility_id, generator_ref, opening_level, closing_level, consumption, underground_tank_qty, surface_tank_qty, record_origin) values ($1, $2, '2026-08-19', $3, $4, $5, $6, $7, $8, $9, $10)", [PAYCHEX_ORG, code, fac, gen, o, cl, c, u, s, origin]);
  await ins("D1", 28600, 26700, 1850, 25000, 3600);
  await ins("D2", null, 8400, null, 4400, 4000);
  await ins("D3", 13850, null, null, 12500, 1350);
  const d1 = (await db.query<{ consumption: string; added: string | null }>("select consumption::text, added::text from public.fm_diesel_usage where code = 'D1'")).rows[0]!;
  assert(Number(d1.consumption) === 1850 && d1.added === null, "consumption stored as recorded (not derived); added not recorded stays NULL");
  await fails("insert into public.fm_diesel_usage (organisation_id, code, log_date, facility_id, generator_ref, record_origin) values ($1, 'D4', '2026-08-19', $2, null, 'migrated_historical')", [PAYCHEX_ORG, fac], /has_observation/, "a row with no observation");
  await fails("insert into public.fm_diesel_usage (organisation_id, code, log_date, facility_id, generator_ref, opening_level, record_origin) values ($1, 'D5', '2026-08-19', $2, null, -1, 'migrated_historical')", [PAYCHEX_ORG, fac], /nonnegative/, "a negative level");
  await fails("insert into public.fm_diesel_usage (organisation_id, code, log_date, facility_id, generator_ref, opening_level, record_origin) values ($1, 'D6', '2026-08-19', $2, null, 10, 'operational')", [PAYCHEX_ORG, fac], /generator/, "an operator row without a generator");
  const parsed = DIESEL_SPEC.parseCreate({ facilityId: "FAC-0002", date: "2026-08-19", generatorId: "G", openingLevel: 500, closingLevel: "", consumption: 120, undergroundTankQty: 100, surfaceTankQty: "" });
  assert(parsed.columns.closing_level === null && parsed.columns.surface_tank_qty === null && parsed.columns.consumption === 120 && parsed.columns.added === null, "domain: blanks are NULL, consumption as entered, no arithmetic check");
  let refused = false;
  try { DIESEL_SPEC.parseCreate({ facilityId: "F", date: "2026-08-19", generatorId: "G" }); } catch (e) { refused = e instanceof FmLogValidationError; }
  assert(refused, "domain refuses an entry with no observation");
  const upd = DIESEL_SPEC.parseUpdate({ id: "DSLU-2026-000001", generatorId: "", date: "2026-08-19", consumption: 1400 });
  assert(!("generator_ref" in upd.columns) && upd.columns.consumption === 1400, "a whole-site historical row can be corrected without inventing a generator");
  const table = code("src/modules/diesel-usage/components/DieselUsageTable.tsx");
  const view = code("src/modules/diesel-usage/components/ViewDieselUsageModal.tsx");
  assert(/"Not recorded"/.test(table) && /Not recorded/.test(view) && /Reading variance/.test(view) && /Reading variance/.test(table), "UI: NULL reads Not recorded; variance shown");
  assert(!/toNumber\(/.test(code("src/services/dieselUsage/DieselUsageService.ts")) && /\?\? null/.test(code("src/services/dieselUsage/DieselUsageService.ts")), "API mapping keeps NULL (never 0)");
});

await check("7 generator diesel: one site/date total — never double-counted, never a generator's own fuel, not-recorded stays NULL", async () => {
  const gen = (code: string, g: string, date: string, fuel: number | null) =>
    db.query("insert into public.fm_generator_logs (organisation_id, code, log_date, generator, log_basis, start_meter_reading, end_meter_reading, fuel_used) values ($1, $2, $3, $4, 'hour_meter', 1, 2, $5)", [PAYCHEX_ORG, code, date, g, fuel]);
  await gen("G1", "Gen 1", "2026-08-16", 1500);
  await gen("G2", "Gen 2", "2026-08-16", null);
  await gen("G3", "Gen 1", "2026-08-17", null);
  await gen("G4", "Gen 2", "2026-08-17", null);
  await fails("insert into public.fm_generator_logs (organisation_id, code, log_date, generator, log_basis, start_meter_reading, end_meter_reading, fuel_used) values ($1, 'G5', '2026-08-16', 'Gen 2', 'hour_meter', 1, 2, 200)", [PAYCHEX_ORG], /one_daily_diesel_total|duplicate key/, "a second diesel total on the same date");
  // Facility + date: the site is the generator asset's facility (fk-enforced), never typed or guessed.
  const annex = (await db.query<{ id: string }>("insert into public.fm_facilities (organisation_id, code, name) values ($1, 'FAC-0001', 'NCC Annex') returning id", [PAYCHEX_ORG])).rows[0]!.id;
  const asset = async (code: string, facility: string) => (await db.query<{ id: string }>("insert into public.fm_assets (organisation_id, code, facility_id, name) values ($1, $2, $3, $2) returning id", [PAYCHEX_ORG, code, facility])).rows[0]!.id;
  const gAnnex = await asset("AST-G1", annex), gCsirt = await asset("AST-G9", fac);
  const sited = (code: string, a: string, f: string | null, date: string, fuel: number | null) =>
    db.query("insert into public.fm_generator_logs (organisation_id, code, log_date, generator, log_basis, start_meter_reading, end_meter_reading, fuel_used, asset_id, facility_id) values ($1, $2, $3, 'G', 'hour_meter', 1, 2, $4, $5, $6)", [PAYCHEX_ORG, code, date, fuel, a, f]);
  await sited("S1", gAnnex, annex, "2026-09-01", 1700);
  await sited("S2", gCsirt, fac, "2026-09-01", 200);
  await fails("insert into public.fm_generator_logs (organisation_id, code, log_date, generator, log_basis, start_meter_reading, end_meter_reading, fuel_used, asset_id, facility_id) values ($1, 'S3', '2026-09-01', 'G', 'hour_meter', 1, 2, 50, $2, $3)", [PAYCHEX_ORG, gAnnex, annex], /one_daily_diesel_total|duplicate key/, "a second total at the same site and date");
  await fails("insert into public.fm_generator_logs (organisation_id, code, log_date, generator, log_basis, start_meter_reading, end_meter_reading, fuel_used) values ($1, 'S4', '2026-09-01', 'G', 'hour_meter', 1, 2, 50)", [PAYCHEX_ORG], /one_daily_diesel_total/, "an unknown-site total beside a known-site total");
  await fails("insert into public.fm_generator_logs (organisation_id, code, log_date, generator, log_basis, start_meter_reading, end_meter_reading, fuel_used, asset_id, facility_id) values ($1, 'S5', '2026-09-02', 'G', 'hour_meter', 1, 2, null, $2, $3)", [PAYCHEX_ORG, gAnnex, fac], /asset_facility_fk|foreign key/, "a facility that is not the asset's facility");
  await fails("insert into public.fm_generator_logs (organisation_id, code, log_date, generator, log_basis, start_meter_reading, end_meter_reading, fuel_used, asset_id) values ($1, 'S6', '2026-09-02', 'G', 'hour_meter', 1, 2, null, $2)", [PAYCHEX_ORG, gAnnex], /asset_has_facility/, "an asset-linked log without its facility");
  const total = (await db.query<{ t: string }>("select sum(fuel_used)::text t from public.fm_generator_logs where log_date = '2026-08-16'")).rows[0]!.t;
  assert(Number(total) === 1500, "date total counted once");
  const parsed = GENERATOR_SPEC.parseCreate({ date: "2026-08-18", generator: "Gen 2", startMeterReading: 1, endMeterReading: 2, fuelUsed: "" });
  assert(parsed.columns.fuel_used === null, "blank diesel stays not recorded");
  const repo = code("src/modules/operational-logs/server/FmLogRepository.ts");
  assert(/one_daily_diesel_total/.test(repo), "a second total gets an operator-facing explanation");
  const table = code("src/modules/generator-log/components/GeneratorLogsTable.tsx");
  assert(/date total, all generators/.test(table) && /"In date total"/.test(table), "UI shows a date total, never a generator's own fuel");
  assert(!/fuelUsed\s*\/\s*|\/\s*[a-z.]*hours[\s\S]{0,40}fuelUsed/i.test(code("src/modules/generator-log/components/GeneratorLogsTable.tsx")), "no per-generator fuel efficiency");
});

console.log(failures ? `\n${failures} check(s) failed` : "\nAll Generator/Diesel reconciliation checks passed");
process.exit(failures ? 1 : 0);
