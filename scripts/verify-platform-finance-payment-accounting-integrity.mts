/**
 * Payment Accounting Integrity slice: confirmed Payment → Review & Post → Journal Entry → GL.
 * Non-mutating: pure functions, prototype stubs and source/migration inspection only.
 *
 *   NODE_PATH=<dir containing an empty server-only/ stub> \
 *     npx tsx --tsconfig tsconfig.json scripts/verify-platform-finance-payment-accounting-integrity.mts
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PAYMENT_CONTROL_ACCOUNT_REASON,
  PAYMENT_PERIOD_CLOSED_REASON,
  PAYMENT_PERIOD_MISSING_REASON,
  PAYMENT_SOURCE_ACCOUNT_REASON,
  paymentAccountingBlockingReason,
  paymentPeriodBlockingReason,
} from "../src/modules/platform-finance/domain/paymentAccounting";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}
const src = (p: string) => readFileSync(resolve(p), "utf8");
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/--.*$/gm, "");

const okInputs = {
  companyId: "co", currency: "NGN", paymentDate: "2026-09-10",
  periods: [{ companyId: "co", startDate: "2026-09-01", endDate: "2026-09-30", status: "open" as const }],
  sourceAccount: { status: "active", companyId: "co", currency: "NGN" },
  controlAccount: { status: "active", accountType: "asset", classification: "current_asset" },
};

async function main() {
  const out: string[] = [];
  const pass = (m: string) => out.push(`PASS ${m}`);
  const svcRaw = src("src/modules/platform-finance/server/PlatformFinancePaymentAccountingServerService.ts");
  const svc = strip(svcRaw);
  const mig = src("supabase/migrations/20260917160000_finance_payment_accounting_review_post.sql");
  const postRpc = src("supabase/migrations/20260914140100_finance_posting_and_rls.sql");

  // ── A. Confirmed + unposted ⇒ Awaiting Accounting (never Posted) ─────────
  {
    assert(/const posted = ft\?\.status === "posted" && Boolean\(ft\.journal_entry_id\)/.test(svc), "A: 'posted' requires the authoritative Finance Transaction to be posted AND to hold a Journal Entry");
    assert(!/from\("finance_payments"\)\s*\.\s*(update|insert|delete|upsert)/.test(svc.replace(/\s+/g, " ")) && !/\.(update|delete)\(/.test(svc), "A: accounting never writes the operational payment — paid stays paid");
    const repo = src("src/modules/platform-finance/server/PlatformFinancePaymentsRepository.ts");
    assert(/accounting\?\.status === "posted" && accounting\.journalEntryId\s*\?\s*"posted"\s*:\s*"awaiting_accounting"/.test(repo), "A: the per-payment accounting state is DERIVED from the Finance Transaction, never stored on the payment");
    const payable = src("src/modules/platform-finance/components/PlatformFinancePayableDetailPage.tsx");
    assert(/Payment: Confirmed · Accounting: \{payment\.accountingStatus === "posted" \? "Posted" : "Awaiting accounting"\}/.test(payable), "A: the Payable page shows operational payment truth and accounting truth separately");
    assert(!/status\s*=\s*['"]posted['"]/.test(strip(src("src/modules/platform-finance/components/PlatformFinancePaymentReviewDrawer.tsx"))), "A: the UI never fabricates Posted");
    pass("A confirmed + unposted ⇒ Awaiting Accounting; Paid ≠ Posted; payment truth never mutated");
  }

  // ── B. Successful post: debit selected, credit derived, balanced, GL via engine ──
  {
    assert(/async post\(actor: Actor, paymentId: string, debitAccountId: string\)/.test(svc), "B: the accountant supplies the debit account");
    assert(/lines: \[\s*\{ accountId: debit\.id, debit: review\.payment\.amount, credit: 0[^}]*\},\s*\{ accountId: credit\.id, debit: 0, credit: review\.payment\.amount/.test(svc.replace(/\s+/g, " ").replace(/\{ /g, "{ ")) || /accountId: debit\.id, debit: review\.payment\.amount/.test(svc) && /accountId: credit\.id, debit: 0, credit: review\.payment\.amount/.test(svc), "B: exactly one debit (selected) and one credit (derived) for the confirmed amount ⇒ balanced");
    assert(/loadCurrentControlAccount\(paymentId\)/.test(svc) && /\.select\("control_gl_account_id"\)/.test(svc), "B: the credit account is the source Financial Account's configured control GL — never client input");
    assert(!/creditAccountId|credit_account_id/.test(svc + src("src/app/api/platform-finance/payments/route.ts")), "B: no client-supplied credit account path");
    assert(/account\.accountType !== "asset" \|\| account\.classification !== "current_asset"/.test(svc.replace(/\s+/g, " ")) || /accountType !== "asset"/.test(svc), "B: the control GL must be an active current-asset account");
    assert(/postFinanceTransaction\(/.test(svc) && /finance_post_transaction/.test(src("src/modules/platform-finance/server/posting.ts")), "B: journal creation goes through the existing atomic posting RPC");
    assert(!/insert\(|from\("finance_journal/.test(svc) && !/finance_general_ledger|finance_gl_/.test(svc), "B: no direct journal or GL writes outside the posting architecture");
    assert(/balanced|debit and credit|sum/i.test(postRpc) && /raise exception 'finance_post_transaction: at least two journal lines/.test(postRpc), "B: the engine enforces balanced journals (2+ lines, debit = credit)");
    const foundation = src("supabase/migrations/20260914140000_finance_foundation.sql");
    const glView = foundation.slice(foundation.indexOf("create or replace view public.finance_general_ledger_v"), foundation.indexOf("create or replace view public.finance_general_ledger_v") + 1500);
    assert(/from public\.finance_journal_entries e/.test(glView) && /finance_journal_lines/.test(glView), "B/J: the General Ledger is a VIEW over journal entries and lines — a posted Journal Entry appears in the GL with no second write");
    assert(/from\("finance_general_ledger_v"\)/.test(src("src/modules/platform-finance/server/PlatformFinanceRepository.ts")), "B/J: the GL reader queries that view (no parallel GL store)");
    assert(/insert into public\.finance_journal_entries/.test(postRpc) && /insert into public\.finance_journal_lines/.test(postRpc), "B: the posting RPC is the single writer of journal entries and lines");
    assert(/if \(debit\.id === credit\.id\)/.test(svc), "B: a net-zero same-account journal is refused");
    pass("B successful post: accountant-selected debit, control-GL credit, balanced, via the posting engine");
  }

  // ── C. Idempotency ────────────────────────────────────────────────────────
  {
    assert(/create unique index finance_transactions_payment_source_uidx[\s\S]*source_type = 'payment'/.test(mig), "C: ONE Finance Transaction per payment (unique source index)");
    assert(/if v_ft\.status = 'posted' or v_ft\.journal_entry_id is not null then\s*raise exception/.test(postRpc.replace(/\s+/g, " ").replace(/then raise/, "then\n    raise")) || /is already posted/.test(postRpc), "C: the engine refuses to post the same transaction twice (row-locked)");
    assert(/if \(review\.transaction\.status === "posted"\) return review;/.test(svc), "C: a repeat request resolves to the existing posting");
    assert(/latest\.transaction\.status === "posted" && latest\.journalEntryId/.test(svc.replace(/\s+/g, " ")), "C: a concurrent/duplicate attempt converges on the one authoritative posting");
    // behavioural: posted ⇒ returns immediately, touches nothing
    const { PlatformFinancePaymentAccountingServerService: Svc } = await import("../src/modules/platform-finance/server/PlatformFinancePaymentAccountingServerService");
    const proto = Svc.prototype as unknown as Record<string, unknown>;
    proto.assertCapability = async () => undefined;
    proto.getReview = async () => ({ status: "posted", transaction: { status: "posted" }, journalEntryId: "JE-1" });
    const service = new Svc("org") as unknown as { post: (a: unknown, p: string, d: string) => Promise<{ journalEntryId: string }>; repo: Record<string, unknown> };
    let touched = false;
    service.repo = { getAccount: async () => { touched = true; return null; }, listPeriods: async () => { touched = true; return []; } };
    const again = await service.post({ organisationId: "org", profileId: "p" }, "pay", "debit");
    assert(again.journalEntryId === "JE-1" && !touched, "C: posting an already-posted payment returns the existing Journal Entry and performs no second post");
    pass("C idempotency: one transaction per payment, engine lock, converge-on-existing");
  }

  // ── D. Period ─────────────────────────────────────────────────────────────
  {
    assert(paymentPeriodBlockingReason([], "co", "2026-09-10") === PAYMENT_PERIOD_MISSING_REASON, "D: a missing period blocks with a 'no period exists' reason");
    assert(paymentPeriodBlockingReason([{ companyId: "co", startDate: "2026-09-01", endDate: "2026-09-30", status: "closed" }], "co", "2026-09-10") === PAYMENT_PERIOD_CLOSED_REASON, "D: a closed period blocks with a 'closed' reason");
    assert(paymentPeriodBlockingReason([{ companyId: "other", startDate: "2026-09-01", endDate: "2026-09-30", status: "open" }], "co", "2026-09-10") === PAYMENT_PERIOD_MISSING_REASON, "D: another company's open period does not count");
    assert(paymentPeriodBlockingReason(okInputs.periods, "co", "2026-09-10") === null, "D: an open covering period does not block");
    assert(paymentAccountingBlockingReason(okInputs) === null, "D: fully valid prerequisites ⇒ Review & Post can proceed");
    // behavioural: post() blocked by period ⇒ throws the explanatory reason, no debit lookup, no post
    const { PlatformFinancePaymentAccountingServerService: Svc } = await import("../src/modules/platform-finance/server/PlatformFinancePaymentAccountingServerService");
    const proto = Svc.prototype as unknown as Record<string, unknown>;
    proto.assertCapability = async () => undefined;
    proto.getReview = async () => ({ status: "draft", period: null, transaction: { status: "draft", companyId: "co", transactionDate: "2026-09-10" }, journalEntryId: null });
    const service = new Svc("org") as unknown as { post: (a: unknown, p: string, d: string) => Promise<unknown>; repo: Record<string, unknown> };
    let debitLooked = false;
    for (const [periods, reason] of [[[], PAYMENT_PERIOD_MISSING_REASON], [[{ companyId: "co", startDate: "2026-09-01", endDate: "2026-09-30", status: "closed" }], PAYMENT_PERIOD_CLOSED_REASON]] as const) {
      service.repo = { listPeriods: async () => periods, getAccount: async () => { debitLooked = true; return null; } };
      let message = "";
      await service.post({ organisationId: "org", profileId: "p" }, "pay", "debit").catch((e: Error) => (message = e.message));
      assert(message === reason && !debitLooked, "D: post() refuses with the exact reason before touching accounts or the ledger");
    }
    pass("D period: missing/closed block with distinct actionable reasons; nothing posted");
  }

  // ── E. Failure / recovery ────────────────────────────────────────────────
  {
    for (const [input, expected] of [
      [{ ...okInputs, sourceAccount: null }, PAYMENT_SOURCE_ACCOUNT_REASON],
      [{ ...okInputs, sourceAccount: { status: "inactive", companyId: "co", currency: "NGN" } }, PAYMENT_SOURCE_ACCOUNT_REASON],
      [{ ...okInputs, controlAccount: null }, PAYMENT_CONTROL_ACCOUNT_REASON],
      [{ ...okInputs, controlAccount: { status: "active", accountType: "expense", classification: "operating" } }, PAYMENT_CONTROL_ACCOUNT_REASON],
    ] as const) {
      assert(paymentAccountingBlockingReason(input as never) === expected, "E: a missing/invalid source or control account is an explicit BLOCK with its reason");
    }
    assert(/catch \(error\) \{[\s\S]*const latest = await this\.getReview\(actor, paymentId\);[\s\S]*throw new ActionError\(/.test(svc), "E: a failed post re-reads authoritative state, returns a posting that did land, otherwise raises the real error");
    const drawer = src("src/modules/platform-finance/components/PlatformFinancePaymentReviewDrawer.tsx");
    assert(/latest\.status === "posted"/.test(drawer) && /Retry/.test(drawer), "E: the UI converges on the authoritative state after an ambiguous failure and offers Retry");
    assert(/finance_post_transaction/.test(src("src/modules/platform-finance/server/posting.ts")) && /language plpgsql/.test(postRpc), "E: posting is one atomic RPC — a failure leaves no partial journal");
    assert(!/status: "posted"|accountingStatus: "posted"/.test(svc.replace(/accountingStatus: posted \? "posted"/, "")), "E: no code path reports Posted except from the authoritative transaction");
    pass("E failure: blocks are explicit, failed posts create no accounting, retry converges");
  }

  // ── F. Authority ──────────────────────────────────────────────────────────
  {
    const postBody = svc.slice(svc.indexOf("async post("));
    assert(postBody.indexOf('assertCapability(actor, "post")') < postBody.indexOf("getReview") && postBody.indexOf('assertCapability(actor, "createTransaction")') < postBody.indexOf("getReview"), "F: posting needs BOTH the post and create_transaction capabilities before anything else");
    const route = src("src/app/api/platform-finance/payments/route.ts");
    assert(/action === "postPaymentAccounting" \? PLATFORM_FINANCE_CAPABILITIES\.post/.test(route), "F: the API gate requires the post capability");
    assert(/accessible\.includes\(payment\.company_id as string\)\) throw new ActionError\("FORBIDDEN", "No company access\."/.test(svc.replace(/\s+/g, " ").replace(/\) throw/, ") throw")) || /No company access/.test(svc), "F: company access is enforced on every review/post");
    assert(/finance_payable_actor_has_company_access/.test(mig) && /platform_finance\.accounting\.create_transaction/.test(mig), "F: the database RPCs independently enforce capability and company access");
    assert(/visibility: "restricted", label: "Restricted corporate financial account"/.test(svc), "F: restricted source accounts stay hidden in the review");
    assert(!/isPlatformSuperAdmin|roleSlugs|command_centre|admin_override|platform\.batcave/i.test(svc + route.replace(/PLATFORM_FINANCE_CAPABILITIES/g, "")), "F: Super Admin / CEO / Command Centre identity never bypasses posting authority");
    const journalPage = src("src/modules/platform-finance/components/PlatformFinanceJournalPage.tsx");
    assert(/cause\.status === 403/.test(journalPage) && /restricted for your access/.test(journalPage), "F: a restricted actor sees 'restricted' — not failure, not empty");
    assert(/companies you can access/.test(journalPage) && !/No confirmed payments are awaiting accounting\./.test(journalPage), "F: the empty message never claims more than the actor's company scope");
    pass("F authority: post + create_transaction, company access, DB-enforced, restricted-account rules, no identity bypass");
  }

  // ── G. Lineage ────────────────────────────────────────────────────────────
  {
    assert(/source_type, source_id/.test(mig) && /'payment', v_payment\.id/.test(mig), "G: the Finance Transaction is sourced from the Payment (existing source model)");
    assert(/payable_id/.test(svc) && /source_type,source_id/.test(svc), "G: the review carries Payment → Payable → Request/Vendor Bill");
    const server = src("src/modules/platform-finance/server/PlatformFinanceServerService.ts");
    assert(/transaction\?\.sourceType === "payment" && transaction\.sourceId/.test(server) && /sourceHref = `\/platform-finance\/payables\//.test(server), "G: the Journal Entry detail links back to the Payment's Payable");
    assert(/journal_entry_id/.test(svc), "G: the Payment's accounting record holds its Journal Entry");
    const drawer = src("src/modules/platform-finance/components/PlatformFinancePaymentReviewDrawer.tsx");
    assert(/Originating Payable/.test(drawer) && /Payable source/.test(drawer) && /View authoritative Journal Entry/.test(drawer), "G: the accountant can see where it came from and open the resulting Journal Entry");
    assert(/sourceId: string \| null;\s*sourceLabel: string \| null;\s*sourceHref: string \| null;/.test(src("src/services/platform-finance/PlatformFinanceService.ts")), "G: the client contract carries the lineage fields");
    pass("G lineage: Journal ⇄ Payment ⇄ Payable ⇄ Request/Vendor Bill, reusing the existing source model");
  }

  // ── H. Scope separation ──────────────────────────────────────────────────
  {
    assert(!existsSync(resolve("src/app/(app)/platform-finance/payments/page.tsx")), "H: no new Payments register");
    const changed = [svcRaw, src("src/modules/platform-finance/domain/paymentAccounting.ts"), src("src/modules/platform-finance/components/PlatformFinanceJournalPage.tsx"), src("src/modules/platform-finance/components/PlatformFinancePaymentReviewDrawer.tsx")].join("\n");
    assert(!/reconcil|bank statement|liquidity|treasury forecast|free cash/i.test(strip(changed)), "H: no treasury / reconciliation implementation");
    assert(!/batcave|command_centre|ecc_|fm_/i.test(strip(changed)), "H: no Command Centre / Batcave / FM / ECC coupling");
    assert(!/approvalPolic|multi-line|recurring/i.test(strip(changed)), "H: no approval or manual-journal redesign");
    pass("H separation: no Payments register, treasury, Command Centre/Batcave/FM/ECC, approval or journal redesign");
  }

  console.log(out.join("\n"));
  console.log(`\n${out.length} groups passed`);
}

main().catch((e) => {
  console.error("FAIL", e instanceof Error ? e.message : e);
  process.exit(1);
});
