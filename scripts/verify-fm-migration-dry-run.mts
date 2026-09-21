/**
 * FM live-data migration — DRY-RUN reconciliation verifier (phase 1). Read-only: parses the
 * immutable source workbooks and asserts the locked migration contract against the manifest.
 * It never connects to a database.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-fm-migration-dry-run.mts [--source=<dir>]
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { manifestDigest, runDryRun, type Manifest } from "./fm-migration/dryRun";
import { readWorkbook } from "./fm-migration/xlsx";
import { RULES_VERSION, importedId, sha256File } from "./fm-migration/ids";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const src = (p: string) => readFileSync(resolve(p), "utf8");
const source = process.argv.find((a) => a.startsWith("--source="))?.slice(9) ?? "/Users/effiongokpo/Developer/sentracore-migration-source";

async function main() {
  const out: string[] = [];
  const pass = (m: string) => out.push(`PASS ${m}`);

  // ── static: the tool is read-only and DB-free ────────────────────────────────
  const toolFiles = readdirSync("scripts/fm-migration").map((f) => join("scripts/fm-migration", f)).concat(["scripts/fm-migration-dry-run.mts"]);
  const toolCode = toolFiles.map((f) => strip(src(f))).join("\n");
  assert(!/supabase|createAdminClient|createClient\(|fetch\(|\.rpc\(|\.from\("|\.insert\(|\.upsert\(|\.delete\(|operational_events|node:http|node:net/.test(toolCode.replace(/process\.env\.FM_MIGRATION_FAC0001_ID/g, "")), "static: the dry-run has no database client, no writes and no operational_events dependency");
  assert(!/writeFileSync|mkdirSync/.test(strip(src("scripts/fm-migration/dryRun.ts")) + strip(src("scripts/fm-migration/dates.ts")) + strip(src("scripts/fm-migration/xlsx.ts"))), "static: only the CLI writes files (to the ignored output directory)");
  assert(/\/migration-output\//.test(src(".gitignore")), "static: generated manifests stay out of git");
  pass("static: DB-free, write-free engine; output ignored by git; operational_events is not referenced");

  const files = {
    LETTERS: join(source, "2026 LETTERS (4).xlsx"),
    FM_PACK: join(source, "Facility Management Operations System Pack.xlsx"),
    MBORA: join(source, "MBORA INCOME STATEMENT.xlsx"),
  };
  if (!Object.values(files).every(existsSync)) {
    console.log(out.join("\n"));
    console.log("SKIPPED data reconciliation — source workbooks not found at", source);
    return;
  }
  const dup = join(source, "Facility Management Operations System Pack (1).xlsx");
  const duplicateFiles = existsSync(dup) && sha256File(dup) === sha256File(files.FM_PACK) ? [{ file: "Facility Management Operations System Pack (1).xlsx", duplicateOf: "FM_PACK" as const }] : [];
  const facility = { code: "FAC-0001", id: "e1a5f579-8bb1-42fb-9fdf-56faaaa1e9e0" };
  const run = () => runDryRun({ files, duplicateFiles, facility, timeZone: "Africa/Lagos" });
  const m: Manifest = run();
  const byKey = new Map(m.ledger.map((l) => [`${l.workbook}|${l.sheet}|${l.row}`, l]));
  const lof = (r: Manifest["records"][number]) => byKey.get(`${r.provenance.workbook}|${r.provenance.sheet}|${r.provenance.row}`)!;

  // A. every populated row exactly once
  {
    const expected = new Set<string>();
    for (const [code, path] of Object.entries(files)) {
      for (const sheet of readWorkbook(path).sheets) for (const row of sheet.rows.keys()) expected.add(`${code}|${sheet.name}|${row}`);
    }
    assert(byKey.size === m.ledger.length, "A: no row is classified twice");
    assert(expected.size === m.ledger.length && [...expected].every((k) => byKey.has(k)), "A: every populated source row is accounted for exactly once");
    const classes = new Set(["IMPORT", "TRANSFORM_IMPORT", "BOOTSTRAP", "PRESERVE_HISTORY", "QUARANTINE", "REJECT", "MODEL_GAP"]);
    assert(m.ledger.every((l) => classes.has(l.classification) && l.reasonCode && l.reason), "A: each row has one classification with a reason");
    assert(m.ignoredDuplicates.length === 1 && m.ignoredDuplicates[0]!.sha256 === m.sources.find((s) => s.workbook === "FM_PACK")!.sha256, "A: the duplicate FM pack is ignored (identical SHA-256) and never double-counted");
    pass(`A ${m.ledger.length} populated rows (${m.summary.businessRows} business, ${m.summary.structuralRows} structural) each accounted for exactly once; duplicate pack ignored`);
  }

  // B. no pivot / total / formula / template becomes a business record
  {
    const derivedReasons = new Set(["PIVOT_DERIVED", "DERIVED_TOTAL_FORMULA", "DERIVED_TOTAL_OR_NOTE", "TEMPLATE_RESIDUE", "STRUCTURAL_TITLE", "STRUCTURAL_TITLE_OR_HEADER"]);
    assert(m.ledger.filter((l) => derivedReasons.has(l.reasonCode)).every((l) => l.classification === "REJECT" && l.proposed.length === 0), "B: pivot/total/formula/template/header rows are rejected and propose nothing");
    assert(m.records.every((r) => ["TRANSFORM_IMPORT", "BOOTSTRAP", "IMPORT"].includes(lof(r).classification)), "B: every proposed record comes from an import-classified row");
    assert(m.records.every((r) => !["Pivot Table 2", "Pending Payments", "2026 Monthly Payment", "KPI Dashboard", "Inventory"].includes(r.provenance.sheet)), "B: no record originates from pivot, commercial or reporting sheets");
    pass("B derived / structural rows never become business records");
  }

  // C. no client payment / income / monthly contract value in FM payment or reimbursement domains
  {
    const allowedTargets = new Set(["fm_requests", "fm_incidents", "fm_assets", "fm_diesel_usage", "fm_work", "fm_work_instructions", "fm_generator_logs", "fm_consumables_items", "fm_consumables_register_entries"]);
    assert(m.records.every((r) => allowedTargets.has(r.target)), "C: proposed records touch only the approved operational domains");
    for (const forbidden of ["fm_payments", "fm_reimbursement_payments", "fm_cost_records", "fm_cost_submissions", "fm_cost_submission_items", "fm_reimbursement_authorizations", "fm_approvals"]) {
      assert(!m.records.some((r) => r.target === forbidden) && !m.deferred.some((d) => d.target === forbidden), `C: nothing targets ${forbidden}`);
    }
    const commercial = m.ledger.filter((l) => (l.sheet === "Pending Payments" || l.sheet === "2026 Monthly Payment") && l.kind === "business" && l.reasonCode !== "TEMPLATE_RESIDUE");
    assert(commercial.length === 18 && commercial.every((l) => l.classification === "REJECT" && l.reasonCode === "PLATFORM_FINANCE_EXCLUDED"), "C: pending-payment and monthly-payment rows are excluded as Platform Finance");
    assert(!/income|payment[_ ]advice/i.test(JSON.stringify(m.records.map((r) => r.values))) && !/"Paid"|"Pending"/.test(JSON.stringify(m.records.map((r) => r.values))), "C: no income/payment values or commercial Paid/Pending states appear in any proposed FM record");
    assert(!/payment[_ ]advice|client income/i.test(JSON.stringify(m.deferredEvidence)), "C: even the deferred evidence carries no client income");
    pass("C client income / payment requests / monthly contract values stay out of every FM domain");
  }

  // D. executed-without-job-order creates no fabricated WI
  {
    const executed = m.records.filter((r) => r.target === "fm_work" && r.values.work_instruction !== undefined);
    assert(executed.length === 2 && executed.every((r) => String(r.values.work_instruction).startsWith("NONE")), "D: the 2 non-conflicting executed-without-Job-Order rows become historical Work");
    const executedIds = new Set(executed.map((r) => r.id));
    assert(!m.records.some((r) => r.target === "fm_work_instructions" && executedIds.has(String(r.values.work_record_id))), "D: NO Work Instruction references those Works — none is fabricated");
    assert(m.ledger.filter((l) => l.sheet === "Executed (NO JOB ORDER)" && l.classification === "QUARANTINE").length === 2, "D: the 2 rows whose state conflicts with the approval register stay quarantined");
    assert(executed.every((r) => r.values.status === "completed" && r.values.completed_at === null && r.values.reported_at === null), "D: 'Executed' is preserved as completed with an UNKNOWN completion/report date");
    pass("D executed (NO JOB ORDER): historical Work only; no WI / Job Order fabricated; conflicting rows quarantined");
  }

  // E. explicit order_type on historical JO / WO
  {
    const wis = m.records.filter((r) => r.target === "fm_work_instructions");
    assert(wis.length === 113 && wis.every((r) => r.values.order_type === "job_order" || r.values.order_type === "work_order"), "E: every migrated Work Instruction has an explicit order_type");
    const sheetOf = (r: Manifest["records"][number]) => r.provenance.sheet;
    assert(wis.every((r) => (/JOB ORDERS/i.test(sheetOf(r)) ? r.values.order_type === "job_order" : r.values.order_type === "work_order")), "E: order_type follows the source sheet");
    assert(wis.filter((r) => r.values.order_type === "job_order").length === 88 && wis.filter((r) => r.values.order_type === "work_order").length === 25, "E: 88 job_order and 25 work_order");
    const workIds = new Set(m.records.filter((r) => r.target === "fm_work").map((r) => r.id));
    assert(wis.every((r) => workIds.has(String(r.values.work_record_id))), "E: each Work Instruction belongs to exactly one migrated Work from the same source row");
    assert(wis.every((r) => r.values.work_category === "other" && r.values.source === "manual"), "E: no corrective category / source is asserted");
    pass("E explicit order_type preserved (88 job_order, 25 work_order); each WI tied to its own migrated Work");
  }

  // F. Paid / Pending never sets Work state
  {
    const works = m.records.filter((r) => r.target === "fm_work" && r.values.work_instruction === undefined);
    assert(works.length === 113 && works.every((w) => w.values.status === "unknown" && w.values.reported_at === null && w.values.completed_at === null && w.values.record_origin === "migrated_historical"), "F: every order Work is migrated_historical with UNKNOWN status/dates — nothing derived from Paid/Pending");
    const wis = m.records.filter((r) => r.target === "fm_work_instructions");
    assert(wis.every((w) => w.values.status === "unknown" && w.values.requested_at === null && w.values.completed_at === null && w.values.record_origin === "migrated_historical"), "F: every Work Instruction has unknown status/request/completion");
    assert(m.ledger.filter((l) => l.reasonCode.startsWith("HISTORICAL_")).every((l) => /commercial state excluded/.test(l.reason)), "F: the ledger records that commercial state is excluded");
    pass("F Paid/Pending never sets operational Work/WI status or dates");
  }

  // G. no platform identities from historical actors
  {
    assert(m.records.every((r) => Object.entries(r.values).every(([k, v]) => !/profile_id/.test(k) || v === null || v === undefined)), "G: no profile identity is set on any proposed record");
    assert(!m.records.some((r) => /profiles|auth/.test(r.target)), "G: no profile/auth target");
    const req = m.records.find((r) => r.target === "fm_requests" && r.values.reporter_name)!;
    assert(typeof req.values.reporter_name === "string" && !("reported_by_profile_id" in req.values), "G: requesters are preserved as historical text only");
    assert(m.exceptions.unresolvedActors.length > 0, "G: historical actor names are listed as unresolved, not matched");
    pass(`G ${m.exceptions.unresolvedActors.length} historical actor names preserved as text; no identity created or guessed`);
  }

  // H. ambiguous dates cannot enter the import set
  {
    const bad = new Set(m.dateExceptions.filter((d) => d.status === "unresolved" || d.status === "invalid").map((d) => `${d.workbook}|${d.sheet}|${d.row}`));
    assert(m.records.every((r) => !bad.has(`${r.provenance.workbook}|${r.provenance.sheet}|${r.provenance.row}`)), "H: no unresolved/invalid date reaches a proposed record");
    const repaired = m.dateExceptions.filter((d) => d.status === "repaired");
    assert(repaired.length === 5 && repaired.every((d) => d.raw && d.normalized && d.rule && d.alternatives.length === 2), "H: every repaired date lists raw value, normalised value, rule and both readings");
    assert(m.records.filter((r) => r.transformations.some((t) => t.startsWith("date repaired"))).length >= 3, "H: repaired dates are recorded on the affected records");
    assert(m.records.every((r) => Object.values(r.values).every((v) => typeof v !== "string" || !/^20\d\d-12-08$/.test(v))), "H: the future misread 2026-12-08 never appears");
    pass(`H ${repaired.length} repaired dates explained; ${m.summary.chronologyConfirmedDates} chronology-confirmed; ambiguity never imported`);
  }

  // I. generator: hour-meter facts, no invented times, broken formulas quarantined
  {
    const gen = m.ledger.filter((l) => l.sheet === "Generator Log");
    for (const row of [67, 72, 73]) assert(gen.find((l) => l.row === row)!.classification === "QUARANTINE", `I: generator row ${row} is quarantined`);
    const logs = m.records.filter((r) => r.target === "fm_generator_logs");
    assert(logs.length === 67, "I: 67 valid dated readings are imported");
    assert(logs.every((r) => r.values.log_basis === "hour_meter" && !("started_at" in r.values) && !("ended_at" in r.values) && r.values.record_origin === "migrated_historical"), "I: hour-meter basis, historical origin, NO invented clock times");
    assert(logs.every((r) => (r.values.end_meter_reading as number) >= (r.values.start_meter_reading as number) && r.values.run_hours_derived_by_database === Math.round(((r.values.end_meter_reading as number) - (r.values.start_meter_reading as number)) * 10) / 10), "I: runtime is derived from readings, never negative; spreadsheet formula results are not imported");
    assert(logs.every((r) => r.values.fuel_used === null || typeof r.values.fuel_used === "number") && logs.some((r) => r.values.fuel_used === null), "I: blank fuel is NULL (unknown), never 0");
    assert(!JSON.stringify(logs).includes('"run_hours"') , "I: the source Run Hours column is not carried as a value");
    pass("I generator hour-meter logs imported with derived runtime, unknown fuel and no invented times; broken rows quarantined");
  }

  // J. asset aliases only via the explicit map
  {
    const assets = m.records.filter((r) => r.target === "fm_assets");
    assert(assets.length === 9 && !assets.some((r) => r.values.name === "65KVA (CSIRT GEN)"), "J: 9 assets bootstrap; the CSIRT generator is quarantined (no approved CSIRT facility)");
    assert(assets.every((r) => r.values.condition === "unknown"), "J: every asset condition is explicit 'unknown' — never 'good'");
    assert(m.exceptions.schemaForcedDefaults.every((d) => d.field !== "condition"), "J: the condition default is no longer forced");
    assert(m.assetAliases.length === 30, "J: the alias map is explicit and reviewable");
    const assetIds = new Map(assets.map((a) => [a.id, String(a.values.name)]));
    const linked = m.records.filter((r) => r.target === "fm_generator_logs" && r.values.asset_record_id);
    assert(linked.length > 0 && linked.every((r) => /^Gen [12]$/.test(String(r.values.generator)) && /GEN [12]\)$/.test(assetIds.get(String(r.values.asset_record_id)) ?? "")), "J: generator logs link to an asset ONLY through the explicit alias (Gen 1/2 ⇒ 1000KVA GEN 1/2)");
    assert(m.records.filter((r) => r.target === "fm_generator_logs" && !r.values.asset_record_id).every((r) => !/^Gen [12]$/.test(String(r.values.generator))), "J: no other generator label is linked");
    assert(!m.records.some((r) => r.target !== "fm_generator_logs" && ("asset_id" in r.values || "asset_ref" in r.values)), "J: no other record links to an asset through text matching");
    assert(m.links.some((l) => l.confidence === "PROBABLE" && /LIFT \(D\)/.test(l.basis)), "J: the incident's free-text 'LIFT (D)' is only a PROBABLE candidate, not linked");
    assert(assets.every((r) => r.values.manufacturer === null && r.values.model === null && r.values.serial_number === null), "J: blank OEM/model/serial stay unknown");
    pass("J assets resolve only through the explicit alias map; unknown metadata and condition stay unknown");
  }

  // K. determinism
  {
    const again = run();
    assert(manifestDigest(again) === manifestDigest(m), "K: a second dry run produces a byte-identical manifest");
    assert(JSON.stringify(again.ledger) === JSON.stringify(m.ledger) && JSON.stringify(again.records) === JSON.stringify(m.records), "K: ledger and records are identical across runs");
    pass(`K deterministic: batch ${m.batchId}, digest ${manifestDigest(m).slice(0, 16)}…`);
  }

  // L. idempotent identity + provenance plan
  {
    const shaOf = Object.fromEntries(m.sources.map((x) => [x.workbook, x.sha256]));
    assert(new Set(m.records.map((r) => r.id)).size === m.records.length, "L: proposed identities are unique");
    assert(m.records.every((r) => r.id === importedId(shaOf[r.provenance.workbook]!, r.provenance.sheet, r.provenance.row, r.target)), "L: identity = f(source bytes hash, sheet, row, target) — independent of the rules version");
    const keys = new Map<string, Set<string>>();
    for (const r of m.records) {
      const set = keys.get(r.target) ?? new Set();
      assert(!set.has(r.naturalKey), `L: duplicate-looking references stay distinct rows (${r.target}:${r.naturalKey})`);
      set.add(r.naturalKey);
      keys.set(r.target, set);
    }
    assert(m.exceptions.duplicateLookingReferences.length === 4, "L: the 4 duplicate-looking Request No suffixes are reported, not collapsed");
    const plan = m.provenancePlan;
    const allowed = new Set(["fm_requests", "fm_incidents", "fm_assets", "fm_work", "fm_work_instructions", "fm_generator_logs", "fm_diesel_usage", "fm_consumables_items", "fm_consumables_register_entries"]);
    assert(plan.length === m.records.length && new Set(plan.map((p) => p.targetId)).size === plan.length, "L: exactly one provenance row per proposed record");
    assert(new Set(plan.map((p) => `${p.workbookSha256}|${p.sheet}|${p.row}|${p.targetTable}`)).size === plan.length, "L: provenance is unique per (workbook hash, sheet, row, target) — reruns cannot duplicate");
    assert(plan.every((p) => allowed.has(p.targetTable) && /^[0-9a-f]{64}$/.test(p.workbookSha256) && /^[0-9a-f]{64}$/.test(p.fingerprint) && ["IMPORT", "TRANSFORM_IMPORT", "BOOTSTRAP"].includes(p.classification) && p.batchKey === m.batchId), "L: every provenance row satisfies the schema constraints (target set, hashes, classification, batch)");
    assert(plan.every((p) => !/amount|payment_advice/i.test(JSON.stringify(p))), "L: provenance holds identifiers/hashes/transformations only — no client values");
    const migration = src("supabase/migrations/20260921100000_fm_historical_migration_support.sql");
    for (const t of allowed) assert(new RegExp(`'${t}'`).test(migration), `L: the provenance table admits target ${t}`);
    assert(m.rulesVersion === RULES_VERSION && m.batchId.startsWith("fmmig-"), "L: batch identity includes the source hashes and rules version");
    pass(`L deterministic UUIDv5 identities + ${plan.length} provenance rows (one per record, unique per source row/target); a production importer inserts ON CONFLICT DO NOTHING`);
  }

  // M / N / O / P / Q
  {
    assert(!/operational_events/.test(toolCode), "M: the tool never reads operational_events");
    assert(m.records.every((r) => r.values.facility_code === "FAC-0001" || r.target === "fm_generator_logs" || r.target === "fm_diesel_usage" && r.values.facility_code === "FAC-0001"), "N: every facility-scoped record targets the existing FAC-0001");
    assert(!m.records.some((r) => r.target === "fm_facilities") && !m.records.some((r) => /building|floor|room/.test(r.target)), "N: no facility, building, floor or room is created (no FAC-0002)");
    assert(!m.records.some((r) => /csirt/i.test(String(r.values.title ?? "") + String(r.values.location_detail ?? "") + String(r.values.name ?? "") + String(r.values.generator ?? ""))), "N: no CSIRT-dependent record is imported");
    const csirt = m.ledger.filter((l) => ["UNRESOLVED_FACILITY", "UNRESOLVED_FACILITY_SHEET_OUT_OF_CONTRACT", "CSIRT_DEPENDENT"].includes(l.reasonCode));
    assert(csirt.length === 43 && csirt.every((l) => l.classification === "QUARANTINE"), "N: 43 CSIRT-dependent rows are quarantined and reported for later resolution");
    assert(m.records.filter((r) => r.target === "fm_diesel_usage").every((r) => r.values.added === 0 && r.transformations.some((t) => /PROVEN by the row's own arithmetic/.test(t))), "O: 'added = 0' is only ever proven, never assumed");
    const dieselRows = m.ledger.filter((l) => l.sheet === "MBORA DIESEL Checklist");
    assert(dieselRows.find((l) => l.row === 5)!.classification === "QUARANTINE" && dieselRows.find((l) => l.row === 24)!.classification === "QUARANTINE", "O: '-' and blank are never converted to zero");
    assert(m.records.filter((r) => r.target === "fm_requests").every((r) => r.values.reporter_name !== "-"), "O: placeholder '-' is not a requester");
    const entries = m.records.filter((r) => r.target === "fm_consumables_register_entries");
    assert(entries.length === 31 && entries.every((r) => r.values.snapshot_date === null && r.values.closing_quantity === null && r.values.record_origin === "migrated_historical"), "P: consumables carry no invented date and no derived closing balance");
    assert(entries.every((r) => ["opening", "received", "issued", "closing", "reorder_level"].every((f) => (r.values[`${f}_quantity`] === null) === (r.values[`${f}_unit`] === null))), "P: every quantity has an explicit unit; unknown stays null");
    const win = entries.find((r) => r.values.raw_opening === "67 Pcks")!;
    assert(win.values.opening_unit === "packs" && win.values.received_unit === "pcs", "P: pcs and packs are never equated (Windowlene keeps packs vs pcs)");
    assert(entries.filter((r) => r.values.raw_opening === "-").every((r) => r.values.opening_quantity === null), "P: '-' is unknown, not zero");
    assert(m.deferredEvidence.length > 0 && m.deferredEvidence.every((e) => e.kind === "historical_direct_cost_deferred") && !m.records.some((r) => /cost/.test(r.target)), "Q: historical direct cost is preserved as evidence only — no cost record, claim, authorization or payment");
    assert(m.exceptions.unknownUnits.length === 0, "P: no unrecognised unit was silently accepted");
    pass("M–Q operational_events untouched; FAC-0001 reused, CSIRT held; unknown never converted to zero; consumables explicit; costs deferred");
  }

  console.log(out.join("\n"));
  console.log(`\n${out.length} groups passed`);
}

main().catch((e) => {
  console.error("FAIL", e instanceof Error ? e.message : e);
  process.exit(1);
});

