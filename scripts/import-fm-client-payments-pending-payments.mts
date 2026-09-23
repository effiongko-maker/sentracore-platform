/**
 * FM Client Payments — import the live "Pending Payments" register ("2026 LETTERS" workbook, "Pending Payments"
 * sheet) as submitted FM Client Payments (fm_cost_submissions): payment requests and contract instalments awaiting
 * receipt from the client. FM-only: nothing outside FM is read or written.
 *
 * Read ONLY: S/N, PENDING PAYMENT REQUEST, INVOICE NUMBER, SUBMISSIONS DATE, AMOUNT, LOCATION, UPDATE (+ the sheet's
 * own TOTAL row as a cross-check). Never any other sheet.
 * NEVER set / create: costs (items), Approvals, reimbursement authorizations, receipts, Work links, due dates,
 * facility, or any actor (submitted_by / created_by stay NULL — provenance-backed).
 *
 *   NODE_PATH=<dir with empty server-only/> npx tsx --tsconfig tsconfig.json scripts/import-fm-client-payments-pending-payments.mts
 *       # DRY-RUN (default): parse, reconcile, plan — writes nothing
 *   ... --apply   # only if every gate passes; idempotent (safe to re-run)
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readWorkbook, sheetByName, type Sheet } from "./fm-migration/xlsx";
import { sha256File, sha256Text, importedId } from "./fm-migration/ids";
import { serialToIso } from "./fm-migration/dates";

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

const SOURCE_FILE = "2026 LETTERS (4).xlsx";
const WORKBOOK = "LETTERS";
const SHEET = "Pending Payments";
const BATCH_KEY = "fm-client-payments-pending-payments-1";
const RULES_VERSION = "fm-client-payments-pending-payments/1";
const HEADER_ROW = 2;
const EXPECTED_HEADERS: Record<string, string> = {
  A: "S/N", B: "PENDING PAYMENT REQUEST", C: "INVOICE NUMBER", D: "SUBMISSIONS DATE", E: "AMOUNT", F: "LOCATION", G: "UPDATE",
};
const EXPECTED = { rows: 8, paymentRequests: 6, instalments: 2, totalKobo: 6_764_440_405 } as const;

const kobo = (n: number) => Math.round(n * 100);
const naira = (k: number) => (k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function rowFingerprint(sheet: Sheet, row: number): string {
  const cells = [...(sheet.rows.get(row)?.values() ?? [])].sort((a, b) => a.col.localeCompare(b.col, "en", { numeric: true }));
  return sha256Text(JSON.stringify(cells.map((c) => [c.col, c.value, c.formula])));
}
/** The period the source itself states at the end of an instalment description ("… - September 2026",
 *  "… - April - August 2026"). Returns null when none is stated — never inferred. */
function statedPeriod(description: string): string | null {
  const m = /[-–—]\s*((?:[A-Za-z]+\s*[-–—]\s*)?[A-Za-z]+\s+\d{4})\s*$/.exec(description.trim());
  return m ? m[1]!.replace(/\s*[-–—]\s*/g, " – ") : null;
}

type Planned = {
  sourceRow: number; sn: number; id: string; fingerprint: string;
  kind: "payment_request" | "contract_instalment";
  description: string; reference: string; submittedOn: string; amountKobo: number;
  periodLabel: string | null; clientLocation: string | null; sourceNote: string | null; transforms: string[];
};

async function main() {
  loadEnvLocal();
  const apply = process.argv.includes("--apply");
  const source = arg("source") ?? resolve(process.env.HOME ?? "", "Developer/sentracore-migration-source");
  const file = resolve(source, SOURCE_FILE);
  const sha = sha256File(file);
  const sheet = sheetByName(readWorkbook(file), SHEET);

  // ---- 1. Strict parse. ------------------------------------------------------------------------------------------
  for (const [col, header] of Object.entries(EXPECTED_HEADERS)) {
    const got = String(sheet.rows.get(HEADER_ROW)?.get(col)?.value ?? "").trim();
    if (got !== header) throw new Error(`header ${col}${HEADER_ROW}: expected "${header}", found "${got}"`);
  }
  const todayIso = new Date().toISOString().slice(0, 10);
  const plan: Planned[] = [];
  let sheetTotalKobo: number | null = null;
  for (const row of [...sheet.rows.keys()].filter((r) => r > HEADER_ROW).sort((a, b) => a - b)) {
    const cells = sheet.rows.get(row)!;
    const text = (col: string) => { const v = cells.get(col)?.value; return v == null || String(v).trim() === "" ? null : String(v); };
    if (![...cells.values()].some((c) => c.value != null && String(c.value).trim() !== "")) continue;
    if (!text("A") && text("B")?.trim().toUpperCase() === "TOTAL") { sheetTotalKobo = kobo(Number(text("E"))); continue; }
    const sn = Number(text("A"));
    if (!Number.isInteger(sn) || sn < 1) throw new Error(`row ${row}: S/N "${text("A") ?? ""}" is not a positive integer`);
    const description = text("B")?.trim();
    if (!description) throw new Error(`row ${row}: no request text`);
    const inv = cells.get("C");
    if (!inv?.value || inv.kind !== "string") throw new Error(`row ${row}: invoice number must be a text cell (leading zeros preserved)`);
    const serial = Number(text("D"));
    if (!Number.isInteger(serial) || serial < 1) throw new Error(`row ${row}: submission date is not a date serial`);
    const submittedOn = serialToIso(serial);
    if (submittedOn > todayIso) throw new Error(`row ${row}: submission date ${submittedOn} is in the future`);
    const amount = Number(text("E"));
    if (!Number.isFinite(amount) || amount <= 0 || Math.abs(amount * 100 - kobo(amount)) > 1e-6) throw new Error(`row ${row}: amount "${text("E")}" is not a positive 2dp number`);
    const transforms: string[] = [];
    const upd = cells.get("G");
    let sourceNote: string | null = null;
    if (upd?.value != null && String(upd.value).trim() !== "") {
      if (upd.kind === "string") sourceNote = String(upd.value);
      else if (upd.kind === "number" && upd.dateFormatted) {
        sourceNote = serialToIso(Number(upd.value));
        transforms.push(`UPDATE is a date cell (serial ${upd.value}) ⇒ source_note = "${sourceNote}"`);
      } else throw new Error(`row ${row}: UPDATE is a non-date ${upd.kind} cell — refusing to guess its meaning`);
    }
    // The source's own wording decides the type — never inferred from amount or anything else.
    const kind = /^Request for Monthly Instalment Payment/i.test(description)
      ? "contract_instalment"
      : /^Payment Request\b/i.test(description) ? "payment_request" : null;
    if (!kind) throw new Error(`row ${row}: request text is neither a "Payment Request" nor a "Request for Monthly Instalment Payment"`);
    const periodLabel = kind === "contract_instalment" ? statedPeriod(description) : null;
    if (kind === "contract_instalment") {
      if (!periodLabel) throw new Error(`row ${row}: contract instalment states no period`);
      transforms.push(`period_label "${periodLabel}" = the period stated at the end of the request text`);
    }
    plan.push({
      sourceRow: row, sn, id: importedId(sha, SHEET, row, "fm_cost_submissions"), fingerprint: rowFingerprint(sheet, row),
      kind, description, reference: String(inv.value), submittedOn, amountKobo: kobo(amount), periodLabel,
      clientLocation: text("F"), sourceNote, transforms,
    });
  }

  // ---- 2. Hard reconciliation gate. ------------------------------------------------------------------------------
  const totalKobo = plan.reduce((s, p) => s + p.amountKobo, 0);
  const sns = plan.map((p) => p.sn).sort((a, b) => a - b);
  const checks: Array<[string, boolean, string]> = [
    ["rows = 8", plan.length === EXPECTED.rows, String(plan.length)],
    ["S/N 1..8, each once", sns.length === 8 && sns.every((n, i) => n === i + 1), sns.join(",")],
    ["payment requests = 6", plan.filter((p) => p.kind === "payment_request").length === EXPECTED.paymentRequests, String(plan.filter((p) => p.kind === "payment_request").length)],
    ["contract instalments = 2", plan.filter((p) => p.kind === "contract_instalment").length === EXPECTED.instalments, String(plan.filter((p) => p.kind === "contract_instalment").length)],
    ["total = NGN 67,644,404.05", totalKobo === EXPECTED.totalKobo, `NGN ${naira(totalKobo)}`],
    ["sheet's own TOTAL row agrees", sheetTotalKobo === totalKobo, sheetTotalKobo == null ? "missing" : `NGN ${naira(sheetTotalKobo)}`],
    ["all submitted, awaiting receipt", true, "status submitted; 0 receipts written"],
    ["no costs / Approvals / authorizations / Work / due dates / actors", true, "none are written by this importer"],
    ["distinct deterministic ids", new Set(plan.map((p) => p.id)).size === plan.length, ""],
  ];
  console.log(JSON.stringify({ mode: apply ? "APPLY" : "DRY-RUN (no writes)", workbook: SOURCE_FILE, sheet: SHEET, workbookSha256: sha }, null, 2));
  console.log("\nPlan:");
  for (const p of plan) {
    console.log(`  S/N ${p.sn}  row ${p.sourceRow}  ${p.kind.padEnd(19)}  ref ${p.reference}  ${p.submittedOn}  NGN ${naira(p.amountKobo).padStart(14)}  loc "${p.clientLocation ?? ""}"${p.periodLabel ? `  period "${p.periodLabel}"` : ""}`);
    console.log(`        "${p.description.slice(0, 88)}${p.description.length > 88 ? "…" : ""}"  note: ${p.sourceNote ? `"${p.sourceNote.slice(0, 60)}${p.sourceNote.length > 60 ? "…" : ""}"` : "—"}`);
  }
  console.log("\nReconciliation:");
  for (const [label, ok, detail] of checks) console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
  if (checks.some(([, ok]) => !ok)) { console.error("\nRECONCILIATION FAILED. Nothing was written."); process.exit(2); }

  // ---- 3. Target state (read-only, FM tables only). ----------------------------------------------------------------
  const { createAdminClient } = await import("../src/utils/supabase/admin");
  const admin = createAdminClient();
  const { data: orgs } = await admin.from("organisations").select("id").eq("status", "active");
  if ((orgs ?? []).length !== 1) throw new Error("expected exactly one active organisation");
  const organisationId = String((orgs![0] as { id: string }).id);
  const ids = plan.map((p) => p.id);
  const { data: existingRows, error: exErr } = await admin.from("fm_cost_submissions").select("id").in("id", ids);
  if (exErr) throw new Error(`lookup failed: ${exErr.message}`);
  const existing = new Set((existingRows ?? []).map((r) => String((r as { id: string }).id)));
  const { data: provRows } = await admin.from("fm_migration_provenance").select("target_id").eq("organisation_id", organisationId).eq("target_table", "fm_cost_submissions").in("target_id", ids);
  const haveProv = new Set((provRows ?? []).map((r) => String((r as { target_id: string }).target_id)));
  const schema = await admin.from("fm_cost_submissions").select("source_note").limit(1);
  console.log(`\nSchema (client payment columns present): ${schema.error ? `NO — apply migration 20260923130000 first (${schema.error.message})` : "yes"}`);
  console.log(`Conflict check: ${existing.size} of ${plan.length} client payments already exist; provenance present for ${haveProv.size}.`);
  if (!apply) { console.log("\nDRY-RUN complete. Nothing was written."); return; }
  if (schema.error) throw new Error("schema migration not applied — refusing to write");

  // ---- 4. APPLY: batch → provenance (one statement) → client payments (one statement). ----------------------------
  let { data: batch } = await admin.from("fm_migration_batches").select("id").eq("organisation_id", organisationId).eq("batch_key", BATCH_KEY).maybeSingle();
  if (!batch) {
    const ins = await admin.from("fm_migration_batches").insert({
      organisation_id: organisationId, batch_key: BATCH_KEY, rules_version: RULES_VERSION,
      sources: [{ workbook: WORKBOOK, file: SOURCE_FILE, sha256: sha }],
    }).select("id").single();
    if (ins.error) throw new Error(`batch insert: ${ins.error.message}`);
    batch = ins.data;
  }
  const batchId = String((batch as { id: string }).id);
  const provToInsert = plan.filter((p) => !haveProv.has(p.id)).map((p) => ({
    organisation_id: organisationId, batch_id: batchId, workbook: WORKBOOK, workbook_sha256: sha,
    source_sheet: SHEET, source_row: p.sourceRow, source_reference: `Pending Payment #${p.sn} (Invoice ${p.reference})`,
    fingerprint: p.fingerprint, target_table: "fm_cost_submissions", target_id: p.id,
    classification: p.transforms.length ? "TRANSFORM_IMPORT" : "IMPORT",
    transformations: [
      `FM Client Payment (${p.kind}), status submitted — awaiting receipt; no receipt recorded`,
      `AMOUNT ⇒ claim_amount (requested) = ${(p.amountKobo / 100).toFixed(2)} NGN; INVOICE NUMBER ⇒ package_reference "${p.reference}" (verbatim)`,
      `SUBMISSIONS DATE serial ⇒ submitted_at = ${p.submittedOn} 00:00 Africa/Lagos (date-only source); submitted_by NULL (not stated)`,
      `PENDING PAYMENT REQUEST ⇒ description (verbatim); LOCATION ⇒ client_location; UPDATE ⇒ source_note (verbatim text)`,
      ...p.transforms,
      "No costs, Approval, reimbursement authorization, Work link, due date, facility or actor — none established by the source",
    ],
  }));
  if (provToInsert.length) {
    const r = await admin.from("fm_migration_provenance").insert(provToInsert);
    if (r.error) throw new Error(`provenance insert failed: ${r.error.message}`);
  }
  const { generateNextSubmissionCode } = await import("../src/modules/finance/server/fmCostDomain");
  const year = new Date().getUTCFullYear();
  const { data: codeRows, error: codeErr } = await admin.from("fm_cost_submissions").select("code").eq("organisation_id", organisationId).ilike("code", `SUB-${year}-%`).order("code", { ascending: false }).limit(1);
  if (codeErr) throw new Error(`code lookup failed: ${codeErr.message}`);
  let latest: string | null = ((codeRows ?? [])[0] as { code?: string } | undefined)?.code ?? null;
  const toInsert = plan.filter((p) => !existing.has(p.id)).map((p) => {
    const code = generateNextSubmissionCode(latest);
    latest = code;
    return {
      id: p.id, organisation_id: organisationId, code, status: "submitted", submission_kind: p.kind, currency: "NGN",
      claim_amount: p.amountKobo / 100, description: p.description, period_label: p.periodLabel,
      package_reference: p.reference, client_location: p.clientLocation, source_note: p.sourceNote,
      submitted_at: `${p.submittedOn}T00:00:00+01:00`,
      // Not established by the source — never fabricated:
      submitted_by_profile_id: null, created_by_profile_id: null, updated_by_profile_id: null,
      facility_id: null, department_id: null, approval_id: null, markup_amount: null, markup_rate_percent: null, no_markup: null,
    };
  });
  if (toInsert.length) {
    const r = await admin.from("fm_cost_submissions").insert(toInsert);
    if (r.error) throw new Error(`client payment insert failed (provenance recorded; re-run completes it): ${r.error.message}`);
  }
  console.log(`\nAPPLIED. Provenance created: ${provToInsert.length}. Client payments created: ${toInsert.length} (${plan.length - toInsert.length} already existed).`);

  // ---- 5. Post-import verification. -------------------------------------------------------------------------------
  const { data: after } = await admin.from("fm_cost_submissions")
    .select("id,status,submission_kind,claim_amount,package_reference,submitted_at,submitted_by_profile_id,approval_id,source_note,client_location,period_label").in("id", ids);
  const rows = (after ?? []) as Array<Record<string, unknown>>;
  const byId = new Map(rows.map((r) => [String(r.id), r]));
  const count = async (table: string, col: string) => (await admin.from(table).select("id", { count: "exact", head: true }).in(col, ids)).count ?? -1;
  const [items, auths, receipts, prov] = await Promise.all([
    count("fm_cost_submission_items", "submission_id"), count("fm_reimbursement_authorizations", "submission_id"),
    count("fm_reimbursement_payments", "submission_id"),
    admin.from("fm_migration_provenance").select("id", { count: "exact", head: true }).eq("target_table", "fm_cost_submissions").in("target_id", ids).then((r) => r.count ?? -1),
  ]);
  const sum = rows.reduce((s, r) => s + kobo(Number(r.claim_amount)), 0);
  const post: Array<[string, boolean, string]> = [
    ["imported client payments = 8", rows.length === 8, String(rows.length)],
    ["6 payment requests / 2 contract instalments", rows.filter((r) => r.submission_kind === "payment_request").length === 6 && rows.filter((r) => r.submission_kind === "contract_instalment").length === 2, ""],
    ["total requested = NGN 67,644,404.05", sum === EXPECTED.totalKobo, `NGN ${naira(sum)}`],
    ["all submitted", rows.every((r) => r.status === "submitted"), ""],
    ["awaiting receipt (0 receipts) ⇒ outstanding = requested", receipts === 0, `receipts ${receipts}`],
    ["no costs / authorizations / Approval links", items === 0 && auths === 0 && rows.every((r) => r.approval_id == null), `items ${items}, auths ${auths}`],
    ["no invented actor", rows.every((r) => r.submitted_by_profile_id == null), ""],
    ["source preserved (ref, date, location, note, period)", plan.every((p) => { const r = byId.get(p.id); return r?.package_reference === p.reference && Date.parse(String(r?.submitted_at)) === Date.parse(`${p.submittedOn}T00:00:00+01:00`) && (r?.client_location ?? null) === p.clientLocation && (r?.source_note ?? null) === p.sourceNote && (r?.period_label ?? null) === p.periodLabel; }), ""],
    ["provenance for all 8", prov === 8, String(prov)],
  ];
  console.log("\nPost-import verification:");
  for (const [label, ok, detail] of post) console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
  if (post.some(([, ok]) => !ok)) process.exit(3);
}
main().catch((e) => { console.error("FAIL", e instanceof Error ? e.message : e); process.exit(1); });
