/**
 * FM Costs & Claims — import the 107 historical FM execution costs from the MBORA order registers.
 *
 * Every source row was already imported as a Work + Work Instruction (governed provenance, batch fmmig-…). This
 * importer reads ONLY the "Cost" column (execution cost) and "Description" column of the four order-register
 * sheets, resolves the Work / Work Instruction it belongs to from the EXISTING provenance ledger (never
 * recomputed/guessed), and inserts one fm_cost_records row per source row that states a Cost value.
 *
 * Explicitly NEVER read: Income (payment advice), Time/Date of Payment, Paid/Pending status, the Monthly Payment
 * sheet, Pending Payments, Pending Approval, or any SUM/formula cell.
 * Explicitly NEVER set: category, location, evidence_reference, recorded_at, reimbursability ('unknown' only — never
 * 'reimbursable'), or any actor.
 *
 *   NODE_PATH=<dir with empty server-only/> npx tsx --tsconfig tsconfig.json scripts/import-fm-historical-costs.mts \
 *     --actor=<super-admin profile uuid>        # DRY-RUN (default): prints the plan, writes nothing
 *   ... --actor=<uuid> --apply                   # create + ledger (idempotent; safe to re-run)
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readWorkbook, sheetByName, type Sheet } from "./fm-migration/xlsx";
import { sha256File, sha256Text, importedId } from "./fm-migration/ids";

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

const FACILITY_CODE = "FAC-0001";
const BATCH_KEY = "fm-cost-records-bootstrap-1";
const RULES_VERSION = "fm-cost-records-bootstrap/1";
const ORDER_SHEETS = ["2025 JOB ORDERS", "2025 WORK ORDERS", "2026 JOB ORDERS", "2026 WORK ORDER"] as const;

function rowFingerprint(sheet: Sheet, row: number): string {
  const cells = [...(sheet.rows.get(row)?.values() ?? [])].sort((a, b) => a.col.localeCompare(b.col, "en", { numeric: true }));
  return sha256Text(JSON.stringify(cells.map((c) => [c.col, c.value, c.formula])));
}
function cellText(sheet: Sheet, row: number, col: string): string | null {
  const v = sheet.rows.get(row)?.get(col)?.value;
  return v == null ? null : String(v).trim() || null;
}

async function main() {
  loadEnvLocal();
  const apply = process.argv.includes("--apply");
  const actor = arg("actor");
  if (!actor) throw new Error("--actor=<profile uuid> is required (record-keeping only; no capability grants are touched)");
  const source = arg("source") ?? resolve(process.env.HOME ?? "", "Developer/sentracore-migration-source");
  const MBORA_FILE = "MBORA INCOME STATEMENT.xlsx";

  // ---- 1. The candidate ROWS are exactly the source rows ALREADY imported as Work (governed provenance) from the
  //         four order-register sheets — never independently rediscovered from the raw sheet. -----------------------
  const sha = sha256File(resolve(source, MBORA_FILE));
  const wb = readWorkbook(resolve(source, MBORA_FILE));
  const { createAdminClient } = await import("../src/utils/supabase/admin");
  const admin = createAdminClient();
  const { data: orgs } = await admin.from("organisations").select("id").eq("status", "active");
  if ((orgs ?? []).length !== 1) throw new Error("expected exactly one active organisation");
  const organisationId = String((orgs![0] as { id: string }).id);
  const { data: fac } = await admin.from("fm_facilities").select("id").eq("organisation_id", organisationId).ilike("code", FACILITY_CODE);
  if ((fac ?? []).length !== 1) throw new Error(`${FACILITY_CODE} not uniquely resolved`);
  const facilityId = String((fac![0] as { id: string }).id);

  const { data: workProv, error: workProvErr } = await admin
    .from("fm_migration_provenance")
    .select("source_sheet, source_row, target_id")
    .eq("organisation_id", organisationId)
    .eq("workbook", "MBORA")
    .eq("target_table", "fm_work")
    .in("source_sheet", [...ORDER_SHEETS]);
  if (workProvErr) throw new Error(`provenance lookup failed: ${workProvErr.message}`);
  const importedWorkRows = (workProv ?? []) as Array<{ source_sheet: string; source_row: number; target_id: string }>;

  // ---- 2. For each already-imported Work row, read Description + Cost from the ORIGINAL workbook. A row with no
  //         Cost stated stays unknown and is never imported (Income / payment date / Paid-Pending are never read). --
  type Candidate = { sheet: string; row: number; description: string; costAmount: number; fingerprint: string; workId: string };
  const candidates: Candidate[] = [];
  for (const wp of importedWorkRows) {
    const sheet = sheetByName(wb, wp.source_sheet);
    const costRaw = cellText(sheet, wp.source_row, "E");
    if (costRaw == null) continue; // no Cost stated for this Work row: stays unknown, not imported
    const cost = Number(costRaw);
    if (!Number.isFinite(cost) || cost < 0) throw new Error(`${wp.source_sheet} row ${wp.source_row}: Cost "${costRaw}" is not a valid non-negative number`);
    const description = cellText(sheet, wp.source_row, "B");
    if (!description) throw new Error(`${wp.source_sheet} row ${wp.source_row}: has a Cost value but no Description`);
    candidates.push({ sheet: wp.source_sheet, row: wp.source_row, description, costAmount: Math.round(cost * 100) / 100, fingerprint: rowFingerprint(sheet, wp.source_row), workId: wp.target_id });
  }
  const expectedTotal = candidates.reduce((s, c) => s + c.costAmount, 0);
  if (candidates.length !== 107) throw new Error(`expected exactly 107 execution-cost candidates (rows with a stated Cost among already-imported Work rows), found ${candidates.length}`);

  // ---- 3. Resolve each candidate's Work Instruction (1:1, already proven certain) — never guessed. -------------------
  type Resolved = Candidate & { costId: string; workInstructionId: string };
  const resolved: Resolved[] = [];
  for (const c of candidates) {
    const { data: wiRows, error: wiErr } = await admin.from("fm_work_instructions").select("id").eq("organisation_id", organisationId).eq("work_id", c.workId);
    if (wiErr) throw new Error(`Work Instruction lookup failed for ${c.sheet} row ${c.row}: ${wiErr.message}`);
    if ((wiRows ?? []).length !== 1) throw new Error(`${c.sheet} row ${c.row}: Work ${c.workId} has ${(wiRows ?? []).length} Work Instructions, expected exactly 1 — refusing`);
    const workInstructionId = String((wiRows![0] as { id: string }).id);
    const costId = importedId(sha, c.sheet, c.row, "fm_cost_records");
    resolved.push({ ...c, costId, workInstructionId });
  }

  console.log(JSON.stringify({ mode: apply ? "APPLY" : "DRY-RUN (no writes)", facility: FACILITY_CODE, candidateCount: resolved.length, expectedTotal: expectedTotal.toFixed(2), workbookSha256: sha }, null, 2));
  console.log("\nSample of the plan (first 3, last 3):");
  for (const r of [...resolved.slice(0, 3), ...resolved.slice(-3)]) {
    console.log(`  ${r.sheet.padEnd(18)} row ${String(r.row).padEnd(4)} cost ${r.costAmount.toFixed(2).padStart(14)} NGN  Work ${r.workId.slice(0, 8)}…  WI ${r.workInstructionId.slice(0, 8)}…  "${r.description.slice(0, 50)}"`);
  }
  console.log("\nFields left explicitly unknown (NULL) on every row: category, location, evidence_reference, recorded_at, department, every actor.");
  console.log("reimbursability is explicitly 'unknown' on every row (never 'reimbursable').");

  // Duplicate / conflict check
  const { data: existingCosts } = await admin.from("fm_cost_records").select("id").eq("organisation_id", organisationId).in("id", resolved.map((r) => r.costId));
  const already = new Set((existingCosts ?? []).map((r) => String((r as { id: string }).id)));
  console.log(`\nConflict check: ${already.size} of ${resolved.length} already exist (idempotent skip); ${resolved.length - already.size} to create.`);

  if (!apply) {
    console.log("\nDRY-RUN complete. Nothing was written.");
    return;
  }

  // ---- 3. APPLY (idempotent): direct insert (never through FmCostRepository.createCost, which requires the fields
  //          this migration is explicit are unknown) + governed provenance in a dedicated batch. --------------------
  let { data: batch } = await admin.from("fm_migration_batches").select("id").eq("organisation_id", organisationId).eq("batch_key", BATCH_KEY).maybeSingle();
  if (!batch) {
    const ins = await admin.from("fm_migration_batches").insert({
      organisation_id: organisationId, batch_key: BATCH_KEY, rules_version: RULES_VERSION,
      sources: [{ workbook: "MBORA", file: MBORA_FILE, sha256: sha }],
    }).select("id").single();
    if (ins.error) throw new Error(`batch insert: ${ins.error.message}`);
    batch = ins.data;
  }
  const batchId = String((batch as { id: string }).id);

  const { data: codeRows } = await admin.from("fm_cost_records").select("code").eq("organisation_id", organisationId);
  const { generateNextCostCode } = await import("../src/modules/finance/server/fmCostDomain");
  let latestCode: string | null = (codeRows ?? []).map((r) => String((r as { code: string }).code)).sort().at(-1) ?? null;

  let created = 0;
  for (const r of resolved) {
    if (already.has(r.costId)) continue;
    const code = generateNextCostCode(latestCode);
    latestCode = code;
    const ins = await admin.from("fm_cost_records").insert({
      id: r.costId, organisation_id: organisationId, code, facility_id: facilityId,
      work_id: r.workId, work_instruction_id: r.workInstructionId,
      description: r.description, actual_amount: r.costAmount, currency: "NGN",
      reimbursability: "unknown", record_origin: "migrated_historical",
      // Explicitly unknown — never fabricated:
      category: "unknown", location: null, evidence_reference: null, recorded_at: null, department_id: null,
      recorded_by_profile_id: null, created_by_profile_id: null, updated_by_profile_id: null,
    });
    if (ins.error) throw new Error(`cost insert failed (${r.sheet} row ${r.row}): ${ins.error.message}`);
    const { data: haveProv } = await admin.from("fm_migration_provenance").select("id").eq("organisation_id", organisationId).eq("target_table", "fm_cost_records").eq("target_id", r.costId).maybeSingle();
    if (!haveProv) {
      const provIns = await admin.from("fm_migration_provenance").insert({
        organisation_id: organisationId, batch_id: batchId, workbook: "MBORA", workbook_sha256: sha,
        source_sheet: r.sheet, source_row: r.row, source_reference: r.description, fingerprint: r.fingerprint,
        target_table: "fm_cost_records", target_id: r.costId, classification: "TRANSFORM_IMPORT",
        transformations: [
          `Cost column (execution cost) ⇒ fm_cost_records.actual_amount = ${r.costAmount.toFixed(2)} NGN`,
          "category / location / evidence_reference / recorded_at / department / actors: unknown — the source states none of them, so NONE is set (never a placeholder or a fabricated default)",
          "reimbursability: 'unknown' — the source establishes NO reimbursement eligibility for this row",
          `Work / Work Instruction linkage from the EXISTING governed provenance for this exact source row (work ${r.workId}, instruction ${r.workInstructionId}) — not recomputed`,
          "Income / payment date / Paid-Pending status on this source row are explicitly OUT of scope for this FM cost migration (client billing / Platform Finance concern)",
        ],
      });
      if (provIns.error) throw new Error(`provenance insert failed (${r.sheet} row ${r.row}): ${provIns.error.message}`);
    }
    created += 1;
  }
  console.log(`\nAPPLIED. Created ${created} cost record(s) this run (${resolved.length - created} already existed).`);
}
main().catch((e) => { console.error("FAIL", e instanceof Error ? e.message : e); process.exit(1); });
