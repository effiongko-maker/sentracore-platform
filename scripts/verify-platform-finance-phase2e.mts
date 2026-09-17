/**
 * Phase 2E static verifier — Opening Positions / Opening Balance Clearing.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path: string) => readFile(path, "utf8");
const stripSql = (value: string) => value.replace(/--.*$/gm, "");
const stripCode = (value: string) =>
  value.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const [
  coaMigration,
  openingMigration,
  domain,
  service,
  drawer,
  cashBanks,
  route,
  client,
  coaDomain,
  phase2a,
  overview,
] = await Promise.all([
  read("supabase/migrations/20260917170000_finance_opening_balance_clearing_coa.sql"),
  read(
    "supabase/migrations/20260917171000_finance_financial_account_opening_positions.sql"
  ),
  read("src/modules/platform-finance/domain/openingPositions.ts"),
  read(
    "src/modules/platform-finance/server/PlatformFinanceOpeningPositionsServerService.ts"
  ),
  read(
    "src/modules/platform-finance/components/PlatformFinanceOpeningPositionDrawer.tsx"
  ),
  read("src/modules/platform-finance/components/PlatformFinanceCashBanksPage.tsx"),
  read("src/app/api/platform-finance/financial-accounts/route.ts"),
  read("src/services/platform-finance/PlatformFinanceService.ts"),
  read("src/modules/platform-finance/domain/coa.ts"),
  read("supabase/migrations/20260917130000_finance_financial_accounts_foundation.sql"),
  read("src/modules/platform-finance/components/PlatformFinanceOverviewPage.tsx"),
]);

assert.match(coaMigration, /3020/);
assert.match(coaMigration, /Opening Balance Clearing/);
assert.match(coaMigration, /transitional|Temporary cutover/i);
assert.match(coaMigration, /'equity'/);
assert.match(
  stripSql(coaMigration),
  /'3020'[\s\S]*'Opening Balance Clearing'[\s\S]*'equity'/
);
assert.doesNotMatch(
  stripSql(coaMigration).replace(/--[\s\S]*?(?=\n|$)/g, ""),
  /insert[\s\S]*'(3000|3010)'/i
);

assert.match(
  openingMigration,
  /create table public\.finance_financial_account_opening_positions/i
);
assert.match(
  openingMigration,
  /constraint finance_fa_opening_positions_fa_unique unique \(financial_account_id\)/i
);
assert.match(
  openingMigration,
  /source_type = 'financial_account_opening_position'/i
);
assert.match(openingMigration, /transaction_type[\s\S]*'foundation'/i);
assert.match(
  openingMigration,
  /platform_finance\.create_transaction/
);
assert.doesNotMatch(
  stripSql(openingMigration),
  /platform_finance\.accounting\.create_transaction/
);
assert.match(openingMigration, /finance_opening_position_get_or_create/);
assert.match(openingMigration, /finance_opening_position_update_draft/);
assert.match(openingMigration, /finance_opening_position_mark_posted/);
assert.match(service, /postFinanceTransaction/);
assert.match(openingMigration, /enable row level security/i);
for (const role of ["public", "anon, authenticated", "service_role"]) {
  assert.match(
    openingMigration,
    new RegExp(
      `finance_opening_position_get_or_create[\\s\\S]{0,200}(from|to) ${role.replace(" ", "\\s*")}`,
      "i"
    )
  );
}

// Phase 2D capability correction inside 2E migration
assert.match(
  openingMigration,
  /create or replace function public\.finance_payment_accounting_get_or_create/i
);
assert.equal(
  (openingMigration.match(/platform_finance\.create_transaction/g) ?? []).length >= 4,
  true,
  "canonical create_transaction used in opening + payment RPC correction"
);

assert.doesNotMatch(
  stripSql(phase2a + "\n" + openingMigration),
  /\b(opening_balance|current_balance|available_balance|ledger_balance|cached_balance)\b/i
);
assert.doesNotMatch(
  stripCode(service),
  /from\("finance_journal_(entries|lines)"\)\.(insert|update)/
);
assert.match(service, /postFinanceTransaction/);
assert.match(service, /account\.classification !== "current_asset"/);
assert.match(service, /No open accounting period covers the cutover date/);
assert.match(service, /Financial Account not found/);
assert.match(service, /OPENING_BALANCE_CLEARING_CODE/);
assert.match(domain, /PHASE_2E_DEFAULT_CUTOVER_DATE = "2026-10-01"/);
assert.match(domain, /OPENING_POSITION_SOURCE_TYPE/);
assert.doesNotMatch(domain, /platform_super_admin/i);
assert.doesNotMatch(stripCode(service), /platform_super_admin/i);

assert.match(drawer, /Opening position/);
assert.match(drawer, /begins[\s\S]*operating in SentraCore/);
assert.match(drawer, /Opening Balance Clearing|creditAccount/);
assert.doesNotMatch(drawer, /Current Balance|Available Balance|Bank Balance/);
assert.doesNotMatch(drawer, /source_type|control_gl_account_id|RPC/);
assert.match(cashBanks, /Set opening position/);
assert.match(cashBanks, /not a live bank balance/i);
assert.doesNotMatch(cashBanks, /Current Balance|Available Balance/);

assert.match(route, /getOpeningPositionReview/);
assert.match(route, /updateOpeningPositionDraft/);
assert.match(route, /postOpeningPosition/);
assert.match(client, /getOpeningPositionReview/);
assert.match(client, /postOpeningPosition/);
assert.match(coaDomain, /code: "3020"/);
assert.match(coaDomain, /Opening Balance Clearing/);

assert.match(
  overview,
  /Account balances will appear here once Cash &amp; Banks is live/
);
assert.doesNotMatch(
  stripCode(overview),
  /openingPosition|Opening Position as current|authoritative current cash/i
);

console.log("PASS static - Phase 2E opening positions");
