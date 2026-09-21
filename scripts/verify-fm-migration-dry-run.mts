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
    const allowedTargets = new Set(["fm_requests", "fm_incidents", "fm_assets", "fm_diesel_usage"]);
    assert(m.records.every((r) => allowedTargets.has(r.target)), "C: proposed records touch only requests, incidents, assets and diesel usage");
    for (const forbidden of ["fm_payments", "fm_reimbursement_payments", "fm_cost_records", "fm_cost_submissions", "fm_cost_submission_items", "fm_reimbursement_authorizations"]) {
      assert(!m.records.some((r) => r.target === forbidden) && !m.deferred.some((d) => d.target === forbidden), `C: nothing targets ${forbidden}`);
    }
    const commercial = m.ledger.filter((l) => (l.sheet === "Pending Payments" || l.sheet === "2026 Monthly Payment") && l.kind === "business" && l.reasonCode !== "TEMPLATE_RESIDUE");
    assert(commercial.length === 18 && commercial.every((l) => l.classification === "REJECT" && l.reasonCode === "PLATFORM_FINANCE_EXCLUDED"), "C: pending-payment and monthly-payment rows are excluded as Platform Finance");
    assert(!/income|payment[_ ]advice/i.test(JSON.stringify(m.records)) && !/"Paid"|"Pending"/.test(JSON.stringify(m.records)), "C: no income/payment values or commercial Paid/Pending states appear in any proposed FM record");
    assert(m.deferred.every((d) => !("income" in d.values) && !("amount" in d.values)), "C: deferred candidates carry no income or payment amount");
    pass("C client income / payment requests / monthly contract values stay out of FM payment, cost and reimbursement domains");
  }

  // D. executed-without-job-order creates no fabricated WI
  {
    assert(!m.records.some((r) => r.target.includes("work_instruction")), "D: no Work Instruction is proposed for import");
    const executed = m.deferred.filter((d) => d.target === "fm_work");
    assert(executed.length === 2 && executed.every((d) => String(d.values.work_instruction).startsWith("NONE")), "D: executed-without-Job-Order candidates explicitly carry NO Work Instruction");
    assert(executed.every((d) => !("order_type" in d.values)), "D: no order_type is invented for them");
    pass("D executed (NO JOB ORDER) proves the absence of a Job Order — no WI / Job Order is fabricated");
  }

  // E. explicit order_type on historical JO / WO candidates
  {
    const orders = m.deferred.filter((d) => d.target === "fm_work+fm_work_instructions");
    assert(orders.length === 144 && orders.every((d) => d.values.order_type === "job_order" || d.values.order_type === "work_order"), "E: every historical order candidate has an explicit order_type");
    assert(orders.every((d) => (/JOB ORDERS/i.test(d.row) ? d.values.order_type === "job_order" : d.values.order_type === "work_order")), "E: order_type follows the sheet (Job Orders ⇒ job_order, Work Orders ⇒ work_order)");
    assert(m.summary.blockedByModelGap && (m.summary.blockedByModelGap as { workInstructions: { job_order: number; work_order: number } }).workInstructions.job_order === 110, "E: 110 job_order / 34 work_order candidates counted");
    pass("E explicit order_type preserved (110 job_order, 34 work_order candidates)");
  }

  // F. Paid / Pending never sets Work state
  {
    assert(!m.records.some((r) => r.target === "fm_work"), "F: no Work record is proposed for import");
    assert(m.deferred.filter((d) => d.target === "fm_work+fm_work_instructions").every((d) => !("status" in d.values) && !("completed_at" in d.values)), "F: no Work/WI status or completion is derived for any Paid/Pending row");
    const gap = m.ledger.filter((l) => l.reasonCode === "HISTORICAL_WORK_STATE_NOT_REPRESENTABLE");
    assert(gap.length === 144 && gap.every((l) => /Paid\/Pending is commercial state and cannot set Work state/.test(l.reason)), "F: the ledger states that Paid/Pending cannot set Work state");
    pass("F Paid/Pending is commercial state and never sets operational Work status");
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
    const ids = m.records.filter((r) => r.transformations.some((t) => t.startsWith("date repaired")));
    assert(ids.length >= 3, "H: repaired dates are also recorded on the affected record's transformations");
    assert(m.records.every((r) => Object.values(r.values).every((v) => typeof v !== "string" || !/^20\d\d-12-08$/.test(v))), "H: the future misread 2026-12-08 never appears");
    pass(`H ${repaired.length} repaired dates explained; ${m.summary.chronologyConfirmedDates} chronology-confirmed; ambiguity never imported`);
  }

  // I. generator negative / broken formulas
  {
    const gen = m.ledger.filter((l) => l.sheet === "Generator Log");
    for (const row of [67, 72, 73]) assert(gen.find((l) => l.row === row)!.classification === "QUARANTINE", `I: generator row ${row} is quarantined`);
    assert(!m.records.some((r) => r.target === "fm_generator_logs"), "I: no generator log is imported (schema gap)");
    const readings = m.deferred.filter((d) => d.target === "fm_generator_logs");
    assert(readings.every((d) => Math.abs((d.values.run_hours_recomputed as number) - Math.round(((d.values.end_reading as number) - (d.values.start_reading as number)) * 10) / 10) < 1e-9 && (d.values.run_hours_recomputed as number) >= 0), "I: runtime is recomputed from readings and never negative; spreadsheet formula results are not trusted");
    assert(readings.every((d) => d.values.fuel_used_source === null || typeof d.values.fuel_used_source === "number"), "I: blank fuel stays unknown (null), never 0");
    pass("I broken generator formulas are quarantined; runtime recomputed from readings");
  }

  // J. asset aliases only via the explicit map
  {
    const assets = m.records.filter((r) => r.target === "fm_assets");
    assert(assets.length === 9 && !assets.some((r) => r.values.name === "65KVA (CSIRT GEN)"), "J: 9 assets bootstrap; the CSIRT generator is quarantined (no CSIRT facility)");
    assert(m.assetAliases.length === 30, "J: the alias map is explicit and reviewable");
    assert(!m.records.some((r) => "asset_id" in r.values || "asset_ref" in r.values), "J: no record links to an asset through text matching");
    assert(m.links.some((l) => l.confidence === "PROBABLE" && /LIFT \(D\)/.test(l.basis)), "J: the incident's free-text 'LIFT (D)' is only a PROBABLE candidate, not linked");
    assert(assets.every((r) => r.values.manufacturer === null && r.values.model === null && r.values.serial_number === null), "J: blank OEM/model/serial stay unknown");
    pass("J assets resolve only through the explicit alias map; unknown metadata stays unknown");
  }

  // K. determinism
  {
    const again = run();
    assert(manifestDigest(again) === manifestDigest(m), "K: a second dry run produces a byte-identical manifest");
    assert(JSON.stringify(again.ledger) === JSON.stringify(m.ledger) && JSON.stringify(again.records) === JSON.stringify(m.records), "K: ledger and records are identical across runs");
    pass(`K deterministic: batch ${m.batchId}, digest ${manifestDigest(m).slice(0, 16)}…`);
  }

  // L. idempotent identity
  {
    const shaOf = Object.fromEntries(m.sources.map((s) => [s.workbook, s.sha256]));
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
    assert(m.rulesVersion === RULES_VERSION && m.batchId.startsWith("fmmig-"), "L: batch identity includes the source hashes and rules version");
    pass("L rerunning cannot duplicate: deterministic UUIDv5 identities (a production importer must insert ON CONFLICT DO NOTHING on this id)");
  }

  // M / N / O
  {
    assert(!/operational_events/.test(toolCode), "M: the tool never reads operational_events");
    assert(m.records.every((r) => r.values.facility_code === "FAC-0001" && r.values.facility_id === facility.id), "N: every record targets the existing FAC-0001");
    assert(!m.records.some((r) => r.target === "fm_facilities") && !m.records.some((r) => /building|floor|room/.test(r.target)), "N: no facility, building, floor or room is created");
    assert(m.records.filter((r) => r.target === "fm_diesel_usage").every((r) => r.values.added === 0 && r.transformations.some((t) => /PROVEN by the row's own arithmetic/.test(t))), "O: 'added = 0' is only ever proven, never assumed");
    const dieselRows = m.ledger.filter((l) => l.sheet === "MBORA DIESEL Checklist");
    assert(dieselRows.find((l) => l.row === 5)!.classification === "QUARANTINE" && dieselRows.find((l) => l.row === 24)!.classification === "QUARANTINE", "O: '-' and blank are never converted to zero");
    assert(m.records.filter((r) => r.target === "fm_requests").every((r) => r.values.reporter_name !== "-"), "O: placeholder '-' is not a requester");
    assert(m.exceptions.schemaForcedDefaults.some((d) => d.field === "condition"), "O: schema-forced defaults that assert something are disclosed");
    pass("M/N/O operational_events untouched; FAC-0001 reused; unknown is never converted to zero/complete");
  }

  console.log(out.join("\n"));
  console.log(`\n${out.length} groups passed`);
}

main().catch((e) => {
  console.error("FAIL", e instanceof Error ? e.message : e);
  process.exit(1);
});

