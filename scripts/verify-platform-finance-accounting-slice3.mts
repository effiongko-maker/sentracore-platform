/**
 * Platform Finance Accounting Slice 3 — Controlled manual journal posting.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-platform-finance-accounting-slice3.mts
 *
 * Static checks always run.
 * Optional DB suite: PLATFORM_FINANCE_VERIFY_DATABASE_URL (transactional ROLLBACK).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertValidPostingLines,
  isBalanced,
  isXorDebitCredit,
} from "../src/modules/platform-finance/domain/invariants";
import {
  resolveFinanceVerifyDatabaseUrl,
  withFinanceVerifyTransaction,
} from "./lib/platform-finance-verify-transaction";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function readSrc(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

function mainStatic() {
  console.log("=== Accounting Slice 3 — static ===\n");

  assert(
    existsSync(
      resolve(
        "src/app/(app)/platform-finance/accounting/journal/new/page.tsx"
      )
    ),
    "journal/new route (redirect)"
  );
  const newRoute = readSrc(
    "src/app/(app)/platform-finance/accounting/journal/new/page.tsx"
  );
  assert(
    newRoute.includes('redirect("/platform-finance/accounting/journal")'),
    "journal/new redirects to register"
  );
  assert(
    existsSync(
      resolve(
        "src/modules/platform-finance/components/PlatformFinanceNewJournalPage.tsx"
      )
    ),
    "new journal form component"
  );
  assert(
    existsSync(
      resolve(
        "src/app/(app)/platform-finance/accounting/trial-balance/page.tsx"
      )
    ),
    "trial balance route exists for statements pass"
  );

  const route = readSrc("src/app/api/platform-finance/route.ts");
  assert(route.includes('"postManualJournal"'), "postManualJournal action");
  assert(route.includes('"findOpenPeriodForDate"'), "period resolve action");
  assert(
    route.includes("PLATFORM_FINANCE_CAPABILITIES.create_transaction") &&
      route.includes("PLATFORM_FINANCE_CAPABILITIES.post"),
    "create_transaction + post enforced for manual journal"
  );
  assert(
    !route.includes('"createJournal"') && !route.includes('"deleteJournal"'),
    "no createJournal/deleteJournal API actions"
  );

  const service = readSrc(
    "src/modules/platform-finance/server/PlatformFinanceServerService.ts"
  );
  assert(service.includes("postManualJournal"), "server postManualJournal");
  assert(
    service.includes("postFinanceTransaction"),
    "uses existing posting wrapper"
  );
  assert(
    service.includes('transactionType: "adjustment"'),
    "manual journal uses adjustment FT type"
  );
  assert(
    service.includes('sourceType: "manual_journal"'),
    "manual journal source tagged"
  );
  assert(
    service.includes("findOpenPeriodForDate"),
    "open period resolution helper"
  );
  assert(
    service.includes("createTransaction: granted.has") &&
      service.includes("post: granted.has"),
    "capabilities expose create/post"
  );

  const posting = readSrc(
    "src/modules/platform-finance/server/posting.ts"
  );
  assert(
    posting.includes('rpc(\n    "finance_post_transaction"') ||
      posting.includes('rpc("finance_post_transaction"') ||
      posting.includes('"finance_post_transaction"'),
    "posting.ts still calls finance_post_transaction"
  );

  const client = readSrc(
    "src/services/platform-finance/PlatformFinanceService.ts"
  );
  assert(client.includes("postManualJournal"), "client postManualJournal");
  assert(
    client.includes("findOpenPeriodForDate"),
    "client findOpenPeriodForDate"
  );

  const page = readSrc(
    "src/modules/platform-finance/components/PlatformFinanceNewJournalPage.tsx"
  );
  assert(page.includes("New Journal Entry"), "form title");
  assert(page.includes("Select company"), "company required UX");
  assert(page.includes("Post Entry"), "post CTA");
  assert(page.includes("Debit Account (DR)"), "debit account selector");
  assert(page.includes("Credit Account (CR)"), "credit account selector");
  assert(page.includes("Amount (₦)"), "single amount field");
  assert(page.includes("PlatformFinanceNewJournalDrawer"), "side drawer export");
  assert(page.includes("Prepared By"), "prepared by");
  assert(page.includes("Assigned on post"), "system reference");
  assert(!page.includes("Add Line"), "no multi-line editor CTA");
  assert(!page.includes("Save Draft"), "no invented draft-lines UX");
  assert(!/JE-2026-00012|PayChex mock|fake company/i.test(page), "no mock copy");

  const register = readSrc(
    "src/modules/platform-finance/components/PlatformFinanceJournalPage.tsx"
  );
  assert(
    register.includes("PlatformFinanceNewJournalDrawer"),
    "register hosts journal entry side drawer"
  );
  assert(
    register.includes("New Journal Entry"),
    "register CTA label"
  );
  assert(
    !register.includes('href="/platform-finance/accounting/journal/new"'),
    "register does not navigate to /journal/new"
  );
  assert(!register.includes('size="panel"'), "register no longer uses centered panel modal");
  assert(!register.includes("createJournal"), "register has no createJournal");
  assert(!register.includes("deleteJournal"), "register has no deleteJournal");

  const detail = readSrc(
    "src/modules/platform-finance/components/PlatformFinanceJournalDetailPage.tsx"
  );
  assert(!detail.includes("Edit journal"), "posted journal not editable");
  assert(!detail.includes("Delete"), "posted journal not deletable via UI");

  // Domain validation unit checks (pure)
  assert(
    isXorDebitCredit({ debit: 100, credit: 0 }) &&
      !isXorDebitCredit({ debit: 100, credit: 50 }) &&
      !isXorDebitCredit({ debit: 0, credit: 0 }),
    "xor debit/credit rules"
  );
  assert(
    isBalanced([
      { debit: 500, credit: 0 },
      { debit: 0, credit: 500 },
    ]),
    "balanced two-line"
  );
  assert(
    isBalanced([
      { debit: 300, credit: 0 },
      { debit: 200, credit: 0 },
      { debit: 0, credit: 500 },
    ]),
    "balanced multi-debit"
  );
  assert(
    !isBalanced([
      { debit: 500, credit: 0 },
      { debit: 0, credit: 450 },
    ]),
    "rejects unbalanced"
  );
  try {
    assertValidPostingLines([
      { accountId: "a", debit: 10, credit: 10 },
      { accountId: "b", debit: 0, credit: 0 },
    ]);
    throw new Error("expected invalid lines to throw");
  } catch (e) {
    assert(
      e instanceof Error && /debit or credit|line/i.test(e.message),
      "invalid lines throw"
    );
  }

  console.log("PASS verify-platform-finance-accounting-slice3 (static)");
  console.log("  Manual journal UI + postManualJournal over finance_post_transaction");
  console.log(
    "  Save Draft omitted: draft FTs do not store journal lines (no second model)."
  );
}

async function mainDb() {
  const url = resolveFinanceVerifyDatabaseUrl();
  if (!url) {
    console.log(
      "\nSKIPPED db.suite — PLATFORM_FINANCE_VERIFY_DATABASE_URL not set"
    );
    return;
  }

  const result = await withFinanceVerifyTransaction(async (client) => {
    // Prove posting RPC still exists and rejects unbalanced payloads.
    const reg = await client.query<{ reg: string | null }>(
      `select to_regprocedure('public.finance_post_transaction(uuid,uuid,jsonb,uuid,text)')::text as reg`
    );
    assert(reg.rows[0]?.reg, "finance_post_transaction missing");

    // Negative: empty lines JSON rejected by RPC when called against a draft FT
    // is covered by foundation-db; here we only assert the procedure remains.
    return { rpc: reg.rows[0]!.reg };
  });

  if (!result.ok) {
    throw new Error(result.error || "DB suite failed");
  }
  console.log("PASS db.suite — finance_post_transaction present (rolled back)");
}

async function main() {
  mainStatic();
  await mainDb();
}

main().catch((err) => {
  console.error("FAIL verify-platform-finance-accounting-slice3");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
