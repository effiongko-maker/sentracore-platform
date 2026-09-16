/**
 * Platform Finance Accounting Slice 2 — Journal register + detail (static).
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-platform-finance-accounting-slice2.mts
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function readSrc(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

function main() {
  assert(
    existsSync(
      resolve("src/app/(app)/platform-finance/accounting/journal/page.tsx")
    ),
    "journal register route"
  );
  assert(
    existsSync(
      resolve(
        "src/app/(app)/platform-finance/accounting/journal/[id]/page.tsx"
      )
    ),
    "journal detail route"
  );
  assert(
    !existsSync(
      resolve(
        "src/app/(app)/platform-finance/accounting/trial-balance/page.tsx"
      )
    ),
    "no fake TB route"
  );

  const nav = readSrc("src/modules/platform-finance/nav.ts");
  assert(
    nav.includes('href: "/platform-finance/accounting/journal"'),
    "Journal subnav is live"
  );
  assert(
    !nav.includes('label: "Journal",\n      icon: BookOpen,\n      comingSoon: true'),
    "Journal is not comingSoon"
  );

  const route = readSrc("src/app/api/platform-finance/route.ts");
  assert(route.includes('"listJournals"'), "listJournals action");
  assert(route.includes('"getJournalDetail"'), "getJournalDetail action");

  const register = readSrc(
    "src/modules/platform-finance/components/PlatformFinanceJournalPage.tsx"
  );
  assert(
    register.includes("View posted journal entries and their accounting details."),
    "register subtitle"
  );
  assert(!/JE-2026-00012|500,?000|website development/i.test(register), "no mock JE copy");
  assert(!register.includes("createJournal"), "no create journal UI");
  assert(!register.includes("deleteJournal"), "no delete journal UI");

  const detail = readSrc(
    "src/modules/platform-finance/components/PlatformFinanceJournalDetailPage.tsx"
  );
  assert(detail.includes("Journal is balanced"), "balance indicator");
  assert(detail.includes("Journal is not balanced"), "unbalanced integrity alert");
  assert(detail.includes("transactionHref"), "FT link gated");
  assert(!detail.includes("Edit journal"), "no edit action");
  assert(!detail.includes("Delete"), "no delete action on detail");

  const service = readSrc(
    "src/modules/platform-finance/server/PlatformFinanceServerService.ts"
  );
  assert(service.includes("listJournals"), "server listJournals");
  assert(service.includes("getJournalDetail"), "server getJournalDetail");
  assert(
    service.includes("listAccessibleCompanyIds"),
    "company access enforced"
  );

  const repo = readSrc(
    "src/modules/platform-finance/server/PlatformFinanceRepository.ts"
  );
  assert(repo.includes("queryJournalRegister"), "register query");
  assert(repo.includes("listJournalLinesWithAccounts"), "lines+accounts");

  // Ops domains still not posting
  assert(
    readSrc("src/modules/platform-finance/domain/vendorBills.ts").includes(
      "vendorBillIsNotPosting"
    ),
    "VB not posting"
  );
  assert(
    readSrc("src/modules/platform-finance/domain/payables.ts").includes(
      "payableIsNotJournal"
    ),
    "payable not journal"
  );

  // No freehand mutation APIs
  assert(!route.includes("updateJournal"), "no updateJournal");
  assert(!route.includes("deleteJournal"), "no deleteJournal");
  assert(!route.includes("createJournal"), "no createJournal");

  console.log("PASS verify-platform-finance-accounting-slice2");
  console.log("  Journal register + detail (read-only) over existing SoT");
}

main();
