/**
 * SentraCore Finance Phase 1A - authoritative PayChex COA verification.
 *
 * Static checks always run. When PLATFORM_FINANCE_VERIFY_DATABASE_URL is set,
 * post-migration live checks are read-only.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import {
  FINANCE_ACCOUNT_TYPES,
  PAYCHEX_AUTHORITATIVE_COA,
  isFinanceAccountType,
} from "../src/modules/platform-finance/domain/coa";

const PAYCHEX_ORG = "835a2e6d-a91b-413f-946a-8ed73a6027cc";
const MIGRATION =
  "supabase/migrations/20260917120000_paychex_authoritative_coa.sql";
const TEST_REFS = [
  "MJ-20260916-2D202C",
  "MJ-20260916-A41A04",
  "MJ-20260916-AFAE30",
] as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function mainStatic() {
  const migration = readFileSync(resolve(MIGRATION), "utf8");
  const codes = PAYCHEX_AUTHORITATIVE_COA.map((account) => account.code);
  const byCode = new Map(
    PAYCHEX_AUTHORITATIVE_COA.map((account) => [account.code, account])
  );

  assert(PAYCHEX_AUTHORITATIVE_COA.length === 61, "source account count is 61");
  assert(new Set(codes).size === 61, "all source account codes are unique");
  assert(
    PAYCHEX_AUTHORITATIVE_COA.every(
      (account) =>
        isFinanceAccountType(account.accountType) &&
        account.classification.trim().length > 0 &&
        account.name.trim().length > 0
    ),
    "all source rows have valid account types, classifications, and names"
  );
  assert(FINANCE_ACCOUNT_TYPES.length === 5, "account type architecture unchanged");

  const expectedByType = {
    asset: 10,
    liability: 5,
    equity: 3,
    revenue: 5,
    expense: 38,
  } as const;
  for (const [type, expected] of Object.entries(expectedByType)) {
    assert(
      PAYCHEX_AUTHORITATIVE_COA.filter((row) => row.accountType === type)
        .length === expected,
      `${type} count is ${expected}`
    );
  }

  assert(byCode.get("1000")?.name === "Land & Permanent Structures", "1000 name");
  assert(byCode.get("1060")?.name === "Cash & Bank Balances", "1060 name");
  assert(
    byCode.get("3020")?.name === "Opening Balance Clearing",
    "3020 Opening Balance Clearing"
  );
  assert(byCode.get("1080")?.name === "Due From Related Parties", "1080 name");
  assert(byCode.get("2020")?.name === "Due to Related Parties", "2020 name");
  assert(
    !PAYCHEX_AUTHORITATIVE_COA.some((row) =>
      [
        "1000|Cash",
        "2000|Accounts Payable",
        "3000|Equity",
        "4000|Revenue",
        "5000|Operating Expense",
      ].includes(`${row.code}|${row.name}`)
    ),
    "prototype semantics are absent"
  );

  for (const account of PAYCHEX_AUTHORITATIVE_COA) {
    if (account.code === "3020") {
      const phase2e = readFileSync(
        resolve(
          "supabase/migrations/20260917170000_finance_opening_balance_clearing_coa.sql"
        ),
        "utf8"
      );
      assert(
        phase2e.includes("'3020'") &&
          phase2e.includes("Opening Balance Clearing") &&
          phase2e.includes("transitional"),
        "Phase 2E migration adds transitional Opening Balance Clearing"
      );
      continue;
    }
    const sqlTuple = `('${account.code}', '${account.name.replaceAll("'", "''")}', '${account.accountType}', '${account.classification}')`;
    assert(migration.includes(sqlTuple), `migration matches source row ${account.code}`);
  }

  assert(migration.includes("account_total <> 5"), "exact prototype preflight");
  assert(migration.includes("transaction_total <> 3"), "exact transaction preflight");
  assert(migration.includes("journal_total <> 3"), "exact journal preflight");
  assert(migration.includes("line_total <> 6"), "exact line preflight");
  for (const reference of TEST_REFS) {
    assert(migration.includes(reference), `allowlisted reference ${reference}`);
  }
  assert(
    migration.includes("unexpected foreign-key dependencies on finance_accounts"),
    "dependency drift stops migration"
  );
  assert(
    migration.includes("disable trigger finance_journal_lines_no_posted_mutate") &&
      migration.includes("enable trigger finance_journal_lines_no_posted_mutate") &&
      migration.includes("disable trigger finance_journal_entries_no_posted_delete") &&
      migration.includes("enable trigger finance_journal_entries_no_posted_delete"),
    "immutability bypass is migration-local and restored"
  );
  assert(
    migration.includes("preserved_after is distinct from preserved_before"),
    "preserved Finance domains are fingerprinted"
  );
  assert(
    migration.includes("authoritative_coa_adopted") &&
      migration.includes("finance_audit_events"),
    "durable Finance audit event"
  );

  const journalPage = readFileSync(
    resolve("src/modules/platform-finance/components/PlatformFinanceNewJournalPage.tsx"),
    "utf8"
  );
  assert(
    journalPage.includes('accts.filter((a) => a.status === "active")'),
    "journal account selection remains active-account based"
  );

  const foundation = readFileSync(resolve("supabase/migrations/20260914140000_finance_foundation.sql"), "utf8");
  const posting = readFileSync(
    resolve("supabase/migrations/20260914140100_finance_posting_and_rls.sql"),
    "utf8"
  );
  assert(
    posting.includes("finance_post_transaction: no open period") &&
      posting.includes("v_period.status <> 'open'") &&
      foundation.includes("posted journal entries cannot be deleted") &&
      foundation.includes("posted journal lines cannot be updated or deleted"),
    "open-period and posted-journal protections remain"
  );
  assert(
    foundation.includes("create or replace view public.finance_general_ledger_v") &&
      foundation.includes("create or replace view public.finance_trial_balance_v"),
    "existing account-type reports remain available"
  );

  console.log("PASS static - 61 COA accounts (60 PayChex + Opening Balance Clearing) and controlled migration");
}

async function mainDb() {
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
    const accounts = await client.query<{
      code: string;
      name: string;
      account_type: string;
      classification: string;
      status: string;
    }>(
      `select code, name, account_type, classification, status
       from public.finance_accounts
       where organisation_id = $1
       order by code`,
      [PAYCHEX_ORG]
    );
    assert(accounts.rowCount === 61, "live PayChex account count is 61");
    assert(
      JSON.stringify(accounts.rows) ===
        JSON.stringify(
          PAYCHEX_AUTHORITATIVE_COA.map((row) => ({
            code: row.code,
            name: row.name,
            account_type: row.accountType,
            classification: row.classification,
            status: "active",
          }))
        ),
      "live account rows exactly match the authoritative source"
    );

    const cleanup = await client.query<{
      transactions: number;
      journals: number;
      lines: number;
    }>(
      `select
        (select count(*)::int from public.finance_transactions where organisation_id = $1) as transactions,
        (select count(*)::int from public.finance_journal_entries where organisation_id = $1) as journals,
        (select count(*)::int
         from public.finance_journal_lines l
         join public.finance_journal_entries e on e.id = l.journal_entry_id
         where e.organisation_id = $1) as lines`,
      [PAYCHEX_ORG]
    );
    assert(
      cleanup.rows[0]?.transactions === 0 &&
        cleanup.rows[0]?.journals === 0 &&
        cleanup.rows[0]?.lines === 0,
      "authorised test accounting records are removed"
    );

    const preserved = await client.query<Record<string, number>>(
      `select
        (select count(*)::int from public.finance_requests where organisation_id = $1) as requests,
        (select count(*)::int from public.finance_vendor_bills where organisation_id = $1) as vendor_bills,
        (select count(*)::int from public.finance_payables where organisation_id = $1) as payables,
        (select count(*)::int from public.finance_periods where organisation_id = $1) as periods,
        (select count(*)::int from public.finance_company_access where organisation_id = $1) as company_access,
        (select count(*)::int from public.finance_capability_grants where organisation_id = $1) as capability_grants`,
      [PAYCHEX_ORG]
    );

    const protections = await client.query<{ trigger_name: string }>(
      `select tgname as trigger_name
       from pg_trigger
       where tgrelid in (
         'public.finance_journal_entries'::regclass,
         'public.finance_journal_lines'::regclass
       )
         and tgname in (
           'finance_journal_entries_no_posted_delete',
           'finance_journal_lines_no_posted_mutate'
         )
         and tgenabled <> 'D'`
    );
    assert(protections.rowCount === 2, "posted-journal triggers are enabled");

    const infrastructure = await client.query<{
      open_period: string | null;
      ledger: string | null;
      trial_balance: string | null;
      audit_count: number;
    }>(
      `select
        to_regprocedure('public.finance_post_transaction(uuid,uuid,jsonb,uuid,text)')::text as open_period,
        to_regclass('public.finance_general_ledger_v')::text as ledger,
        to_regclass('public.finance_trial_balance_v')::text as trial_balance,
        (select count(*)::int
         from public.finance_audit_events
         where organisation_id = $1
           and action = 'authoritative_coa_adopted') as audit_count`,
      [PAYCHEX_ORG]
    );
    assert(infrastructure.rows[0]?.open_period, "open-period guard exists");
    assert(infrastructure.rows[0]?.ledger, "general-ledger view exists");
    assert(infrastructure.rows[0]?.trial_balance, "trial-balance view exists");
    assert(infrastructure.rows[0]?.audit_count === 1, "migration audit event exists once");

    // Read both views to prove expanded account types/classifications do not crash reports.
    await client.query(
      `select count(*) from public.finance_general_ledger_v where organisation_id = $1`,
      [PAYCHEX_ORG]
    );
    await client.query(
      `select count(*) from public.finance_trial_balance_v where organisation_id = $1`,
      [PAYCHEX_ORG]
    );

    console.log(`PASS live - ${JSON.stringify(preserved.rows[0])}`);
  } finally {
    await client.end();
  }
}

async function main() {
  mainStatic();
  await mainDb();
}

main().catch((error) => {
  console.error("FAIL verify-paychex-authoritative-coa");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
