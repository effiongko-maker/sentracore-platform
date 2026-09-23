import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = (path: string) => readFile(path, "utf8");
const stripComments = (value: string) => value.replace(/--.*$/gm, "");
const [migration, phase2fa, dbVerify, types, server, route, page, nav, overview, seed, bundle] = await Promise.all([
  read("supabase/migrations/20260918130000_finance_receivables_subledger.sql"),
  read("supabase/migrations/20260918121000_finance_invoices_foundation.sql"),
  read("scripts/verify-platform-finance-phase2f-b-db.sql"),
  read("src/modules/platform-finance/types.ts"),
  read("src/modules/platform-finance/server/PlatformFinanceReceivablesServerService.ts"),
  read("src/app/api/platform-finance/receivables/route.ts"),
  read("src/modules/platform-finance/components/PlatformFinanceReceivablesPage.tsx"),
  read("src/modules/platform-finance/nav.ts"),
  read("src/modules/platform-finance/components/PlatformFinanceOverviewPage.tsx"),
  read("supabase/seed.sql"),
  read("scripts/lib/platform-developer-access-bundle.ts"),
]);
assert.match(migration, /create table public\.finance_receivables/i);
assert.match(migration, /unique \(invoice_id\)/i);
assert.match(migration, /source invoice must be issued/i);
assert.match(migration, /receivables are immutable/i);
assert.match(migration, /after insert or update of status on public\.finance_invoices/i);
assert.match(migration, /where status = 'issued'/i);
assert.match(migration, /on conflict \(invoice_id\) do nothing/i);
assert.match(migration, /platform_finance\.receivable\.view/i);
assert.doesNotMatch(stripComments(migration), /finance_post_transaction|insert into public\.finance_(transactions|journal_entries|journal_lines)/i);
assert.doesNotMatch(migration, /outstanding_amount|paid_amount|receipt|allocation/i);
assert.doesNotMatch(phase2fa, /finance_receivables/i);
assert.match(dbVerify, /repeated issue duplicated receivable or accounting/);
assert.match(dbVerify, /rollback;/);
assert.match(types, /receivable_view: "platform_finance\.receivable\.view"/);
assert.match(server, /listAccessibleCompanyIds/);
assert.match(server, /platform_finance\.receivable\.view/);
// Invoice (GL-recognised) receivables settle on POSTED receipts; off-ledger non-invoice receivables on confirmed ones.
assert.match(server, /const settled = offLedger \? committed : posted;/);
assert.match(server, /offLedger = originType !== "invoice"/);
assert.match(server, /outstandingAmount = Math\.max\(0, originalAmount - settled\)/);
assert.match(server, /availableToAllocate = Math\.max\(0, originalAmount - committed\)/);
assert.doesNotMatch(server + route, /is_platform_super_admin/i);
assert.match(route, /PLATFORM_FINANCE_CAPABILITIES\.receivable_view/);
assert.match(nav, /href: "\/platform-finance\/receivables"/);
assert.match(page, /Source &amp; accounting/);
assert.match(page, /accounting\/journal/);
assert.doesNotMatch(page, /Record Receipt|Allocate Receipt|Write Off|Cancel Receivable|Adjust Balance/);
assert.doesNotMatch(overview, /Receivables not live yet/);
for (const cap of ["counterparty", "invoice", "receivable"]) {
  assert.match(seed, new RegExp(`platform_finance\\.${cap}`));
  assert.match(bundle, new RegExp(`PLATFORM_FINANCE_CAPABILITIES\\.${cap}_`));
}
console.log("PASS verify-platform-finance-phase2f-b");
