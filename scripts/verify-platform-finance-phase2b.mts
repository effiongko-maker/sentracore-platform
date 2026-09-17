import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  maskedPaymentDestinationFromRow,
  paymentDestinationLast4,
  validatePaymentDestinationInput,
} from "../src/modules/platform-finance/domain/paymentDestination";
import {
  decryptPaymentDestinationAccountNumber,
  encryptPaymentDestination,
  PAYMENT_DESTINATION_KEY_ENV,
} from "../src/modules/platform-finance/server/paymentDestinationCryptoCore";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");
const migration = await read("supabase/migrations/20260917140000_finance_payment_destinations.sql");
const requestRepo = await read("src/modules/platform-finance/server/PlatformFinanceRequestsRepository.ts");
const vendorRepo = await read("src/modules/platform-finance/server/PlatformFinanceVendorBillsRepository.ts");
const payableRepo = await read("src/modules/platform-finance/server/PlatformFinancePayablesRepository.ts");
const requestRoute = await read("src/app/api/platform-finance/requests/route.ts");
const vendorRoute = await read("src/app/api/platform-finance/vendor-bills/route.ts");

assert.equal(maskedPaymentDestinationFromRow({}), null);
const complete = validatePaymentDestinationInput({
  paymentMethod: "bank_transfer",
  bankName: "Example Bank",
  accountName: "Unrelated Account Name",
  accountNumber: "1000200030",
});
assert.equal(complete.accountName, "Unrelated Account Name");
assert.throws(() => validatePaymentDestinationInput({ ...complete, accountName: "" }));
assert.equal(paymentDestinationLast4("1000200030"), "0030");

const testEnv = { [PAYMENT_DESTINATION_KEY_ENV]: Buffer.alloc(32, 7).toString("base64") };
const first = encryptPaymentDestination(complete, testEnv);
const second = encryptPaymentDestination(complete, testEnv);
assert.notEqual(first.account_number_iv, second.account_number_iv);
assert.notEqual(first.account_number_ciphertext, second.account_number_ciphertext);
assert.equal(decryptPaymentDestinationAccountNumber(first, testEnv), complete.accountNumber);
assert.throws(() => decryptPaymentDestinationAccountNumber(
  { ...first, account_number_auth_tag: Buffer.alloc(16, 1).toString("base64") },
  testEnv
));
assert.throws(() => encryptPaymentDestination(complete, {}));
assert.throws(() => encryptPaymentDestination(complete, { [PAYMENT_DESTINATION_KEY_ENV]: "bad" }));

const DESTINATION_FIELDS = [
  "payment_method",
  "payment_bank_name",
  "payment_account_name",
  "payment_account_number_last4",
  "payment_account_number_ciphertext",
  "payment_account_number_iv",
  "payment_account_number_auth_tag",
  "payment_encryption_key_version",
] as const;

/** Extract CHECK body for payment_destination_complete on a table. */
function destinationCompleteCheck(sql: string, table: string): string {
  const re = new RegExp(
    `alter table public\\.${table}[\\s\\S]*?` +
      `add constraint ${table}_payment_destination_complete check \\(([\\s\\S]*?)\\)\\s*;`,
    "i"
  );
  const match = sql.match(re);
  assert.ok(match?.[1], `missing ${table}_payment_destination_complete check`);
  return match[1];
}

assert.doesNotMatch(
  migration,
  /\bnum_nonnulls?\s*\(/i,
  "Phase 2B must not depend on num_nonnull/num_nonnulls"
);

for (const table of ["finance_requests", "finance_vendor_bills", "finance_payables"]) {
  assert.match(migration, new RegExp(`alter table public\\.${table}`));
  const check = destinationCompleteCheck(migration, table);
  for (const field of DESTINATION_FIELDS) {
    assert.match(
      check,
      new RegExp(`${field}\\s+is\\s+null`, "i"),
      `${table}: absent branch must require ${field} IS NULL`
    );
    assert.match(
      check,
      new RegExp(`${field}\\s+is\\s+not\\s+null`, "i"),
      `${table}: complete branch must require ${field} IS NOT NULL`
    );
  }
  assert.match(check, /\bis\s+null[\s\S]*?\bor\s*\(/i);
  assert.match(check, /payment_method\s*=\s*'bank_transfer'/);
  assert.match(check, /payment_account_number_last4\s*~\s*'?\^\[0-9\]\{4\}\$'?/);
  assert.match(check, /payment_encryption_key_version\s*>\s*0/);
  // Structural rejection of partials: only (all-null) OR (all-not-null AND validations).
  assert.match(check, /\)\s*or\s*\(/i);
}
assert.doesNotMatch(migration, /add column\s+(?:payment_)?account_number\s/i);
for (const fn of [
  "finance_request_create_with_payment_destination",
  "finance_request_update_draft_with_payment_destination",
  "finance_request_resubmit_with_payment_destination",
  "finance_vendor_bill_create_with_payment_destination",
  "finance_vendor_bill_update_draft_with_payment_destination",
  "finance_vendor_bill_resubmit_with_payment_destination",
]) assert.match(migration, new RegExp(fn));
assert.match(migration, /before insert on public\.finance_payables/);
assert.match(migration, /finance_payables_no_destination_update/);
assert.doesNotMatch(migration, /grant execute[\s\S]{0,240}with_payment_destination[\s\S]{0,120}to authenticated/);
assert.doesNotMatch(migration, /add column\s+(?:payment_)?account_number\s/i);

const WRAPPER_SIGNATURES = [
  "finance_request_create_with_payment_destination(uuid, uuid, uuid, uuid, numeric, text, text, text, text, date, text, text, text, jsonb)",
  "finance_request_update_draft_with_payment_destination(uuid, uuid, uuid, numeric, text, text, text, text, date, boolean, text, text, text, jsonb)",
  "finance_request_resubmit_with_payment_destination(uuid, uuid, uuid, numeric, text, text, text, text, date, boolean, text, text, text, jsonb)",
  "finance_vendor_bill_create_with_payment_destination(uuid, uuid, uuid, numeric, text, text, text, text, text, date, boolean, date, text, text, jsonb)",
  "finance_vendor_bill_update_draft_with_payment_destination(uuid, uuid, numeric, text, text, text, text, text, date, boolean, boolean, date, boolean, text, text, text, jsonb)",
  "finance_vendor_bill_resubmit_with_payment_destination(uuid, uuid, numeric, text, text, text, text, text, date, boolean, boolean, date, boolean, text, text, jsonb)",
] as const;

const hardening = await read(
  "supabase/migrations/20260917141000_finance_payment_destination_wrapper_execute_hardening.sql"
);
assert.equal(WRAPPER_SIGNATURES.length, 6);
assert.doesNotMatch(hardening, /\b(insert|update|delete)\b/i);
assert.doesNotMatch(hardening, /\bcreate\s+or\s+replace\s+function\b/i);
assert.doesNotMatch(hardening, /payment_account_number_/i);

for (const signature of WRAPPER_SIGNATURES) {
  const escaped = signature.replace(/[()]/g, "\\$&");
  // Fresh-install source (140000) and live forward fix (141000) must both
  // establish service-role-only EXECUTE using the SentraCore pattern.
  for (const [label, sql] of [
    ["140000", migration],
    ["141000", hardening],
  ] as const) {
    assert.match(
      sql,
      new RegExp(
        `revoke all on function public\\.${escaped}\\s+from public`,
        "i"
      ),
      `${label}: missing PUBLIC revoke for ${signature}`
    );
    assert.match(
      sql,
      new RegExp(
        `revoke all on function public\\.${escaped}\\s+from anon,\\s*authenticated`,
        "i"
      ),
      `${label}: missing anon/authenticated revoke for ${signature}`
    );
    assert.match(
      sql,
      new RegExp(
        `grant execute on function public\\.${escaped}\\s+to service_role`,
        "i"
      ),
      `${label}: missing service_role grant for ${signature}`
    );
    assert.doesNotMatch(
      sql,
      new RegExp(
        `grant execute on function public\\.${escaped}[\\s\\S]{0,80}to authenticated`,
        "i"
      ),
      `${label}: must not grant authenticated EXECUTE for ${signature}`
    );
  }
}

for (const [repo, selectName] of [
  [requestRepo, "REQUEST_SELECT"],
  [vendorRepo, "VENDOR_BILL_SELECT"],
  [payableRepo, "PAYABLE_SELECT"],
] as const) {
  assert.match(repo, /payment_account_number_last4/);
  assert.doesNotMatch(repo, new RegExp(`const ${selectName} = ["']\\*["']`));
  assert.doesNotMatch(repo, /payment_account_number_(?:ciphertext|iv|auth_tag)/);
}
const masked = maskedPaymentDestinationFromRow({
  payment_method: "bank_transfer",
  payment_bank_name: "Example Bank",
  payment_account_name: "Unrelated Account Name",
  payment_account_number_last4: "0030",
});
assert.deepEqual(Object.keys(masked ?? {}).sort(), [
  "accountName", "accountNumberLast4", "bankName", "paymentMethod",
]);

for (const route of [requestRoute, vendorRoute]) {
  assert.doesNotMatch(route, /reveal|decryptPaymentDestination/i);
  assert.match(route, /rejectClientCryptographicFields/);
}

console.log("PASS verify-platform-finance-phase2b");
console.log("  optional coherent destination + AES-256-GCM + masked DTOs + atomic immutable payable snapshot");
