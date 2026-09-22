/**
 * Platform Finance — import governed historical commercial facts into platform_finance_historical_commercial_facts.
 * Foundation: supabase/migrations/20260922150000_platform_finance_historical_commercial_facts.sql (commit 968e75d).
 *
 * THREE populations, each deterministically reconstructed from source (never independently re-guessed row by
 * row for population 3 — its amounts are the already-forensically-verified cutover-register values, re-asserted
 * here against a fresh independent cell read so any drift or transcription error fails loudly instead of writing
 * silently):
 *
 *   1. SETTLED — order-register sheets (2025/2026 JOB/WORK ORDER*), Status = "Paid". Amount received (Income
 *      column), source payment status, payment datetime + raw source text. fm_work_id / fm_work_instruction_id
 *      resolved from the EXISTING governed fm_migration_provenance for the same source row (never recomputed).
 *      No submitted/authorised amount exists per-row in these sheets — left NULL (not evidenced).
 *   2. SETTLED — "2026 Monthly Payment" sheet, Status = "Paid". Submitted (Requested) AND amount received
 *      (Income) both evidenced per row, plus payment datetime. Contract-level: no Work/WI relationship exists
 *      (never invented). The "Difference" column is a computed cell and is NEVER read.
 *   3. OPEN — 13 rows from the reconciled cutover register (of its 19 candidates) that carry an independently
 *      evidenced submitted/authorised amount and are not contradictory/quarantined/domain-gap matters. Explicitly
 *      excluded per instruction: Facility Inspection (no domain), the two contradictory Pending-Approval-vs-
 *      Executed matters, and the CSIRT-mixed plumbing/electrical order. Also excluded: two Group-A items with NO
 *      evidenced commercial fact at all (Water Pump, Car Marking — cost already lives in fm_cost_records; nothing
 *      else is stated), and the HVAC comprehensive-overhaul item, whose authorised amount cannot be reconciled
 *      1:1 to this specific Job Order (ambiguous — quarantined, not imported, per governing law).
 *
 *   NODE_PATH=<dir with empty server-only/> npx tsx --tsconfig tsconfig.json \
 *     scripts/import-platform-finance-historical-facts.mts --actor=<uuid>          # DRY-RUN (default)
 *   ... --actor=<uuid> --apply                                                     # create + provenance (idempotent)
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readWorkbook, sheetByName, type Sheet } from "./fm-migration/xlsx";
import { sha256File, sha256Text, importedId } from "./fm-migration/ids";
import { parsePaymentDatetime } from "./fm-migration/paymentDatetime";

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

const BATCH_KEY = "platform-finance-historical-facts-bootstrap-1";
const RULES_VERSION = "platform-finance-historical-facts-bootstrap/1";
const ORDER_SHEETS = ["2025 JOB ORDERS", "2025 WORK ORDERS", "2026 JOB ORDERS", "2026 WORK ORDER"] as const;
const TARGET_TABLE = "platform_finance_historical_commercial_facts";

function cell(sheet: Sheet, row: number, col: string) {
  return sheet.rows.get(row)?.get(col) ?? null;
}
function cellText(sheet: Sheet, row: number, col: string): string | null {
  const v = cell(sheet, row, col)?.value;
  return v == null ? null : String(v).trim() || null;
}
function cellNumber(sheet: Sheet, row: number, col: string): number | null {
  const t = cellText(sheet, row, col);
  if (t == null) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) throw new Error(`${col}${row}: "${t}" is not a valid number`);
  return Math.round(n * 100) / 100;
}
function rowFingerprint(sheet: Sheet, row: number): string {
  const cells = [...(sheet.rows.get(row)?.values() ?? [])].sort((a, b) => a.col.localeCompare(b.col, "en", { numeric: true }));
  return sha256Text(JSON.stringify(cells.map((c) => [c.col, c.value, c.formula])));
}

type FactPlan = {
  id: string;
  population: "1_order_register_paid" | "2_monthly_payment_paid" | "3_cutover_register_open";
  workbook: "MBORA" | "LETTERS";
  workbookSha256: string;
  sheet: string;
  row: number;
  fingerprint: string;
  description: string;
  submittedAmount: number | null;
  authorisedAmount: number | null;
  amountReceived: number | null;
  sourcePaymentStatus: string | null;
  paymentDatetime: string | null;
  paymentDatetimeSourceText: string | null;
  commercialReference: string | null;
  sourceCounterpartyText: string | null;
  fmWorkCode: string | null; // resolved to an id later
  fmWorkId: string | null;
  fmWorkInstructionId: string | null;
  sourceReferenceNote: string; // provenance.source_reference
  transformations: string[];
};

async function main() {
  loadEnvLocal();
  const apply = process.argv.includes("--apply");
  const actor = arg("actor");
  if (!actor) throw new Error("--actor=<profile uuid> is required (record-keeping only; no capability grants are touched)");
  const source = arg("source") ?? resolve(process.env.HOME ?? "", "Developer/sentracore-migration-source");
  const MBORA_FILE = "MBORA INCOME STATEMENT.xlsx";
  const LETTERS_FILE = "2026 LETTERS (4).xlsx";

  const mboraSha = sha256File(resolve(source, MBORA_FILE));
  const lettersSha = sha256File(resolve(source, LETTERS_FILE));
  const mbora = readWorkbook(resolve(source, MBORA_FILE));
  const letters = readWorkbook(resolve(source, LETTERS_FILE));

  const { createAdminClient } = await import("../src/utils/supabase/admin");
  const admin = createAdminClient();
  const { data: orgs } = await admin.from("organisations").select("id").eq("status", "active");
  if ((orgs ?? []).length !== 1) throw new Error("expected exactly one active organisation");
  const organisationId = String((orgs![0] as { id: string }).id);

  const plans: FactPlan[] = [];
  const skipped: Array<{ population: string; sheet: string; row: number; reason: string }> = [];

  // ---- Population 1: order-register Paid rows -------------------------------------------------------------
  for (const sheetName of ORDER_SHEETS) {
    const sheet = sheetByName(mbora, sheetName);
    for (const [row, m] of sheet.rows) {
      const a = m.get("A")?.value;
      if (!a || !/^\d+$/.test(String(a))) continue;
      const status = cellText(sheet, row, "F");
      if (status !== "Paid") continue;

      const description = cellText(sheet, row, "B");
      if (!description) throw new Error(`${sheetName} row ${row}: Paid but no Description`);
      const paydateRaw = cellText(sheet, row, "C");
      const paydate = paydateRaw ? parsePaymentDatetime(paydateRaw) : null;
      if (paydate && paydate.status !== "exact") {
        skipped.push({ population: "1", sheet: sheetName, row, reason: `SOURCE_FACT_AMBIGUOUS payment datetime: "${paydateRaw}" (${paydate.rule})` });
        continue;
      }
      const income = cellNumber(sheet, row, "D");

      plans.push({
        id: importedId(mboraSha, sheetName, row, TARGET_TABLE),
        population: "1_order_register_paid",
        workbook: "MBORA", workbookSha256: mboraSha, sheet: sheetName, row,
        fingerprint: rowFingerprint(sheet, row),
        description,
        submittedAmount: null, authorisedAmount: null,
        amountReceived: income,
        sourcePaymentStatus: status,
        paymentDatetime: paydate?.iso ?? null,
        paymentDatetimeSourceText: paydateRaw,
        commercialReference: null, sourceCounterpartyText: null,
        fmWorkCode: null, fmWorkId: null, fmWorkInstructionId: null,
        sourceReferenceNote: `${sheetName} S/N ${a}`,
        transformations: [
          `Status = "Paid" ⇒ source_payment_status = "Paid" (verbatim source status, never a SentraCore workflow status)`,
          income != null ? `Income (as per payment advice) ⇒ amount_received = ${income.toFixed(2)} NGN` : "Income (as per payment advice) absent ⇒ amount_received left NULL",
          paydateRaw ? `Time and Date of Payment ⇒ payment_datetime = ${paydate?.iso} (parsed), payment_datetime_source_text = "${paydateRaw}" (raw, verbatim)` : "Time and Date of Payment column absent for this row ⇒ payment_datetime and payment_datetime_source_text left NULL (a genuine settled Paid row with no recorded payment time)",
          "submitted_amount / authorised_amount: not evidenced per-row in this sheet ⇒ left NULL (never derived from Income or Cost)",
          "commercial_reference / source_counterparty_text: no reference/counterparty column exists in this sheet ⇒ left NULL",
          "fm_work_id / fm_work_instruction_id resolved from the EXISTING governed fm_migration_provenance for this exact source row — never recomputed",
          "Cost column (execution cost) is explicitly NOT read here — it already lives in fm_cost_records via the prior FM cost import",
        ],
      });
    }
  }

  // ---- Population 2: Monthly Payment Paid rows -------------------------------------------------------------
  {
    const sheetName = "2026 Monthly Payment";
    const sheet = sheetByName(mbora, sheetName);
    for (const [row, m] of sheet.rows) {
      const a = m.get("A")?.value;
      if (!a || !/^\d+$/.test(String(a))) continue;
      const status = cellText(sheet, row, "F");
      if (status !== "Paid") continue;

      const description = cellText(sheet, row, "B");
      if (!description) throw new Error(`${sheetName} row ${row}: Paid but no Description`);
      const paydateRaw = cellText(sheet, row, "D");
      const paydate = paydateRaw ? parsePaymentDatetime(paydateRaw) : null;
      if (paydate && paydate.status !== "exact") {
        skipped.push({ population: "2", sheet: sheetName, row, reason: `SOURCE_FACT_AMBIGUOUS payment datetime: "${paydateRaw}" (${paydate.rule})` });
        continue;
      }
      const requested = cellNumber(sheet, row, "C");
      const income = cellNumber(sheet, row, "E");

      plans.push({
        id: importedId(mboraSha, sheetName, row, TARGET_TABLE),
        population: "2_monthly_payment_paid",
        workbook: "MBORA", workbookSha256: mboraSha, sheet: sheetName, row,
        fingerprint: rowFingerprint(sheet, row),
        description,
        submittedAmount: requested, authorisedAmount: null,
        amountReceived: income,
        sourcePaymentStatus: status,
        paymentDatetime: paydate?.iso ?? null,
        paymentDatetimeSourceText: paydateRaw,
        commercialReference: null, sourceCounterpartyText: null,
        fmWorkCode: null, fmWorkId: null, fmWorkInstructionId: null, // contract-level: no Work/Cost equivalent (per cutover register D-group)
        sourceReferenceNote: `${sheetName} S/N ${a}`,
        transformations: [
          `Status = "Paid" ⇒ source_payment_status = "Paid"`,
          requested != null ? `Requested ⇒ submitted_amount = ${requested.toFixed(2)} NGN` : "Requested absent ⇒ submitted_amount left NULL",
          income != null ? `Income (as per payment advice) ⇒ amount_received = ${income.toFixed(2)} NGN` : "Income absent ⇒ amount_received left NULL",
          paydateRaw ? `Time and Date of Payment ⇒ payment_datetime = ${paydate?.iso} (parsed), payment_datetime_source_text = "${paydateRaw}" (raw, verbatim)` : "no payment datetime recorded ⇒ left NULL",
          "authorised_amount: not separately evidenced ⇒ left NULL",
          "No fm_work_id / fm_work_instruction_id: this is a contract-level recurring instalment with no Work/Cost equivalent in FM (same treatment as the cutover register's open Monthly Payment candidates)",
          "'Difference' column (G) is a computed/derived cell in the source sheet — never read",
        ],
      });
    }
  }

  // ---- Population 3: cutover-register open candidates (already forensically reconciled) --------------------
  type OpenCandidate = {
    label: string; workbook: "MBORA" | "LETTERS"; sheet: string; row: number;
    description: string; submitted: number | null; authorised: number | null;
    sourceStatus: string; commercialRef: string; workCode: string | null;
    note: string;
  };
  const OPEN_CANDIDATES: OpenCandidate[] = [
    { label: "A2", workbook: "LETTERS", sheet: "Inventory", row: 179, description: "Award of Contract for the connection of Digital Park building to the main building powerhouse of the Annex Office, Mbora", submitted: 68017443, authorised: null, sourceStatus: "Pending", commercialRef: "TRV177", workCode: "WRK-2026-000058", note: "Payment Request TRV177 (13 Jul 2026). Award TRV056 (27 Jan 2026) → Acceptance TRV064 (3 Feb 2026) precede it; no authorised amount separately stated." },
    { label: "A3", workbook: "LETTERS", sheet: "Pending Payments", row: 3, description: "Provision of Additional 5 (Five) Tables and 18 (Eighteen) Chairs in the Canteen at the Commission's Annex Office, Mbora", submitted: 9069775, authorised: null, sourceStatus: "Pending", commercialRef: "Pending Payment #1 (Invoice 0048)", workCode: "WRK-2026-000080", note: "Pending Payments row 3; open as of 1 Sep 2026 per the sheet's own Update text." },
    { label: "A4", workbook: "LETTERS", sheet: "Pending Payments", row: 4, description: "Installation of New Socket Outlets and Repainting Office Spaces within the Kitchen Area at the Commission's Annex Office, Mbora", submitted: 990128.75, authorised: null, sourceStatus: "Pending", commercialRef: "Pending Payment #2 (Invoice 0198)", workCode: "WRK-2026-000091", note: "Pending Payments row 4." },
    { label: "A5", workbook: "LETTERS", sheet: "Inventory", row: 152, description: "Urgent repair of the leaking roof at the Digital Park, Commission's Annex Office, Mbora", submitted: 1856159.5, authorised: 1856159.5, sourceStatus: "Pending", commercialRef: "TRV150", workCode: "WRK-2026-000092", note: "Approval TRV150 (11 Jun 2026) → Acceptance TRV164 (24 Jun 2026) confirms at the same figure." },
    { label: "A6", workbook: "LETTERS", sheet: "Pending Payments", row: 7, description: "Upgrade of the Security Shade at the Commission's Annex Office, Mbora", submitted: 3374683, authorised: null, sourceStatus: "Pending", commercialRef: "Pending Payment #5 (Invoice 0150)", workCode: "WRK-2026-000096", note: "Pending Payments row 7." },
    { label: "A9", workbook: "LETTERS", sheet: "Inventory", row: 200, description: "Treatment of Expansion Joint at the Commission's Annex Office, Mbora", submitted: 35002624, authorised: 35002624, sourceStatus: "Pending", commercialRef: "TRV197", workCode: "WRK-2026-000101", note: "Approval TRV197 (29 Jul 2026) → Acceptance TRV219 (28 Aug 2026) confirms at the same figure." },
    { label: "A10", workbook: "LETTERS", sheet: "Inventory", row: 206, description: "Installation of additional Electric Socket Outlets on 5th Floor Wing A (USPF), Commission's Annex Office, Mbora", submitted: 1320917, authorised: 1320917, sourceStatus: "Pending", commercialRef: "TRV203", workCode: "WRK-2026-000102", note: "Approval TRV203 (6 Aug 2026) → Acceptance TRV221 (3 Sep 2026) confirms at the same figure." },
    { label: "A11", workbook: "LETTERS", sheet: "Pending Payments", row: 5, description: "Evacuation of Sewage/Drainage of Sludge and maintenance of the UPS (Lift A) at the Commission's Annex Office, Mbora", submitted: 641103.13, authorised: null, sourceStatus: "Pending", commercialRef: "Pending Payment #3 (Invoice 0146)", workCode: "WRK-2026-000113", note: "Pending Payments row 5." },
    { label: "D1", workbook: "LETTERS", sheet: "Inventory", row: 232, description: "Request for Monthly Instalment Payment on the contract for the provision of Facility Management and Maintenance works and CRECHE Management — September 2026", submitted: 26662344.42, authorised: null, sourceStatus: "Requested (no Status recorded on the Monthly Payment sheet row)", commercialRef: "TRV227", workCode: null, note: "Contract-level recurring billing; no Work/Cost equivalent. = Monthly Payment sheet row 9 (Requested only) = Pending Payments #7." },
    { label: "D2", workbook: "MBORA", sheet: "2026 Monthly Payment", row: 11, description: "Request for Monthly Instalment Payment on the Contract for the Provision of Facility Management and Maintenance Works — October 2026", submitted: 26662344.42, authorised: null, sourceStatus: "Not recorded (wholly prospective as of source snapshot)", commercialRef: "", workCode: null, note: "Contract-level recurring billing; no correspondence reference found yet." },
    { label: "D3a", workbook: "LETTERS", sheet: "Inventory", row: 222, description: "Request for Monthly Instalment Payment on the Contract for Management of the Commission's CRECHE (Annex Office, Mbora) — January to August 2026", submitted: 15466672, authorised: null, sourceStatus: "Requested", commercialRef: "TRV218", workCode: null, note: "Contract-level recurring billing; no Work/Cost equivalent. Distinct source fact from D3b — the source does not state whether these two CRECHE requests are duplicates, corrections, or genuinely separate claims; both are preserved as independently evidenced facts without resolving that relationship." },
    { label: "D3b", workbook: "LETTERS", sheet: "Pending Payments", row: 10, description: "Request for Monthly Instalment Payment on the Contract for Management of the Commission's CRECHE (Annex Office, Mbora) — April to August 2026", submitted: 9666670, authorised: null, sourceStatus: "JUST Requested", commercialRef: "Pending Payment #8 (Invoice 0154)", workCode: null, note: "Contract-level recurring billing; see D3a note on the unresolved relationship between the two CRECHE requests." },
    { label: "E1", workbook: "LETTERS", sheet: "Inventory", row: 235, description: "Office Space Relocation and Reallocation at the NCC Annex Office, Mbora", submitted: 16476525, authorised: 16476525, sourceStatus: "Pending", commercialRef: "TRV230", workCode: null, note: "Payment Request TRV230 (16 Sep 2026); Approval TRV191 (23 Jul 2026) / RE-Approval TRV211 (20 Aug 2026) independently confirm the same authorised figure. No confident order-register Work match was established — no fm_work_id link." },
  ];

  for (const c of OPEN_CANDIDATES) {
    const book = c.workbook === "MBORA" ? mbora : letters;
    const sha = c.workbook === "MBORA" ? mboraSha : lettersSha;
    const sheet = sheetByName(book, c.sheet);
    const col = c.sheet === "Inventory" ? "E" : c.sheet === "2026 Monthly Payment" ? "C" : "E";
    const liveAmount = cellNumber(sheet, c.row, col);
    if (c.submitted != null && (liveAmount == null || Math.abs(liveAmount - c.submitted) > 0.01)) {
      throw new Error(`INTEGRITY CHECK FAILED for ${c.label}: expected ${c.submitted} at ${c.workbook}/${c.sheet} row ${c.row} col ${col}, live cell reads ${liveAmount}`);
    }
    plans.push({
      id: importedId(sha, c.sheet, c.row, TARGET_TABLE),
      population: "3_cutover_register_open",
      workbook: c.workbook, workbookSha256: sha, sheet: c.sheet, row: c.row,
      fingerprint: rowFingerprint(sheet, c.row),
      description: c.description,
      submittedAmount: c.submitted, authorisedAmount: c.authorised, amountReceived: null,
      sourcePaymentStatus: c.sourceStatus || null,
      paymentDatetime: null, paymentDatetimeSourceText: null,
      commercialReference: c.commercialRef || null, sourceCounterpartyText: null,
      fmWorkCode: c.workCode, fmWorkId: null, fmWorkInstructionId: null,
      sourceReferenceNote: `${c.label}: ${c.commercialRef || c.sheet + " #" + c.row}`,
      transformations: [
        `Re-verified against the reconciled FM Reporting Cutover Register (candidate ${c.label}); cell value independently re-read and matched exactly at import time`,
        c.submitted != null ? `submitted_amount = ${c.submitted.toFixed(2)} NGN` : "submitted_amount not evidenced ⇒ NULL",
        c.authorised != null ? `authorised_amount = ${c.authorised.toFixed(2)} NGN (independently confirmed, not derived from submitted)` : "authorised_amount not separately evidenced ⇒ NULL",
        "amount_received: not evidenced (this candidate is OPEN, not settled) ⇒ NULL",
        "payment_datetime: not applicable (open, unpaid) ⇒ NULL",
        c.workCode ? `fm_work_id resolved by code lookup (${c.workCode}) — the SAME governed Work already established by the FM Work migration, never recomputed` : "no fm_work_id: no Work/Cost equivalent exists for this commercial fact (contract-level billing or no confident match)",
        c.note,
      ],
    });
  }

  // ---- Resolve fm_work_id / fm_work_instruction_id ----------------------------------------------------------
  // Population 1: from EXISTING governed provenance for the exact source row.
  const p1Rows = plans.filter((p) => p.population === "1_order_register_paid");
  if (p1Rows.length) {
    const { data: workProv } = await admin.from("fm_migration_provenance").select("source_sheet, source_row, target_id")
      .eq("organisation_id", organisationId).eq("workbook", "MBORA").eq("target_table", "fm_work").in("source_sheet", [...ORDER_SHEETS]);
    const workByRow = new Map(
      (workProv ?? []).map((r) => {
        const row = r as { source_sheet: string; source_row: number; target_id: string };
        return [`${row.source_sheet}#${row.source_row}`, String(row.target_id)];
      })
    );
    for (const p of p1Rows) {
      p.fmWorkId = workByRow.get(`${p.sheet}#${p.row}`) ?? null;
      if (!p.fmWorkId) continue;
      const { data: wiRows } = await admin.from("fm_work_instructions").select("id").eq("organisation_id", organisationId).eq("work_id", p.fmWorkId);
      if ((wiRows ?? []).length === 1) p.fmWorkInstructionId = String((wiRows![0] as { id: string }).id);
    }
  }
  // Population 3 (Group A items only): by governed Work CODE lookup.
  const codesNeeded = [...new Set(plans.filter((p) => p.fmWorkCode).map((p) => p.fmWorkCode!))];
  if (codesNeeded.length) {
    const { data: workRows } = await admin.from("fm_work").select("id, code").eq("organisation_id", organisationId).in("code", codesNeeded);
    const idByCode = new Map(
      (workRows ?? []).map((r) => {
        const row = r as { code: string; id: string };
        return [String(row.code), String(row.id)];
      })
    );
    for (const p of plans) {
      if (!p.fmWorkCode) continue;
      const workId = idByCode.get(p.fmWorkCode);
      if (!workId) throw new Error(`${p.sourceReferenceNote}: FM Work code ${p.fmWorkCode} not found — refusing to guess`);
      p.fmWorkId = workId;
      const { data: wiRows } = await admin.from("fm_work_instructions").select("id").eq("organisation_id", organisationId).eq("work_id", workId);
      if ((wiRows ?? []).length === 1) p.fmWorkInstructionId = String((wiRows![0] as { id: string }).id);
    }
  }

  // ---- Report ---------------------------------------------------------------------------------------------
  const byPop = (pop: FactPlan["population"]) => plans.filter((p) => p.population === pop);
  const p1 = byPop("1_order_register_paid"), p2 = byPop("2_monthly_payment_paid"), p3 = byPop("3_cutover_register_open");
  const withWork = plans.filter((p) => p.fmWorkId).length;
  const withDatetime = plans.filter((p) => p.paymentDatetime).length;
  const withSubmittedOrAuthorised = plans.filter((p) => p.submittedAmount != null || p.authorisedAmount != null).length;
  const withReceived = plans.filter((p) => p.amountReceived != null).length;

  console.log(JSON.stringify({
    mode: apply ? "APPLY" : "DRY-RUN (no writes)",
    totalPlanned: plans.length,
    population1_order_register_paid: p1.length,
    population2_monthly_payment_paid: p2.length,
    population3_cutover_register_open: p3.length,
    skippedAmbiguousDatetime: skipped.length,
    certainFmWorkLinks: withWork,
    withPaymentDatetime: withDatetime,
    withSubmittedOrAuthorisedAmount: withSubmittedOrAuthorised,
    withAmountReceived: withReceived,
    mboraSha256: mboraSha, lettersSha256: lettersSha,
  }, null, 2));

  if (skipped.length) {
    console.log("\nSKIPPED (ambiguous payment datetime — recorded here, not silently dropped):");
    for (const s of skipped) console.log(`  ${s.sheet} row ${s.row}: ${s.reason}`);
  }

  console.log("\n--- Population 1 sample (first 3) ---");
  for (const r of p1.slice(0, 3)) console.log(`  ${r.sheet} r${r.row} received=${r.amountReceived} paid@${r.paymentDatetime} work=${r.fmWorkId ? "linked" : "NONE"} "${r.description.slice(0, 50)}"`);
  console.log("\n--- Population 2 (all, Monthly Payment) ---");
  for (const r of p2) console.log(`  r${r.row} submitted=${r.submittedAmount} received=${r.amountReceived} paid@${r.paymentDatetime} "${r.description.slice(0, 60)}"`);
  console.log("\n--- Population 3 (all, open cutover-register candidates) ---");
  for (const r of p3) console.log(`  ${r.sourceReferenceNote} submitted=${r.submittedAmount} authorised=${r.authorisedAmount} work=${r.fmWorkId ? "linked" : "NONE"} "${r.description.slice(0, 50)}"`);

  // Duplicate/idempotency check
  const { data: existing } = await admin.from(TARGET_TABLE).select("id").eq("organisation_id", organisationId).in("id", plans.map((p) => p.id));
  const already = new Set((existing ?? []).map((r) => String((r as { id: string }).id)));
  console.log(`\nIdempotency: ${already.size} of ${plans.length} already exist; ${plans.length - already.size} to create.`);

  if (!apply) {
    console.log("\nDRY-RUN complete. Nothing was written.");
    return;
  }

  let { data: batch } = await admin.from("fm_migration_batches").select("id").eq("organisation_id", organisationId).eq("batch_key", BATCH_KEY).maybeSingle();
  if (!batch) {
    const ins = await admin.from("fm_migration_batches").insert({
      organisation_id: organisationId, batch_key: BATCH_KEY, rules_version: RULES_VERSION,
      sources: [{ workbook: "MBORA", file: MBORA_FILE, sha256: mboraSha }, { workbook: "LETTERS", file: LETTERS_FILE, sha256: lettersSha }],
    }).select("id").single();
    if (ins.error) throw new Error(`batch insert: ${ins.error.message}`);
    batch = ins.data;
  }
  const batchId = String((batch as { id: string }).id);

  const { data: codeRows } = await admin.from(TARGET_TABLE).select("code").eq("organisation_id", organisationId);
  const { generateNextHistoricalFactCode } = await import("../src/modules/platform-finance/domain/historicalCommercialFacts");
  let latestCode: string | null = (codeRows ?? []).map((r) => String((r as { code: string }).code)).sort().at(-1) ?? null;

  let created = 0;
  for (const p of plans) {
    if (already.has(p.id)) continue;
    const code = generateNextHistoricalFactCode(latestCode);
    latestCode = code;
    const ins = await admin.from(TARGET_TABLE).insert({
      id: p.id, organisation_id: organisationId, code, description: p.description,
      submitted_amount: p.submittedAmount, authorised_amount: p.authorisedAmount, amount_received: p.amountReceived,
      currency: "NGN", source_payment_status: p.sourcePaymentStatus,
      payment_datetime: p.paymentDatetime, payment_datetime_source_text: p.paymentDatetimeSourceText,
      commercial_reference: p.commercialReference, source_counterparty_text: p.sourceCounterpartyText,
      fm_work_id: p.fmWorkId, fm_work_instruction_id: p.fmWorkInstructionId,
      created_by_profile_id: null, updated_by_profile_id: null,
    });
    if (ins.error) throw new Error(`insert failed (${p.sourceReferenceNote}): ${ins.error.message}`);

    const { data: haveProv } = await admin.from("fm_migration_provenance").select("id").eq("organisation_id", organisationId).eq("target_table", TARGET_TABLE).eq("target_id", p.id).maybeSingle();
    if (!haveProv) {
      const provIns = await admin.from("fm_migration_provenance").insert({
        organisation_id: organisationId, batch_id: batchId, workbook: p.workbook, workbook_sha256: p.workbookSha256,
        source_sheet: p.sheet, source_row: p.row, source_reference: p.sourceReferenceNote, fingerprint: p.fingerprint,
        target_table: TARGET_TABLE, target_id: p.id, classification: "TRANSFORM_IMPORT",
        transformations: p.transformations,
      });
      if (provIns.error) throw new Error(`provenance insert failed (${p.sourceReferenceNote}): ${provIns.error.message}`);
    }
    created += 1;
  }
  console.log(`\nAPPLIED. Created ${created} historical commercial fact(s) this run (${plans.length - created} already existed).`);
}
main().catch((e) => { console.error("FAIL", e instanceof Error ? e.message : e); process.exit(1); });
