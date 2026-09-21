/**
 * FM controlled importer — behavioural verification in a REAL Postgres (PGlite, in-process). Applies the FM migration
 * chain + 20260921100000 to a scratch database and drives the importer against the approved manifest. Never touches
 * Supabase; performs ZERO remote writes.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-fm-migration-import.mts [--source=<dir>]
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { manifestDigest, runDryRun, type Manifest } from "./fm-migration/dryRun";
import { evaluateProductionGates, projectRefFromDatabaseUrl, APPROVED_PROJECT_REF } from "./fm-migration-import/gates";
import { IMPORT_ORDER, PlanError, TARGET_SPECS, buildImportPlan, type ImportPlan } from "./fm-migration-import/plan";
import { assertSafeToProceed, census, executeImport, readState, reconcile, schemaReadiness, verifyIdempotent, type SqlClient } from "./fm-migration-import/executor";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}
const source = process.argv.find((a) => a.startsWith("--source="))?.slice(9) ?? "/Users/effiongokpo/Developer/sentracore-migration-source";
const dir = resolve("supabase/migrations") + "/";
const CHAIN = ["20260918190000", "20260918200000", "20260918220000", "20260918221000", "20260919120000", "20260919140000", "20260919160000", "20260919180000", "20260919200000", "20260919210000", "20260919230000", "20260919240000"];
const NEW = "20260921100000";
const sqlOf = (stamp: string) => readFileSync(dir + readdirSync(dir).find((n) => n.startsWith(stamp))!, "utf8");
const ORG = "00000000-0000-4000-8000-000000000001";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const BLOCKERS = ["fm_incidents.status=reported", "fm_incidents.severity=medium", "fm_work.priority=medium", "fm_work_instructions.priority=medium"];

function refuses(fn: () => unknown, needle: RegExp): boolean {
  try { fn(); return false; } catch (e) { return e instanceof PlanError && needle.test(e.message); }
}

async function freshDb(manifest: Manifest, applyNew = true): Promise<PGlite> {
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
  if (applyNew) await db.exec(sqlOf(NEW));
  await db.exec(`insert into public.organisations (id, slug) values ('${ORG}', 'o');
    insert into public.fm_facilities (id, organisation_id, code, name) values ('${manifest.facility.id}', '${ORG}', 'FAC-0001', 'NCC Annex');`);
  return db;
}
const asClient = (db: PGlite): SqlClient => ({ query: (sql, params) => db.query(sql, params as unknown[]) as never });

/** Client that records every statement and can inject a failure on the Nth insert. */
function spy(db: PGlite, failOnInsert?: number) {
  const log: string[] = [];
  let inserts = 0;
  const client: SqlClient = {
    async query(sql, params) {
      log.push(sql.trim().split(/\s+/).slice(0, 4).join(" "));
      if (/^\s*insert into/i.test(sql)) { inserts++; if (failOnInsert && inserts === failOnInsert) throw new Error("injected failure"); }
      return db.query(sql, params as unknown[]) as never;
    },
  };
  return { client, log };
}

async function main() {
  const out: string[] = [];
  const pass = (m: string) => out.push(`PASS ${m}`);

  // ── manifest (deterministic re-derivation from the approved sources) ────────────
  const files = { LETTERS: join(source, "2026 LETTERS (4).xlsx"), FM_PACK: join(source, "Facility Management Operations System Pack.xlsx"), MBORA: join(source, "MBORA INCOME STATEMENT.xlsx") };
  for (const f of Object.values(files)) assert(existsSync(f), `missing source ${f}`);
  const facility = { code: "FAC-0001", id: process.env.FM_MIGRATION_FAC0001_ID ?? "e1a5f579-8bb1-42fb-9fdf-56faaaa1e9e0" };
  const duplicateFiles = [{ file: "Facility Management Operations System Pack (1).xlsx", duplicateOf: "FM_PACK" as const }];
  const manifest = runDryRun({ files, duplicateFiles, facility, timeZone: "Africa/Lagos" });
  const digest = manifestDigest(manifest);
  assert(digest === manifestDigest(runDryRun({ files, duplicateFiles, facility, timeZone: "Africa/Lagos" })), "A: dry-run is deterministic");
  pass(`A dry-run deterministic (digest ${digest.slice(0, 16)}…, batch ${manifest.batchId})`);

  // ── B. plan verification ────────────────────────────────────────────────────────
  const plan = buildImportPlan(manifest, { expectedDigest: digest, expectedBatchKey: manifest.batchId });
  const unblocked = buildImportPlan(manifest, { acknowledgeBlockers: BLOCKERS });
  {
    const want = { fm_assets: 9, fm_requests: 29, fm_incidents: 3, fm_work: 115, fm_work_instructions: 113, fm_generator_logs: 67, fm_diesel_usage: 14, fm_consumables_items: 31, fm_consumables_register_entries: 31 };
    assert(JSON.stringify(plan.countsByTarget) === JSON.stringify(want), `B: approved counts ${JSON.stringify(plan.countsByTarget)}`);
    assert(plan.rows.length === 412 && manifest.provenancePlan.length === 412, "B: 412 planned rows = 412 provenance rows");
    assert(new Set(plan.rows.map((r) => r.id)).size === 412, "B: every deterministic id unique");
    const wi = plan.rows.filter((r) => r.target === "fm_work_instructions");
    assert(wi.filter((r) => r.columns.order_type === "job_order").length === 88 && wi.filter((r) => r.columns.order_type === "work_order").length === 25, "B: 88 job_order + 25 work_order");
    assert(plan.rows.filter((r) => r.target === "fm_work").length - wi.length === 2, "B: 2 executed-without-Job-Order Works have no Work Instruction");
    assert(refuses(() => buildImportPlan(manifest, { expectedDigest: "0".repeat(64) }), /digest/), "B: a different manifest digest is refused");
    assert(refuses(() => buildImportPlan(manifest, { expectedBatchKey: "fmmig-other" }), /batch/), "B: a different batch is refused");
    assert(plan.blockers.length === 4 && plan.blockers.map((b) => b.key).sort().join() === [...BLOCKERS].sort().join(), "B: exactly the four material forced defaults block execution");
    assert(plan.acceptedDisclosures.length === 1 && plan.acceptedDisclosures[0]!.key === "fm_incidents.incident_type=other", "B: incident_type=other is the only accepted disclosure");
    assert(plan.ignoredByDesign.assetAliases === 30 && plan.ignoredByDesign.links === 131, "B: aliases and relationships are never written");
    const aliasNames = new Set(manifest.assetAliases.map((a) => a.asset));
    const created = new Set(manifest.records.filter((r) => r.target === "fm_assets").map((r) => String(r.values.name)));
    const forCreated = manifest.assetAliases.filter((a) => created.has(a.asset)).length;
    const excluded = manifest.assetAliases.filter((a) => !created.has(a.asset));
    assert(forCreated === 28 && excluded.length === 2 && excluded.every((a) => /CSIRT/.test(a.asset)) && aliasNames.size === 10, "B: 30 aliases = 28 for the 9 created assets + 2 for the excluded CSIRT generator");
    pass("B plan: approved counts, 412 provenance rows, ids unique, order types, digest/batch pinning, 4 blockers, alias reconciliation (28 + 2 CSIRT)");
  }

  // ── C. exclusion tests (each mutation must be refused by the plan builder) ─────
  {
    const m = () => clone(manifest);
    let x = m(); x.records.push({ ...x.records[0]!, id: "11111111-1111-5111-8111-111111111111", target: "fm_cost_records" }); assert(refuses(() => buildImportPlan(x), /outside the approved operational domains|nothing may target/), "C: historical cost target refused");
    x = m(); x.records[0]!.values.facility_code = "FAC-0002"; assert(refuses(() => buildImportPlan(x), /FAC-0001|CSIRT/), "C: FAC-0002 refused");
    x = m(); x.records[0]!.values.title = "CSIRT generator room"; assert(refuses(() => buildImportPlan(x), /CSIRT/), "C: CSIRT-dependent content refused");
    x = m(); const lrow = x.ledger.find((l) => l.classification === "QUARANTINE")!; const rec = x.records[0]!; rec.provenance.sheet = lrow.sheet; rec.provenance.row = lrow.row; x.provenancePlan[0]!.sheet = lrow.sheet; x.provenancePlan[0]!.row = lrow.row; x.provenancePlan[0]!.workbook = lrow.workbook; rec.provenance.workbook = lrow.workbook; assert(refuses(() => buildImportPlan(x), /quarantined \/ excluded rows never import/), "C: a quarantined source row never imports");
    x = m(); x.records.find((r) => r.target === "fm_requests")!.values.income_amount = 5; assert(refuses(() => buildImportPlan(x), /neither mapped nor declared/), "C: an unmapped (e.g. commercial) key is refused, not silently dropped");
    x = m(); x.deferred.push({ id: "x", target: "fm_cost_records", reasonCode: "r", row: "r", values: {} }); assert(refuses(() => buildImportPlan(x), /deferred|nothing may target/), "C: deferred historical cost cannot ride along");
    x = m(); x.records.find((r) => r.target === "fm_assets")!.values.condition = "good"; assert(refuses(() => buildImportPlan(x), /condition "good"/), "C: asset condition good refused");
    x = m(); x.records.find((r) => r.target === "fm_assets")!.values.model = "X1"; assert(refuses(() => buildImportPlan(x), /speculative/), "C: speculative asset metadata refused");
    x = m(); const exec = x.records.find((r) => r.target === "fm_work" && r.values.work_instruction !== undefined)!; x.records.find((r) => r.target === "fm_work_instructions")!.values.work_record_id = exec.id; assert(refuses(() => buildImportPlan(x), /executed without Job Order but a Work Instruction references it/), "C: a Work Instruction attached to an executed-without-Job-Order Work is refused");
    x = m(); x.records.find((r) => r.target === "fm_work")!.schemaForcedDefaults.push("fm_work.status=requested"); assert(refuses(() => buildImportPlan(x), /unreviewed schema-forced default/), "C: an unreviewed forced default is refused");
    x = m(); x.provenancePlan.pop(); assert(refuses(() => buildImportPlan(x), /provenance/), "C: provenance must be 1:1 with records");
    x = m(); x.facility.code = "FAC-0002"; assert(refuses(() => buildImportPlan(x), /FAC-0001/), "C: a facility other than FAC-0001 is refused");
    const targets = new Set(plan.rows.map((r) => r.target));
    assert([...targets].every((t) => (IMPORT_ORDER as readonly string[]).includes(t)) && !targets.has("fm_cost_records" as never), "C: only the nine approved operational domains are ever planned");
    assert(!/fm_(payments|cost|reimbursement|approvals)/.test(JSON.stringify(plan.rows.map((r) => [r.target, r.columns]))), "C: no cost / payment / approval / Platform Finance content in any planned row");
    assert(plan.rows.every((r) => r.provenance.classification !== "QUARANTINE") && !plan.rows.some((r) => /^(Pending Payments|2026 Monthly Payment|Inventory|Pivot Table 2)$/.test(r.provenance.sheet)), "C: no quarantined / Platform Finance sheet feeds any row");
    // every manifest value key is mapped or explicitly non-persisted (nothing silently dropped)
    for (const r of manifest.records) { const spec = TARGET_SPECS[r.target as keyof typeof TARGET_SPECS]; const mapped = new Set([...Object.values(spec.columns), ...spec.nonPersisted]); assert(Object.keys(r.values).every((k) => mapped.has(k)), `C: ${r.target} keys covered`); }
    pass("C exclusions: cost targets, FAC-0002, CSIRT content, quarantined rows, unmapped/commercial keys, deferred cost, asset good/metadata, fabricated WI, unreviewed defaults, broken provenance — all refused");
  }

  // ── D. blockers make execution impossible ──────────────────────────────────────
  {
    const db = await freshDb(manifest);
    const { client, log } = spy(db);
    let refusedBlocked = false;
    try { await executeImport(client, plan); } catch (e) { refusedBlocked = e instanceof PlanError && /BLOCKED/.test(e.message); }
    assert(refusedBlocked && log.length === 0, "D: a plan with blocking forced defaults opens no transaction and issues no statement");
    pass("D blocked plan: executeImport refuses before issuing any SQL");
    await db.close();
  }

  // ── E. gates ────────────────────────────────────────────────────────────────────
  {
    const url = `postgresql://postgres.${APPROVED_PROJECT_REF}:pw@aws-1-eu-west-1.pooler.supabase.com:5432/postgres`;
    const good = { productionFlag: true, confirm: `${plan.batchKey}@${APPROVED_PROJECT_REF}`, expectedProjectRef: APPROVED_PROJECT_REF, linkedProjectRef: APPROVED_PROJECT_REF, databaseUrl: url, supabaseUrl: `https://${APPROVED_PROJECT_REF}.supabase.co`, batchKey: plan.batchKey, approvedBatchKey: plan.batchKey, manifestDigest: plan.manifestDigest, approvedDigest: plan.manifestDigest, sourcesVerified: true, blockers: 0 };
    assert(evaluateProductionGates(good).length === 0, "E: all gates satisfied → no failures");
    for (const [k, v] of Object.entries({ productionFlag: false, confirm: "yes", expectedProjectRef: "otherprojectrefxxxxx", linkedProjectRef: "otherprojectrefxxxxx", databaseUrl: "postgresql://postgres.otherprojectrefxxxxx:pw@h:5432/postgres", supabaseUrl: "https://otherprojectrefxxxxx.supabase.co", approvedBatchKey: "fmmig-x", approvedDigest: "0".repeat(64), sourcesVerified: false, blockers: 4 })) {
      assert(evaluateProductionGates({ ...good, [k]: v }).length > 0, `E: gate ${k} alone blocks execution`);
    }
    assert(projectRefFromDatabaseUrl("postgresql://u:p@localhost:5432/db") === null, "E: a local/unknown URL never identifies the production project");
    pass("E gates: flag, confirm string, project ref (arg/linked/db url/api url), batch, digest, sources, blockers — each independently blocks");
  }

  // ── F. schema readiness ─────────────────────────────────────────────────────────
  {
    const old = await freshDb(manifest, false);
    assert((await schemaReadiness(asClient(old))).length > 0, "F: pre-migration schema is reported not ready");
    await old.close();
    const ready = await freshDb(manifest);
    assert((await schemaReadiness(asClient(ready))).length === 0, "F: post-migration schema is ready");
    await ready.close();
    pass("F schema readiness detects the un-migrated and the migrated schema");
  }

  // ── G. full execution against a real Postgres (blockers acknowledged — TEST ONLY) ─
  const db = await freshDb(manifest);
  const client = asClient(db);
  const before = await census(client);
  {
    const { client: c, log } = spy(db);
    const res = await executeImport(c, unblocked);
    assert(res.outcome === "imported" && res.provenanceInserted === 412, "G: imported with 412 provenance rows");
    assert(JSON.stringify(res.inserted) === JSON.stringify(unblocked.countsByTarget), "G: exact per-domain insert counts");
    // dependency order: first insert of each domain appears in the locked order; provenance written alongside
    const domainInserts = log.filter((l) => /^insert into public\.fm_/i.test(l) && !/fm_migration_provenance/.test(l)).map((l) => l.split(" ")[2]!.replace("public.", ""));
    const firstIdx = IMPORT_ORDER.map((t) => domainInserts.indexOf(t));
    assert(firstIdx.every((i, k) => i >= 0 && (k === 0 || i > firstIdx[k - 1]!)), "G: domains are written in the locked dependency order");
    assert(log[0] === "begin" && log.includes("commit") && log.filter((l) => l === "begin").length === 1, "G: one transaction (single begin/commit)");
    assert(log.findIndex((l) => /^insert into public\.fm_migration_batches/.test(l)) < log.findIndex((l) => /^insert into public\.fm_assets/.test(l)), "G: batch/provenance infrastructure precedes every domain");
    const after = await census(client);
    for (const t of IMPORT_ORDER) assert(after[t]! - before[t]! === unblocked.countsByTarget[t], `G: ${t} +${unblocked.countsByTarget[t]}`);
    assert(after.fm_facilities === before.fm_facilities, "G: no facility created (FAC-0001 reused)");
    for (const t of ["fm_cost_records", "fm_cost_submissions", "fm_reimbursement_authorizations", "fm_reimbursement_payments", "fm_approvals", "profiles"]) assert(after[t] === before[t], `G: ${t} untouched`);
    assert(after.fm_migration_provenance === 412 && after.fm_migration_batches === 1, "G: 412 provenance rows, 1 batch");
    const codes = (await db.query<{ code: string }>("select code from public.fm_requests order by code")).rows.map((r) => r.code);
    assert(codes[0] === "REQ-2026-000001" && codes.length === 29 && new Set(codes).size === 29, "G: display codes are allocated in the app's format and are unique");
    pass("G full execution (PGlite): one transaction, locked order, exact counts per domain, batch first, no facility/cost/profile writes, 412 provenance rows");
  }

  // ── H. reconciliation (independent, read-only) ─────────────────────────────────
  {
    const rep = await reconcile(client, unblocked);
    assert(rep.ok, `H: reconciliation ${rep.checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail}`).join("; ")}`);
    const hasChecks = ["FAC-0001 reused", "no CSIRT / FAC-0002 facility", "provenance count = plan", "no duplicate provenance (source or target)", "generator runtime is database-derived from meter readings", "no historical asset condition promoted to good"];
    assert(hasChecks.every((n) => rep.checks.some((c) => c.name === n && c.ok)), "H: required invariants are checked and pass");
    // tamper detection
    await db.exec(`update public.fm_assets set condition = 'good' where id = (select id from public.fm_assets limit 1)`);
    const bad = await reconcile(client, unblocked);
    assert(!bad.ok && bad.checks.some((c) => !c.ok && /condition/.test(c.name + c.detail)), "H: reconciliation detects an asset changed to good");
    await db.exec(`update public.fm_assets set condition = 'unknown' where condition = 'good'`);
    await db.exec(`update public.fm_work set reported_at = now() where id = (select id from public.fm_work limit 1)`);
    assert(!(await reconcile(client, unblocked)).ok, "H: reconciliation detects an invented reported_at (current timestamp)");
    await db.exec(`update public.fm_work set reported_at = null where reported_at is not null`);
    await db.exec(`update public.fm_generator_logs set fuel_used = 0 where fuel_used is null`);
    assert(!(await reconcile(client, unblocked)).ok, "H: reconciliation detects NULL fuel converted to zero");
    await db.exec(`update public.fm_generator_logs set fuel_used = null where id in (select id from public.fm_generator_logs where fuel_used = 0)`);
    assert((await reconcile(client, unblocked)).ok, "H: reconciliation passes again after the tampering is reverted");
    pass("H reconciliation: manifest → provenance → domain rows, field-level equality, DB-derived runtime, tamper detection (good/now()/zero)");
  }

  // ── I. idempotency ──────────────────────────────────────────────────────────────
  {
    const c1 = await census(client);
    const v = await verifyIdempotent(client, unblocked);
    assert(v.ok && v.summary.insert === 0 && v.summary.present === 412, "I: read-only verification — a second execution would insert 0 rows");
    const { client: c, log } = spy(db);
    const again = await executeImport(c, unblocked);
    assert(again.outcome === "already-imported" && Object.values(again.inserted).every((n) => n === 0) && again.provenanceInserted === 0, "I: second execution reports already-imported");
    assert(!log.some((l) => /^insert into/i.test(l)), "I: the second execution issues no INSERT at all");
    assert(JSON.stringify(await census(client)) === JSON.stringify(c1), "I: census identical after the second execution");
    const third = await executeImport(client, unblocked);
    assert(third.outcome === "already-imported", "I: third execution also a no-op");
    const dups = (await db.query<{ c: string }>("select count(*)::text c from (select target_table, target_id from public.fm_migration_provenance group by 1,2 having count(*)>1) x")).rows[0]!.c;
    assert(dups === "0", "I: zero duplicate provenance");
    pass("I idempotency: verify-only = 0 inserts; re-executions issue no INSERT, census unchanged, zero duplicate provenance");
  }

  // ── J. collisions (each on a fresh database; nothing may be written) ───────────
  {
    const zero = async (d: PGlite, label: string, run: () => Promise<unknown>, needle: RegExp) => {
      const c0 = await census(asClient(d));
      let msg = "";
      try { await run(); } catch (e) { msg = e instanceof Error ? e.message : String(e); }
      assert(needle.test(msg), `J: ${label} — expected refusal /${needle}/, got "${msg.slice(0, 200)}"`);
      const c1 = await census(asClient(d));
      assert(JSON.stringify(c0) === JSON.stringify(c1), `J: ${label} — rolled back completely (census unchanged)`);
    };
    const assetName = String(plan.rows.find((r) => r.target === "fm_assets")!.columns.name);
    let d = await freshDb(manifest);
    await d.exec(`insert into public.fm_assets (organisation_id, code, facility_id, name) values ('${ORG}', 'AST-2026-000001', '${manifest.facility.id}', '${assetName.toLowerCase()}')`);
    await zero(d, "live asset with the same logical identity", () => executeImport(asClient(d), unblocked), /already exists in FAC-0001/);
    await d.close();

    d = await freshDb(manifest);
    const item = String(plan.rows.find((r) => r.target === "fm_consumables_items")!.columns.name);
    await d.exec(`insert into public.fm_consumables_items (organisation_id, code, facility_id, name) values ('${ORG}', 'ITEM-2026-000001', '${manifest.facility.id}', '${item}')`);
    await zero(d, "live consumables item with the same name", () => executeImport(asClient(d), unblocked), /live item named/);
    await d.close();

    d = await freshDb(manifest);
    const gl = plan.rows.find((r) => r.target === "fm_generator_logs")!;
    await d.exec(`insert into public.fm_generator_logs (organisation_id, code, log_date, generator, started_at, ended_at, fuel_used) values ('${ORG}', 'GENLOG-2026-000001', '${String(gl.columns.log_date)}', '${String(gl.columns.generator)}', '${String(gl.columns.log_date)}T08:00:00Z', '${String(gl.columns.log_date)}T09:00:00Z', 10)`);
    await zero(d, "live generator log for the same generator/date", () => executeImport(asClient(d), unblocked), /live log for/);
    await d.close();

    d = await freshDb(manifest);
    const req = plan.rows.find((r) => r.target === "fm_requests")!;
    await d.exec(`insert into public.fm_requests (id, organisation_id, code, facility_id, title) values ('${req.id}', '${ORG}', 'REQ-2026-000001', '${manifest.facility.id}', 'squatter with our id')`);
    await zero(d, "domain row with a planned id but no provenance", () => executeImport(asClient(d), unblocked), /provenance\(source=no, target=no\), domain row exists/);
    await d.close();

    // provenance for the same source row but a different fingerprint (source changed) → conflict, not overwrite
    d = await freshDb(manifest);
    await executeImport(asClient(d), unblocked);
    await d.exec(`alter table public.fm_migration_provenance disable trigger fm_migration_provenance_append_only`);
    const sample = plan.rows.find((r) => r.target === "fm_requests")!;
    await d.exec(`update public.fm_migration_provenance set fingerprint = '${"e".repeat(64)}' where target_id = '${sample.id}'`);
    await d.exec(`alter table public.fm_migration_provenance enable trigger fm_migration_provenance_append_only`);
    await zero(d, "same source row, different fingerprint", () => executeImport(asClient(d), unblocked), /different fingerprint/);
    assert(!(await verifyIdempotent(asClient(d), unblocked)).ok, "J: verify-idempotency reports the fingerprint conflict");
    await d.close();

    // half-imported batch: provenance exists, domain row missing
    d = await freshDb(manifest);
    await executeImport(asClient(d), unblocked);
    await d.exec(`delete from public.fm_diesel_usage where id = '${plan.rows.find((r) => r.target === "fm_diesel_usage")!.id}'`);
    await zero(d, "provenance present but domain row missing", () => executeImport(asClient(d), unblocked), /domain row absent/);
    await d.close();

    // batch key reused with different sources
    d = await freshDb(manifest);
    await d.exec(`insert into public.fm_migration_batches (organisation_id, batch_key, rules_version, sources) values ('${ORG}', '${plan.batchKey}', 'other-rules', '[]')`);
    await zero(d, "batch key exists with different rules/sources", () => executeImport(asClient(d), unblocked), /different rules_version\/sources/);
    await d.close();

    // unknown facility → never creates one
    d = await freshDb(manifest);
    await d.exec(`delete from public.fm_facilities`);
    await zero(d, "FAC-0001 missing", () => executeImport(asClient(d), unblocked), /never creates facilities/);
    await d.close();
    pass("J collisions: live asset/item/generator-log identity, squatting id, changed fingerprint, half-imported batch, reused batch key, missing facility — each aborts with zero writes");
  }

  // ── K. transaction atomicity: a mid-import failure rolls everything back ────────
  {
    for (const failAt of [1, 2, 60, 300, 700]) {
      const d = await freshDb(manifest);
      const c0 = await census(asClient(d));
      const { client: c } = spy(d, failAt);
      let failed = false;
      try { await executeImport(c, unblocked); } catch (e) { failed = /injected failure/.test(String(e)); }
      assert(failed, `K: failure injected at insert #${failAt}`);
      assert(JSON.stringify(await census(asClient(d))) === JSON.stringify(c0), `K: failure at insert #${failAt} left ZERO rows (batch, domains, provenance)`);
      await d.close();
    }
    // constraint violation in the middle (schema-level) also rolls back
    const d = await freshDb(manifest);
    const c0 = await census(asClient(d));
    const broken = clone(unblocked) as ImportPlan;
    broken.rows.find((r) => r.target === "fm_generator_logs")!.columns.end_meter_reading = -1;
    let msg = ""; try { await executeImport(asClient(d), broken); } catch (e) { msg = String(e); }
    assert(/hour_meter_basis|check/.test(msg), "K: the database constraint rejects an impossible reading");
    assert(JSON.stringify(await census(asClient(d))) === JSON.stringify(c0), "K: a database constraint violation mid-import leaves zero rows");
    await d.close();
    // rehearsal mode leaves nothing behind
    const r = await freshDb(manifest);
    const cr = await census(asClient(r));
    const rehearsal = await executeImport(asClient(r), unblocked, { rollbackForRehearsal: true });
    assert(rehearsal.outcome === "imported" && JSON.stringify(await census(asClient(r))) === JSON.stringify(cr), "K: rehearsal executes the full plan then rolls back — nothing persists");
    await r.close();
    pass("K transaction: single atomic unit; injected failures (5 points) and a constraint violation leave zero rows; rehearsal rolls back");
  }

  // ── L. code allocation respects existing codes ─────────────────────────────────
  {
    const d = await freshDb(manifest);
    await d.exec(`insert into public.fm_requests (organisation_id, code, facility_id, title) values ('${ORG}', 'REQ-2026-000041', '${manifest.facility.id}', 'operational'), ('${ORG}', 'REQ-2025-000099', '${manifest.facility.id}', 'other year')`);
    await executeImport(asClient(d), unblocked);
    const max = (await d.query<{ m: string; n: string }>("select max(code) m, count(*)::text n from public.fm_requests where code like 'REQ-2026-%'")).rows[0]!;
    assert(max.m === "REQ-2026-000070" && max.n === "30", "L: imported request codes continue after the highest existing code, never colliding");
    await d.close();
    pass("L display codes continue after existing codes; existing operational rows untouched");
  }

  // ── M. read-only / write-path static safety ────────────────────────────────────
  {
    const exec = readFileSync("scripts/fm-migration-import/executor.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    assert(!/on\s+conflict/i.test(exec), "M: the executor never uses ON CONFLICT (no broad conflict suppression)");
    assert(!/operational_events|appsScript|apps-script|script\.google/i.test(exec + readFileSync("scripts/fm-migration-import/plan.ts", "utf8")), "M: no operational_events / Apps Script dependency");
    const cli = readFileSync("scripts/fm-migration-import.mts", "utf8");
    assert(/evaluateProductionGates/.test(cli) && cli.indexOf("evaluateProductionGates") < cli.indexOf("executeImport(client"), "M: the CLI evaluates every gate before it can reach executeImport");
    assert(!/acknowledgeBlockers/.test(cli), "M: the test-only blocker acknowledgement is not reachable from the CLI");
    pass("M static: no ON CONFLICT, no operational_events/Apps Script, gates precede execution, no CLI blocker override");
  }

  await db.close();
  console.log(out.join("\n"));
  console.log(`\n${out.length} groups passed — ZERO remote writes (in-process Postgres only)`);
}

main().catch((e) => {
  console.error("FAIL", e instanceof Error ? e.stack ?? e.message : e);
  process.exit(1);
});
void assertSafeToProceed; void readState;
