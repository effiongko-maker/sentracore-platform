import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  FINANCE_PAYABLE_PAYMENT_ELIGIBLE_STATUSES,
  FINANCE_PAYMENT_CAPABILITIES,
  FINANCE_PAYMENT_INVARIANTS,
  financePayableOutstandingAmount,
  isFinancePayablePaymentEligible,
} from "../src/modules/platform-finance/types";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

const migration = await read(
  "supabase/migrations/20260917150000_finance_payments_payable_settlement.sql"
);
const paymentsRoute = await read(
  "src/app/api/platform-finance/payments/route.ts"
);
const paymentsService = await read(
  "src/modules/platform-finance/server/PlatformFinancePaymentsServerService.ts"
);
const paymentsRepo = await read(
  "src/modules/platform-finance/server/PlatformFinancePaymentsRepository.ts"
);
const detailPage = await read(
  "src/modules/platform-finance/components/PlatformFinancePayableDetailPage.tsx"
);

assert.equal(FINANCE_PAYMENT_INVARIANTS.noJournalPostingInPhase2C, true);
assert.equal(FINANCE_PAYMENT_INVARIANTS.noFinancialAccountBalanceMutation, true);
assert.deepEqual(
  [...FINANCE_PAYABLE_PAYMENT_ELIGIBLE_STATUSES],
  ["approved", "partially_paid"]
);
assert.equal(isFinancePayablePaymentEligible("approved"), true);
assert.equal(isFinancePayablePaymentEligible("paid"), false);
assert.equal(financePayableOutstandingAmount({ payableAmount: 100, paidAmount: 40 }), 60);

assert.match(migration, /create table public\.finance_payments/);
assert.match(migration, /partially_paid/);
assert.match(migration, /finance_payment_confirm_against_payable/);
assert.match(migration, /platform_finance\.payment\.view/);
assert.match(migration, /platform_finance\.payment\.execute/);
assert.match(
  migration,
  /revoke all on function public\.finance_payment_confirm_against_payable[\s\S]*from anon,\s*authenticated/i
);
assert.match(
  migration,
  /grant execute on function public\.finance_payment_confirm_against_payable[\s\S]*to service_role/i
);
assert.doesNotMatch(migration, /add column\s+\w*balance\w*/i);
assert.doesNotMatch(migration, /\bfinance_post_transaction\s*\(/);
assert.doesNotMatch(migration, /insert into public\.finance_journal/);
assert.doesNotMatch(migration, /insert into public\.finance_transactions/);
assert.doesNotMatch(
  migration,
  /create table public\.finance_payments\([\s\S]*account_number/
);
assert.doesNotMatch(migration, /\bcreate table public\.finance_money_movements\b/);

assert.equal(FINANCE_PAYMENT_CAPABILITIES.view, "platform_finance.payment.view");
assert.equal(
  FINANCE_PAYMENT_CAPABILITIES.execute,
  "platform_finance.payment.execute"
);

assert.match(paymentsRoute, /revealPayableDestination/);
assert.match(paymentsRoute, /confirmPayment/);
assert.doesNotMatch(paymentsRoute, /listAccessiblePayables|bulkReveal/i);
assert.match(paymentsService, /decryptPaymentDestinationAccountNumber/);
assert.match(paymentsService, /destination_revealed|appendDestinationRevealAudit/);
assert.doesNotMatch(paymentsService, /finance_post_transaction\s*\(/);
assert.doesNotMatch(paymentsService, /\.from\([\"']finance_transactions[\"']\)/);
assert.doesNotMatch(paymentsService, /\.from\([\"']finance_journal/);
assert.match(paymentsRepo, /PAYMENT_SELECT/);
assert.match(paymentsRepo, /loadPayableDestinationCrypto/);
assert.match(paymentsRepo, /finance\.payment\.destination_revealed/);
assert.match(
  paymentsRepo,
  /const PAYMENT_SELECT = \[[\s\S]*?\]\.join/
);
assert.doesNotMatch(
  paymentsRepo,
  /const PAYMENT_SELECT = \[[^\]]*ciphertext[^\]]*\]/
);
assert.match(detailPage, /Confirm external payment/);
assert.match(detailPage, /Reveal account number/);
assert.match(detailPage, /does not send money/i);

console.log("PASS verify-platform-finance-phase2c");
console.log(
  "  payments + payable settlement + controlled reveal + no journal posting"
);
