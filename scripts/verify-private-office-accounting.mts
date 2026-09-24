/**
 * Private Office Tranche 1 — accounting domain verification (pure; runs the browser-side domain in Node).
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-private-office-accounting.mts
 */
import {
  createVault,
  decryptItem,
  destroyVault,
  encryptItem,
  randomBytes,
} from "../src/modules/private-office/security/crypto/vaultCrypto";
import {
  derivePosition,
  displayAmount,
  hasFinancialActivity,
  minorUnits,
  openingPosition,
  systemAccountId,
  type Account,
  type FinancialRecord,
  type Journal,
} from "../src/modules/private-office/accounting/domain";

let failures = 0;
function check(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(
      () => console.log(`PASS ${name}`),
      (error: Error) => {
        failures += 1;
        console.log(`FAIL ${name}\n     ${error.message}`);
      }
    );
}
function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}
function throws(fn: () => unknown, pattern: RegExp, message: string) {
  try {
    fn();
  } catch (error) {
    if (pattern.test((error as Error).message)) return;
    throw new Error(`${message}: unexpected error "${(error as Error).message}"`);
  }
  throw new Error(`${message}: expected rejection`);
}
const clone = <T,>(v: T): T => structuredClone(v);

const [bank, bankOpening] = openingPosition({ name: "Salary account", accountKind: "bank", currency: "NGN", balance: "14250000.50", date: "2026-09-01" });

await check("opening position is a balanced double-entry journal: Dr the account, Cr hidden Opening Balance Equity", () => {
  assert(bankOpening.lines.length === 2, "two lines");
  const [dr, cr] = bankOpening.lines as [Journal["lines"][0], Journal["lines"][0]];
  assert(dr.accountId === bank.id && dr.classification === "asset" && dr.debit === "1425000050" && dr.credit === "0", "debit to the user's asset account in minor units");
  assert(cr.accountId === systemAccountId("opening-balance-equity", "NGN") && cr.classification === "equity" && cr.credit === "1425000050", "credit to hidden opening balance equity");
  assert(derivePosition([bank, bankOpening]).trialBalance.NGN!.debit === derivePosition([bank, bankOpening]).trialBalance.NGN!.credit, "trial balance equal");
});

await check("an opening position is never income (income/expense offsets and forged classifications are rejected)", () => {
  const asIncome = clone(bankOpening);
  asIncome.lines[1]!.classification = "income";
  throws(() => derivePosition([bank, asIncome]), /classification does not match|never income/, "income offset");
  const wrongSystem = clone(bankOpening);
  wrongSystem.lines[1]!.accountId = "system:income:NGN";
  throws(() => derivePosition([bank, wrongSystem]), /unknown account|never income/, "non-equity system account");
  const forged = clone(bankOpening);
  forged.lines[0]!.classification = "equity";
  throws(() => derivePosition([bank, forged]), /classification does not match/, "classification is derived from the ledger, not trusted from the record");
});

await check("balances derive only from ledger entries; unbalanced or one-sided entries are rejected", () => {
  assert(!("balance" in bank) && !Object.keys(bankOpening).some((k) => /balance/i.test(k)), "no stored balance field on any record");
  assert(derivePosition([bank, bankOpening]).accounts[0]!.balance === "1425000050", "balance = Σ debits − Σ credits");
  const unbalanced = clone(bankOpening);
  unbalanced.lines[1]!.credit = "1";
  throws(() => derivePosition([bank, unbalanced]), /does not balance/, "unbalanced");
  const both = clone(bankOpening);
  both.lines[0]!.credit = "5";
  throws(() => derivePosition([bank, both]), /either a debit or a credit|does not balance|never income/, "debit and credit on one line");
  throws(() => derivePosition([bank]), /missing its opening position/, "account without its opening");
  throws(() => derivePosition([bank, bankOpening, { ...clone(bankOpening), id: crypto.randomUUID() }]), /exactly one opening position/, "second opening");
  throws(() => derivePosition([bank, bankOpening, bankOpening]), /Duplicate/, "duplicated record");
});

await check("zero opening balance is a real, balanced, recorded position", () => {
  const [cash, zero] = openingPosition({ name: "Petty cash", accountKind: "cash", currency: "NGN", balance: "0", date: "2026-09-01" });
  const position = derivePosition([cash, zero]);
  assert(position.accounts[0]!.balance === "0" && position.positions.NGN === "0", "zero balance");
  assert(position.trialBalance.NGN!.debit === "0" && position.trialBalance.NGN!.credit === "0", "balanced zero journal");
  assert(hasFinancialActivity([cash, zero], cash.id), "zero opening is still financial activity");
});

await check("multiple accounts stay independent; multiple currencies stay separate (never FX-converted)", () => {
  const [wallet, walletOpening] = openingPosition({ name: "Mobile wallet", accountKind: "mobile_wallet", currency: "NGN", balance: "250000", date: "2026-09-02" });
  const [usd, usdOpening] = openingPosition({ name: "Dom account", accountKind: "bank", currency: "USD", balance: "1200.25", date: "2026-09-02" });
  const [jpy, jpyOpening] = openingPosition({ name: "Travel cash", accountKind: "other_liquid", currency: "JPY", balance: "5000", date: "2026-09-02" });
  const p = derivePosition([bank, bankOpening, wallet, walletOpening, usd, usdOpening, jpy, jpyOpening]);
  const by = Object.fromEntries(p.accounts.map((a) => [a.name, a.balance]));
  assert(by["Salary account"] === "1425000050" && by["Mobile wallet"] === "25000000" && by["Dom account"] === "120025" && by["Travel cash"] === "5000", "each account keeps its own balance");
  assert(p.positions.NGN === "1450000050" && p.positions.USD === "120025" && p.positions.JPY === "5000", "per-currency positions");
  assert(Object.keys(p.positions).length === 3 && !("total" in p), "no cross-currency total exists");
  assert(Object.keys(p.trialBalance).sort().join() === "JPY,NGN,USD", "ledger balances per currency");
  assert(displayAmount(p.positions.USD!, "USD") === "USD 1,200.25" && displayAmount(p.positions.JPY!, "JPY") === "JPY 5,000", "currency-correct presentation");
  const mixed = clone(usdOpening);
  mixed.lines[1]!.accountId = systemAccountId("opening-balance-equity", "NGN");
  throws(() => derivePosition([usd, mixed]), /Currencies cannot be mixed|never income/, "mixed-currency journal");
});

await check("account currency is immutable once activity exists (from its opening position onward)", () => {
  assert(hasFinancialActivity([bank, bankOpening], bank.id), "opening position is activity");
  const recurrencied: Account = { ...bank, currency: "USD" };
  throws(() => derivePosition([bank, bankOpening, recurrencied]), /Duplicate/, "re-declaring the account with another currency");
  throws(() => derivePosition([recurrencied, bankOpening]), /Currencies cannot be mixed/, "history in a different currency than the account");
  const moved = clone(bankOpening);
  moved.currency = "USD";
  moved.lines[1]!.accountId = systemAccountId("opening-balance-equity", "USD");
  throws(() => derivePosition([bank, moved]), /Currencies cannot be mixed/, "opening re-expressed in another currency");
});

await check("amount entry: currency minor units, no negatives, no separators, no excess precision, ISO currencies only", () => {
  assert(minorUnits("1200.5", "USD") === "120050" && minorUnits("7", "JPY") === "7" && minorUnits("1.234", "KWD") === "1234", "minor units per currency");
  throws(() => minorUnits("-5", "NGN"), /non-negative/, "negative");
  throws(() => minorUnits("1,000", "NGN"), /without separators/, "separator");
  throws(() => minorUnits("1.001", "USD"), /decimal places/, "excess precision");
  throws(() => minorUnits("1", "XYZ"), /ISO currency/, "unknown currency");
  throws(() => openingPosition({ name: " ", accountKind: "bank", currency: "NGN", balance: "1", date: "2026-09-01" }), /account name/, "empty name");
  throws(() => openingPosition({ name: "x", accountKind: "credit_card" as never, currency: "NGN", balance: "1", date: "2026-09-01" }), /account name and type/, "unsupported kind");
  throws(() => openingPosition({ name: "x", accountKind: "bank", currency: "NGN", balance: "1", date: "2026-02-30" }), /valid balance date/, "impossible date");
});

await check("encrypted records round-trip: each account and journal is its own record; ciphertext carries no financial content", async () => {
  const { vault } = await createVault({ vaultId: crypto.randomUUID(), passkeyWrapperId: crypto.randomUUID(), prfOutput: randomBytes(32) });
  const records: FinancialRecord[] = [bank, bankOpening];
  const items = await Promise.all(records.map((r) => encryptItem(vault, r.id, JSON.stringify(r))));
  assert(items.length === 2 && items.every((i, n) => i.itemId === records[n]!.id), "granular: one envelope per record");
  const envelopes = JSON.stringify(items);
  for (const plain of ["Salary account", "1425000050", "NGN", "opening_position", "asset", "equity"]) assert(!envelopes.includes(plain), `"${plain}" visible in envelope`);
  const back = (await Promise.all(items.map((i) => decryptItem(vault, i)))).map((t) => JSON.parse(t) as FinancialRecord);
  assert(JSON.stringify(back) === JSON.stringify(records), "records decrypt unchanged");
  assert(derivePosition(back).accounts[0]!.balance === "1425000050", "ledger recomputed from decrypted records");
  destroyVault(vault);
});

console.log(failures === 0 ? "\nPRIVATE OFFICE ACCOUNTING: PASS" : `\nPRIVATE OFFICE ACCOUNTING: ${failures} FAIL`);
process.exit(failures === 0 ? 0 : 1);
