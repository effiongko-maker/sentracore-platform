/**
 * FM historical-migration schema — behavioural verification in a REAL Postgres (PGlite, in-process).
 * Applies the FM migration chain + 20260921100000 to a scratch database; never touches Supabase.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-fm-historical-schema.mts
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const dir = resolve("supabase/migrations") + "/";
const CHAIN = ["20260918190000", "20260918200000", "20260918220000", "20260918221000", "20260919120000", "20260919140000", "20260919160000", "20260919180000", "20260919200000", "20260919210000", "20260919230000", "20260919240000"];
const NEW = "20260921100000";
const NEW2 = "20260921110000";
const NEW3 = "20260921120000";
const sqlOf = (stamp: string) => readFileSync(dir + readdirSync(dir).find((n) => n.startsWith(stamp))!, "utf8");

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

async function rejects(db: PGlite, sql: string): Promise<string | null> {
  try {
    await db.exec(`savepoint s; ${sql}`);
    await db.exec("release savepoint s");
    return null;
  } catch (e) {
    await db.exec("rollback to savepoint s");
    return e instanceof Error ? e.message : String(e);
  }
}

async function main() {
  const out: string[] = [];
  const pass = (m: string) => out.push(`PASS ${m}`);
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create type public.entity_status as enum ('active','inactive','pending','suspended');
    create table public.organisations (id uuid primary key default gen_random_uuid(), slug text);
    create table public.profiles (id uuid primary key default gen_random_uuid(), organisation_id uuid references public.organisations(id), unique (organisation_id, id));
    create table public.operational_events (id uuid primary key default gen_random_uuid(), organisation_id uuid);
    create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
  `);
  for (const stamp of CHAIN) await db.exec(sqlOf(stamp));
  await db.exec("begin"); // savepoints in the assertions below need a transaction; nothing is committed anywhere

  // Legacy (pre-migration) operational rows: must be untouched by the evolution.
  await db.exec(`
    insert into public.organisations (id, slug) values ('00000000-0000-4000-8000-000000000001', 'o');
    insert into public.fm_facilities (id, organisation_id, code, name) values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000001', 'FAC-0001', 'NCC Annex');
    insert into public.fm_work (id, organisation_id, code, facility_id, title, source, priority, status)
      values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', 'WRK-L1', '00000000-0000-4000-8000-0000000000f1', 'legacy work', 'manual', 'medium', 'requested');
    insert into public.fm_assets (id, organisation_id, code, facility_id, name, condition)
      values ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000001', 'AST-L1', '00000000-0000-4000-8000-0000000000f1', 'legacy asset', 'fair');
    insert into public.fm_generator_logs (organisation_id, code, log_date, generator, started_at, ended_at, fuel_used)
      values ('00000000-0000-4000-8000-000000000001', 'GEN-L1', '2026-08-01', 'Gen 1', '2026-08-01T08:00:00Z', '2026-08-01T10:30:00Z', 120);
    insert into public.fm_work_instructions (id, organisation_id, code, order_type, work_id, facility_id, title, priority, status)
      values ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-000000000001', 'WO-L1', 'job_order', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000f1', 'legacy wi', 'high', 'open');
    insert into public.fm_incidents (id, organisation_id, code, facility_id, title, severity, status)
      values ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-000000000001', 'INC-L1', '00000000-0000-4000-8000-0000000000f1', 'legacy incident', 'critical', 'investigating');
  `);
  const snapshot = async () => JSON.stringify((await db.query(`select 'w' k, code, priority, status, reported_at::text from public.fm_work where code='WRK-L1'
    union all select 'wi', code, priority, status, requested_at::text from public.fm_work_instructions where code='WO-L1'
    union all select 'inc', code, severity, status, reported_at::text from public.fm_incidents where code='INC-L1' order by 1`)).rows);
  const legacyBefore = await snapshot();
  const before = (await db.query<{ c: string; h: string }>("select condition c, hours::text h from public.fm_assets, public.fm_generator_logs")).rows[0]!;
  await db.exec(sqlOf(NEW));
  await db.exec(sqlOf(NEW2));
  const O = "'00000000-0000-4000-8000-000000000001'";
  const F = "'00000000-0000-4000-8000-0000000000f1'";

  // 1. legacy compatibility
  {
    const w = (await db.query<{ o: string; r: string | null; s: string }>("select record_origin o, reported_at::text r, status s from public.fm_work where code='WRK-L1'")).rows[0]!;
    assert(w.o === "operational" && w.r !== null && w.s === "requested", "legacy Work keeps origin=operational, its reported_at and status");
    const a = (await db.query<{ c: string }>("select condition c from public.fm_assets where code='AST-L1'")).rows[0]!;
    assert(a.c === before.c && a.c === "fair", "existing asset condition is unchanged");
    const g = (await db.query<{ b: string; h: string }>("select log_basis b, hours::text h from public.fm_generator_logs where code='GEN-L1'")).rows[0]!;
    assert(g.b === "clock_times" && g.h === before.h && g.h === "2.50", "existing generator log stays clock_times and its derived hours are identical (2.50)");
    pass("legacy rows are untouched: origin operational, condition preserved, generator hours identical");
  }

  // 2. strict FORWARD Work validation is intact
  {
    const base = (extra: string, cols = "") => `insert into public.fm_work (organisation_id, code, facility_id, title, source, priority${cols}) values (${O}, 'W-${Math.random().toString(36).slice(2, 8)}', ${F}, 't', 'manual', 'medium'${extra});`;
    assert(await rejects(db, base(", null", ", reported_at")), "operational Work cannot have an unknown reported_at");
    assert(await rejects(db, base(", 'unknown'", ", status")), "operational Work cannot have status unknown");
    assert(await rejects(db, base(", 'completed'", ", status")), "operational Work cannot be completed without completed_at");
    assert((await rejects(db, base("")) ) === null, "operational Work with defaults still inserts (reported_at defaults to now)");
    const r = (await db.query<{ r: string | null }>("select reported_at::text r from public.fm_work where code not like 'WRK-L1' limit 1")).rows[0]!;
    assert(r.r !== null, "the reported_at default is preserved for operational inserts");
    pass("forward Work: unknown reported_at / unknown status / completed-without-timestamp are still rejected");
  }

  // 3. explicit historical Work + WI
  let historicalWork = "";
  {
    const id = "00000000-0000-4000-8000-0000000000c1";
    historicalWork = id;
    assert((await rejects(db, `insert into public.fm_work (id, organisation_id, code, facility_id, title, source, priority, status, reported_at, record_origin) values ('${id}', ${O}, 'W-H1', ${F}, 'job', 'manual', 'medium', 'unknown', null, 'migrated_historical');`)) === null, "migrated Work may have unknown reported_at and unknown status");
    assert((await rejects(db, `insert into public.fm_work (organisation_id, code, facility_id, title, source, priority, status, reported_at, record_origin) values (${O}, 'W-H2', ${F}, 'executed', 'manual', 'medium', 'completed', null, 'migrated_historical');`)) === null, "migrated Work may be completed without completed_at (execution evidence, date unknown)");
    assert(await rejects(db, `update public.fm_work set record_origin = 'migrated_historical' where code = 'WRK-L1';`), "an operational Work cannot be re-labelled historical");
    assert(await rejects(db, `update public.fm_work set record_origin = 'operational' where code = 'W-H1';`), "a historical Work cannot be re-labelled operational");
    assert(await rejects(db, `update public.fm_work set status = 'unknown' where code = 'WRK-L1';`), "an operational Work cannot be flipped to unknown");
    assert(await rejects(db, `insert into public.fm_work (organisation_id, code, facility_id, title, source, priority, record_origin) values (${O}, 'W-BAD', ${F}, 't', 'manual', 'medium', 'other');`), "record_origin is a closed set");
    const wi = `insert into public.fm_work_instructions (organisation_id, code, order_type, work_id, facility_id, title, status, requested_at, record_origin) values (${O}, '%c', 'job_order', '${id}', ${F}, 'j', '%s', %r, '%o');`;
    assert((await rejects(db, wi.replace("%c", "WI-H1").replace("%s", "unknown").replace("%r", "null").replace("%o", "migrated_historical"))) === null, "migrated Work Instruction may have unknown requested_at and status");
    assert(await rejects(db, wi.replace("%c", "WI-O1").replace("%s", "unknown").replace("%r", "now()").replace("%o", "operational")), "operational WI cannot be unknown");
    assert(await rejects(db, wi.replace("%c", "WI-O2").replace("%s", "open").replace("%r", "null").replace("%o", "operational")), "operational WI cannot have unknown requested_at");
    assert(await rejects(db, wi.replace("%c", "WI-O3").replace("%s", "completed").replace("%r", "now()").replace("%o", "operational")), "operational WI cannot be completed without completed_at");
    assert(await rejects(db, wi.replace("%c", "WI-H2").replace("%s", "open").replace("%r", "null").replace("order_type", "order_type").replace("'job_order'", "'purchase_order'").replace("%o", "migrated_historical")), "order_type stays a strict enum even for historical rows");
    assert((await rejects(db, wi.replace("%c", "WI-H3").replace("%s", "completed").replace("%r", "null").replace("%o", "migrated_historical").replace("'job_order'", "'work_order'"))) === null, "historical work_order preserves its explicit order_type");
    pass("historical Work/WI: unknown lifecycle facts are storable ONLY for migrated_historical; origin is immutable; order_type stays strict");
  }

  // 4. asset unknown condition
  {
    assert((await rejects(db, `insert into public.fm_assets (organisation_id, code, facility_id, name, condition) values (${O}, 'AST-U1', ${F}, 'u', 'unknown');`)) === null, "asset condition 'unknown' is accepted");
    await db.exec(`insert into public.fm_assets (organisation_id, code, facility_id, name) values (${O}, 'AST-D1', ${F}, 'default cond');`);
    const d = (await db.query<{ c: string }>("select condition c from public.fm_assets where code='AST-D1'")).rows[0]!;
    assert(d.c === "good", "the forward default stays 'good' (unknown is only ever explicit)");
    assert(await rejects(db, `insert into public.fm_assets (organisation_id, code, facility_id, name, condition) values (${O}, 'AST-X', ${F}, 'x', 'fine');`), "invalid conditions are still rejected");
    pass("asset condition unknown: explicit, distinct from good, default unchanged");
  }

  // 5. generator logs
  {
    const gen = (cols: string, vals: string) => `insert into public.fm_generator_logs (organisation_id, code, log_date, generator, ${cols}) values (${O}, 'G-${Math.random().toString(36).slice(2, 8)}', '2026-08-16', 'Gen 1', ${vals});`;
    assert(await rejects(db, gen("started_at, ended_at, fuel_used", "'2026-08-16T08:00Z', '2026-08-16T09:00Z', null")), "clock_times log still requires fuel_used");
    assert(await rejects(db, gen("started_at, ended_at, fuel_used", "null, '2026-08-16T09:00Z', 10")), "clock_times log still requires both clock times");
    assert(await rejects(db, gen("log_basis, start_meter_reading, end_meter_reading, fuel_used", "'hour_meter', 3265.1, 3271.5, null")), "an OPERATIONAL hour_meter log is rejected (historical only)");
    assert((await rejects(db, gen("log_basis, start_meter_reading, end_meter_reading, fuel_used, record_origin, asset_id", "'hour_meter', 3265.1, 3271.5, null, 'migrated_historical', '00000000-0000-4000-8000-0000000000b1'"))) === null, "historical hour_meter log: readings, unknown (null) fuel, canonical asset link");
    const h = (await db.query<{ h: string; f: string | null; s: string | null }>("select hours::text h, fuel_used::text f, started_at::text s from public.fm_generator_logs where log_basis='hour_meter'")).rows[0]!;
    assert(h.h === "6.40" && h.f === null && h.s === null, "runtime is derived from readings (6.40), fuel stays NULL, no clock time is invented");
    assert(await rejects(db, gen("log_basis, start_meter_reading, end_meter_reading, record_origin", "'hour_meter', 3271.5, 3265.1, 'migrated_historical'")), "end reading below start reading is rejected");
    assert(await rejects(db, gen("log_basis, start_meter_reading, record_origin", "'hour_meter', 3271.5, 'migrated_historical'")), "a missing end reading is rejected (no broken runtime)");
    assert(await rejects(db, gen("log_basis, start_meter_reading, end_meter_reading, started_at, ended_at, record_origin", "'hour_meter', 1, 2, '2026-08-16T08:00Z', '2026-08-16T09:00Z', 'migrated_historical'")), "hour_meter logs never carry invented clock times");
    assert(await rejects(db, gen("started_at, ended_at, fuel_used, asset_id", "'2026-08-16T08:00Z', '2026-08-16T09:00Z', 1, '00000000-0000-4000-8000-0000000000ff'")), "asset_id must reference a real asset");
    pass("generator: strict clock basis preserved; hour-meter basis is historical-only with derived runtime, unknown fuel, no invented times");
  }

  // 6. consumables register evidence
  {
    await db.exec(`insert into public.fm_consumables_items (id, organisation_id, code, facility_id, name) values ('00000000-0000-4000-8000-0000000000d1', ${O}, 'CI-1', ${F}, 'Windowlene');`);
    assert((await rejects(db, `insert into public.fm_consumables_register_entries (organisation_id, facility_id, item_id, opening_quantity, opening_unit, received_quantity, received_unit, raw_opening, raw_received, raw_issued) values (${O}, ${F}, '00000000-0000-4000-8000-0000000000d1', 67, 'packs', 48, 'pcs', '67 Pcks', '48 Pcs', '-');`)) === null, "register evidence keeps per-field units (packs vs pcs), a null date and unknown (null) closing");
    const e = (await db.query<{ d: string | null; c: string | null }>("select snapshot_date::text d, closing_quantity::text c from public.fm_consumables_register_entries")).rows[0]!;
    assert(e.d === null && e.c === null, "no date is invented and no closing balance is derived across units");
    assert(await rejects(db, `insert into public.fm_consumables_register_entries (organisation_id, facility_id, item_id, opening_quantity, raw_opening) values (${O}, ${F}, '00000000-0000-4000-8000-0000000000d1', 5, '5');`), "a quantity without an explicit unit is rejected");
    assert(await rejects(db, `insert into public.fm_consumables_register_entries (organisation_id, facility_id, item_id, issued_quantity, issued_unit) values (${O}, ${F}, '00000000-0000-4000-8000-0000000000d1', -1, 'pcs');`), "negative quantities are rejected");
    const cols = (await db.query<{ column_name: string }>("select column_name from information_schema.columns where table_name='fm_consumables_register_entries'")).rows.map((r) => r.column_name);
    assert(!cols.some((c) => /generated|derived/.test(c)) && (await db.query<{ n: string }>("select count(*)::text n from information_schema.columns where table_name='fm_consumables_register_entries' and is_generated <> 'NEVER'")).rows[0]!.n === "0", "the register table has NO generated/derived balance columns");
    assert(await rejects(db, `insert into public.fm_consumables_register_entries (organisation_id, facility_id, item_id, record_origin) values (${O}, ${F}, '00000000-0000-4000-8000-0000000000d1', 'operational');`), "register entries can only be historical evidence");
    pass("consumables: historical register evidence is separate from dated updates; explicit units; no invented dates, zeroes or balances");
  }

  // 7. provenance
  {
    await db.exec(`insert into public.fm_migration_batches (id, organisation_id, batch_key, rules_version, sources) values ('00000000-0000-4000-8000-0000000000e1', ${O}, 'fmmig-test', 'r1', '[{"workbook":"FM_PACK","file":"x.xlsx","sha256":"${"a".repeat(64)}"}]');`);
    const prov = (row: number, extra = "") => `insert into public.fm_migration_provenance (organisation_id, batch_id, workbook, workbook_sha256, source_sheet, source_row, fingerprint, target_table, target_id, classification${extra ? ", " + extra.split("|")[0] : ""}) values (${O}, '00000000-0000-4000-8000-0000000000e1', 'FM_PACK', '${"a".repeat(64)}', 'Maintenance Request', ${row}, '${"b".repeat(64)}', 'fm_requests', gen_random_uuid(), 'TRANSFORM_IMPORT'${extra ? ", " + extra.split("|")[1] : ""});`;
    assert((await rejects(db, prov(4))) === null, "a provenance row records batch, workbook hash, sheet, row, fingerprint, target and classification");
    assert(await rejects(db, prov(4)), "re-inserting the same source row for the same target is rejected (idempotent reruns)");
    assert((await rejects(db, prov(5, "source_reference|'22/06/2026-NCC-001'"))) === null, "a source reference can be stored");
    assert(await rejects(db, `update public.fm_migration_provenance set source_row = 9;`), "provenance is append-only (no update)");
    assert(await rejects(db, `delete from public.fm_migration_provenance;`), "provenance is append-only (no delete)");
    assert(await rejects(db, `update public.fm_migration_batches set rules_version = 'x';`), "batches are append-only");
    assert(await rejects(db, `insert into public.fm_migration_provenance (organisation_id, batch_id, workbook, workbook_sha256, source_sheet, source_row, fingerprint, target_table, target_id, classification) values (${O}, '00000000-0000-4000-8000-0000000000e1', 'FM_PACK', 'nothex', 's', 1, '${"b".repeat(64)}', 'fm_requests', gen_random_uuid(), 'IMPORT');`), "hashes must be 64 hex characters");
    assert(await rejects(db, `insert into public.fm_migration_provenance (organisation_id, batch_id, workbook, workbook_sha256, source_sheet, source_row, fingerprint, target_table, target_id, classification) values (${O}, '00000000-0000-4000-8000-0000000000e1', 'FM_PACK', '${"a".repeat(64)}', 's', 1, '${"b".repeat(64)}', 'fm_cost_records', gen_random_uuid(), 'IMPORT');`), "historical costs are not an allowed migration target");
    const grants = (await db.query<{ p: string }>("select privilege_type p from information_schema.role_table_grants where table_name='fm_migration_provenance' and grantee='service_role' order by 1")).rows.map((r) => r.p).join();
    const anon = (await db.query<{ n: string }>("select count(*)::text n from information_schema.role_table_grants where table_name in ('fm_migration_provenance','fm_migration_batches','fm_consumables_register_entries') and grantee in ('anon','authenticated','PUBLIC')")).rows[0]!.n;
    assert(grants === "INSERT,SELECT" && anon === "0", "only the service role can read/insert provenance; no other role has any access");
    const cols = (await db.query<{ column_name: string }>("select column_name from information_schema.columns where table_name='fm_migration_provenance'")).rows.map((r) => r.column_name);
    assert(!cols.some((c) => /amount|title|description|status|quantity|reading/.test(c)), "provenance holds identifiers and hashes only — never operational values");
    pass("provenance: central, append-only, idempotent per (workbook hash, sheet, row, target), hash-validated, service-role only, no operational values");
  }

  // 8. unknown incident status/severity and Work/WI priority — historical ONLY (20260921110000)
  {
    assert((await snapshot()) === legacyBefore, "existing operational Work / Work Instruction / Incident rows are byte-for-byte unchanged by the migration");
    const inc = (extra: { status?: string; severity?: string; origin?: string }) => `insert into public.fm_incidents (organisation_id, code, facility_id, title, status, severity, record_origin) values (${O}, 'I-${Math.random().toString(36).slice(2, 8)}', ${F}, 't', '${extra.status ?? "reported"}', '${extra.severity ?? "medium"}', '${extra.origin ?? "operational"}');`;
    const legacyOrigin = (await db.query<{ o: string }>("select record_origin o from public.fm_incidents where code='INC-L1'")).rows[0]!.o;
    assert(legacyOrigin === "operational", "the legacy incident is backfilled as operational (default), never historical");
    // forward strictness
    assert(await rejects(db, inc({ status: "unknown" })), "operational Incident cannot use status=unknown");
    assert(await rejects(db, inc({ severity: "unknown" })), "operational Incident cannot use severity=unknown");
    assert(await rejects(db, inc({ status: "unknown", severity: "unknown" })), "operational Incident cannot use unknown status AND severity");
    assert((await rejects(db, inc({ status: "triaged", severity: "high" }))) === null, "operational Incident with real values still inserts");
    assert(await rejects(db, inc({ status: "bogus" })) && await rejects(db, inc({ severity: "bogus" })), "incident status/severity remain closed sets");
    // explicit historical
    assert((await rejects(db, inc({ status: "unknown", severity: "unknown", origin: "migrated_historical" }))) === null, "migrated historical Incident can use status=unknown and severity=unknown");
    assert((await rejects(db, inc({ status: "unknown", origin: "migrated_historical" }))) === null && (await rejects(db, inc({ severity: "unknown", origin: "migrated_historical" }))) === null, "migrated historical Incident can use either unknown alone");
    assert(await rejects(db, inc({ origin: "sideways" })), "incident record_origin is a closed set");
    assert(await rejects(db, `update public.fm_incidents set record_origin = 'migrated_historical' where code = 'INC-L1';`), "an operational Incident cannot be re-labelled historical");
    assert(await rejects(db, `update public.fm_incidents set status = 'unknown' where code = 'INC-L1';`), "an operational Incident cannot be flipped to unknown status");
    assert(await rejects(db, `update public.fm_incidents set severity = 'unknown' where code = 'INC-L1';`), "an operational Incident cannot be flipped to unknown severity");
    const histCode = (await db.query<{ code: string }>("select code from public.fm_incidents where record_origin='migrated_historical' limit 1")).rows[0]!.code;
    assert(await rejects(db, `update public.fm_incidents set record_origin = 'operational' where code = '${histCode}';`), "a historical Incident cannot be re-labelled operational (unknown would become invalid)");
    // Work priority
    const wk = (priority: string, origin: string) => `insert into public.fm_work (organisation_id, code, facility_id, title, source, priority, record_origin, status, reported_at) values (${O}, 'W-${Math.random().toString(36).slice(2, 8)}', ${F}, 't', 'manual', '${priority}', '${origin}', '${origin === "operational" ? "requested" : "unknown"}', ${origin === "operational" ? "now()" : "null"});`;
    assert(await rejects(db, wk("unknown", "operational")), "operational Work cannot use priority=unknown");
    assert((await rejects(db, wk("high", "operational"))) === null, "operational Work with a real priority still inserts");
    assert((await rejects(db, wk("unknown", "migrated_historical"))) === null, "migrated historical Work can use priority=unknown");
    assert(await rejects(db, wk("urgent", "migrated_historical")), "Work priority remains a closed set for historical rows");
    assert(await rejects(db, `update public.fm_work set priority = 'unknown' where code = 'WRK-L1';`), "an operational Work cannot be flipped to priority unknown");
    // Work Instruction priority
    const wid = historicalWork;
    const wi = (priority: string, origin: string) => `insert into public.fm_work_instructions (organisation_id, code, order_type, work_id, facility_id, title, priority, status, requested_at, record_origin) values (${O}, 'X-${Math.random().toString(36).slice(2, 8)}', 'job_order', '${wid}', ${F}, 't', '${priority}', '${origin === "operational" ? "open" : "unknown"}', ${origin === "operational" ? "now()" : "null"}, '${origin}');`;
    assert(await rejects(db, wi("unknown", "operational")), "operational Work Instruction cannot use priority=unknown");
    assert((await rejects(db, wi("low", "operational"))) === null, "operational Work Instruction with a real priority still inserts");
    assert((await rejects(db, wi("unknown", "migrated_historical"))) === null, "migrated historical Work Instruction can use priority=unknown");
    assert(await rejects(db, `update public.fm_work_instructions set priority = 'unknown' where code = 'WO-L1';`), "an operational Work Instruction cannot be flipped to priority unknown");
    assert((await snapshot()) === legacyBefore, "the legacy operational rows are still identical after all attempted writes");
    // the default for new operational rows is unchanged
    const defs = (await db.query<{ n: string; d: string | null }>("select column_name n, column_default d from information_schema.columns where table_name in ('fm_incidents') and column_name in ('status','severity','record_origin') order by 1")).rows.map((r) => `${r.n}=${r.d}`).join();
    assert(defs === "record_origin='operational'::text,severity='medium'::text,status='reported'::text", `forward column defaults are unchanged (${defs})`);
    pass("unknown incident status/severity and Work/WI priority: rejected for operational rows (insert AND update), accepted only for migrated_historical, origin immutable, legacy rows unchanged");
  }

  // 9. least privilege on the migration tables (20260921120000)
  {
    // PGlite has no Supabase default privileges: reproduce them (service_role gets ALL on new public tables), then apply the migration.
    const T = ["fm_migration_batches", "fm_migration_provenance", "fm_consumables_register_entries"];
    await db.exec(`grant all on table ${T.map((t) => "public." + t).join(", ")} to service_role;`);
    const privs = async () => (await db.query<{ t: string; p: string }>(`select table_name t, string_agg(privilege_type, ',' order by privilege_type) p from information_schema.role_table_grants where table_schema='public' and table_name = any($1) and grantee='service_role' group by 1 order by 1`, [T])).rows;
    assert((await privs()).every((r) => /TRUNCATE/.test(r.p) && /UPDATE/.test(r.p)), "precondition: default-style grants reproduce the over-privileged state");
    const trig = async () => (await db.query<{ n: string }>("select tgname n from pg_trigger where not tgisinternal and tgrelid in ('public.fm_migration_batches'::regclass,'public.fm_migration_provenance'::regclass) order by 1")).rows.map((r) => r.n).join();
    const trigBefore = await trig();
    const rlsBefore = (await db.query<{ r: string }>("select string_agg(relname||':'||relrowsecurity, ',' order by relname) r from pg_class where relname = any($1) and relnamespace='public'::regnamespace", [T])).rows[0]!.r;
    await db.exec(sqlOf(NEW3));
    assert((await privs()).every((r) => r.p === "INSERT,SELECT"), `service_role keeps only SELECT and INSERT (${JSON.stringify(await privs())})`);
    assert((await trig()) === trigBefore && /append_only/.test(trigBefore), "append-only triggers are untouched");
    assert((await db.query<{ r: string }>("select string_agg(relname||':'||relrowsecurity, ',' order by relname) r from pg_class where relname = any($1) and relnamespace='public'::regnamespace", [T])).rows[0]!.r === rlsBefore, "RLS is untouched");
    const anon = (await db.query<{ n: string }>("select count(*)::text n from information_schema.role_table_grants where table_name = any($1) and grantee in ('anon','authenticated','PUBLIC')", [T])).rows[0]!.n;
    assert(anon === "0", "no access for anon / authenticated / PUBLIC");
    await db.exec(sqlOf(NEW3)); // idempotent
    assert((await privs()).every((r) => r.p === "INSERT,SELECT"), "re-applying is idempotent");
    assert(/^\s*(--[^\n]*\n|\s)*(revoke|grant)/im.test(sqlOf(NEW3)) && !/\b(drop|alter|create|delete|update)\s/i.test(sqlOf(NEW3).replace(/--[^\n]*/g, "")), "the migration contains privilege statements only");
    pass("least privilege: service_role reduced to SELECT+INSERT on the three migration tables; triggers, RLS, anon/authenticated untouched; idempotent; privilege-only migration");
  }

  void historicalWork;
  console.log(out.join("\n"));
  console.log(`\n${out.length} groups passed`);
}

main().catch((e) => {
  console.error("FAIL", e instanceof Error ? e.message : e);
  process.exit(1);
});
