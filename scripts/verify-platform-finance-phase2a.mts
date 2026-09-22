/**
 * Platform Finance Phase 2A - Financial Accounts + treasury authority.
 * Static checks always run. Optional live checks are read-only.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import {
  FINANCE_FINANCIAL_ACCOUNT_TYPES,
  FINANCE_FINANCIAL_ACCOUNT_VISIBILITIES,
  financialAccountIsVisible,
  isAccountNumberLast4,
} from "../src/modules/platform-finance/domain/financialAccounts";
import { PAYCHEX_AUTHORITATIVE_COA } from "../src/modules/platform-finance/domain/coa";
import { PLATFORM_FINANCE_CAPABILITIES } from "../src/modules/platform-finance/types";

const MIGRATION =
  "supabase/migrations/20260917130000_finance_financial_accounts_foundation.sql";
const PAYCHEX_ORG = "835a2e6d-a91b-413f-946a-8ed73a6027cc";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(path: string) {
  return readFileSync(resolve(path), "utf8");
}

function mainStatic() {
  const migration = source(MIGRATION);
  const repository = source(
    "src/modules/platform-finance/server/PlatformFinanceFinancialAccountsRepository.ts"
  );
  const service = source(
    "src/modules/platform-finance/server/PlatformFinanceFinancialAccountsServerService.ts"
  );
  const route = source(
    "src/app/api/platform-finance/financial-accounts/route.ts"
  );
  const ui = source(
    "src/modules/platform-finance/components/PlatformFinanceCashBanksPage.tsx"
  );
  const auditRepository = source(
    "src/modules/platform-finance/server/PlatformFinanceRepository.ts"
  );
  const access = source(
    "src/modules/platform-finance/server/requirePlatformFinanceAccess.ts"
  );

  assert(
    migration.includes("create table public.finance_financial_accounts") &&
      migration.includes("control_gl_account_id uuid not null references public.finance_accounts"),
    "Financial Account is a first-class entity with one GL control account"
  );
  assert(
    !/\b(current_balance|available_balance|opening_balance|ledger_balance|cached_balance|balance numeric)\b/i.test(
      migration
    ),
    "no balance field"
  );
  assert(
    migration.includes("account_number_last4") &&
      !/\b(full_account_number|account_number text|bank_account_number)\b/i.test(migration),
    "last-four-only banking data"
  );
  assert(
    JSON.stringify(FINANCE_FINANCIAL_ACCOUNT_TYPES) ===
      JSON.stringify(["bank", "cash", "petty_cash"]),
    "only justified account types"
  );
  assert(
    JSON.stringify(FINANCE_FINANCIAL_ACCOUNT_VISIBILITIES) ===
      JSON.stringify(["company", "restricted"]),
    "only company/restricted visibility"
  );
  assert(isAccountNumberLast4("1234"), "valid last four");
  assert(!isAccountNumberLast4("12345"), "full/long account number rejected");

  assert(
    financialAccountIsVisible({
      hasViewCapability: true,
      hasCompanyAccess: true,
      visibilityPolicy: "company",
      hasRestrictedAccountGrant: false,
    }),
    "company account visible with view + company"
  );
  assert(
    !financialAccountIsVisible({
      hasViewCapability: true,
      hasCompanyAccess: false,
      visibilityPolicy: "company",
      hasRestrictedAccountGrant: false,
    }),
    "company account hidden without company"
  );
  assert(
    financialAccountIsVisible({
      hasViewCapability: true,
      hasCompanyAccess: true,
      visibilityPolicy: "restricted",
      hasRestrictedAccountGrant: true,
    }),
    "restricted account visible with full authority composition"
  );
  assert(
    !financialAccountIsVisible({
      hasViewCapability: true,
      hasCompanyAccess: true,
      visibilityPolicy: "restricted",
      hasRestrictedAccountGrant: false,
    }),
    "restricted account absent without account grant"
  );
  assert(
    !financialAccountIsVisible({
      hasViewCapability: false,
      hasCompanyAccess: true,
      visibilityPolicy: "restricted",
      hasRestrictedAccountGrant: true,
    }),
    "restricted account absent without view capability"
  );

  assert(
    repository.includes("finance_financial_account_access") &&
      repository.includes("financialAccountIsVisible") &&
      repository.includes("listAccessibleCompanyIds"),
    "admin repository applies server-side visibility filtering"
  );
  assert(
    service.includes("requireCapability") &&
      service.includes("getVisible(profileId, financialAccountId)") &&
      service.includes("Financial Account not found"),
    "direct fetch/update fail closed in authoritative service"
  );
  assert(
    route.includes("financial_account_view") &&
      route.includes("financial_account_manage") &&
      route.includes("requirePlatformFinanceAccess"),
    "route composes explicit view/manage authority"
  );
  assert(
    access.includes("Super Admin does not auto-receive finance capabilities") &&
      !migration.includes("is_platform_super_admin()"),
    "Super Admin does not bypass Financial Account authority"
  );
  assert(
    migration.includes("A restricted account creator must not lose access") &&
      migration.includes("finance_financial_account_access"),
    "restricted creator receives an atomic explicit grant"
  );
  assert(
    migration.includes("object_type <> 'financial_account'") &&
      auditRepository.includes('row.object_type !== "financial_account"'),
    "restricted audit events cannot leak through RLS or admin reads"
  );
  assert(
    (ui.includes("Balances and money movements are") ||
      ui.includes("not a live bank balance")) &&
      !ui.includes("currentBalance") &&
      !ui.includes("availableBalance") &&
      !ui.includes("Payment history") &&
      !ui.includes("Transfer") &&
      !/\b(Current Balance|Available Balance|Bank Balance)\b/.test(ui),
    "minimal Cash & Banks surface has no fabricated treasury features"
  );
  assert(
    !/create\s+table[^;]*(batcave|private_office|private_finance|user_financial_account)/i.test(
      migration
    ),
    "no private/Private Office entity"
  );
  assert(
    !migration.includes("create or replace function public.finance_post_transaction") &&
      !migration.includes("alter table public.finance_journal_entries") &&
      !migration.includes("alter table public.finance_periods"),
    "posting, journal immutability, and period controls untouched"
  );
  assert(
    PAYCHEX_AUTHORITATIVE_COA.length === 61 &&
      PAYCHEX_AUTHORITATIVE_COA.find((row) => row.code === "1060")?.name ===
        "Cash & Bank Balances" &&
      PAYCHEX_AUTHORITATIVE_COA.find((row) => row.code === "3020")?.name ===
        "Opening Balance Clearing" &&
      !/insert into public\.finance_accounts|update public\.finance_accounts|delete from public\.finance_accounts/i.test(
        migration
      ),
    "Phase 1A COA base remains intact in Phase 2A migration; 3020 is Phase 2E"
  );
  assert(
    PLATFORM_FINANCE_CAPABILITIES.financial_account_view ===
      "platform_finance.financial_account.view" &&
      PLATFORM_FINANCE_CAPABILITIES.financial_account_manage ===
        "platform_finance.financial_account.manage",
    "small coherent capability additions"
  );

  console.log("PASS static - Phase 2A Financial Accounts and authority foundation");
}

async function mainLive() {
  const url = process.env.PLATFORM_FINANCE_VERIFY_DATABASE_URL?.trim();
  if (!url) {
    console.log("SKIPPED live - PLATFORM_FINANCE_VERIFY_DATABASE_URL not set");
    return;
  }
  const client = new Client({
    connectionString: url,
    ssl: url.includes("localhost") ? undefined : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const result = await client.query<{
      coa_count: number;
      cash_name: string;
      financial_accounts: number;
    }>(
      `select
        (select count(*)::int from public.finance_accounts where organisation_id = $1) as coa_count,
        (select name from public.finance_accounts where organisation_id = $1 and code = '1060') as cash_name,
        (select count(*)::int from public.finance_financial_accounts where organisation_id = $1) as financial_accounts`,
      [PAYCHEX_ORG]
    );
    assert(result.rows[0]?.coa_count === 61, "live PayChex COA remains 61");
    assert(
      result.rows[0]?.cash_name === "Cash & Bank Balances",
      "live PayChex 1060 unchanged"
    );
    console.log(
      `PASS live read-only - COA 60, 1060 unchanged, Financial Accounts ${result.rows[0]?.financial_accounts}`
    );
  } finally {
    await client.end();
  }
}

async function main() {
  mainStatic();
  await mainLive();
}

main().catch((error) => {
  console.error("FAIL verify-platform-finance-phase2a");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
