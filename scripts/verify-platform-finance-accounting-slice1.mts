/**
 * Platform Finance Accounting Slice 1 — static verification (no DB writes).
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-platform-finance-accounting-slice1.mts
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  FINANCE_ACCOUNT_TYPES,
  PAYCHEX_AUTHORITATIVE_COA,
  isFinanceAccountType,
  normalizeAccountCode,
} from "../src/modules/platform-finance/domain/coa";
import {
  monthBounds,
  yearMonthBounds,
} from "../src/modules/platform-finance/domain/periods";
import { PLATFORM_FINANCE_CAPABILITIES } from "../src/modules/platform-finance/types";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function readSrc(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

function main() {
  // Domain: COA
  assert(FINANCE_ACCOUNT_TYPES.length === 5, "five account types");
  assert(isFinanceAccountType("asset"), "asset type");
  assert(!isFinanceAccountType("bank"), "no invented types");
  assert(normalizeAccountCode(" 1000 ") === "1000", "code normalize");
  assert(
    PAYCHEX_AUTHORITATIVE_COA.length === 60,
    "authoritative PayChex COA contains 60 accounts"
  );

  // Domain: periods
  const jan = monthBounds(2026, 1);
  assert(jan.startDate === "2026-01-01", "jan start");
  assert(jan.endDate === "2026-01-31", "jan end");
  const feb = monthBounds(2026, 2);
  assert(feb.endDate === "2026-02-28", "feb 2026 non-leap");
  const febLeap = monthBounds(2024, 2);
  assert(febLeap.endDate === "2024-02-29", "feb leap");
  assert(yearMonthBounds(2026).length === 12, "12 months");

  // Routes exist; unfinished report routes do not
  assert(
    existsSync(resolve("src/app/(app)/platform-finance/accounting/page.tsx")),
    "accounting hub route"
  );
  assert(
    existsSync(
      resolve(
        "src/app/(app)/platform-finance/accounting/chart-of-accounts/page.tsx"
      )
    ),
    "coa route"
  );
  assert(
    existsSync(
      resolve("src/app/(app)/platform-finance/accounting/periods/page.tsx")
    ),
    "periods route"
  );
  assert(
    existsSync(
      resolve("src/app/(app)/platform-finance/accounting/journal/page.tsx")
    ),
    "journal route exists (Slice 2)"
  );
  assert(
    !existsSync(
      resolve(
        "src/app/(app)/platform-finance/accounting/trial-balance/page.tsx"
      )
    ),
    "no fake trial balance page"
  );

  // Nav: Accounting live; subnav has coming soon for statements
  const nav = readSrc("src/modules/platform-finance/nav.ts");
  assert(
    nav.includes('href: "/platform-finance/accounting"'),
    "Accounting nav href is live"
  );
  assert(
    !nav.includes('label: "Accounting",\n    match: "prefix",\n    icon: Calculator,\n    comingSoon: true'),
    "Accounting is not comingSoon"
  );
  assert(
    nav.includes("PLATFORM_FINANCE_ACCOUNTING_SUBNAV") &&
      nav.includes("comingSoon: true"),
    "accounting subnav reserves unfinished surfaces"
  );

  // API actions + capability wiring
  const route = readSrc("src/app/api/platform-finance/route.ts");
  assert(route.includes('"createAccount"'), "createAccount action");
  assert(route.includes('"updateAccount"'), "updateAccount action");
  assert(route.includes('"setAccountStatus"'), "setAccountStatus action");
  assert(
    route.includes('"generatePeriodCalendar"'),
    "generatePeriodCalendar action"
  );
  assert(
    route.includes("PLATFORM_FINANCE_CAPABILITIES.manage_coa"),
    "manage_coa enforced"
  );
  assert(
    route.includes("PLATFORM_FINANCE_CAPABILITIES.manage_periods"),
    "manage_periods enforced"
  );
  assert(
    !route.includes("deleteAccount"),
    "no account hard-delete action"
  );

  // Server protects posted account identity
  const service = readSrc(
    "src/modules/platform-finance/server/PlatformFinanceServerService.ts"
  );
  assert(
    service.includes("accountHasPostedUsage") &&
      service.includes("Cannot change code of an account used in posted journals"),
    "posted account code lock"
  );
  assert(
    service.includes("generatePeriodCalendar") &&
      service.includes("ensureOpenPeriod"),
    "idempotent period generation"
  );

  // No operational domain posting introduced
  const vb = readSrc(
    "src/modules/platform-finance/domain/vendorBills.ts"
  );
  const payables = readSrc(
    "src/modules/platform-finance/domain/payables.ts"
  );
  assert(vb.includes("vendorBillIsNotPosting"), "VB still not posting");
  assert(payables.includes("payableIsNotJournal"), "payable still not journal");

  // Capabilities unchanged meaning
  assert(
    PLATFORM_FINANCE_CAPABILITIES.manage_coa ===
      "platform_finance.manage_coa",
    "manage_coa slug"
  );
  assert(
    PLATFORM_FINANCE_CAPABILITIES.manage_periods ===
      "platform_finance.manage_periods",
    "manage_periods slug"
  );

  // No schema migration required for Slice 1 (reuse finance_accounts / finance_periods)
  assert(
    !existsSync(
      resolve(
        "supabase/migrations/20260916200000_finance_accounting_slice1.sql"
      )
    ),
    "slice1 does not invent a parallel schema migration"
  );

  console.log("PASS verify-platform-finance-accounting-slice1");
  console.log(
    "  COA manage API + UI, period calendar generation, accounting workspace"
  );
}

main();
