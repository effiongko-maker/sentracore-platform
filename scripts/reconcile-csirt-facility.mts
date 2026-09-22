/**
 * CSIRT facility reconciliation — the ~31 order-register rows previously quarantined (CSIRT_DEPENDENT /
 * UNRESOLVED_FACILITY) are now resolvable: stakeholder-confirmed CSIRT is a SEPARATE facility (Wuse II).
 * Creates the CSIRT facility (owner-confirmed, no source row — mirrors "Annex Building" in
 * reconstruct-fm-master-data.mts), then imports the 31 rows as Work (+ WI, + Cost where a Cost value exists),
 * using the EXACT historical template (status/priority=unknown, work_category=other, no dates) already
 * established for the other 107 historical Work rows. Shared Annex+CSIRT rows get facility_id=FAC-0001 (the
 * structurally-required primary — fm_work.facility_id is NOT NULL) PLUS an fm_work_facilities row for BOTH
 * facilities; the commercial/cost VALUE is never split.
 *
 *   NODE_PATH=<dir with empty server-only/> npx tsx --tsconfig tsconfig.json scripts/reconcile-csirt-facility.mts \
 *     --actor=<uuid>              # DRY-RUN (default)
 *   ... --actor=<uuid> --apply    # create + provenance (idempotent)
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

const ORDER_SHEETS = ["2025 JOB ORDERS", "2025 WORK ORDERS", "2026 JOB ORDERS", "2026 WORK ORDER"] as const;
const ORDER_TYPE: Record<string, string> = {
  "2025 JOB ORDERS": "job_order", "2026 JOB ORDERS": "job_order",
  "2025 WORK ORDERS": "work_order", "2026 WORK ORDER": "work_order",
};
const BATCH_KEY = "fm-csirt-facility-reconcile-1";
const RULES_VERSION = "fm-csirt-facility-reconcile/1";

function cellText(sheet: Sheet, row: number, col: string): string | null {
  const v = sheet.rows.get(row)?.get(col)?.value;
  return v == null ? null : String(v).trim() || null;
}
function rowFingerprint(sheet: Sheet, row: number): string {
  const cells = [...(sheet.rows.get(row)?.values() ?? [])].sort((a, b) => a.col.localeCompare(b.col, "en", { numeric: true }));
  return sha256Text(JSON.stringify(cells.map((c) => [c.col, c.value, c.formula])));
}

async function main() {
  loadEnvLocal();
  const apply = process.argv.includes("--apply");
  const actor = arg("actor");
  if (!actor) throw new Error("--actor=<profile uuid> is required");
  const source = arg("source") ?? resolve(process.env.HOME ?? "", "Developer/sentracore-migration-source");
  const MBORA_FILE = "MBORA INCOME STATEMENT.xlsx";
  const sha = sha256File(resolve(source, MBORA_FILE));
  const wb = readWorkbook(resolve(source, MBORA_FILE));

  const { createAdminClient } = await import("../src/utils/supabase/admin");
  const admin = createAdminClient();
  const { data: orgs } = await admin.from("organisations").select("id").eq("status", "active");
  if ((orgs ?? []).length !== 1) throw new Error("expected exactly one active organisation");
  const organisationId = String((orgs![0] as { id: string }).id);
  const { data: facRows } = await admin.from("fm_facilities").select("id,code").eq("organisation_id", organisationId);
  const annex = (facRows ?? []).find((f) => (f as { code: string }).code === "FAC-0001") as { id: string } | undefined;
  if (!annex) throw new Error("FAC-0001 not found");
  let csirtId = ((facRows ?? []).find((f) => (f as { code: string }).code !== "FAC-0001") as { id: string } | undefined)?.id ?? null;

  // ---- 1. Classify the quarantined CSIRT-related order-register population ----
  const { data: prov } = await admin
    .from("fm_migration_provenance")
    .select("source_sheet,source_row")
    .eq("organisation_id", organisationId)
    .eq("workbook", "MBORA")
    .eq("target_table", "fm_work")
    .in("source_sheet", [...ORDER_SHEETS]);
  const provSet = new Set((prov ?? []).map((r) => `${(r as { source_sheet: string }).source_sheet}#${(r as { source_row: number }).source_row}`));

  type Candidate = { sheet: string; row: number; desc: string; cost: number | null; classification: "CSIRT_ONLY" | "SHARED"; fingerprint: string };
  const candidates: Candidate[] = [];
  for (const sheetName of ORDER_SHEETS) {
    const sheet = sheetByName(wb, sheetName);
    for (const [row, m] of sheet.rows) {
      const a = m.get("A")?.value;
      if (!a || !/^\d+$/.test(String(a))) continue;
      if (provSet.has(`${sheetName}#${row}`)) continue;
      const desc = cellText(sheet, row, "B");
      if (!desc || !/csirt/i.test(desc)) continue;
      const hasAnnex = /\bannex\b|\bncc annex\b|\bmbora\b|digital park/i.test(desc);
      const costRaw = cellText(sheet, row, "E");
      const cost = costRaw != null ? Math.round(Number(costRaw) * 100) / 100 : null;
      if (costRaw != null && !Number.isFinite(cost)) throw new Error(`${sheetName} r${row}: bad Cost "${costRaw}"`);
      candidates.push({ sheet: sheetName, row, desc, cost, classification: hasAnnex ? "SHARED" : "CSIRT_ONLY", fingerprint: rowFingerprint(sheet, row) });
    }
  }
  const byClass = { CSIRT_ONLY: candidates.filter((c) => c.classification === "CSIRT_ONLY").length, SHARED: candidates.filter((c) => c.classification === "SHARED").length };
  console.log(JSON.stringify({ mode: apply ? "APPLY" : "DRY-RUN", total: candidates.length, ...byClass, withCost: candidates.filter((c) => c.cost != null).length, csirtFacilityExists: !!csirtId }, null, 2));
  for (const c of candidates) console.log(`  ${c.classification.padEnd(10)} ${c.sheet} r${c.row} cost=${c.cost} :: ${c.desc.slice(0, 70)}`);

  if (!apply) { console.log("\nDRY-RUN complete. Nothing was written."); return; }

  // ---- 2. Batch + CSIRT facility (owner-confirmed, no source row) ----
  let { data: batch } = await admin.from("fm_migration_batches").select("id").eq("organisation_id", organisationId).eq("batch_key", BATCH_KEY).maybeSingle();
  if (!batch) {
    const ins = await admin.from("fm_migration_batches").insert({ organisation_id: organisationId, batch_key: BATCH_KEY, rules_version: RULES_VERSION, sources: [{ workbook: "MBORA", file: MBORA_FILE, sha256: sha }] }).select("id").single();
    if (ins.error) throw new Error(`batch: ${ins.error.message}`);
    batch = ins.data;
  }
  const batchId = String((batch as { id: string }).id);

  if (!csirtId) {
    const { generateNextFacilityCode } = await import("../src/modules/facilities/server/fmFacilityDomain");
    const code = generateNextFacilityCode(["FAC-0001"]);
    const ins = await admin.from("fm_facilities").insert({ organisation_id: organisationId, code, name: "CSIRT", status: "active", facility_type: "office", location_text: "Wuse II, Abuja", created_by_profile_id: actor }).select("id").single();
    if (ins.error) throw new Error(`facility insert: ${ins.error.message}`);
    csirtId = String((ins.data as { id: string }).id);
    const provIns = await admin.from("fm_migration_provenance").insert({
      organisation_id: organisationId, batch_id: batchId, workbook: "MBORA", workbook_sha256: sha,
      source_sheet: "N/A", source_row: 1, source_reference: "Owner-confirmed: CSIRT is a separate facility (Wuse II, Abuja) under the NCC FM contract.",
      fingerprint: sha256Text("owner-confirmed-csirt-facility"), target_table: "fm_facilities", target_id: csirtId, classification: "BOOTSTRAP",
      transformations: ["Owner-confirmed structural decision; no workbook row establishes this — the code IS the fact, not inferred from any source cell."],
    });
    if (provIns.error) throw new Error(`facility provenance: ${provIns.error.message}`);
    console.log(`Created CSIRT facility ${code} (${csirtId})`);
  }

  // ---- 3. Import Work (+WI, +Cost) per candidate, idempotent ----
  const { generateNextWorkCode } = await import("../src/modules/maintenance/server/fmWorkDomain");
  const { generateNextInstructionCode } = await import("../src/modules/work-orders/server/fmWorkInstructionDomain");
  const { generateNextCostCode } = await import("../src/modules/finance/server/fmCostDomain");
  const { data: workCodeRows } = await admin.from("fm_work").select("code").eq("organisation_id", organisationId);
  let latestWorkCode: string | null = (workCodeRows ?? []).map((r) => String((r as { code: string }).code)).sort().at(-1) ?? null;
  const { data: wiCodeRows } = await admin.from("fm_work_instructions").select("code").eq("organisation_id", organisationId);
  let latestWiCode: string | null = (wiCodeRows ?? []).map((r) => String((r as { code: string }).code)).sort().at(-1) ?? null;
  const { data: costCodeRows } = await admin.from("fm_cost_records").select("code").eq("organisation_id", organisationId);
  let latestCostCode: string | null = (costCodeRows ?? []).map((r) => String((r as { code: string }).code)).sort().at(-1) ?? null;

  let createdWork = 0, createdCost = 0, sharedLinks = 0;
  for (const c of candidates) {
    const workId = importedId(sha, c.sheet, c.row, "fm_work");
    const { data: existingWork } = await admin.from("fm_work").select("id").eq("id", workId).maybeSingle();
    const facilityId = c.classification === "CSIRT_ONLY" ? csirtId! : annex.id;

    if (!existingWork) {
      latestWorkCode = generateNextWorkCode([latestWorkCode ?? ""]);
      const wIns = await admin.from("fm_work").insert({
        id: workId, organisation_id: organisationId, code: latestWorkCode, facility_id: facilityId, title: c.desc,
        source: "manual", priority: "unknown", status: "unknown", reported_at: null, record_origin: "migrated_historical",
      });
      if (wIns.error) throw new Error(`work insert (${c.sheet} r${c.row}): ${wIns.error.message}`);
      const wProv = await admin.from("fm_migration_provenance").insert({
        organisation_id: organisationId, batch_id: batchId, workbook: "MBORA", workbook_sha256: sha,
        source_sheet: c.sheet, source_row: c.row, source_reference: c.desc, fingerprint: c.fingerprint,
        target_table: "fm_work", target_id: workId, classification: "TRANSFORM_IMPORT",
        transformations: [
          `Facility resolved from CSIRT quarantine reconciliation: ${c.classification === "CSIRT_ONLY" ? "CSIRT only" : "Annex + CSIRT shared — facility_id=FAC-0001 (structurally required primary), fm_work_facilities records BOTH"}`,
          "status/priority=unknown, reported_at=null — no lifecycle fact stated by source (same template as the other 107 historical Work rows)",
        ],
      });
      if (wProv.error) throw new Error(`work provenance (${c.sheet} r${c.row}): ${wProv.error.message}`);
      createdWork++;
    }

    if (c.classification === "SHARED") {
      const linkIns = await admin.from("fm_work_facilities").upsert(
        [{ organisation_id: organisationId, work_id: workId, facility_id: annex.id }, { organisation_id: organisationId, work_id: workId, facility_id: csirtId! }],
        { onConflict: "organisation_id,work_id,facility_id", ignoreDuplicates: true }
      );
      if (linkIns.error) throw new Error(`work_facilities (${c.sheet} r${c.row}): ${linkIns.error.message}`);
      sharedLinks++;
    }

    const wiId = importedId(sha, c.sheet, c.row, "fm_work_instructions");
    const { data: existingWi } = await admin.from("fm_work_instructions").select("id").eq("id", wiId).maybeSingle();
    if (!existingWi) {
      latestWiCode = generateNextInstructionCode(latestWiCode);
      const wiIns = await admin.from("fm_work_instructions").insert({
        id: wiId, organisation_id: organisationId, code: latestWiCode, order_type: ORDER_TYPE[c.sheet], work_id: workId,
        facility_id: facilityId, title: c.desc, work_category: "other", source: "manual", status: "unknown",
        priority: "unknown", requested_at: null, record_origin: "migrated_historical",
      });
      if (wiIns.error) throw new Error(`wi insert (${c.sheet} r${c.row}): ${wiIns.error.message}`);
      const wiProv = await admin.from("fm_migration_provenance").insert({
        organisation_id: organisationId, batch_id: batchId, workbook: "MBORA", workbook_sha256: sha,
        source_sheet: c.sheet, source_row: c.row, source_reference: c.desc, fingerprint: c.fingerprint,
        target_table: "fm_work_instructions", target_id: wiId, classification: "TRANSFORM_IMPORT",
        transformations: ["1:1 Work Instruction for the reconciled Work above; same historical-unknown template."],
      });
      if (wiProv.error) throw new Error(`wi provenance (${c.sheet} r${c.row}): ${wiProv.error.message}`);
    }

    if (c.cost != null) {
      const costId = importedId(sha, c.sheet, c.row, "fm_cost_records");
      const { data: existingCost } = await admin.from("fm_cost_records").select("id").eq("id", costId).maybeSingle();
      if (!existingCost) {
        latestCostCode = generateNextCostCode(latestCostCode);
        const cIns = await admin.from("fm_cost_records").insert({
          id: costId, organisation_id: organisationId, code: latestCostCode, facility_id: facilityId,
          work_id: workId, work_instruction_id: wiId, description: c.desc, actual_amount: c.cost, currency: "NGN",
          reimbursability: "unknown", record_origin: "migrated_historical",
          category: "unknown", location: null, evidence_reference: null, recorded_at: null, department_id: null,
          recorded_by_profile_id: null, created_by_profile_id: null, updated_by_profile_id: null,
        });
        if (cIns.error) throw new Error(`cost insert (${c.sheet} r${c.row}): ${cIns.error.message}`);
        const cProv = await admin.from("fm_migration_provenance").insert({
          organisation_id: organisationId, batch_id: batchId, workbook: "MBORA", workbook_sha256: sha,
          source_sheet: c.sheet, source_row: c.row, source_reference: c.desc, fingerprint: c.fingerprint,
          target_table: "fm_cost_records", target_id: costId, classification: "TRANSFORM_IMPORT",
          transformations: [`Cost column ⇒ actual_amount = ${c.cost.toFixed(2)} NGN (execution cost — never split for shared-facility work)`],
        });
        if (cProv.error) throw new Error(`cost provenance (${c.sheet} r${c.row}): ${cProv.error.message}`);
        createdCost++;
      }
    }
  }
  console.log(`\nAPPLIED. Work created: ${createdWork}/${candidates.length}. Cost created: ${createdCost}. Shared-facility links: ${sharedLinks}.`);
}
main().catch((e) => { console.error("FAIL", e instanceof Error ? e.message : e); process.exit(1); });
