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
        "src/app/(app)/platform-finance/accounting/general-ledger/page.tsx"
      )
    ),
    "general ledger route"
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
    existsSync(
      resolve(
        "src/app/(app)/platform-finance/accounting/trial-balance/page.tsx"
      )
    ),
    "trial balance route"
  );
  assert(
    existsSync(
      resolve(
        "src/app/(app)/platform-finance/accounting/profit-and-loss/page.tsx"
      )
    ) &&
      existsSync(
        resolve(
          "src/app/(app)/platform-finance/accounting/balance-sheet/page.tsx"
        )
      ),
    "P&L and Balance Sheet routes"
  );
  assert(
    !existsSync(
      resolve("src/app/(app)/platform-finance/accounting/cash-flow/page.tsx")
    ) &&
      !existsSync(
        resolve("src/app/(app)/platform-finance/accounting/pnl/page.tsx")
      ),
    "Cash Flow route remains dark"
  );

  const nav = readSrc("src/modules/platform-finance/nav.ts");
  assert(
    nav.includes('href: "/platform-finance/accounting/journal"'),
    "Journal subnav is live"
  );
  assert(
    nav.includes('href: "/platform-finance/accounting/general-ledger"'),
    "General Ledger subnav is live"
  );
  assert(
    !nav.includes('label: "Journal",\n      icon: BookOpen,\n      comingSoon: true'),
    "Journal is not comingSoon"
  );
  assert(
    !nav.includes("comingSoon: true") ||
      (nav.includes('label: "Trial Balance"') &&
        nav.includes('label: "P&L"') &&
        nav.includes('label: "Balance Sheet"') &&
        nav.includes('label: "Cash Flow"')),
    "statement labels remain"
  );
  assert(
    nav.includes('href: "/platform-finance/accounting/trial-balance"'),
    "Trial Balance is live"
  );
  assert(
    nav.includes('href: "/platform-finance/accounting/profit-and-loss"'),
    "P&L is live"
  );
  assert(
    nav.includes('href: "/platform-finance/accounting/balance-sheet"'),
    "Balance Sheet is live"
  );
  assert(
    nav.includes('{ href: null, label: "Cash Flow"') ||
      nav.includes('href: null,\n        label: "Cash Flow"'),
    "Cash Flow remains dark"
  );

  const route = readSrc("src/app/api/platform-finance/route.ts");
  assert(route.includes('"listJournals"'), "listJournals action");
  assert(route.includes('"listGeneralLedger"'), "listGeneralLedger action");
  assert(route.includes('"getJournalDetail"'), "getJournalDetail action");
  assert(
    !route.includes("platform_finance.ledger") &&
      !route.includes("counterparty.ledger") &&
      !route.includes("general_ledger.view"),
    "no invented GL capability"
  );

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
  assert(repo.includes("queryGeneralLedger"), "dedicated GL query");
  assert(repo.includes("finance_general_ledger_v"), "GL reads posted-line view");
  assert(!repo.includes("debit.sum()"), "GL totals do not use PostgREST sum");
  assert(!repo.includes("credit.sum()"), "GL totals do not use PostgREST credit sum");
  assert(repo.includes("sumGeneralLedgerDebitCredit"), "server-only debit/credit scan");
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
  assert(service.includes("listGeneralLedger"), "server listGeneralLedger");
  assert(service.includes("getJournalDetail"), "server getJournalDetail");
  assert(
    service.includes("listAccessibleCompanyIds"),
    "company access enforced"
  );
  assert(service.includes("preparedByName"), "service maps preparedByName");
  assert(
    service.includes("GL account is required."),
    "GL requires an account"
  );

  const glPage = readSrc(
    "src/modules/platform-finance/components/PlatformFinanceGeneralLedgerPage.tsx"
  );
  assert(glPage.includes(">Journal Ref</th>"), "GL Journal Ref column");
  assert(glPage.includes(">Prepared By</th>"), "GL Prepared By column");
  assert(!glPage.includes(">GL Code</th>"), "account-scoped GL omits GL Code column");
  assert(glPage.includes("Total Debits"), "filtered debit total");
  assert(glPage.includes("Total Credits"), "filtered credit total");
  assert(glPage.includes("Net Movement"), "filtered net movement");
  assert(
    glPage.includes("Select a GL account to view posted activity."),
    "account required empty state"
  );
  assert(
    glPage.includes("Search reference or description..."),
    "search placeholder omits account"
  );
  assert(!glPage.includes("Date from"), "period/date controls removed from primary GL UI");
  assert(!glPage.includes("aria-label=\"Period\""), "period control removed from primary GL UI");
  assert(!/running balance|opening balance/i.test(glPage), "no running/opening balance");
  assert(
    !/last4|institution|account_number|Restricted corporate financial account/i.test(
      glPage
    ),
    "no restricted financial-account identity"
  );
  assert(!glPage.includes("source_id"), "no source_id in GL UI");
  assert(
    glPage.includes("/platform-finance/accounting/journal/"),
    "Journal Ref routes to journal detail"
  );
  assert(
    !glPage.includes("queryJournalRegister"),
    "GL page does not reuse journal register query"
  );

  const glTypes = readSrc(
    "src/modules/platform-finance/domain/generalLedger.ts"
  );
  assert(glTypes.includes("totalDebit"), "filtered-set debit total type");
  assert(glTypes.includes("journalEntryId"), "GL row keeps journalEntryId");
  assert(!glTypes.includes("source_id"), "GL types omit source_id");

  const client = readSrc(
    "src/services/platform-finance/PlatformFinanceService.ts"
  );
  assert(client.includes("listGeneralLedger"), "client listGeneralLedger");

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
  console.log("  Journal register + detail + General Ledger (posted lines)");
}

main();
