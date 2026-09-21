import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path: string) => readFile(path, "utf8");
const stripSqlComments = (value: string) => value.replace(/--.*$/gm, "");
const stripCodeComments = (value: string) => value.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const [migration, remediation, service, domain, drawer, route, client, paymentMigration, paymentService, verifier2c, overview] = await Promise.all([
  read("supabase/migrations/20260917160000_finance_payment_accounting_review_post.sql"),
  read("supabase/migrations/20260917161000_finance_payment_accounting_source_id_type_fix.sql"),
  read("src/modules/platform-finance/server/PlatformFinancePaymentAccountingServerService.ts"),
  read("src/modules/platform-finance/domain/paymentAccounting.ts"),
  read("src/modules/platform-finance/components/PlatformFinancePaymentReviewDrawer.tsx"),
  read("src/app/api/platform-finance/payments/route.ts"),
  read("src/services/platform-finance/PlatformFinancePaymentsService.ts"),
  read("supabase/migrations/20260917150000_finance_payments_payable_settlement.sql"),
  read("src/modules/platform-finance/server/PlatformFinancePaymentsServerService.ts"),
  read("scripts/verify-platform-finance-phase2c.mts"),
  read("src/modules/platform-finance/server/PlatformFinanceServerService.ts"),
]);

assert.doesNotMatch(stripSqlComments(paymentMigration), /finance_transactions|finance_journal_entries|finance_journal_lines|finance_post_transaction/);
assert.doesNotMatch(stripCodeComments(paymentService), /finance_post_transaction|postFinanceTransaction|createTransaction/);
assert.match(verifier2c, /noJournalPostingInPhase2C|finance_post_transaction|finance_transactions/);

assert.match(migration, /where source_type = 'payment' and source_id is not null/i);
assert.match(migration, /transaction_type[\s\S]*'payment'/i);
assert.match(migration, /source_type[\s\S]*source_id[\s\S]*'payment'[\s\S]*v_payment\.id/i);
assert.doesNotMatch(migration, /finance_accounting_proposals|create table[\s\S]*proposal/i);
assert.doesNotMatch(`${migration}\n${service}`, /category.*gl|vendor.*gl|ai.*classif|project.*gl/i);

assert.match(service, /control_gl_account_id/);
assert.match(service, /p_debit_account_id|debitAccountId/);
assert.match(service, /postFinanceTransaction/);
assert.doesNotMatch(service, /from\("finance_journal_(entries|lines)"\)\.(insert|update)/);
assert.match(service, /transaction\.amount !== Number\(payment\.amount\)/);
assert.match(service, /transaction\.transactionDate !== payment\.payment_date/);
assert.match(service, /account\.company_id !== payment\.company_id/);
assert.match(service, /account\.currency !== payment\.currency/);
assert.match(service, /findOpenPeriodForDate/);
// The closed-period refusal text now lives in the payment-accounting domain rules (single source of
// truth shared by the work list and Review & Post); the service must still use it.
assert.match(await read("src/modules/platform-finance/domain/paymentAccounting.ts"), /closed accounting period/);
assert.match(service, /paymentPeriodBlockingReason/);
assert.match(service, /account\.status !== "active"/);
assert.match(service, /account\.accountType !== "asset"/);
assert.match(service, /account\.classification !== "current_asset"/);
assert.match(service, /loadCurrentControlAccount\(paymentId\)/);
assert.match(service, /source Financial Account control account configuration is no longer valid for posting/);

assert.match(domain, /visibility: "visible"[\s\S]*name: string[\s\S]*last4: string \| null/);
assert.match(domain, /visibility: "restricted"[\s\S]*label: "Restricted corporate financial account"/);
assert.match(domain, /Omit<[\s\S]*FinancePayment[\s\S]*"sourceFinancialAccountId"/);
assert.doesNotMatch(domain, /platform_super_admin/i);
assert.match(service, /Boolean\(viewGrant\)[\s\S]*account\.visibility_policy === "company" \|\| Boolean\(restrictedGrant\)/);
assert.match(service, /sourceFinancialAccount: canSeeSourceAccount[\s\S]*visibility: "visible"[\s\S]*visibility: "restricted"/);
assert.doesNotMatch(drawer, /sourceFinancialAccount(Id|Name|Last4)/);
assert.match(drawer, /Restricted corporate financial account|account\.label/);

const reviewClient = client.slice(client.indexOf("getPaymentAccountingReview"));
assert.match(reviewClient, /getPaymentAccountingReview\(paymentId: string\)/);
assert.match(reviewClient, /postPaymentAccounting\(paymentId: string, debitAccountId: string\)/);
assert.doesNotMatch(reviewClient, /sourceFinancialAccountId|creditAccountId|controlGlAccountId|postingLines|\blines\b/);
const reviewRouteStart = route.indexOf('if (action === "getPaymentAccountingReview"');
assert.notEqual(reviewRouteStart, -1, "missing Review/Post API action block");
const reviewRoute = route.slice(
  reviewRouteStart,
  route.indexOf("return NextResponse.json(\n      { success: false", reviewRouteStart),
);
assert.match(reviewRoute, /body\.input\?\.paymentId/);
assert.match(reviewRoute, /body\.input\?\.debitAccountId/);
assert.doesNotMatch(reviewRoute, /sourceFinancialAccountId|creditAccountId|controlGlAccountId|postingLines|\blines\b/);
assert.match(service, /account\.control_gl_account_id/);
assert.match(service, /accountId: credit\.id/);

for (const role of ["public", "anon, authenticated", "service_role"]) {
  assert.match(migration, new RegExp(`finance_post_transaction[\\s\\S]{0,180}(from|to) ${role.replace(" ", "\\s*")}`, "i"));
}
assert.match(migration, /finance_payment_accounting_get_or_create/);
assert.match(migration, /on conflict \(source_id\)[\s\S]*source_type = 'payment'/i);
assert.match(overview, /paymentAccountingPending \+ unrelatedDrafts/);

for (const [name, sql] of [["160000", migration], ["161000", remediation]] as const) {
  assert.equal(
    sql.match(/source_id\s*=\s*p_payment_id::text/gi)?.length,
    2,
    `${name} must cast both payment source-id comparisons to text`,
  );
  assert.doesNotMatch(
    sql,
    /source_id\s*=\s*p_payment_id(?!\s*::text)/i,
    `${name} must not compare text source_id directly with UUID p_payment_id`,
  );
}
assert.equal(
  remediation.match(/create\s+or\s+replace\s+function/gi)?.length,
  1,
  "161000 must replace exactly one function",
);
assert.match(remediation, /create or replace function public\.finance_payment_accounting_get_or_create\(\s*p_actor_profile_id uuid,\s*p_payment_id uuid/i);
assert.doesNotMatch(remediation, /finance_payment_accounting_set_debit|create\s+(table|index)|alter\s+table|drop\s+/i);
for (const role of ["public", "anon, authenticated", "service_role"]) {
  assert.match(remediation, new RegExp(`finance_payment_accounting_get_or_create[\\s\\S]{0,180}(from|to) ${role.replace(" ", "\\s*")}`, "i"));
}

const forbidden = `${migration}\n${remediation}\n${service}`;
assert.doesNotMatch(forbidden, /void|reversal journal|intercompany|batcave|kaiso/i);
assert.doesNotMatch(forbidden, /payment_account_number_ciphertext|payment_account_number_auth_tag/);

console.log("PASS verify-platform-finance-phase2d");
console.log("  Payment truth -> idempotent draft FT -> selected debit + derived control GL -> existing posting engine");
