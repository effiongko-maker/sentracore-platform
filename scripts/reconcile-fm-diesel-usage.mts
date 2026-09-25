/**
 * FM Diesel Usage — reconcile the live register against the operator's updated workbook (both site checklists).
 *
 *   NODE_PATH=<dir with empty server-only/> npx tsx --tsconfig tsconfig.json scripts/reconcile-fm-diesel-usage.mts \
 *     [--source=<path to Udated.xlsx>]                         # DRY-RUN (default): reads only
 *   ... --apply --actor=<profile uuid>                          # writes (requires migration 20260925153000)
 *
 * Every dated source observation is represented with exactly what it records (NULL = not recorded, never 0); nothing
 * is recalculated to make a cycle balance (see fm-migration/dieselReconcile.ts). Existing imported rows are updated
 * to the updated workbook's recorded values; operator-entered rows are never touched. New rows are
 * migrated_historical, generator_ref NULL, each with governed provenance (batch fm-diesel-reconcile-udated-1,
 * workbook UDATED + sha256, sheet, row). Provenance is append-only and one-per-target, so the field-level changes made
 * to EXISTING rows are recorded in the batch's `sources` entry (target, source row, from → to). Idempotent: a rerun
 * finds nothing to update and every inserted source row already in the provenance ledger.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { readWorkbook, type Sheet } from "./fm-migration/xlsx";
import { sha256File, sha256Text } from "./fm-migration/ids";
import {
  DIESEL_SITES,
  DIESEL_VALUE_COLUMNS,
  planDieselReconciliation,
  readDieselSourceRows,
  type LiveDieselRow,
} from "./fm-migration/dieselReconcile";

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
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);

const WORKBOOK = "UDATED";
const BATCH_KEY = "fm-diesel-reconcile-udated-1";
const RULES_VERSION = "fm-diesel-reconcile/2-observations";

function rowFingerprint(sheet: Sheet, row: number): string {
  const cells = [...(sheet.rows.get(row)?.values() ?? [])].sort((a, b) => a.col.localeCompare(b.col, "en", { numeric: true }));
  return sha256Text(JSON.stringify(cells.map((c) => [c.col, c.value, c.formula])));
}

async function main() {
  loadEnvLocal();
  const apply = process.argv.includes("--apply");
  const file = arg("source") ?? resolve(process.env.HOME ?? "", "Developer/sentracore-migration-source/Udated.xlsx");
  const sha = sha256File(file);
  const wb = readWorkbook(file);
  const sheets = new Map(DIESEL_SITES.map((s) => {
    const sheet = wb.sheets.find((x) => x.name === s.sheet);
    if (!sheet) throw new Error(`${s.sheet} not found in ${file}`);
    return [s.sheet, sheet] as const;
  }));
  const rows = DIESEL_SITES.flatMap((s) => readDieselSourceRows(sheets.get(s.sheet)!));

  const { createAdminClient } = await import("../src/utils/supabase/admin");
  const admin = createAdminClient();
  const { data: org } = await admin.from("organisations").select("id").eq("slug", "paychex").single();
  if (!org) throw new Error("organisation not found");
  const organisationId = String(org.id);
  const { data: facs } = await admin.from("fm_facilities").select("id, code").eq("organisation_id", organisationId).in("code", DIESEL_SITES.map((s) => s.facilityCode));
  const facilityId = new Map((facs ?? []).map((f) => [String(f.code), String(f.id)]));
  for (const s of DIESEL_SITES) if (!facilityId.has(s.facilityCode)) throw new Error(`${s.facilityCode} not found`);
  const codeByFacility = new Map([...facilityId].map(([code, id]) => [id, code]));

  const { data: liveRows, error } = await admin
    .from("fm_diesel_usage")
    .select("id, code, facility_id, log_date, opening_level, closing_level, added, consumption, underground_tank_qty, surface_tank_qty, record_origin")
    .eq("organisation_id", organisationId)
    .order("log_date", { ascending: true });
  if (error) throw new Error(`live read failed: ${error.message}`);
  const num = (v: unknown) => (v == null ? null : Number(v));
  const live: LiveDieselRow[] = (liveRows ?? []).map((r) => ({
    id: String(r.id), code: String(r.code), facilityCode: codeByFacility.get(String(r.facility_id)) ?? "?", logDate: String(r.log_date).slice(0, 10),
    opening: num(r.opening_level), closing: num(r.closing_level), added: num(r.added), consumption: num(r.consumption),
    underground: num(r.underground_tank_qty), surface: num(r.surface_tank_qty),
    recordOrigin: r.record_origin === "migrated_historical" ? "migrated_historical" : "operational",
  }));

  const plan = planDieselReconciliation({ sites: DIESEL_SITES, rows, live });

  // Idempotency: source rows of THIS workbook already imported are never inserted again.
  const { data: prov } = await admin.from("fm_migration_provenance").select("source_sheet, source_row")
    .eq("organisation_id", organisationId).eq("target_table", "fm_diesel_usage").eq("workbook_sha256", sha);
  const already = new Set((prov ?? []).map((p) => `${p.source_sheet}#${p.source_row}`));
  const inserts = plan.inserts.filter((x) => !already.has(`${x.sheet}#${x.sourceRow}`));
  const v = (n: number | null) => (n == null ? "∅" : String(n));

  console.log(`Source: ${file} (sha256 ${sha.slice(0, 12)}…) · live rows: ${live.length}`);
  console.log(`\nUPDATE existing imported rows to the recorded source values (${plan.updates.length}):`);
  for (const u of plan.updates) console.log(`  ${u.code} ${u.date}  ${u.changes.map((c) => `${c.field} ${v(c.from)}→${v(c.to)}`).join(" · ")}  (${u.sheet} r${u.sourceRow})`);
  console.log(`\nINSERT missing observations (${inserts.length}${inserts.length !== plan.inserts.length ? `; ${plan.inserts.length - inserts.length} already imported` : ""}):`);
  for (const x of inserts) console.log(`  ${x.facilityCode} ${x.date}  opening ${v(x.opening)} · closing ${v(x.closing)} · consumption ${v(x.consumption)} · underground ${v(x.underground)} · surface ${v(x.surface)}  (${x.sheet} r${x.sourceRow})`);
  console.log(`\nUNCHANGED (${plan.unchanged.length}):`);
  for (const u of plan.unchanged) console.log(`  ${u.code} ${u.date}`);
  console.log(`\nEXCEPTIONS (${plan.exceptions.length}):`);
  for (const e of plan.exceptions) console.log(`  ${e.facilityCode} ${e.date ?? "?"} (${e.sheet} r${e.sourceRow}): ${e.reason}`);
  console.log(`\nLIVE ROWS NOT IN SOURCE — untouched (${plan.liveOnly.length}):`);
  for (const l of plan.liveOnly) console.log(`  ${l.code} ${l.facilityCode} ${l.date}`);
  console.log(`\nREADING VARIANCES preserved, not corrected (${plan.variances.length}):`);
  for (const x of plan.variances) console.log(`  ${x.facilityCode} ${x.date}: (opening − closing) − consumption = ${x.variance} L`);
  console.log(`\nRESULTING COVERAGE:`);
  for (const [fac, cov] of Object.entries(plan.coverage)) console.log(`  ${fac}: ${cov.rows} rows, ${cov.first ?? "—"} → ${cov.last ?? "—"} (${cov.incomplete} with an incomplete cycle)`);

  if (!apply) {
    console.log("\nDRY-RUN complete. Nothing was written.");
    return;
  }
  const actor = arg("actor");
  if (!actor) throw new Error("--actor=<profile uuid> is required with --apply");
  if (plan.exceptions.some((e) => /authoritative/.test(e.reason))) throw new Error("a duplicated source date needs a human choice — nothing written");

  let { data: batch } = await admin.from("fm_migration_batches").select("id").eq("organisation_id", organisationId).eq("batch_key", BATCH_KEY).maybeSingle();
  if (!batch && (plan.updates.length || inserts.length)) {
    const ins = await admin.from("fm_migration_batches").insert({
      organisation_id: organisationId, batch_key: BATCH_KEY, rules_version: RULES_VERSION,
      sources: [{
        workbook: WORKBOOK, file: "Udated.xlsx", sha256: sha,
        rule: "every dated observation as recorded; NULL = not recorded; no arithmetic correction",
        updates: plan.updates.map((u) => ({ target_table: "fm_diesel_usage", target_id: u.liveId, code: u.code, source_sheet: u.sheet, source_row: u.sourceRow, date: u.date, changes: u.changes })),
      }],
    }).select("id").single();
    if (ins.error) throw new Error(`batch: ${ins.error.message}`);
    batch = ins.data;
  }
  for (const u of plan.updates) {
    const patch: Record<string, unknown> = { updated_by_profile_id: actor };
    for (const c of u.changes) patch[DIESEL_VALUE_COLUMNS[c.field]] = c.to;
    const r = await admin.from("fm_diesel_usage").update(patch)
      .eq("organisation_id", organisationId).eq("id", u.liveId).eq("record_origin", "migrated_historical");
    if (r.error) throw new Error(`${u.code}: ${r.error.message}`);
  }
  if (inserts.length) {
    const year = new Date().getUTCFullYear();
    const { data: latestRows } = await admin.from("fm_diesel_usage").select("code").eq("organisation_id", organisationId).ilike("code", `DSLU-${year}-%`).order("code", { ascending: false }).limit(1);
    let seq = Number(String((latestRows ?? [])[0]?.code ?? "").match(/-(\d+)$/)?.[1] ?? 0);
    for (const x of inserts) {
      const id = randomUUID();
      const p = await admin.from("fm_migration_provenance").insert({
        organisation_id: organisationId, batch_id: (batch as { id: string }).id, workbook: WORKBOOK, workbook_sha256: sha,
        source_sheet: x.sheet, source_row: x.sourceRow, source_reference: `${x.sheet} ${x.date}`,
        fingerprint: rowFingerprint(sheets.get(x.sheet)!, x.sourceRow), target_table: "fm_diesel_usage", target_id: id,
        classification: "TRANSFORM_IMPORT", transformations: x.transformations,
      });
      if (p.error) throw new Error(`provenance ${x.sheet} r${x.sourceRow}: ${p.error.message}`);
      seq += 1;
      const d = await admin.from("fm_diesel_usage").insert({
        id, organisation_id: organisationId, code: `DSLU-${year}-${String(seq).padStart(6, "0")}`, log_date: x.date,
        facility_id: facilityId.get(x.facilityCode), generator_ref: null,
        opening_level: x.opening, added: x.added, closing_level: x.closing, consumption: x.consumption,
        underground_tank_qty: x.underground, surface_tank_qty: x.surface, record_origin: "migrated_historical",
        created_by_profile_id: actor, updated_by_profile_id: actor,
      });
      if (d.error) throw new Error(`insert ${x.sheet} r${x.sourceRow}: ${d.error.message}`);
    }
  }
  console.log(`\nApplied: ${plan.updates.length} updated, ${inserts.length} inserted.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
