/**
 * Platform Finance — Accounting Bridge Tranche 1 (supplier accrual + accrued-payable settlement).
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-platform-finance-accounting-bridge.mts
 *
 * Behavioural proof in a REAL Postgres: the full repository migration chain (including
 * 20260925120000_finance_accounting_bridge_supplier_accrual) applied to in-process PGlite — see scripts/lib/pf-pglite.ts.
 * Upstream approval STATE is seeded; obligations and payments are created by the real workflow functions
 * (finance_payable_insert_from_approved_vendor_bill / _request, finance_payment_confirm_against_payable), and all
 * accounting goes through the new RPCs and the canonical finance_post_transaction. Never touches Supabase.
 */
import { readFileSync } from "node:fs";
import type { PGlite } from "@electric-sql/pglite";
import { financeDatabase, PAYCHEX_ORG } from "./lib/pf-pglite";
import { PLATFORM_FINANCE_CAPABILITIES } from "../src/modules/platform-finance/types";
import { buildTrialBalance } from "../src/modules/platform-finance/domain/trialBalance";
import { journalSourceDescriptor } from "../src/modules/platform-finance/domain/accountingReview";

let failures = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL ${name}\n     ${(error as Error).message}`);
  }
}
function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

const db: PGlite = await financeDatabase();
const one = async <T,>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0]!;
const all = async <T,>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
async function fails(sql: string, params: unknown[], pattern: RegExp, why: string) {
  try {
    await db.query(sql, params);
  } catch (error) {
    if (pattern.test((error as Error).message)) return;
    throw new Error(`${why}: unexpected error ${(error as Error).message}`);
  }
  throw new Error(`${why}: expected refusal`);
}

// ── Fixtures ───────────────────────────────────────────────────────────────────────────────────────────────
const OFFICER = "a0000000-0000-4000-8000-000000000001";
const INPUTTER = "a0000000-0000-4000-8000-000000000002";
const OUTSIDER = "a0000000-0000-4000-8000-000000000003";
for (const id of [OFFICER, INPUTTER, OUTSIDER]) {
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${id}@example.test`]);
  // auth.users insert creates the profile (existing trigger); attach it to the organisation the way the IAM
  // control plane does (transaction-scoped sentracore.bypass_profile_acl).
  await db.exec(`begin; select set_config('sentracore.bypass_profile_acl', 'on', true);
    update public.profiles set organisation_id = '${PAYCHEX_ORG}', status = 'active' where id = '${id}'; commit;`);
}
const company = await one<{ id: string }>("select id from public.finance_companies where organisation_id = $1 and code = 'PAYCHEX'", [PAYCHEX_ORG]);
const COMPANY = company.id;
for (const cap of [PLATFORM_FINANCE_CAPABILITIES.create_transaction, PLATFORM_FINANCE_CAPABILITIES.post, "platform_finance.payment.execute", "platform_finance.financial_account.view", "platform_finance.request.approve"]) {
  await db.query("insert into public.finance_capability_grants (organisation_id, profile_id, capability) values ($1, $2, $3)", [PAYCHEX_ORG, OFFICER, cap]);
}
await db.query("insert into public.finance_company_access (organisation_id, profile_id, company_id) values ($1, $2, $3)", [PAYCHEX_ORG, OFFICER, COMPANY]);
await db.query("insert into public.finance_company_access (organisation_id, profile_id, company_id) values ($1, $2, $3)", [PAYCHEX_ORG, OUTSIDER, COMPANY]);
await db.query(`insert into public.finance_periods (organisation_id, company_id, year, month, start_date, end_date, status) values ($1, $2, 2026, 9, '2026-09-01', '2026-09-30', 'open')`, [PAYCHEX_ORG, COMPANY]);
await db.query(`insert into public.finance_periods (organisation_id, company_id, year, month, start_date, end_date, status, closed_at, closed_by_profile_id) values ($1, $2, 2026, 8, '2026-08-01', '2026-08-31', 'closed', now(), $3)`, [PAYCHEX_ORG, COMPANY, OFFICER]);
const acct = async (code: string) => (await one<{ id: string }>("select id from public.finance_accounts where organisation_id = $1 and code = $2", [PAYCHEX_ORG, code])).id;
const [CASH_1060, AR_1070, PREPAID_1090, IT_1020, AP_2000, TAX_2030, EQUITY_3000, REVENUE_4000, SUBCONTRACT_5010] = await Promise.all(
  ["1060", "1070", "1090", "1020", "2000", "2030", "3000", "4000", "5010"].map(acct)
);
const bank = await one<{ id: string }>(
  `insert into public.finance_financial_accounts (organisation_id, company_id, account_type, name, currency, control_gl_account_id, created_by_profile_id)
   values ($1, $2, 'bank', 'Operating account', 'NGN', $3, $4) returning id`, [PAYCHEX_ORG, COMPANY, CASH_1060, OFFICER]);

// Synthetic payment destination (no real bank data); payables snapshot it from their source at creation.
const DEST_COLS = "payment_method, payment_bank_name, payment_account_name, payment_account_number_last4, payment_account_number_ciphertext, payment_account_number_iv, payment_account_number_auth_tag, payment_encryption_key_version";
const DEST_VALS = "'bank_transfer', 'Synthetic Bank', 'Synthetic Payee', '0000', 'synthetic-ciphertext', 'synthetic-iv', 'synthetic-tag', 1";

async function decidedVendorBill(amount: number, invoiceDate: string | null, status: "approved" | "partially_approved" = "approved") {
  const billed = status === "approved" ? amount : amount + 1000;
  const bill = await one<{ id: string }>(
    `insert into public.finance_vendor_bills (organisation_id, company_id, inputter_profile_id, status, currency, billed_amount, approved_amount, payee_name, payee_type, invoice_reference, invoice_date, purpose, project_contract_ref, goods_services_received, decided_at, ${DEST_COLS})
     values ($1, $2, $3, $4, 'NGN', $5, $6, 'Acme Facilities Ltd', 'vendor', 'ACME-INV-77', $7, 'Generator servicing', 'PRJ-9', true, now(), ${DEST_VALS}) returning id`,
    [PAYCHEX_ORG, COMPANY, INPUTTER, status, billed, amount, invoiceDate]);
  const payable = await one<{ id: string }>("select public.finance_payable_insert_from_approved_vendor_bill($1, $2, $3) as id", [INPUTTER, bill.id, amount]);
  return { bill: bill.id, payable: payable.id };
}
async function confirmPayment(payableId: string, amount: number, date = "2026-09-20") {
  const r = await one<{ id: string }>(
    "select public.finance_payment_confirm_against_payable($1, $2, $3, $4, $5::date, $6) as id",
    [OFFICER, payableId, bank.id, amount, date, `EXT-${Math.random().toString(36).slice(2, 8)}`]);
  return r.id;
}
const operational = async (billId: string, payableId: string) =>
  JSON.stringify(await one("select b.status as bill, b.approved_amount as approved, p.status as payable, p.paid_amount as paid, p.payable_amount as owed from public.finance_vendor_bills b join public.finance_payables p on p.source_id = b.id where b.id = $1 and p.id = $2", [billId, payableId]));
const linesOf = (journalId: string) => all<{ account_id: string; debit: string; credit: string }>("select account_id, debit, credit from public.finance_journal_lines where journal_entry_id = $1 order by line_no", [journalId]);

// ── 1. Capability ──────────────────────────────────────────────────────────────────────────────────────────
await check("1 capability: DB payment/supplier RPCs require the canonical capability the application grants; the defective string is gone", async () => {
  const defs = await all<{ proname: string; def: string }>(
    "select p.proname, pg_get_functiondef(p.oid) as def from pg_proc p where p.pronamespace = 'public'::regnamespace and (p.proname like 'finance_payment_accounting_%' or p.proname like 'finance_vendor_bill_accounting_%')");
  assert(defs.length >= 6, "functions present");
  for (const d of defs) assert(!/platform_finance\.accounting\./.test(d.def), `${d.proname} still checks a non-canonical capability`);
  assert(defs.filter((d) => /set_debit|get_or_create/.test(d.proname)).every((d) => d.def.includes(`'${PLATFORM_FINANCE_CAPABILITIES.create_transaction}'`)), "draft/debit RPCs check platform_finance.create_transaction");
  assert(defs.filter((d) => /_post$|settle_accrued/.test(d.proname)).every((d) => d.def.includes(`'${PLATFORM_FINANCE_CAPABILITIES.post}'`)), "posting RPCs check platform_finance.post");
  const appRoute = readFileSync("src/app/api/platform-finance/accounting-review/route.ts", "utf8") + readFileSync("src/app/api/platform-finance/payments/route.ts", "utf8");
  assert(!/accounting\.create_transaction/.test(appRoute), "application routes use the same canonical capability");
  await fails("select public.finance_vendor_bill_accounting_get_or_create($1, gen_random_uuid())", [OUTSIDER], /missing create_transaction|decided vendor bill not found/, "outsider");
});

// ── 2–6. Supplier accrual ──────────────────────────────────────────────────────────────────────────────────
const main = await decidedVendorBill(150000, "2026-09-05");
let mainFt = "";
await check("2 a decided vendor bill yields at most ONE draft accounting transaction, prefilled from authoritative source facts", async () => {
  const a = await one<{ id: string }>("select public.finance_vendor_bill_accounting_get_or_create($1, $2) as id", [OFFICER, main.bill]);
  const b = await one<{ id: string }>("select public.finance_vendor_bill_accounting_get_or_create($1, $2) as id", [OFFICER, main.bill]);
  assert(a.id === b.id, "same draft on repeat");
  const ft = await one<Record<string, unknown>>("select *, to_char(transaction_date, 'YYYY-MM-DD') as accounting_date from public.finance_transactions where id = $1", [a.id]);
  assert(Number(ft.amount) === 150000 && ft.currency === "NGN" && ft.accounting_date === "2026-09-05", "amount / currency / supplier invoice date from the bill");
  assert(ft.source_type === "vendor_bill" && ft.source_id === main.bill && ft.status === "draft", "provenance + draft");
  assert(/Acme Facilities Ltd/.test(String(ft.description)) && /ACME-INV-77/.test(String(ft.description)), "supplier and invoice reference carried");
  assert((await one<{ n: number }>("select count(*)::int as n from public.finance_transactions where source_type = 'vendor_bill' and source_id = $1", [main.bill])).n === 1, "one transaction");
  await fails("insert into public.finance_transactions (organisation_id, company_id, reference, transaction_date, transaction_type, description, amount, currency, source_type, source_id, created_by_profile_id) values ($1, $2, 'DUP-1', '2026-09-05', 'other', 'dup', 1, 'NGN', 'vendor_bill', $3, $4)", [PAYCHEX_ORG, COMPANY, main.bill, OFFICER], /duplicate key|unique/, "second recognition row");
  mainFt = a.id;
});

await check("5 debit classification: revenue, equity, liability, AR and cash/bank control are rejected; expense, prepayment and fixed asset accepted", async () => {
  for (const [name, id] of [["revenue 4000", REVENUE_4000], ["equity 3000", EQUITY_3000], ["liability 2030", TAX_2030], ["AP 2000", AP_2000], ["AR 1070", AR_1070], ["cash/bank control 1060", CASH_1060]] as const) {
    await fails("select public.finance_vendor_bill_accounting_set_debit($1, $2, $3)", [OFFICER, mainFt, id], /debit account must be/, `${name} accepted`);
  }
  for (const id of [PREPAID_1090, IT_1020, SUBCONTRACT_5010]) {
    await db.query("select public.finance_vendor_bill_accounting_set_debit($1, $2, $3)", [OFFICER, mainFt, id]);
  }
  const ft = await one<{ m: { debit_account_id: string } }>("select metadata as m from public.finance_transactions where id = $1", [mainFt]);
  assert(ft.m.debit_account_id === SUBCONTRACT_5010, "last confirmed classification kept");
});

let mainJournal = "";
await check("3/4/6/13 posting: canonical engine, balanced, Dr confirmed expense / Cr 2000; operational status untouched; audited", async () => {
  const before = await operational(main.bill, main.payable);
  const r = await one<{ id: string }>("select public.finance_vendor_bill_accounting_post($1, $2) as id", [OFFICER, main.bill]);
  mainJournal = r.id;
  const lines = await linesOf(mainJournal);
  const dr = lines.filter((l) => Number(l.debit) > 0);
  const cr = lines.filter((l) => Number(l.credit) > 0);
  assert(lines.length === 2 && dr.length === 1 && cr.length === 1, "two lines");
  assert(Number(dr[0]!.debit) === 150000 && Number(cr[0]!.credit) === 150000, "balanced");
  assert(cr[0]!.account_id === AP_2000 && dr[0]!.account_id === SUBCONTRACT_5010, "Dr 5010 / Cr 2000");
  const ft = await one<{ status: string; journal_entry_id: string }>("select status, journal_entry_id from public.finance_transactions where id = $1", [mainFt]);
  assert(ft.status === "posted" && ft.journal_entry_id === mainJournal, "transaction posted and linked");
  assert((await one<{ n: number }>("select count(*)::int as n from public.finance_audit_events where action = 'finance.transaction.posted' and object_id = $1", [mainFt])).n === 1, "engine audit event");
  assert(/finance_post_transaction\(/.test((await one<{ d: string }>("select pg_get_functiondef('public.finance_vendor_bill_accounting_post(uuid,uuid)'::regprocedure) as d")).d), "delegates to finance_post_transaction");
  assert(before === (await operational(main.bill, main.payable)), "vendor bill / payable status and amounts unchanged");
});

await check("8 duplicate posting / recognition is rejected or converges on the one journal", async () => {
  const again = await one<{ id: string }>("select public.finance_vendor_bill_accounting_post($1, $2) as id", [OFFICER, main.bill]);
  assert(again.id === mainJournal, "repeat post returns the same journal");
  await fails("select public.finance_post_transaction($1, $2, $3::jsonb)", [mainFt, OFFICER, JSON.stringify([{ account_id: SUBCONTRACT_5010, debit: 1, credit: 0 }, { account_id: AP_2000, debit: 0, credit: 1 }])], /already|must be draft/, "second journal for the same transaction");
  assert((await one<{ n: number }>("select count(*)::int as n from public.finance_journal_entries where transaction_id = $1", [mainFt])).n === 1, "one journal entry");
});

await check("7 closed-period invoice date is preserved and period controls block posting; partial approval recognises the approved amount", async () => {
  const closed = await decidedVendorBill(40000, "2026-08-15");
  await db.query("select public.finance_vendor_bill_accounting_get_or_create($1, $2)", [OFFICER, closed.bill]);
  const ft = await one<{ id: string; d: string }>("select id, to_char(transaction_date, 'YYYY-MM-DD') as d from public.finance_transactions where source_type = 'vendor_bill' and source_id = $1", [closed.bill]);
  assert(ft.d === "2026-08-15", "the real invoice date is kept, not moved into an open period");
  await db.query("select public.finance_vendor_bill_accounting_set_debit($1, $2, $3)", [OFFICER, ft.id, SUBCONTRACT_5010]);
  await fails("select public.finance_vendor_bill_accounting_post($1, $2)", [OFFICER, closed.bill], /no open period|closed/, "posted into a closed period");
  const partial = await decidedVendorBill(9000, "2026-09-06", "partially_approved");
  const p = await one<{ id: string }>("select public.finance_vendor_bill_accounting_get_or_create($1, $2) as id", [OFFICER, partial.bill]);
  assert(Number((await one<{ amount: string }>("select amount from public.finance_transactions where id = $1", [p.id])).amount) === 9000, "partially approved bill recognises the APPROVED amount");
});

await check("7b invoice-date invariant: a vendor bill cannot be approved or partially approved into a payable without a supplier invoice date", async () => {
  const pending = async (invoiceDate: string | null) => (await one<{ id: string }>(
    `insert into public.finance_vendor_bills (organisation_id, company_id, inputter_profile_id, status, currency, billed_amount, payee_name, payee_type, invoice_reference, invoice_date, purpose, goods_services_received, submitted_at, ${DEST_COLS})
     values ($1, $2, $3, 'pending_ceo_approval', 'NGN', 30000, 'Undated Supplier Ltd', 'vendor', 'U-1', $4, 'Repairs', true, now(), ${DEST_VALS}) returning id`,
    [PAYCHEX_ORG, COMPANY, INPUTTER, invoiceDate])).id;
  const undated = await pending(null);
  await fails("select public.finance_vendor_bill_approve($1, $2, 'ok')", [OFFICER, undated], /supplier invoice date must be recorded/, "full approval without invoice date");
  await fails("select public.finance_vendor_bill_partially_approve($1, $2, 10000, 'part')", [OFFICER, undated], /supplier invoice date must be recorded/, "partial approval without invoice date");
  const state = await one<{ status: string; payables: number }>("select b.status, (select count(*)::int from public.finance_payables p where p.source_type = 'vendor_bill' and p.source_id = b.id) as payables from public.finance_vendor_bills b where b.id = $1", [undated]);
  assert(state.status === "pending_ceo_approval" && state.payables === 0, "refused atomically: bill still pending, no payable minted");
  await fails("update public.finance_vendor_bills set status = 'approved', approved_amount = billed_amount, decided_at = now() where id = $1", [undated], /supplier invoice date must be recorded/, "direct write bypassing the RPC");
  await fails(
    `insert into public.finance_vendor_bills (organisation_id, company_id, inputter_profile_id, status, currency, billed_amount, approved_amount, payee_name, payee_type, purpose) values ($1, $2, $3, 'approved', 'NGN', 5, 5, 'X', 'vendor', 'x')`,
    [PAYCHEX_ORG, COMPANY, INPUTTER], /supplier invoice date must be recorded/, "decided undated bill inserted");
  const constraint = await one<{ def: string; validated: boolean }>("select pg_get_constraintdef(oid) as def, convalidated as validated from pg_constraint where conname = 'finance_vendor_bills_decided_invoice_date_required'");
  assert(constraint.validated && /invoice_date IS NOT NULL/i.test(constraint.def), "validated CHECK constraint backstops every path");
  const dated = await pending("2026-09-12");
  await db.query("select public.finance_vendor_bill_approve($1, $2, 'ok')", [OFFICER, dated]);
  assert((await one<{ n: number }>("select count(*)::int as n from public.finance_payables where source_type = 'vendor_bill' and source_id = $1", [dated])).n === 1, "a dated bill approves into its payable as before");
});

// ── 9–11. Payments ─────────────────────────────────────────────────────────────────────────────────────────
await check("9/10 payment against the accrued payable: Dr 2000 / Cr source cash-bank control; the debit cannot be chosen again", async () => {
  const paymentId = await confirmPayment(main.payable, 100000);
  const before = await operational(main.bill, main.payable);
  const ft = await one<{ id: string }>("select public.finance_payment_accounting_get_or_create($1, $2) as id", [OFFICER, paymentId]);
  await fails("select public.finance_payment_accounting_set_debit($1, $2, $3)", [OFFICER, ft.id, SUBCONTRACT_5010], /settles a recognised supplier bill/, "expense recognised twice via payment debit");
  await fails("select public.finance_post_transaction($1, $2, $3::jsonb)", [ft.id, OFFICER, JSON.stringify([{ account_id: SUBCONTRACT_5010, debit: 100000, credit: 0 }, { account_id: CASH_1060, debit: 0, credit: 100000 }])], /must be Dr Trade Accounts Payable/, "direct engine call with an expense debit");
  const j = await one<{ id: string }>("select public.finance_payment_accounting_settle_accrued($1, $2) as id", [OFFICER, paymentId]);
  const lines = await linesOf(j.id);
  assert(lines.length === 2 && lines.some((l) => l.account_id === AP_2000 && Number(l.debit) === 100000) && lines.some((l) => l.account_id === CASH_1060 && Number(l.credit) === 100000), "Dr 2000 / Cr 1060");
  assert(before === (await operational(main.bill, main.payable)), "payable paid/status unchanged by posting");
  const again = await one<{ id: string }>("select public.finance_payment_accounting_settle_accrued($1, $2) as id", [OFFICER, paymentId]);
  assert(again.id === j.id, "idempotent settlement");
});

await check("9 a payment against a supplier bill that is not yet recognised cannot post", async () => {
  const pending = await decidedVendorBill(20000, "2026-09-07");
  const paymentId = await confirmPayment(pending.payable, 20000);
  await fails("select public.finance_payment_accounting_settle_accrued($1, $2)", [OFFICER, paymentId], /must be recognised \(posted\) before/, "settled before recognition");
});

await check("11 non-AP (Financial Request) payment keeps the reviewer-chosen debit; AP (2000) cannot be debited without a recognised bill", async () => {
  const category = await one<{ id: string }>("select id from public.finance_request_categories where organisation_id = $1 limit 1", [PAYCHEX_ORG]);
  const req = await one<{ id: string }>(
    `insert into public.finance_requests (organisation_id, company_id, requester_profile_id, status, currency, requested_amount, approved_amount, category_id, purpose, payee_name, payee_type, decided_at, ${DEST_COLS})
     values ($1, $2, $3, 'approved', 'NGN', 12000, 12000, $4, 'Site diesel', 'Staff Member', 'staff', now(), ${DEST_VALS}) returning id`, [PAYCHEX_ORG, COMPANY, INPUTTER, category.id]);
  const payable = await one<{ id: string }>("select public.finance_payable_insert_from_approved_request($1, $2, $3) as id", [INPUTTER, req.id, 12000]);
  const paymentId = await confirmPayment(payable.id, 12000);
  const ft = await one<{ id: string }>("select public.finance_payment_accounting_get_or_create($1, $2) as id", [OFFICER, paymentId]);
  await fails("select public.finance_payment_accounting_set_debit($1, $2, $3)", [OFFICER, ft.id, AP_2000], /can only be debited by settling/, "AP debited without an accrual");
  await fails("select public.finance_payment_accounting_settle_accrued($1, $2)", [OFFICER, paymentId], /does not settle a recognised supplier bill/, "request payment treated as AP settlement");
  const diesel = await acct("5070");
  await db.query("select public.finance_payment_accounting_set_debit($1, $2, $3)", [OFFICER, ft.id, diesel]);
  const j = await one<{ id: string }>("select public.finance_post_transaction($1, $2, $3::jsonb) as id", [ft.id, OFFICER, JSON.stringify([{ account_id: diesel, debit: 12000, credit: 0 }, { account_id: CASH_1060, debit: 0, credit: 12000 }])]);
  assert((await linesOf(j.id)).length === 2, "existing cash-basis treatment still posts");
});

// ── 12. Provenance ─────────────────────────────────────────────────────────────────────────────────────────
await check("12 provenance resolves both ways: source → transaction → journal and journal → source record", async () => {
  const forward = await one<{ journal_entry_id: string }>("select journal_entry_id from public.finance_transactions where source_type = 'vendor_bill' and source_id = $1", [main.bill]);
  assert(forward.journal_entry_id === mainJournal, "vendor bill → journal");
  const back = await one<{ source_type: string; source_id: string; transaction_type: string }>("select t.source_type, t.source_id, t.transaction_type from public.finance_journal_entries e join public.finance_transactions t on t.id = e.transaction_id where e.id = $1", [mainJournal]);
  assert(back.source_type === "vendor_bill" && back.source_id === main.bill, "journal → vendor bill");
  const d = journalSourceDescriptor({ sourceType: back.source_type, sourceId: back.source_id, payableId: null });
  assert(d.label === "Supplier bill" && d.href === `/platform-finance/vendor-bills/${main.bill}`, "labelled by source_type, not transaction_type ('other')");
  assert(journalSourceDescriptor({ sourceType: "invoice", sourceId: "i1", payableId: null }).href === "/platform-finance/invoices/i1", "invoice link");
  assert(journalSourceDescriptor({ sourceType: "payment", sourceId: "p1", payableId: "py1" }).href === "/platform-finance/payables/py1", "payment link via its payable");
  assert(journalSourceDescriptor({ sourceType: "receipt", sourceId: "r1", payableId: null }).label === "Customer receipt", "receipt label");
  assert(journalSourceDescriptor({ sourceType: "financial_account_opening_position", sourceId: "o1", payableId: null }).label === "Opening position", "opening position label");
  assert(journalSourceDescriptor({ sourceType: "manual_journal", sourceId: null, payableId: null }).href === null, "manual journal has no source record");
});

// ── 14. Existing flows unaffected by the treatment guard ─────────────────────────────────────────────────────
await check("14 manual-journal style posting (source_type manual_journal) is unaffected by the new guard", async () => {
  const ft = await one<{ id: string }>(
    `insert into public.finance_transactions (organisation_id, company_id, reference, transaction_date, transaction_type, description, amount, currency, source_type, created_by_profile_id)
     values ($1, $2, 'MJ-TEST-1', '2026-09-10', 'adjustment', 'Synthetic adjustment', 500, 'NGN', 'manual_journal', $3) returning id`, [PAYCHEX_ORG, COMPANY, OFFICER]);
  const j = await one<{ id: string }>("select public.finance_post_transaction($1, $2, $3::jsonb) as id", [ft.id, OFFICER, JSON.stringify([{ account_id: await acct("6150"), debit: 500, credit: 0 }, { account_id: CASH_1060, debit: 0, credit: 500 }])]);
  assert(Boolean(j.id), "manual journal posts");
});

// ── 15. Trial Balance ──────────────────────────────────────────────────────────────────────────────────────
await check("15 Trial Balance stays balanced after the synthetic postings (view and statement builder)", async () => {
  const totals = await one<{ d: string; c: string }>("select sum(total_debit) as d, sum(total_credit) as c from public.finance_trial_balance_v where company_id = $1", [COMPANY]);
  assert(Number(totals.d) === Number(totals.c) && Number(totals.d) > 0, "view balanced");
  const movements = (await all<Record<string, unknown>>(
    `select tb.period_id, p.year, p.month, tb.account_id, tb.account_code, tb.account_name, tb.account_type, a.classification, tb.total_debit, tb.total_credit
     from public.finance_trial_balance_v tb join public.finance_periods p on p.id = tb.period_id join public.finance_accounts a on a.id = tb.account_id where tb.company_id = $1`, [COMPANY]))
    .map((r) => ({ periodId: String(r.period_id), year: Number(r.year), month: Number(r.month), accountId: String(r.account_id), accountCode: String(r.account_code), accountName: String(r.account_name), accountType: r.account_type as never, classification: (r.classification as string) ?? null, totalDebit: Number(r.total_debit), totalCredit: Number(r.total_credit) }));
  const tb = buildTrialBalance({ companyId: COMPANY, periodId: "p", asAtDate: "2026-09-30", asAtLabel: "As at 30 Sep 2026", asOf: { year: 2026, month: 9 }, movements });
  assert(tb.balanced, "statement builder balanced");
  const ap = tb.rows.find((r) => r.accountCode === "2000");
  assert(ap && ap.credit === 50000, "AP carries 150,000 recognised − 100,000 settled = 50,000 credit");
});

console.log(failures === 0 ? "\nACCOUNTING BRIDGE: PASS" : `\nACCOUNTING BRIDGE: ${failures} FAIL`);
process.exit(failures === 0 ? 0 : 1);
