/**
 * Platform Finance — import the LIVE NCC "Pending Payments" register ("2026 LETTERS" workbook, "Pending Payments"
 * sheet) as open, OFF-LEDGER client receivables (finance_receivables, origin client_request / contract_instalment).
 * These are amounts NCC currently owes PayChex; settlement uses the existing receipts + allocations.
 *
 * Read ONLY: S/N, PENDING PAYMENT REQUEST, INVOICE NUMBER, SUBMISSIONS DATE, AMOUNT, LOCATION, UPDATE (+ the
 * sheet's own TOTAL row, used only as a cross-check). NEVER read Inventory / Pending Approval / Pivot Table 2.
 * NEVER create: invoices, journals, receipts, allocations, payables, FM claims/authorisations, Work or Costs.
 * Historical-fact links are EXACTLY the business-confirmed set below — never inferred from text or amount.
 *
 * Counterparty: NCC (the client named by every row) is created once through the governed
 * organisation_counterparty_create RPC with --actor as the real recording profile (roles: customer).
 *
 *   NODE_PATH=<dir with empty server-only/> npx tsx --tsconfig tsconfig.json scripts/import-live-client-receivables.mts \
 *     --actor=<profile uuid>            # DRY-RUN (default): parse, reconcile, plan — writes nothing
 *   ... --actor=<profile uuid> --apply  # only if every gate passes; idempotent (safe to re-run)
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
const WORKBOOK = "LETTERS"; // same workbook label the historical-fact import used for this file
const SHEET = "Pending Payments";
const BATCH_KEY = "pf-live-client-receivables-pending-payments-1";
const RULES_VERSION = "pf-live-client-receivables/1";
const HEADER_ROW = 2;
const EXPECTED_HEADERS: Record<string, string> = {
  A: "S/N", B: "PENDING PAYMENT REQUEST", C: "INVOICE NUMBER", D: "SUBMISSIONS DATE", E: "AMOUNT", F: "LOCATION", G: "UPDATE",
};
const EXPECTED = { rows: 8, totalKobo: 6_764_440_405 } as const;
const COMPANY_NAME = "PayChex";
const COUNTERPARTY = "NCC";

// Business-confirmed historical-fact links (S/N → HIST code). S/N 4 and 6 are deliberately unlinked.
const FACT_LINKS: Record<number, string> = {
  1: "HIST-2026-000141", 2: "HIST-2026-000142", 3: "HIST-2026-000147",
  5: "HIST-2026-000144", 7: "HIST-2026-000148", 8: "HIST-2026-000151",
};

const kobo = (n: number) => Math.round(n * 100);
const naira = (k: number) => (k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function rowFingerprint(sheet: Sheet, row: number): string {
  const cells = [...(sheet.rows.get(row)?.values() ?? [])].sort((a, b) => a.col.localeCompare(b.col, "en", { numeric: true }));
  return sha256Text(JSON.stringify(cells.map((c) => [c.col, c.value, c.formula])));
}

type Planned = {
  sourceRow: number; sn: number; receivableId: string; fingerprint: string;
  description: string; clientReference: string; submittedOn: string; amountKobo: number;
  originType: "client_request" | "contract_instalment";
  sourceLocation: string | null; sourceUpdate: string | null; updateTransform: string | null;
  factCode: string | null;
};

async function main() {
  loadEnvLocal();
  const apply = process.argv.includes("--apply");
  const actor = arg("actor");
  if (!actor || !/^[0-9a-f-]{36}$/i.test(actor)) throw new Error("--actor=<profile uuid> is required (records who created the NCC counterparty)");
  const source = arg("source") ?? resolve(process.env.HOME ?? "", "Developer/sentracore-migration-source");
  const file = resolve(source, SOURCE_FILE);
  const sha = sha256File(file);
  const sheet = sheetByName(readWorkbook(file), SHEET);

  // ---- 1. Strict parse of the one sheet. -------------------------------------------------------------------------
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
    if (!text("A") && text("B")?.trim().toUpperCase() === "TOTAL") {
      sheetTotalKobo = kobo(Number(text("E")));
      continue;
    }
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
    const upd = cells.get("G");
    let sourceUpdate: string | null = null;
    let updateTransform: string | null = null;
    if (upd?.value != null && String(upd.value).trim() !== "") {
      if (upd.kind === "number" && upd.dateFormatted) {
        sourceUpdate = serialToIso(Number(upd.value));
        updateTransform = `UPDATE is a date cell (serial ${upd.value}) ⇒ source_update = "${sourceUpdate}"`;
      } else if (upd.kind === "string") {
        sourceUpdate = String(upd.value);
      } else {
        throw new Error(`row ${row}: UPDATE is a non-date ${upd.kind} cell — refusing to guess its meaning`);
      }
    }
    plan.push({
      sourceRow: row, sn, receivableId: importedId(sha, SHEET, row, "finance_receivables"),
      fingerprint: rowFingerprint(sheet, row), description, clientReference: String(inv.value),
      submittedOn, amountKobo: kobo(amount),
      // The source's own wording: "Request for Monthly Instalment Payment on the contract…" ⇒ contract instalment.
      originType: /^Request for Monthly Instalment Payment/i.test(description) ? "contract_instalment" : "client_request",
      sourceLocation: text("F"), sourceUpdate, updateTransform,
      factCode: FACT_LINKS[sn] ?? null,
    });
  }

  // ---- 2. Hard reconciliation gate (before any write). -----------------------------------------------------------
  const totalKobo = plan.reduce((s, p) => s + p.amountKobo, 0);
  const sns = plan.map((p) => p.sn).sort((a, b) => a - b);
  const checks: Array<[string, boolean, string]> = [
    ["rows = 8", plan.length === EXPECTED.rows, String(plan.length)],
    ["S/N 1..8, each once", sns.length === 8 && sns.every((n, i) => n === i + 1), sns.join(",")],
    ["amount-bearing rows = 8", plan.every((p) => p.amountKobo > 0), String(plan.filter((p) => p.amountKobo > 0).length)],
    ["total = NGN 67,644,404.05", totalKobo === EXPECTED.totalKobo, `NGN ${naira(totalKobo)}`],
    ["sheet's own TOTAL row agrees", sheetTotalKobo === totalKobo, sheetTotalKobo == null ? "missing" : `NGN ${naira(sheetTotalKobo)}`],
    ["distinct deterministic ids", new Set(plan.map((p) => p.receivableId)).size === plan.length, ""],
    ["supplier payables / invoices / FM claims / receipts to create = 0", true, "0 (this importer writes none of them)"],
  ];

  console.log(JSON.stringify({ mode: apply ? "APPLY" : "DRY-RUN (no writes)", workbook: SOURCE_FILE, sheet: SHEET, workbookSha256: sha }, null, 2));
  console.log("\nPlan:");
  for (const p of plan) {
    console.log(`  S/N ${p.sn}  row ${p.sourceRow}  ${p.submittedOn}  inv ${p.clientReference}  NGN ${naira(p.amountKobo).padStart(14)}  ${p.originType.padEnd(19)}  fact ${p.factCode ?? "— (unlinked)"}  loc "${p.sourceLocation ?? ""}"`);
    console.log(`        "${p.description.slice(0, 90)}${p.description.length > 90 ? "…" : ""}"  update: ${p.sourceUpdate ? `"${p.sourceUpdate.slice(0, 60)}${p.sourceUpdate.length > 60 ? "…" : ""}"` : "—"}`);
  }
  console.log("\nReconciliation:");
  for (const [label, ok, detail] of checks) console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
  if (checks.some(([, ok]) => !ok)) {
    console.error("\nRECONCILIATION FAILED. Nothing was written.");
    process.exit(2);
  }

  // ---- 3. Target state (read-only). -----------------------------------------------------------------------------
  const { createAdminClient } = await import("../src/utils/supabase/admin");
  const admin = createAdminClient();
  const { data: orgs } = await admin.from("organisations").select("id").eq("status", "active");
  if ((orgs ?? []).length !== 1) throw new Error("expected exactly one active organisation");
  const organisationId = String((orgs![0] as { id: string }).id);
  const { data: companies } = await admin.from("finance_companies").select("id,name").eq("organisation_id", organisationId).eq("name", COMPANY_NAME);
  if ((companies ?? []).length !== 1) throw new Error(`finance company "${COMPANY_NAME}" not uniquely resolved`);
  const companyId = String((companies![0] as { id: string }).id);

  const { data: facts, error: factErr } = await admin.from("platform_finance_historical_commercial_facts")
    .select("id,code,submitted_amount").eq("organisation_id", organisationId).in("code", Object.values(FACT_LINKS));
  if (factErr) throw new Error(`fact lookup: ${factErr.message}`);
  const factByCode = new Map((facts ?? []).map((f) => [String(f.code), f as { id: string; code: string; submitted_amount: number | null }]));
  for (const p of plan.filter((q) => q.factCode)) {
    const f = factByCode.get(p.factCode!);
    if (!f) throw new Error(`S/N ${p.sn}: linked fact ${p.factCode} not found`);
    if (f.submitted_amount == null || kobo(Number(f.submitted_amount)) !== p.amountKobo) {
      throw new Error(`S/N ${p.sn}: fact ${p.factCode} amount ${f.submitted_amount} ≠ source ${naira(p.amountKobo)} — refusing the link`);
    }
  }
  const { data: cps } = await admin.from("organisation_counterparties").select("id,status").eq("organisation_id", organisationId).eq("display_name", COUNTERPARTY);
  const existingCp = (cps ?? [])[0] as { id: string; status: string } | undefined;
  const ids = plan.map((p) => p.receivableId);
  const { data: existingRows, error: exErr } = await admin.from("finance_receivables").select("id").in("id", ids);
  if (exErr) throw new Error(`schema not ready or lookup failed: ${exErr.message}`);
  const existing = new Set((existingRows ?? []).map((r) => String((r as { id: string }).id)));
  const { data: provRows } = await admin.from("fm_migration_provenance").select("target_id").eq("organisation_id", organisationId).eq("target_table", "finance_receivables").in("target_id", ids);
  const haveProv = new Set((provRows ?? []).map((r) => String((r as { target_id: string }).target_id)));
  console.log(`\nCompany: ${COMPANY_NAME} (${companyId.slice(0, 8)}…). Counterparty "${COUNTERPARTY}": ${existingCp ? `exists (${existingCp.status})` : "will be created (roles: customer)"}.`);
  console.log(`Linked facts verified (amount-equal): ${plan.filter((p) => p.factCode).length}. Unlinked: S/N ${plan.filter((p) => !p.factCode).map((p) => p.sn).join(", ")}.`);
  console.log(`Conflict check: ${existing.size} of ${plan.length} receivables already exist; provenance present for ${haveProv.size}.`);

  if (!apply) {
    console.log("\nDRY-RUN complete. Nothing was written.");
    return;
  }

  // ---- 4. APPLY: counterparty (once) → batch → provenance (one statement) → receivables (one statement). --------
  let counterpartyId = existingCp?.id;
  if (!counterpartyId) {
    const { data, error } = await admin.rpc("organisation_counterparty_create", {
      p_actor_profile_id: actor, p_organisation_id: organisationId, p_display_name: COUNTERPARTY,
      p_legal_name: null, p_party_kind: "organisation", p_tax_registration_id: null, p_contact_person: null,
      p_email: null, p_phone: null, p_address_line_1: null, p_address_line_2: null, p_city: null,
      p_state_region: null, p_country: null, p_status: "active", p_roles: ["customer"],
    });
    if (error) throw new Error(`counterparty create: ${error.message}`);
    counterpartyId = String(data);
  } else if (existingCp!.status !== "active") {
    throw new Error(`counterparty ${COUNTERPARTY} exists but is ${existingCp!.status}`);
  }

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

  const provToInsert = plan.filter((p) => !haveProv.has(p.receivableId)).map((p) => ({
    organisation_id: organisationId, batch_id: batchId, workbook: WORKBOOK, workbook_sha256: sha,
    source_sheet: SHEET, source_row: p.sourceRow, source_reference: `Pending Payment #${p.sn} (Invoice ${p.clientReference})`,
    fingerprint: p.fingerprint, target_table: "finance_receivables", target_id: p.receivableId,
    classification: p.updateTransform ? "TRANSFORM_IMPORT" : "IMPORT",
    transformations: [
      `LIVE client receivable (NCC owes PayChex), origin ${p.originType}; OFF-LEDGER — no invoice, journal or receipt created`,
      `AMOUNT ⇒ original_amount = ${(p.amountKobo / 100).toFixed(2)} NGN; INVOICE NUMBER ⇒ client_reference "${p.clientReference}" (verbatim)`,
      `SUBMISSIONS DATE serial ⇒ submitted_on = ${p.submittedOn}; due date not stated ⇒ NULL`,
      `LOCATION ⇒ source_location ${p.sourceLocation ? `"${p.sourceLocation}"` : "NULL"}; UPDATE ⇒ source_update (verbatim text)`,
      ...(p.updateTransform ? [p.updateTransform] : []),
      p.factCode ? `historical_fact_id ⇒ ${p.factCode} (business-confirmed link; amount-equal verified at import)` : "No historical-fact link (none confirmed) — never inferred from text or amount",
    ],
  }));
  if (provToInsert.length) {
    const r = await admin.from("fm_migration_provenance").insert(provToInsert);
    if (r.error) throw new Error(`provenance insert failed: ${r.error.message}`);
  }
  const recvToInsert = plan.filter((p) => !existing.has(p.receivableId)).map((p) => ({
    id: p.receivableId, organisation_id: organisationId, company_id: companyId, counterparty_id: counterpartyId,
    origin_type: p.originType, invoice_id: null, invoice_reference: null, invoice_date: null, due_date: null,
    client_reference: p.clientReference, submitted_on: p.submittedOn, description: p.description,
    source_location: p.sourceLocation, source_update: p.sourceUpdate,
    historical_fact_id: p.factCode ? factByCode.get(p.factCode)!.id : null,
    currency: "NGN", original_amount: p.amountKobo / 100,
    counterparty_display_name: COUNTERPARTY, // overwritten from the counterparty master by the DB trigger
  }));
  if (recvToInsert.length) {
    const r = await admin.from("finance_receivables").insert(recvToInsert);
    if (r.error) throw new Error(`receivable insert failed (provenance recorded; re-run completes it): ${r.error.message}`);
  }
  console.log(`\nAPPLIED. Provenance created: ${provToInsert.length}. Receivables created: ${recvToInsert.length} (${plan.length - recvToInsert.length} already existed).`);

  // ---- 5. Post-import verification. -----------------------------------------------------------------------------
  const { data: after } = await admin.from("finance_receivables")
    .select("id,origin_type,invoice_id,original_amount,historical_fact_id,client_reference,submitted_on,source_location,source_update").in("id", ids);
  const rows = (after ?? []) as Array<Record<string, unknown>>;
  const { count: provCount } = await admin.from("fm_migration_provenance").select("id", { count: "exact", head: true }).eq("target_table", "finance_receivables").in("target_id", ids);
  const { count: allocCount } = await admin.from("finance_receipt_allocations").select("id", { count: "exact", head: true }).in("receivable_id", ids);
  const { count: invoiceCount } = await admin.from("finance_invoices").select("id", { count: "exact", head: true }).eq("organisation_id", organisationId);
  const { count: receiptCount } = await admin.from("finance_receipts").select("id", { count: "exact", head: true }).eq("organisation_id", organisationId);
  const byId = new Map(rows.map((r) => [String(r.id), r]));
  const factIdToCode = new Map([...factByCode.values()].map((f) => [f.id, f.code]));
  const sum = rows.reduce((s, r) => s + kobo(Number(r.original_amount)), 0);
  const post: Array<[string, boolean, string]> = [
    ["imported receivables = 8", rows.length === 8, String(rows.length)],
    ["total original = NGN 67,644,404.05", sum === EXPECTED.totalKobo, `NGN ${naira(sum)}`],
    ["outstanding = original (no allocations)", allocCount === 0, `allocations ${allocCount}`],
    ["receipts in org = 0", receiptCount === 0, String(receiptCount)],
    ["invoices in org = 0", invoiceCount === 0, String(invoiceCount)],
    ["all off-ledger (no invoice)", rows.every((r) => r.invoice_id == null && r.origin_type !== "invoice"), ""],
    ["fact links exactly as confirmed", plan.every((p) => (factIdToCode.get(String(byId.get(p.receivableId)?.historical_fact_id)) ?? null) === p.factCode), ""],
    ["S/N 4 and 6 unlinked", plan.filter((p) => p.sn === 4 || p.sn === 6).every((p) => byId.get(p.receivableId)?.historical_fact_id == null), ""],
    ["source preserved (ref, date, location, update)", plan.every((p) => { const r = byId.get(p.receivableId); return r?.client_reference === p.clientReference && r?.submitted_on === p.submittedOn && (r?.source_location ?? null) === p.sourceLocation && (r?.source_update ?? null) === p.sourceUpdate; }), ""],
    ["provenance for all 8", provCount === 8, String(provCount)],
  ];
  console.log("\nPost-import verification:");
  for (const [label, ok, detail] of post) console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
  if (post.some(([, ok]) => !ok)) process.exit(3);
}
main().catch((e) => { console.error("FAIL", e instanceof Error ? e.message : e); process.exit(1); });
