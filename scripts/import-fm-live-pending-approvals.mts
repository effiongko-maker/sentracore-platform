/**
 * FM Approvals — import the LIVE external Pending Approval register ("2026 LETTERS" workbook, "Pending Approval"
 * sheet) as ACTIVE Approvals (status awaiting_decision). These are current client approval requests, not archive
 * records: once imported they are progressed natively (Follow-up / Record Decision).
 *
 * Read ONLY: S/N (A), PENDING APPROVAL REQUEST (B), SUBMISSIONS DATE (C), AMOUNT (D), UPDATE (E) of that one sheet.
 * NEVER read: Inventory, Pending Payments, Pivot Table 2, or any other workbook.
 * NEVER set / infer: Work Order (work_instruction_id), approval type, facility, client, any actor, any decision.
 * A blank AMOUNT stays NULL (unknown — never 0). UPDATE is stored verbatim as source_note (evidence, never a status).
 *
 * Idempotency: deterministic Approval UUID = importedId(workbook sha256, sheet, row, "fm_approvals") and one
 * fm_migration_provenance row per source row (unique per source row + target). Provenance is written FIRST — the
 * fm_approvals_source_register_guard trigger admits a row without Work Order / type only when it exists.
 *
 *   NODE_PATH=<dir with empty server-only/> npx tsx --tsconfig tsconfig.json scripts/import-fm-live-pending-approvals.mts
 *       # DRY-RUN (default): parses, reconciles, prints the plan; writes nothing
 *   ... --apply                  # only if every hard reconciliation gate passes; safe to re-run
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
const WORKBOOK = "2026 LETTERS";
const SHEET = "Pending Approval";
const BATCH_KEY = "fm-approvals-live-pending-register-1";
const RULES_VERSION = "fm-approvals-live-pending-register/1";
const HEADER_ROW = 2;
const EXPECTED_HEADERS: Record<string, string> = {
  A: "S/N", B: "PENDING APPROVAL REQUEST", C: "SUBMISSIONS DATE", D: "AMOUNT", E: "UPDATE",
};

// Hard acceptance gate — business-established source facts. Any mismatch aborts before any write.
const EXPECTED = { total: 27, known: 25, unknown: 2, knownSumKobo: 28_694_054_843 } as const;

function rowFingerprint(sheet: Sheet, row: number): string {
  const cells = [...(sheet.rows.get(row)?.values() ?? [])].sort((a, b) => a.col.localeCompare(b.col, "en", { numeric: true }));
  return sha256Text(JSON.stringify(cells.map((c) => [c.col, c.value, c.formula])));
}
function rawCell(sheet: Sheet, row: number, col: string): string | null {
  const v = sheet.rows.get(row)?.get(col)?.value;
  return v == null || String(v).trim() === "" ? null : String(v);
}
const kobo = (n: number) => Math.round(n * 100);
const naira = (k: number) => (k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Planned = {
  sourceRow: number;
  sn: number;
  approvalId: string;
  fingerprint: string;
  title: string;
  titleTrimmed: boolean;
  submittedDate: string;
  amountKobo: number | null;
  sourceNote: string | null;
};

async function main() {
  loadEnvLocal();
  const apply = process.argv.includes("--apply");
  const source = arg("source") ?? resolve(process.env.HOME ?? "", "Developer/sentracore-migration-source");
  const file = resolve(source, SOURCE_FILE);
  const sha = sha256File(file);
  const sheet = sheetByName(readWorkbook(file), SHEET);

  // ---- 1. Parse the one sheet strictly. Any unexpected shape aborts (never guessed). -------------------------------
  for (const [col, header] of Object.entries(EXPECTED_HEADERS)) {
    const got = rawCell(sheet, HEADER_ROW, col)?.trim();
    if (got !== header) throw new Error(`header ${col}${HEADER_ROW}: expected "${header}", found "${got ?? ""}"`);
  }
  const todayIso = new Date().toISOString().slice(0, 10);
  const plan: Planned[] = [];
  for (const row of [...sheet.rows.keys()].filter((r) => r > HEADER_ROW).sort((a, b) => a - b)) {
    const cells = sheet.rows.get(row)!;
    if (![...cells.values()].some((c) => c.value != null && String(c.value).trim() !== "")) continue;
    const extra = [...cells.keys()].filter((c) => !(c in EXPECTED_HEADERS) && cells.get(c)?.value != null && String(cells.get(c)?.value).trim() !== "");
    if (extra.length) throw new Error(`row ${row}: unexpected populated column(s) ${extra.join(", ")}`);
    if ([...cells.values()].some((c) => c.formula)) throw new Error(`row ${row}: contains a formula cell — refusing`);

    const snRaw = rawCell(sheet, row, "A");
    const sn = Number(snRaw);
    if (!Number.isInteger(sn) || sn < 1) throw new Error(`row ${row}: S/N "${snRaw ?? ""}" is not a positive integer`);
    const subjectRaw = rawCell(sheet, row, "B");
    if (!subjectRaw) throw new Error(`row ${row}: no request/subject`);
    const dateRaw = rawCell(sheet, row, "C");
    const serial = Number(dateRaw);
    if (!Number.isInteger(serial) || serial < 1) throw new Error(`row ${row}: submission date "${dateRaw ?? ""}" is not a date serial`);
    const submittedDate = serialToIso(serial);
    if (submittedDate > todayIso) throw new Error(`row ${row}: submission date ${submittedDate} is in the future`);
    const amountRaw = rawCell(sheet, row, "D");
    let amountKobo: number | null = null;
    if (amountRaw != null) {
      const n = Number(amountRaw);
      if (!Number.isFinite(n) || n < 0) throw new Error(`row ${row}: amount "${amountRaw}" is not a non-negative number`);
      if (Math.abs(n * 100 - kobo(n)) > 1e-6) throw new Error(`row ${row}: amount "${amountRaw}" has more than 2 decimal places`);
      amountKobo = kobo(n);
    }
    const note = sheet.rows.get(row)?.get("E")?.value;
    plan.push({
      sourceRow: row, sn,
      approvalId: importedId(sha, SHEET, row, "fm_approvals"),
      fingerprint: rowFingerprint(sheet, row),
      title: subjectRaw.trim(), titleTrimmed: subjectRaw !== subjectRaw.trim(),
      submittedDate, amountKobo,
      sourceNote: note == null || String(note).trim() === "" ? null : String(note),
    });
  }

  // ---- 2. Hard reconciliation gate (before ANY write). -----------------------------------------------------------
  const known = plan.filter((p) => p.amountKobo != null);
  const unknown = plan.filter((p) => p.amountKobo == null);
  const knownSumKobo = known.reduce((s, p) => s + p.amountKobo!, 0);
  const sns = plan.map((p) => p.sn).sort((a, b) => a - b);
  const checks: Array<[string, boolean, string]> = [
    ["source records = 27", plan.length === EXPECTED.total, String(plan.length)],
    ["S/N 1..27, each once", sns.every((n, i) => n === i + 1) && sns.length === EXPECTED.total, sns.join(",")],
    ["known-amount records = 25", known.length === EXPECTED.known, String(known.length)],
    ["unknown-amount records = 2", unknown.length === EXPECTED.unknown, String(unknown.length)],
    ["known amount sum = NGN 286,940,548.43", knownSumKobo === EXPECTED.knownSumKobo, `NGN ${naira(knownSumKobo)}`],
    ["all planned status = awaiting_decision", true, "awaiting_decision (constant; no other status is ever written)"],
    ["inferred Work Orders = 0", true, "0 (work_instruction_id is never set)"],
    ["inferred approval types = 0", true, "0 (approval_type is never set)"],
    ["distinct deterministic ids", new Set(plan.map((p) => p.approvalId)).size === plan.length, String(new Set(plan.map((p) => p.approvalId)).size)],
  ];
  const failed = checks.filter(([, ok]) => !ok);

  console.log(JSON.stringify({ mode: apply ? "APPLY" : "DRY-RUN (no writes)", workbook: SOURCE_FILE, sheet: SHEET, workbookSha256: sha }, null, 2));
  console.log("\nPlan:");
  for (const p of plan) {
    console.log(
      `  S/N ${String(p.sn).padStart(2)}  row ${String(p.sourceRow).padStart(2)}  ${p.submittedDate}  ` +
        `${p.amountKobo != null ? `NGN ${naira(p.amountKobo).padStart(15)}` : "amount UNKNOWN     "}  ` +
        `${p.sourceNote ? `note "${p.sourceNote}"  ` : ""}"${p.title.slice(0, 60)}${p.title.length > 60 ? "…" : ""}"`
    );
  }
  console.log("\nReconciliation:");
  for (const [label, ok, detail] of checks) console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}  — ${detail}`);
  console.log("\nLeft NULL on every row (not established by the source): work_instruction_id, approval_type, facility, client, description, generated_at, every actor, every decision field.");
  if (failed.length) {
    console.error(`\nRECONCILIATION FAILED (${failed.length} check(s)). Nothing was written.`);
    process.exit(2);
  }

  // ---- 3. Target state (read-only). -------------------------------------------------------------------------------
  const { createAdminClient } = await import("../src/utils/supabase/admin");
  const admin = createAdminClient();
  const { data: orgs } = await admin.from("organisations").select("id").eq("status", "active");
  if ((orgs ?? []).length !== 1) throw new Error("expected exactly one active organisation");
  const organisationId = String((orgs![0] as { id: string }).id);

  const schema = await admin.from("fm_approvals").select("source_note").limit(1);
  const schemaReady = !schema.error;
  const ids = plan.map((p) => p.approvalId);
  const { data: existingRows, error: existingErr } = await admin.from("fm_approvals").select("id").eq("organisation_id", organisationId).in("id", ids);
  if (existingErr) throw new Error(`existing approval lookup failed: ${existingErr.message}`);
  const existing = new Set((existingRows ?? []).map((r) => String((r as { id: string }).id)));
  const { data: provRows, error: provErr } = await admin.from("fm_migration_provenance").select("target_id").eq("organisation_id", organisationId).eq("target_table", "fm_approvals").in("target_id", ids);
  if (provErr && schemaReady) throw new Error(`provenance lookup failed: ${provErr.message}`);
  const haveProv = new Set((provRows ?? []).map((r) => String((r as { target_id: string }).target_id)));
  console.log(`\nSchema (fm_approvals.source_note present): ${schemaReady ? "yes" : `NO — apply migration 20260923100000 first (${schema.error?.message})`}`);
  console.log(`Conflict check: ${existing.size} of ${plan.length} Approvals already exist (idempotent skip); ${plan.length - existing.size} to create. Provenance present for ${haveProv.size}.`);

  if (!apply) {
    console.log("\nDRY-RUN complete. Nothing was written.");
    return;
  }
  if (!schemaReady) throw new Error("schema migration not applied — refusing to write");

  // ---- 4. APPLY: batch → provenance (one statement) → Approvals (one statement). --------------------------------
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

  const provToInsert = plan.filter((p) => !haveProv.has(p.approvalId)).map((p) => ({
    organisation_id: organisationId, batch_id: batchId, workbook: WORKBOOK, workbook_sha256: sha,
    source_sheet: SHEET, source_row: p.sourceRow, source_reference: `S/N ${p.sn}`, fingerprint: p.fingerprint,
    target_table: "fm_approvals", target_id: p.approvalId, classification: p.titleTrimmed ? "TRANSFORM_IMPORT" : "IMPORT",
    transformations: [
      "LIVE client approval request: status = awaiting_decision (the source register lists it as pending approval)",
      `SUBMISSIONS DATE serial ⇒ submitted_at = ${p.submittedDate} 00:00 Africa/Lagos (date-only source)`,
      p.amountKobo != null ? `AMOUNT ⇒ approval_amount = ${(p.amountKobo / 100).toFixed(2)} NGN` : "AMOUNT blank ⇒ approval_amount NULL (unknown — never 0); needs review/classification",
      p.sourceNote ? `UPDATE ⇒ source_note verbatim "${p.sourceNote}" (evidence only — not a status)` : "UPDATE blank ⇒ source_note NULL",
      ...(p.titleTrimmed ? ["PENDING APPROVAL REQUEST ⇒ title with surrounding whitespace trimmed"] : []),
      "work_instruction_id / approval_type / facility / client / actors: not established by the source ⇒ NULL (never inferred)",
    ],
  }));
  if (provToInsert.length) {
    const r = await admin.from("fm_migration_provenance").insert(provToInsert);
    if (r.error) throw new Error(`provenance insert failed: ${r.error.message}`);
  }

  const { generateNextApprovalCode } = await import("../src/modules/approvals/server/fmApprovalDomain");
  const year = new Date().getUTCFullYear();
  const { data: codeRows, error: codeErr } = await admin.from("fm_approvals").select("code").eq("organisation_id", organisationId).ilike("code", `APR-${year}-%`).order("code", { ascending: false }).limit(1);
  if (codeErr) throw new Error(`code lookup failed: ${codeErr.message}`);
  let latestCode: string | null = ((codeRows ?? [])[0] as { code?: string } | undefined)?.code ?? null;

  const approvalsToInsert = plan.filter((p) => !existing.has(p.approvalId)).map((p) => {
    const code = generateNextApprovalCode(latestCode);
    latestCode = code;
    return {
      id: p.approvalId, organisation_id: organisationId, code,
      title: p.title, status: "awaiting_decision", submitted_at: `${p.submittedDate}T00:00:00+01:00`,
      approval_amount: p.amountKobo != null ? p.amountKobo / 100 : null,
      currency: p.amountKobo != null ? "NGN" : null,
      source_note: p.sourceNote,
      // Explicitly not established by the source — never fabricated:
      work_instruction_id: null, approval_type: null, generated_at: null,
      requested_by_profile_id: null, created_by_profile_id: null, updated_by_profile_id: null,
    };
  });
  if (approvalsToInsert.length) {
    const r = await admin.from("fm_approvals").insert(approvalsToInsert);
    if (r.error) throw new Error(`approval insert failed (provenance already recorded; re-run completes it): ${r.error.message}`);
  }
  console.log(`\nAPPLIED. Provenance created: ${provToInsert.length}. Approvals created: ${approvalsToInsert.length} (${plan.length - approvalsToInsert.length} already existed).`);

  // ---- 5. Post-import verification against the database. ---------------------------------------------------------
  const { data: after, error: afterErr } = await admin.from("fm_approvals")
    .select("id, status, approval_amount, work_instruction_id, approval_type, source_note, submitted_at").eq("organisation_id", organisationId).in("id", ids);
  if (afterErr) throw new Error(`post-import read failed: ${afterErr.message}`);
  const rows = (after ?? []) as Array<{ id: string; status: string; approval_amount: number | null; work_instruction_id: string | null; approval_type: string | null; source_note: string | null; submitted_at: string | null }>;
  const { count: provCount } = await admin.from("fm_migration_provenance").select("id", { count: "exact", head: true }).eq("organisation_id", organisationId).eq("target_table", "fm_approvals").in("target_id", ids);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const postKnown = rows.filter((r) => r.approval_amount != null);
  const postSum = postKnown.reduce((s, r) => s + kobo(Number(r.approval_amount)), 0);
  const post: Array<[string, boolean, string]> = [
    ["imported rows = 27", rows.length === EXPECTED.total, String(rows.length)],
    ["recorded amounts = 25", postKnown.length === EXPECTED.known, String(postKnown.length)],
    ["null amounts = 2", rows.length - postKnown.length === EXPECTED.unknown, String(rows.length - postKnown.length)],
    ["known sum = NGN 286,940,548.43", postSum === EXPECTED.knownSumKobo, `NGN ${naira(postSum)}`],
    ["all awaiting_decision", rows.every((r) => r.status === "awaiting_decision"), ""],
    ["no Work Order set", rows.every((r) => r.work_instruction_id == null), ""],
    ["no approval type set", rows.every((r) => r.approval_type == null), ""],
    ["provenance for every row", provCount === EXPECTED.total, String(provCount)],
    ["source notes verbatim", plan.every((p) => byId.get(p.approvalId)?.source_note === p.sourceNote), ""],
    ["submission dates preserved", plan.every((p) => Date.parse(byId.get(p.approvalId)?.submitted_at ?? "") === Date.parse(`${p.submittedDate}T00:00:00+01:00`)), ""],
  ];
  console.log("\nPost-import verification:");
  for (const [label, ok, detail] of post) console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
  if (post.some(([, ok]) => !ok)) process.exit(3);
}
main().catch((e) => { console.error("FAIL", e instanceof Error ? e.message : e); process.exit(1); });
