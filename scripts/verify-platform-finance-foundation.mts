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

  // --- Seed registration ---
  const seed = readSrc("supabase/seed.sql");
  assert(seed.includes("'platform_finance'"), "seed registers platform_finance");
  assert(seed.includes("finance_companies"), "seed mirrors company seed");

  console.log("PASS verify-platform-finance-foundation");
  console.log("  domain invariants + static isolation + migrations + workspace freeze");
}

main();
