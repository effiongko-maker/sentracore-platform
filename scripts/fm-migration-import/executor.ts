/**
 * FM migration executor over an abstract SQL client (node-postgres in production, PGlite in tests).
 *
 * Transaction strategy: the ENTIRE import (batch row, 9 domains, provenance) is ONE transaction guarded by an
 * advisory lock. Any collision, constraint violation or failed in-transaction reconciliation rolls back everything.
 * There is deliberately NO `ON CONFLICT`: identity is decided by explicit classification before any insert
 * (provenance row + deterministic id), and an unexpected collision aborts instead of being suppressed.
 */
import { IMPORT_ORDER, TARGET_SPECS, assertExecutable, type ImportPlan, type ImportTarget, type PlannedRow } from "./plan";

export interface SqlClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export type Census = Record<string, number>;
const CENSUS_TABLES = [
  ...IMPORT_ORDER, "fm_facilities", "fm_migration_batches", "fm_migration_provenance",
  "fm_cost_records", "fm_cost_submissions", "fm_reimbursement_authorizations", "fm_reimbursement_payments", "fm_approvals", "profiles",
] as const;

/** jsonb does not preserve key order — compare sources as ordered tuples, never as raw JSON text. */
const canonSources = (v: unknown): string => JSON.stringify(((v ?? []) as Array<{ workbook: string; file: string; sha256: string }>).map((s) => [s.workbook, s.file, s.sha256]));

const ident = (t: string) => {
  if (!/^[a-z_]+$/.test(t)) throw new Error(`unsafe identifier ${t}`);
  return `public.${t}`;
};

/** Counts only — no operational or personal values. Missing tables report -1 (e.g. pre-migration). */
export async function census(db: SqlClient): Promise<Census> {
  const out: Census = {};
  for (const t of CENSUS_TABLES) {
    const exists = await db.query<{ ok: boolean }>("select to_regclass($1) is not null as ok", [`public.${t}`]);
    out[t] = exists.rows[0]?.ok ? Number((await db.query<{ c: string }>(`select count(*)::text c from ${ident(t)}`)).rows[0]!.c) : -1;
  }
  return out;
}

// ── schema readiness ────────────────────────────────────────────────────────────
export async function schemaReadiness(db: SqlClient): Promise<string[]> {
  const problems: string[] = [];
  const cols = async (table: string) => new Set((await db.query<{ c: string }>("select column_name c from information_schema.columns where table_schema='public' and table_name=$1", [table])).rows.map((r) => r.c));
  const cons = async (table: string) => new Map((await db.query<{ n: string; d: string }>("select conname n, pg_get_constraintdef(oid) d from pg_constraint where conrelid = to_regclass($1)", [`public.${table}`])).rows.map((r) => [r.n, r.d]));
  for (const t of ["fm_migration_batches", "fm_migration_provenance", "fm_consumables_register_entries"]) {
    if (!(await db.query<{ ok: boolean }>("select to_regclass($1) is not null ok", [`public.${t}`])).rows[0]!.ok) problems.push(`missing table ${t}`);
  }
  for (const t of ["fm_work", "fm_work_instructions", "fm_generator_logs", "fm_incidents"]) if (!(await cols(t)).has("record_origin")) problems.push(`${t}.record_origin missing`);
  const gl = await cols("fm_generator_logs");
  for (const c of ["log_basis", "start_meter_reading", "end_meter_reading", "asset_id"]) if (!gl.has(c)) problems.push(`fm_generator_logs.${c} missing`);
  const assetCons = await cons("fm_assets");
  if (!/unknown/.test(assetCons.get("fm_assets_condition_check") ?? "")) problems.push("fm_assets condition check does not admit 'unknown'");
  const workCons = await cons("fm_work");
  if (!workCons.has("fm_work_unknown_status_historical_only")) problems.push("fm_work unknown-status historical-only constraint missing");
  const incCons = await cons("fm_incidents");
  for (const name of ["fm_incidents_unknown_status_historical_only", "fm_incidents_unknown_severity_historical_only"]) if (!incCons.has(name)) problems.push(`fm_incidents ${name} missing`);
  if (!/unknown/.test(incCons.get("fm_incidents_status_check") ?? "") || !/unknown/.test(incCons.get("fm_incidents_severity_check") ?? "")) problems.push("fm_incidents status/severity checks do not admit 'unknown'");
  if (!/unknown/.test(workCons.get("fm_work_priority_check") ?? "") || !workCons.has("fm_work_unknown_priority_historical_only")) problems.push("fm_work priority does not admit historical-only 'unknown'");
  const wiCons = await cons("fm_work_instructions");
  if (!/unknown/.test(wiCons.get("fm_work_instructions_priority_check") ?? "") || !wiCons.has("fm_work_instructions_unknown_priority_historical_only")) problems.push("fm_work_instructions priority does not admit historical-only 'unknown'");
  if (!wiCons.has("fm_work_instructions_unknown_status_historical_only")) problems.push("fm_work_instructions unknown-status historical-only constraint missing");
  for (const t of ["fm_migration_batches", "fm_migration_provenance"]) {
    const trig = await db.query<{ n: string }>("select tgname n from pg_trigger where tgrelid = to_regclass($1) and not tgisinternal", [`public.${t}`]);
    if (!trig.rows.length) problems.push(`${t} append-only trigger missing`);
  }
  return problems;
}

// ── state + classification ──────────────────────────────────────────────────────
export type RowState = "insert" | "present" | "conflict";
export type Classified = { row: PlannedRow; state: RowState; detail?: string };
export type State = {
  organisationId: string;
  batchId: string | null;
  batchConflict: string | null;
  classified: Classified[];
  collisions: string[];
};

type ProvRow = { source_sheet: string; source_row: number; workbook_sha256: string; target_table: string; target_id: string; fingerprint: string; batch_id: string };

export async function readState(db: SqlClient, plan: ImportPlan): Promise<State> {
  const fac = (await db.query<{ id: string; organisation_id: string; code: string }>("select id, organisation_id, code from public.fm_facilities where id = $1", [plan.facility.id])).rows[0];
  if (!fac) throw new Error(`facility ${plan.facility.id} not found — the importer never creates facilities`);
  if (fac.code !== plan.facility.code) throw new Error(`facility ${plan.facility.id} has code ${fac.code}, expected ${plan.facility.code}`);
  const org = fac.organisation_id;

  const batch = (await db.query<{ id: string; rules_version: string; sources: unknown }>("select id, rules_version, sources from public.fm_migration_batches where organisation_id=$1 and batch_key=$2", [org, plan.batchKey])).rows[0];
  const batchConflict = batch && (batch.rules_version !== plan.rulesVersion || canonSources(batch.sources) !== canonSources(plan.sources))
    ? `batch ${plan.batchKey} exists with different rules_version/sources` : null;

  const shas = [...new Set(plan.sources.map((s) => s.sha256))];
  const provRows = (await db.query<ProvRow>("select source_sheet, source_row, workbook_sha256, target_table, target_id, fingerprint, batch_id from public.fm_migration_provenance where organisation_id=$1 and workbook_sha256 = any($2::text[])", [org, shas])).rows;
  const provBySource = new Map(provRows.map((p) => [`${p.workbook_sha256}|${p.source_sheet}|${p.source_row}|${p.target_table}`, p]));
  const provByTarget = new Map(provRows.map((p) => [`${p.target_table}|${p.target_id}`, p]));

  const classified: Classified[] = [];
  for (const target of IMPORT_ORDER) {
    const rows = plan.rows.filter((r) => r.target === target);
    const ids = rows.map((r) => r.id);
    const existing = new Set((await db.query<{ id: string }>(`select id from ${ident(target)} where organisation_id=$1 and id = any($2::uuid[])`, [org, ids])).rows.map((r) => r.id));
    for (const row of rows) {
      const p = row.provenance;
      const bySource = provBySource.get(`${p.workbookSha256}|${p.sheet}|${p.row}|${p.targetTable}`);
      const byTarget = provByTarget.get(`${p.targetTable}|${p.targetId}`);
      const inDomain = existing.has(row.id);
      if (!bySource && !byTarget && !inDomain) classified.push({ row, state: "insert" });
      else if (bySource && bySource.target_id === row.id && bySource.fingerprint === p.fingerprint && byTarget === bySource && inDomain) classified.push({ row, state: "present" });
      else classified.push({ row, state: "conflict", detail: `${target} ${row.id}: provenance(source=${bySource ? "yes" : "no"}, target=${byTarget ? "yes" : "no"}${bySource && bySource.target_id !== row.id ? ", different target id" : ""}${bySource && bySource.fingerprint !== p.fingerprint ? ", different fingerprint" : ""}), domain row ${inDomain ? "exists" : "absent"}` });
    }
  }

  // Logical-identity collisions with rows this batch does not own (would create duplicate logical records).
  const collisions: string[] = [];
  const toInsert = classified.filter((c) => c.state === "insert").map((c) => c.row);
  for (const r of toInsert.filter((x) => x.target === "fm_assets")) {
    const hit = await db.query<{ id: string }>("select id from public.fm_assets where organisation_id=$1 and facility_id=$2 and lower(name)=lower($3) and id <> $4", [org, plan.facility.id, r.columns.name, r.id]);
    if (hit.rows.length) collisions.push(`fm_assets: a live asset named "${String(r.columns.name)}" already exists in FAC-0001 (${hit.rows[0]!.id})`);
  }
  for (const r of toInsert.filter((x) => x.target === "fm_consumables_items")) {
    const hit = await db.query<{ id: string }>("select id from public.fm_consumables_items where organisation_id=$1 and facility_id=$2 and lower(name)=lower($3) and id <> $4", [org, plan.facility.id, r.columns.name, r.id]);
    if (hit.rows.length) collisions.push(`fm_consumables_items: a live item named "${String(r.columns.name)}" already exists in FAC-0001 (${hit.rows[0]!.id})`);
  }
  for (const r of toInsert.filter((x) => x.target === "fm_generator_logs")) {
    const hit = await db.query<{ id: string }>("select id from public.fm_generator_logs where organisation_id=$1 and log_date=$2 and lower(generator)=lower($3) and id <> $4", [org, r.columns.log_date, r.columns.generator, r.id]);
    if (hit.rows.length) collisions.push(`fm_generator_logs: a live log for ${String(r.columns.generator)} on ${String(r.columns.log_date)} already exists`);
  }
  for (const r of toInsert.filter((x) => x.target === "fm_diesel_usage")) {
    const hit = await db.query<{ id: string }>("select id from public.fm_diesel_usage where organisation_id=$1 and facility_id=$2 and log_date=$3 and lower(generator_ref)=lower($4) and id <> $5", [org, plan.facility.id, r.columns.log_date, r.columns.generator_ref, r.id]);
    if (hit.rows.length) collisions.push(`fm_diesel_usage: a live ${String(r.columns.generator_ref)} row for ${String(r.columns.log_date)} already exists`);
  }
  return { organisationId: org, batchId: batch?.id ?? null, batchConflict, classified, collisions };
}

export function summariseState(state: State) {
  const n = (s: RowState) => state.classified.filter((c) => c.state === s).length;
  return { insert: n("insert"), present: n("present"), conflict: n("conflict"), collisions: state.collisions.length };
}

/** Refuses anything but a clean all-insert or a clean all-present state. */
export function assertSafeToProceed(state: State): "insert-all" | "already-imported" {
  const problems: string[] = [];
  if (state.batchConflict) problems.push(state.batchConflict);
  for (const c of state.classified) if (c.state === "conflict") problems.push(c.detail!);
  problems.push(...state.collisions);
  const s = summariseState(state);
  if (s.insert > 0 && s.present > 0) problems.push(`partial prior state: ${s.present} present, ${s.insert} missing — refusing to complete a half-imported batch automatically`);
  if (problems.length) throw new Error(`Unsafe import state:\n - ${problems.join("\n - ")}`);
  return s.insert === 0 ? "already-imported" : "insert-all";
}

// ── code allocation ─────────────────────────────────────────────────────────────
export async function allocateCodes(db: SqlClient, org: string, table: ImportTarget, prefix: string, year: number, count: number): Promise<string[]> {
  const like = `${prefix}-${year}-%`;
  const rows = (await db.query<{ code: string }>(`select code from ${ident(table)} where organisation_id=$1 and lower(code) like lower($2)`, [org, like])).rows;
  const re = new RegExp(`^${prefix}-${year}-(\\d+)$`, "i");
  let max = 0;
  for (const r of rows) { const m = re.exec(r.code); if (m) max = Math.max(max, parseInt(m[1]!, 10)); }
  return Array.from({ length: count }, (_, i) => `${prefix}-${year}-${String(max + i + 1).padStart(6, "0")}`);
}

// ── execute ─────────────────────────────────────────────────────────────────────
export type ExecuteResult = { outcome: "imported" | "already-imported"; inserted: Record<string, number>; provenanceInserted: number; codes: Record<string, [string, string] | null> };

export async function executeImport(db: SqlClient, plan: ImportPlan, opts: { rollbackForRehearsal?: boolean } = {}): Promise<ExecuteResult> {
  assertExecutable(plan); // blocked forced defaults can never be written
  await db.query("begin");
  try {
    await db.query("set local statement_timeout = '120s'");
    await db.query("set local lock_timeout = '10s'");
    await db.query("select pg_advisory_xact_lock(hashtext('sentracore.fm_migration'))");

    // Re-read state INSIDE the lock; never act on a pre-lock snapshot.
    const state = await readState(db, plan);
    const mode = assertSafeToProceed(state);
    const inserted: Record<string, number> = Object.fromEntries(IMPORT_ORDER.map((t) => [t, 0]));
    const codes: ExecuteResult["codes"] = {};
    if (mode === "already-imported") {
      await db.query(opts.rollbackForRehearsal ? "rollback" : "commit");
      return { outcome: "already-imported", inserted, provenanceInserted: 0, codes };
    }
    const org = state.organisationId;

    // 1. batch / provenance infrastructure
    let batchId = state.batchId;
    if (!batchId) {
      batchId = (await db.query<{ id: string }>(
        "insert into public.fm_migration_batches (organisation_id, batch_key, rules_version, sources) values ($1,$2,$3,$4::jsonb) returning id",
        [org, plan.batchKey, plan.rulesVersion, JSON.stringify(plan.sources.map((s) => ({ workbook: s.workbook, file: s.file, sha256: s.sha256 })))],
      )).rows[0]!.id;
    }

    // 2. facility resolution = reuse (verified in readState); nothing is created.
    // 3..13. domains in locked order; provenance is written with its domain row.
    let provenanceInserted = 0;
    for (const target of IMPORT_ORDER) {
      const rows = state.classified.filter((c) => c.state === "insert" && c.row.target === target).map((c) => c.row);
      const spec = TARGET_SPECS[target];
      const allocated = spec.prefix ? await allocateCodes(db, org, target, spec.prefix, plan.codeYear, rows.length) : [];
      codes[target] = allocated.length ? [allocated[0]!, allocated[allocated.length - 1]!] : null;
      for (const [i, row] of rows.entries()) {
        const cols = ["id", "organisation_id", ...(spec.prefix ? ["code"] : []), ...Object.keys(row.columns)];
        const vals = [row.id, org, ...(spec.prefix ? [allocated[i]] : []), ...Object.values(row.columns)];
        await db.query(`insert into ${ident(target)} (${cols.join(", ")}) values (${cols.map((_, k) => `$${k + 1}`).join(", ")})`, vals);
        inserted[target]!++;
        const p = row.provenance;
        await db.query(
          `insert into public.fm_migration_provenance
             (organisation_id, batch_id, workbook, workbook_sha256, source_sheet, source_row, source_reference, fingerprint, target_table, target_id, classification, transformations)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)`,
          [org, batchId, p.workbook, p.workbookSha256, p.sheet, p.row, p.sourceReference, p.fingerprint, p.targetTable, p.targetId, p.classification, JSON.stringify(p.transformations)],
        );
        provenanceInserted++;
      }
    }

    // In-transaction reconciliation: a mismatch rolls the entire import back.
    const report = await reconcile(db, plan);
    if (!report.ok) throw new Error(`In-transaction reconciliation failed:\n - ${report.checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail}`).join("\n - ")}`);
    await db.query(opts.rollbackForRehearsal ? "rollback" : "commit");
    return { outcome: "imported", inserted, provenanceInserted, codes };
  } catch (e) {
    await db.query("rollback").catch(() => undefined);
    throw e;
  }
}

// ── reconcile (read-only) ───────────────────────────────────────────────────────
export type Check = { name: string; ok: boolean; detail: string };

function same(expected: unknown, actual: unknown): boolean {
  if (expected === null || expected === undefined) return actual === null || actual === undefined;
  if (actual === null || actual === undefined) return false;
  if (typeof expected === "number") return Math.abs(expected - Number(actual)) < 1e-9;
  if (typeof expected === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(expected)) return Date.parse(expected) === Date.parse(String(actual));
  return expected === actual;
}

export async function reconcile(db: SqlClient, plan: ImportPlan): Promise<{ ok: boolean; checks: Check[] }> {
  const checks: Check[] = [];
  const add = (name: string, ok: boolean, detail = "") => checks.push({ name, ok, detail });
  const fac = (await db.query<{ organisation_id: string; code: string }>("select organisation_id, code from public.fm_facilities where id=$1", [plan.facility.id])).rows[0];
  if (!fac) { add("FAC-0001 reused", false, "facility not found"); return { ok: false, checks }; }
  const org = fac.organisation_id;
  add("FAC-0001 reused", fac.code === "FAC-0001", fac.code);
  const facs = (await db.query<{ code: string; name: string }>("select code, name from public.fm_facilities where organisation_id=$1 and (code = 'FAC-0002' or name ilike '%csirt%')", [org])).rows;
  add("no CSIRT / FAC-0002 facility", facs.length === 0, `${facs.length} found`);

  const batch = (await db.query<{ id: string; rules_version: string; sources: unknown }>("select id, rules_version, sources from public.fm_migration_batches where organisation_id=$1 and batch_key=$2", [org, plan.batchKey])).rows[0];
  add("batch row present", Boolean(batch));
  if (!batch) return { ok: false, checks };
  add("batch sources = approved source hashes", canonSources(batch.sources) === canonSources(plan.sources));

  const prov = (await db.query<{ target_table: string; target_id: string; fingerprint: string; classification: string; workbook_sha256: string; source_sheet: string; source_row: number }>(
    "select target_table, target_id, fingerprint, classification, workbook_sha256, source_sheet, source_row from public.fm_migration_provenance where organisation_id=$1 and batch_id=$2", [org, batch.id])).rows;
  add("provenance count = plan", prov.length === plan.rows.length, `${prov.length} vs ${plan.rows.length}`);
  add("no duplicate provenance (source or target)", new Set(prov.map((p) => `${p.workbook_sha256}|${p.source_sheet}|${p.source_row}|${p.target_table}`)).size === prov.length && new Set(prov.map((p) => `${p.target_table}|${p.target_id}`)).size === prov.length);
  const provByTarget = new Map(prov.map((p) => [`${p.target_table}|${p.target_id}`, p]));
  const provMismatch = plan.rows.filter((r) => { const p = provByTarget.get(`${r.target}|${r.id}`); return !p || p.fingerprint !== r.provenance.fingerprint || p.classification !== r.provenance.classification || p.workbook_sha256 !== r.provenance.workbookSha256 || p.source_sheet !== r.provenance.sheet || p.source_row !== r.provenance.row; });
  add("every plan row has matching provenance", provMismatch.length === 0, `${provMismatch.length} mismatched`);

  for (const target of IMPORT_ORDER) {
    const planned = plan.rows.filter((r) => r.target === target);
    const cols = Object.keys(planned[0]?.columns ?? {});
    const found = new Map((await db.query<Record<string, unknown>>(`select to_jsonb(t) as j from ${ident(target)} t where organisation_id=$1 and id = any($2::uuid[])`, [org, planned.map((r) => r.id)])).rows.map((r) => { const j = r.j as Record<string, unknown>; return [String(j.id), j] as const; }));
    add(`${target}: planned ids present (${planned.length})`, found.size === planned.length, `${found.size} found`);
    let diffs = 0; let sample = "";
    for (const r of planned) {
      const j = found.get(r.id);
      if (!j) continue;
      for (const c of cols) if (!same(r.columns[c], j[c])) { diffs++; sample ||= `${r.id}.${c}: expected ${JSON.stringify(r.columns[c])} got ${JSON.stringify(j[c])}`; }
    }
    add(`${target}: every mapped column equals the manifest`, diffs === 0, sample || `${diffs} differences`);
    const provCount = prov.filter((p) => p.target_table === target).length;
    add(`${target}: provenance rows = domain rows`, provCount === planned.length, `${provCount} vs ${planned.length}`);
    const stray = (await db.query<{ c: string }>(`select count(*)::text c from ${ident(target)} d join public.fm_migration_provenance p on p.target_table=$3 and p.target_id=d.id and p.organisation_id=d.organisation_id where d.organisation_id=$1 and p.batch_id=$2`, [org, batch.id, target])).rows[0]!.c;
    add(`${target}: no unplanned rows carry this batch's provenance`, Number(stray) === planned.length, `${stray}`);

    // Identity / actor law on the imported rows.
    if (["fm_requests", "fm_incidents", "fm_work", "fm_work_instructions", "fm_assets"].includes(target)) {
      const actorCols = ["created_by_profile_id", "updated_by_profile_id", "reported_by_profile_id", "assigned_to_profile_id", "assigned_to_profile_id"].filter((c) => c in ((found.values().next().value as Record<string, unknown>) ?? {}));
      const fake = [...found.values()].filter((j) => actorCols.some((c) => j[c] !== null && j[c] !== undefined)).length;
      add(`${target}: no invented actor identities`, fake === 0, `${fake} rows carry a profile id`);
    }
  }

  // Truth-preservation invariants (database side).
  const one = async (sql: string, params: unknown[]) => Number((await db.query<{ c: string }>(sql, params)).rows[0]!.c);
  const ids = (t: ImportTarget) => plan.rows.filter((r) => r.target === t).map((r) => r.id);
  add("no historical asset condition promoted to good", (await one("select count(*)::text c from public.fm_assets where id = any($1::uuid[]) and condition = 'good'", [ids("fm_assets")])) === 0);
  add("historical Work has no invented reported_at / completed_at", (await one("select count(*)::text c from public.fm_work where id = any($1::uuid[]) and (reported_at is not null or completed_at is not null)", [ids("fm_work")])) === 0);
  add("historical Work Instructions have no invented requested_at / completed_at", (await one("select count(*)::text c from public.fm_work_instructions where id = any($1::uuid[]) and (requested_at is not null or completed_at is not null)", [ids("fm_work_instructions")])) === 0);
  add("all imported Incidents / Work / WI are migrated_historical", (await one("select ((select count(*) from public.fm_work where id = any($1::uuid[]) and record_origin <> 'migrated_historical') + (select count(*) from public.fm_work_instructions where id = any($2::uuid[]) and record_origin <> 'migrated_historical') + (select count(*) from public.fm_incidents where id = any($3::uuid[]) and record_origin <> 'migrated_historical'))::text as c", [ids("fm_work"), ids("fm_work_instructions"), ids("fm_incidents")])) === 0);
  const unknownWanted = (t: ImportTarget, col: string) => plan.rows.filter((r) => r.target === t && r.columns[col] === "unknown").length;
  add("unknown incident status/severity and Work/WI priority preserved as unknown (never defaulted)", (await one("select ((select count(*) from public.fm_incidents where id = any($1::uuid[]) and status = 'unknown') + (select count(*) from public.fm_incidents where id = any($1::uuid[]) and severity = 'unknown') + (select count(*) from public.fm_work where id = any($2::uuid[]) and priority = 'unknown') + (select count(*) from public.fm_work_instructions where id = any($3::uuid[]) and priority = 'unknown'))::text as c", [ids("fm_incidents"), ids("fm_work"), ids("fm_work_instructions")])) === unknownWanted("fm_incidents", "status") + unknownWanted("fm_incidents", "severity") + unknownWanted("fm_work", "priority") + unknownWanted("fm_work_instructions", "priority"));
  const nullFuelPlanned = plan.rows.filter((r) => r.target === "fm_generator_logs" && r.columns.fuel_used === null).length;
  add("generator fuel NULL preserved (never zero)", (await one("select count(*)::text c from public.fm_generator_logs where id = any($1::uuid[]) and fuel_used is null", [ids("fm_generator_logs")])) === nullFuelPlanned, `${nullFuelPlanned} expected NULL`);
  add("no clock times invented on hour-meter logs", (await one("select count(*)::text c from public.fm_generator_logs where id = any($1::uuid[]) and (started_at is not null or ended_at is not null or log_basis <> 'hour_meter')", [ids("fm_generator_logs")])) === 0);
  const gen = (await db.query<{ id: string; hours: string }>("select id, hours::text from public.fm_generator_logs where id = any($1::uuid[])", [ids("fm_generator_logs")])).rows;
  const derivedWanted = new Map(plan.rows.filter((r) => r.target === "fm_generator_logs").map((r) => [r.id, r] as const));
  // db-derived runtime must equal the value the manifest computed from the readings
  const badHours = gen.filter((g) => { const p = derivedWanted.get(g.id)!; const expected = Number(p.columns.end_meter_reading) - Number(p.columns.start_meter_reading); return Math.abs(Number(g.hours) - Math.round(expected * 100) / 100) > 0.011; });
  add("generator runtime is database-derived from meter readings", badHours.length === 0, `${badHours.length} differ`);
  add("no consumables register date invented", (await one("select count(*)::text c from public.fm_consumables_register_entries where id = any($1::uuid[]) and snapshot_date is not null", [ids("fm_consumables_register_entries")])) === 0);
  add("no historical-cost / payment rows carry migration provenance", (await one("select count(*)::text c from public.fm_migration_provenance where batch_id=$1 and target_table not in (select unnest($2::text[]))", [batch.id, [...IMPORT_ORDER]])) === 0);
  return { ok: checks.every((c) => c.ok), checks };
}

/** Read-only idempotency verification: a second execution would insert nothing. */
export async function verifyIdempotent(db: SqlClient, plan: ImportPlan): Promise<{ ok: boolean; summary: ReturnType<typeof summariseState> }> {
  const state = await readState(db, plan);
  const summary = summariseState(state);
  return { ok: summary.insert === 0 && summary.conflict === 0 && summary.collisions === 0 && !state.batchConflict, summary };
}
