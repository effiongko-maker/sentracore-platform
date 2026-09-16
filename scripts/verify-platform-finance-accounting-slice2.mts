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
  assert(register.includes("New Journal Entry"), "new journal CTA");
  assert(
    register.includes("pf-journal-toolbar-cta"),
    "CTA lives in register toolbar with search"
  );
  assert(
    !register.includes("pf-journal-header-cta") &&
      !register.includes("pf-journal-header-actions"),
    "CTA not in page header / old toolbar group"
  );
  assert(
    !/>\s*Filters\s*</.test(register) && !register.includes(">Filters<"),
    "no Filters toggle button"
  );
  assert(!register.includes("filtersOpen"), "filters always visible");
  assert(register.includes("All Companies"), "company filter default");
  assert(register.includes(">Date</th>"), "Date column");
  assert(register.includes(">Ref No</th>"), "Ref No column");
  assert(register.includes(">Description</th>"), "Description column");
  assert(register.includes(">Code</th>"), "Code column");
  assert(register.includes(">Account Name</th>"), "Account Name column");
  assert(register.includes("Debit (₦)"), "Debit column");
  assert(register.includes("Credit (₦)"), "Credit column");
  assert(register.includes(">Prepared By</th>"), "Prepared By column");
  assert(register.includes(">Period</th>"), "Period column");
  assert(
    !register.includes("<th>Company</th>") &&
      !register.includes("<th>Journal No.</th>") &&
      !register.includes("<th>Source Type</th>") &&
      !register.includes("<th>Status</th>"),
    "no company/journal-no/source/status columns"
  );
  assert(
    register.includes("No posted journal entries yet."),
    "restrained empty message"
  );
  assert(
    !register.includes("pf-req-empty"),
    "empty state does not replace table with blank card"
  );
  assert(register.includes("journalEntryId"), "line rows open journal detail");

  const types = readSrc("src/modules/platform-finance/journalTypes.ts");
  assert(types.includes("accountCode"), "register row has accountCode");
  assert(types.includes("preparedByName"), "register row has preparedByName");
  assert(types.includes("journalEntryId"), "register row has journalEntryId");
  assert(types.includes("pageDebitTotal"), "page debit total");

  const repo = readSrc(
    "src/modules/platform-finance/server/PlatformFinanceRepository.ts"
  );
  assert(repo.includes("queryJournalRegister"), "register query");
  assert(repo.includes("enrichJournalRegisterLines"), "line-level enrichment");
  assert(repo.includes("listJournalLinesWithAccounts"), "lines+accounts");
  assert(
    repo.includes("created_by_profile_id"),
    "preparer sourced from FT"
  );

  const detail = readSrc(
    "src/modules/platform-finance/components/PlatformFinanceJournalDetailPage.tsx"
  );
  assert(detail.includes("Journal is balanced"), "balance indicator");
  assert(detail.includes("Journal is not balanced"), "unbalanced integrity alert");
  assert(detail.includes("transactionHref"), "FT link gated");
  assert(detail.includes("<dt>Company</dt>"), "detail keeps Company attribute");
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
  assert(service.includes("preparedByName"), "service maps preparedByName");

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
