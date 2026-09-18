/**
 * Phase 2F-A static verifier — Counterparties + Sales Invoicing foundation.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path: string) => readFile(path, "utf8");
const stripSql = (value: string) => value.replace(/--.*$/gm, "");

const [
  cpMigration,
  invMigration,
  cpDomain,
  invDomain,
  cpService,
  invService,
  cpRoute,
  invRoute,
  nav,
  invoicesPage,
  reviewDrawer,
  paymentAccounting,
  openingService,
] = await Promise.all([
  read("supabase/migrations/20260918120000_organisation_counterparties_foundation.sql"),
  read("supabase/migrations/20260918121000_finance_invoices_foundation.sql"),
  read("src/modules/platform-finance/domain/counterparties.ts"),
  read("src/modules/platform-finance/domain/invoices.ts"),
  read("src/modules/platform-finance/server/PlatformFinanceCounterpartiesServerService.ts"),
  read("src/modules/platform-finance/server/PlatformFinanceInvoicesServerService.ts"),
  read("src/app/api/platform-finance/counterparties/route.ts"),
  read("src/app/api/platform-finance/invoices/route.ts"),
  read("src/modules/platform-finance/nav.ts"),
  read("src/modules/platform-finance/components/PlatformFinanceInvoicesPage.tsx"),
  read("src/modules/platform-finance/components/PlatformFinanceInvoiceReviewDrawer.tsx"),
  read("src/modules/platform-finance/server/PlatformFinancePaymentAccountingServerService.ts"),
  read("src/modules/platform-finance/server/PlatformFinanceOpeningPositionsServerService.ts"),
]);

assert.match(cpMigration, /create table public\.organisation_counterparties/i);
assert.match(cpMigration, /organisation_counterparty_roles/i);
assert.match(cpMigration, /tax_registration_id/);
assert.match(cpMigration, /role in \('customer', 'vendor', 'related_party'\)/);
assert.match(cpMigration, /platform_finance\.counterparty\.view/);
assert.match(cpMigration, /platform_finance\.counterparty\.manage/);
assert.match(cpMigration, /organisation_counterparty_create/);
assert.match(cpMigration, /organisation_counterparty_update/);
assert.doesNotMatch(stripSql(cpMigration), /finance_customers/i);
assert.doesNotMatch(stripSql(cpMigration), /create table public\.finance_vendors/i);

assert.match(invMigration, /create table public\.finance_invoices/i);
assert.match(invMigration, /create table public\.finance_invoice_lines/i);
assert.match(invMigration, /status in \('draft', 'under_review', 'issued'\)/);
assert.match(invMigration, /counterparty_display_name/);
assert.match(invMigration, /revenue_gl_account_id/);
assert.match(invMigration, /account_type <> 'revenue'/);
assert.match(invMigration, /code::int < 4000/);
assert.match(invMigration, /code::int > 4040/);
assert.match(invMigration, /finance_invoice_issue_and_post/);
assert.match(invMigration, /finance_invoice_create_draft/);
assert.match(invMigration, /finance_invoice_update_draft/);
assert.match(invMigration, /finance_post_transaction/);
assert.match(invMigration, /code = '1070'/);
assert.match(invMigration, /source_type = 'invoice'/);
assert.match(invMigration, /finance_transactions_invoice_source_uidx/);
assert.match(invMigration, /platform_finance\.invoice\.issue/);
assert.doesNotMatch(stripSql(invMigration), /finance_receivables/i);
assert.doesNotMatch(stripSql(invMigration), /create table public\.finance_receipts/i);
assert.doesNotMatch(stripSql(invMigration), /\bVAT\b|\bWHT\b|e-?invoic/i);
assert.doesNotMatch(stripSql(invMigration), /create table[\s\S]*accounting_proposal/i);
assert.doesNotMatch(stripSql(cpMigration + "\n" + invMigration), /is_platform_super_admin/i);

assert.match(invDomain, /INVOICE_SOURCE_TYPE = "invoice"/);
assert.match(cpDomain, /COUNTERPARTY_ROLES/);
assert.match(invDomain, /code >= 4000/);
assert.match(invDomain, /code <= 4040/);
assert.match(invService, /finance_invoice_issue_and_post/);
assert.match(invService, /finance_invoice_create_draft/);
assert.match(invService, /finance_invoice_update_draft/);
assert.match(invService, /getAccountingPreview/);
assert.match(cpService, /organisation_counterparties/);
assert.match(cpRoute, /createCounterparty/);
assert.match(invRoute, /issueAndPostInvoice/);
assert.match(nav, /href: "\/platform-finance\/invoices"/);
assert.match(nav, /href: "\/platform-finance\/counterparties"/);
assert.match(nav, /Receivables[\s\S]*comingSoon: true/);
assert.match(invoicesPage, /New Invoice/);
assert.match(reviewDrawer, /Issue & post to ledger/);
assert.doesNotMatch(reviewDrawer, /debitAccountId|Select debit/);

// Regression: payment and opening keep their own two-line workflows
assert.match(paymentAccounting, /source_type", "payment"/);
assert.match(openingService, /OPENING_POSITION_SOURCE_TYPE/);
assert.doesNotMatch(paymentAccounting, /finance_invoice_issue_and_post/);
assert.doesNotMatch(openingService, /finance_invoice_issue_and_post/);

console.log("verify-platform-finance-phase2f-a: PASS");
