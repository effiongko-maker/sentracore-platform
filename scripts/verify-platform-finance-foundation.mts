/**
 * Platform Finance Phase 1 foundation — pure unit + static checks (no DB).
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-platform-finance-foundation.mts
 *
 * Optional DB smoke (skips without env):
 *   npx tsx --tsconfig tsconfig.json scripts/verify-platform-finance-foundation-db.mts
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertBalanced,
  assertValidPostingLines,
  assertXorDebitCredit,
  isBalanced,
  isXorDebitCredit,
  sumCredits,
  sumDebits,
} from "../src/modules/platform-finance/domain/invariants";
import {
  PLATFORM_FINANCE_CAPABILITIES,
  PLATFORM_FINANCE_MODULE_SLUG,
} from "../src/modules/platform-finance/types";
import { getWorkspace, resolveCurrentWorkspaceId } from "../src/lib/platform/workspaces";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function readSrc(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

function collectTsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectTsFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function main() {
  // --- Domain invariants ---
  assert(isXorDebitCredit({ debit: 100, credit: 0 }), "xor debit ok");
  assert(isXorDebitCredit({ debit: 0, credit: 50 }), "xor credit ok");
  assert(!isXorDebitCredit({ debit: 10, credit: 10 }), "xor both positive fails");
  assert(!isXorDebitCredit({ debit: 0, credit: 0 }), "xor both zero fails");
  assert(!isXorDebitCredit({ debit: -1, credit: 0 }), "xor negative fails");

  assertXorDebitCredit({ debit: 25, credit: 0 });
  let threw = false;
  try {
    assertXorDebitCredit({ debit: 1, credit: 1 });
  } catch {
    threw = true;
  }
  assert(threw, "assertXorDebitCredit rejects dual amounts");

  const balanced = [
    { debit: 100, credit: 0 },
    { debit: 0, credit: 100 },
  ];
  assert(isBalanced(balanced), "balanced entry");
  assert(sumDebits(balanced) === 100, "sum debit");
  assert(sumCredits(balanced) === 100, "sum credit");
  assertBalanced(balanced);

  assert(
    !isBalanced([{ debit: 50, credit: 0 }, { debit: 0, credit: 40 }]),
    "unbalanced rejected"
  );
  assert(!isBalanced([{ debit: 10, credit: 0 }]), "single line rejected");

  assertValidPostingLines([
    { accountId: "a1", debit: 80, credit: 0 },
    { accountId: "a2", debit: 0, credit: 80 },
  ]);

  threw = false;
  try {
    assertValidPostingLines([
      { accountId: "a1", debit: 10, credit: 0 },
      { accountId: "a2", debit: 0, credit: 5 },
    ]);
  } catch {
    threw = true;
  }
  assert(threw, "assertValidPostingLines rejects unbalanced");

  // --- Capability prefix ---
  for (const cap of Object.values(PLATFORM_FINANCE_CAPABILITIES)) {
    assert(
      cap.startsWith("platform_finance."),
      `capability prefix: ${cap}`
    );
    assert(!cap.startsWith("finance."), `must not use FM finance.*: ${cap}`);
  }
  assert(PLATFORM_FINANCE_MODULE_SLUG === "platform_finance", "module slug");

  // --- Workspace catalogue freeze ---
  const financeWs = getWorkspace("finance");
  assert(financeWs, "finance workspace exists");
  assert(financeWs!.status === "in_development", "finance stays in_development");
  assert(financeWs!.href === undefined, "finance catalogue has no href");
  assert(
    resolveCurrentWorkspaceId("/platform-finance") === "finance",
    "/platform-finance → finance workspace"
  );

  const workspacesSrc = readSrc("src/lib/platform/workspaces.ts");
  const platformFinanceBlock = workspacesSrc.slice(
    workspacesSrc.indexOf('id: "finance"'),
    workspacesSrc.indexOf('id: "construction"')
  );
  assert(
    !/(^|\n)\s*href\s*:/.test(platformFinanceBlock),
    "finance workspace block must not define href"
  );
  assert(
    platformFinanceBlock.includes('status: "in_development"'),
    "finance workspace in_development in source"
  );
  assert(
    workspacesSrc.includes("isPlatformFinancePath"),
    "isPlatformFinancePath helper present"
  );

  // --- No FM finance module imports ---
  const pfRoot = resolve("src/modules/platform-finance");
  for (const file of collectTsFiles(pfRoot)) {
    const src = readFileSync(file, "utf8");
    assert(
      !src.includes("@/modules/finance") &&
        !src.includes('from "../finance') &&
        !src.includes("from '@/modules/finance"),
      `platform-finance must not import FM finance: ${file}`
    );
    assert(
      !src.includes("ecc_finance_"),
      `platform-finance must not reference ecc_finance_*: ${file}`
    );
  }

  const clientSvc = readSrc("src/services/platform-finance/PlatformFinanceService.ts");
  assert(
    !clientSvc.includes("@/modules/finance"),
    "client service must not import FM finance"
  );

  // --- Migrations ---
  const foundation = resolve(
    "supabase/migrations/20260914140000_finance_foundation.sql"
  );
  const posting = resolve(
    "supabase/migrations/20260914140100_finance_posting_and_rls.sql"
  );
  assert(existsSync(foundation), "foundation migration exists");
  assert(existsSync(posting), "posting/RLS migration exists");

  const foundationSql = readSrc(
    "supabase/migrations/20260914140000_finance_foundation.sql"
  );
  for (const table of [
    "finance_companies",
    "finance_company_access",
    "finance_capability_grants",
    "finance_accounts",
    "finance_periods",
    "finance_transactions",
    "finance_journal_entries",
    "finance_journal_lines",
    "finance_audit_events",
  ]) {
    assert(foundationSql.includes(table), `foundation has ${table}`);
  }
  assert(
    foundationSql.includes("before update or delete on public.finance_journal_lines"),
    "journal lines immutability is UPDATE/DELETE only"
  );
  assert(
    !/before insert.*finance_journal_lines/i.test(foundationSql),
    "journal lines INSERT must not be blocked by immutability trigger"
  );

  const postingSql = readSrc(
    "supabase/migrations/20260914140100_finance_posting_and_rls.sql"
  );
  assert(
    postingSql.includes("finance_post_transaction"),
    "posting RPC name present"
  );
  assert(
    postingSql.includes("finance_close_period"),
    "close period RPC present"
  );
  assert(
    postingSql.includes("security definer"),
    "posting uses SECURITY DEFINER"
  );
  assert(
    postingSql.includes("platform_finance.view"),
    "RLS references platform_finance.view"
  );
  assert(
    postingSql.includes("has_finance_company_access"),
    "RLS uses company access helper"
  );

  // --- Module slug in actions types ---
  const actionsTypes = readSrc("src/lib/actions/types.ts");
  assert(
    actionsTypes.includes('"platform_finance"'),
    "PlatformModuleSlug includes platform_finance"
  );

  // --- Seed + developer/QA access bundle ---
  // Role-based explicit grants for organisation_owner / platform_super_admin
  // (not email bypass). Full implemented Finance + Command Centre catalog.
  const seed = readSrc("supabase/seed.sql");
  assert(seed.includes("'platform_finance'"), "seed registers platform_finance");
  assert(seed.includes("finance_companies"), "seed mirrors company seed");
  assert(
    seed.includes("platform-developer-access-bundle") &&
      seed.includes("'platform_finance.view'") &&
      seed.includes("'platform_finance.request.create'") &&
      seed.includes("'platform_finance.request.review'") &&
      seed.includes("'platform_finance.request.approve'") &&
      seed.includes("'platform_finance.vendor_bill.create'") &&
      seed.includes("'platform_finance.vendor_bill.review'") &&
      seed.includes("'platform.command_centre.view'") &&
      seed.includes("'platform.command_centre.decide'"),
    "seed grants developer/QA Finance + Command Centre capability bundle"
  );
  assert(
    seed.includes("organisation_owner") &&
      seed.includes("platform_super_admin") &&
      seed.includes("finance_company_access"),
    "seed developer access is role-based and includes company access"
  );

  const developerBundle = readSrc(
    "scripts/lib/platform-developer-access-bundle.ts"
  );
  assert(
    developerBundle.includes("PLATFORM_FINANCE_CAPABILITIES") &&
      developerBundle.includes("COMMAND_CENTRE_CAPABILITIES") &&
      developerBundle.includes("vendor_bill_create") &&
      developerBundle.includes("request_approve"),
    "central developer access bundle imports catalog capabilities"
  );

  const developerGrant = readSrc("scripts/grant-platform-developer-access.mts");
  assert(
    developerGrant.includes("PLATFORM_DEVELOPER_FINANCE_CAPABILITIES") &&
      developerGrant.includes("PLATFORM_DEVELOPER_COMMAND_CENTRE_CAPABILITIES") &&
      developerGrant.includes("finance_capability_grants") &&
      developerGrant.includes("platform_capability_grants") &&
      developerGrant.includes("finance_company_access"),
    "developer grant script upserts Finance, Command Centre, and company grants"
  );

  const legacyGrant = readSrc("scripts/grant-platform-finance-dev-access.mts");
  assert(
    legacyGrant.includes("grant-platform-developer-access.mts"),
    "legacy finance grant script delegates to central developer grant"
  );
  assert(
    !legacyGrant.includes("PLATFORM_FINANCE_CAPABILITIES.request_review"),
    "legacy finance grant script does not invent its own capability list"
  );

  // --- Verification lifecycle hardening (static) ---
  const txHelperPath = "scripts/lib/platform-finance-verify-transaction.ts";
  const foundationDbPath = "scripts/verify-platform-finance-foundation-db.mts";
  const slice2Path = "scripts/verify-platform-finance-requests-slice2.mts";
  assert(existsSync(resolve(txHelperPath)), "transaction helper exists");
  assert(
    !existsSync(resolve("scripts/lib/platform-finance-smoke-cleanup.mts")),
    "unsafe smoke-cleanup helper must be removed"
  );
  assert(
    !existsSync(resolve("scripts/cleanup-platform-finance-smoke-artifacts.mts")),
    "unsafe one-shot smoke cleanup script must be removed"
  );

  const txHelper = readSrc(txHelperPath);
  const foundationDb = readSrc(foundationDbPath);
  const slice2 = readSrc(slice2Path);
  const scriptsBundle = [txHelper, foundationDb, slice2].join("\n");

  assert(
    txHelper.includes("BEGIN") && txHelper.includes("ROLLBACK"),
    "transaction helper BEGIN/ROLLBACK"
  );
  assert(
    /finally[\s\S]*ROLLBACK/.test(txHelper),
    "ROLLBACK guaranteed in finally"
  );
  assert(
    !/session_replication_role\s*=\s*replica/.test(scriptsBundle),
    "session_replication_role = replica must be absent"
  );
  assert(
    !scriptsBundle.includes("hardDeleteFinanceSmokeArtifacts"),
    "hardDeleteFinanceSmokeArtifacts must not be referenced"
  );
  assert(
    foundationDb.includes("withFinanceVerifyTransaction") &&
      slice2.includes("withFinanceVerifyTransaction"),
    "DB verifies use withFinanceVerifyTransaction"
  );
  assert(
    !/from\(["']finance_capability_grants["']\)\s*\.delete\(/.test(foundationDb) &&
      !/from\(["']finance_capability_grants["']\)\s*\.delete\(/.test(slice2) &&
      !/\.query\(\s*`delete from public\.finance_capability_grants/i.test(
        scriptsBundle
      ),
    "verify scripts must not delete finance_capability_grants"
  );
  assert(
    !/\.query\(\s*`delete from public\.finance_company_access/i.test(
      scriptsBundle
    ),
    "verify scripts must not delete finance_company_access"
  );
  assert(
    !/delete from public\.finance_periods[\s\S]*year = any/i.test(scriptsBundle) &&
      !/year IN \(2098,\s*2099\)/i.test(scriptsBundle),
    "no broad 2098/2099 period deletion"
  );
  assert(
    !/reason = any\(\[[\s\S]*race A/i.test(scriptsBundle) &&
      !/FINANCE_SMOKE_AUDIT_REASONS/.test(scriptsBundle),
    "no generic audit-reason deletion cleanup"
  );
  assert(
    !/ee7eb825-090d-4db9-a852-feb278a69763/.test(foundationDb) &&
      !/ee7eb825-090d-4db9-a852-feb278a69763/.test(slice2),
    "verify scripts must not hard-code development profile UUID"
  );
  assert(
    foundationDb.includes("PLATFORM_FINANCE_VERIFY_DATABASE_URL") &&
      slice2.includes("PLATFORM_FINANCE_VERIFY_DATABASE_URL"),
    "DB suite gated on explicit PLATFORM_FINANCE_VERIFY_DATABASE_URL"
  );

  // Default period selection remains non-hard-coded
  const overviewSvc = readSrc(
    "src/modules/platform-finance/server/PlatformFinanceServerService.ts"
  );
  assert(
    overviewSvc.includes("selectDefaultFinancePeriod"),
    "selectDefaultFinancePeriod present"
  );
  assert(
    !/September 2026|2099-01|hard-?coded.*period/i.test(
      overviewSvc.slice(
        overviewSvc.indexOf("selectDefaultFinancePeriod"),
        overviewSvc.indexOf("selectDefaultFinancePeriod") + 1200
      )
    ),
    "default period helper must not hard-code a product month"
  );

  console.log("PASS verify-platform-finance-foundation");
  console.log(
    "  domain invariants + static isolation + migrations + workspace freeze + verify lifecycle"
  );
}

main();
