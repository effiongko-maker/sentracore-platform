/**
 * Private Office accounting domain — runs ONLY inside the owner's browser, on decrypted records.
 *
 * The owner records financial reality; SentraCore does the accounting underneath:
 *   - every financial fact is a balanced double-entry journal (Σ debits = Σ credits, per journal, one currency);
 *   - the ledger is the only financial truth — balances are always derived from journal lines, never stored;
 *   - the owner never sees or configures a chart of accounts; SentraCore maintains hidden system accounts;
 *   - an opening position is the balance already held, offset to Opening Balance Equity — never income;
 *   - currencies never mix: every total is per ISO currency, and nothing is FX-converted.
 *
 * Amounts are integer minor units carried as decimal strings; arithmetic is BigInt only.
 * Records are immutable. An account's currency is fixed when it is created, because its opening position is its
 * first financial activity; later tranches append new facts, they never rewrite old ones.
 */

export type AccountKind = "bank" | "cash" | "mobile_wallet" | "other_liquid";
/** Full accounting classes, so later tranches can add liabilities, receivables, investments, income, expense. */
export type AccountingClass = "asset" | "liability" | "equity" | "income" | "expense";
export type JournalPurpose = "opening_position";

export type Account = { schema: 1; kind: "account"; id: string; name: string; accountKind: AccountKind; currency: string; openedOn: string };
export type Line = { accountId: string; classification: AccountingClass; debit: string; credit: string };
export type Journal = { schema: 1; kind: "journal"; id: string; purpose: JournalPurpose; date: string; currency: string; lines: Line[] };
export type FinancialRecord = Account | Journal;

export const ACCOUNT_KINDS: ReadonlyArray<{ kind: AccountKind; label: string }> = [
  { kind: "bank", label: "Bank" },
  { kind: "cash", label: "Cash" },
  { kind: "mobile_wallet", label: "Mobile wallet" },
  { kind: "other_liquid", label: "Other liquid account" },
];
const USER_ACCOUNT_KINDS = new Set<string>(ACCOUNT_KINDS.map((k) => k.kind));
/** Every user-facing Tranche 1 account is a liquid asset. */
const USER_ACCOUNT_CLASS: Record<AccountKind, AccountingClass> = { bank: "asset", cash: "asset", mobile_wallet: "asset", other_liquid: "asset" };

// ── Hidden system accounts ─────────────────────────────────────────────────────────────────────────────────
// Deterministic per currency, so they never need to be stored, configured or shown.

const SYSTEM_ACCOUNTS: Record<string, { classification: AccountingClass; label: string }> = {
  "opening-balance-equity": { classification: "equity", label: "Opening Balance Equity" },
};

export function systemAccountId(role: keyof typeof SYSTEM_ACCOUNTS, currency: string): string {
  return `system:${role}:${currency}`;
}

function systemAccount(accountId: string): { role: string; currency: string; classification: AccountingClass } | null {
  const match = /^system:([a-z-]+):([A-Z]{3})$/.exec(accountId);
  const def = match ? SYSTEM_ACCOUNTS[match[1]!] : undefined;
  return match && def ? { role: match[1]!, currency: match[2]!, classification: def.classification } : null;
}

// ── Currency and amounts ───────────────────────────────────────────────────────────────────────────────────

const ZERO = BigInt(0);
const currencies = new Set(Intl.supportedValuesOf("currency"));

export function currencyDigits(currency: string): number {
  if (!currencies.has(currency)) throw new Error("Choose a supported ISO currency.");
  return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

/** "14250000.50" → minor units string. Non-negative, no separators, no more decimals than the currency has. */
export function minorUnits(value: string, currency: string): string {
  const digits = currencyDigits(currency);
  const text = value.trim();
  if (!/^\d{1,15}(\.\d+)?$/.test(text)) throw new Error("Enter a non-negative amount without separators.");
  const [whole, fraction = ""] = text.split(".") as [string, string?];
  if (fraction.length > digits) throw new Error(`This currency supports ${digits} decimal places.`);
  return BigInt(whole + fraction.padEnd(digits, "0")).toString();
}

export function displayAmount(value: string, currency: string): string {
  const digits = currencyDigits(currency);
  const negative = value.startsWith("-");
  const padded = (negative ? value.slice(1) : value).padStart(digits + 1, "0");
  const whole = digits ? padded.slice(0, -digits) : padded;
  return `${currency} ${negative ? "−" : ""}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${digits ? "." + padded.slice(-digits) : ""}`;
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

// ── Validation ─────────────────────────────────────────────────────────────────────────────────────────────

function validateAccount(account: Account): void {
  if (account.schema !== 1 || account.kind !== "account" || typeof account.id !== "string" || !account.id) throw new Error("Invalid financial account.");
  if (typeof account.name !== "string" || !account.name.trim() || account.name.length > 120) throw new Error("Invalid financial account.");
  if (!USER_ACCOUNT_KINDS.has(account.accountKind) || !isIsoDate(account.openedOn)) throw new Error("Invalid financial account.");
  currencyDigits(account.currency);
}

/** Classification is never trusted from the record: it must match what the ledger says the account is. */
function classificationOf(accountId: string, accounts: Map<string, Account>): { classification: AccountingClass; currency: string } {
  const user = accounts.get(accountId);
  if (user) return { classification: USER_ACCOUNT_CLASS[user.accountKind], currency: user.currency };
  const system = systemAccount(accountId);
  if (system) return { classification: system.classification, currency: system.currency };
  throw new Error("Journal refers to an unknown account.");
}

/** General double-entry rules, then the rules of the journal's purpose. */
export function validateJournal(journal: Journal, accounts: Map<string, Account>): void {
  if (journal.schema !== 1 || journal.kind !== "journal" || typeof journal.id !== "string" || !journal.id) throw new Error("Unsupported accounting record.");
  if (!isIsoDate(journal.date) || !Array.isArray(journal.lines) || journal.lines.length < 2) throw new Error("Unsupported accounting record.");
  currencyDigits(journal.currency);
  let debit = ZERO;
  let credit = ZERO;
  for (const line of journal.lines) {
    if (!/^\d+$/.test(line.debit) || !/^\d+$/.test(line.credit)) throw new Error("Invalid accounting amount.");
    const d = BigInt(line.debit);
    const c = BigInt(line.credit);
    if (d > ZERO && c > ZERO) throw new Error("A journal line is either a debit or a credit.");
    const owner = classificationOf(line.accountId, accounts);
    if (owner.classification !== line.classification) throw new Error("Journal line classification does not match its account.");
    if (owner.currency !== journal.currency) throw new Error("Currencies cannot be mixed in one journal.");
    debit += d;
    credit += c;
  }
  if (debit !== credit) throw new Error("Accounting entry does not balance.");

  switch (journal.purpose) {
    case "opening_position": {
      // Exactly: Dr the user's asset account, Cr hidden Opening Balance Equity (same amount, possibly zero).
      const [asset, equity] = journal.lines as [Line, Line];
      const account = accounts.get(asset.accountId);
      if (
        journal.lines.length !== 2 || !account || asset.classification !== "asset" || asset.credit !== "0" ||
        equity.accountId !== systemAccountId("opening-balance-equity", journal.currency) || equity.classification !== "equity" || equity.debit !== "0"
      ) {
        throw new Error("An opening position is offset to opening balance equity — never income.");
      }
      if (journal.date !== account.openedOn) throw new Error("An opening position is dated when the account's recorded history starts.");
      return;
    }
    default:
      throw new Error("Unsupported accounting record.");
  }
}

// ── Commands (produce new immutable records; never mutate old ones) ────────────────────────────────────────

export type OpeningInput = { name: string; accountKind: AccountKind; currency: string; balance: string; date: string };

/** A new account and its opening position: the balance already held on `date`. Zero is a real, recorded position. */
export function openingPosition(input: OpeningInput, newId: () => string = () => crypto.randomUUID()): [Account, Journal] {
  const name = input.name.trim();
  if (!name || name.length > 120 || !USER_ACCOUNT_KINDS.has(input.accountKind)) throw new Error("Enter an account name and type.");
  if (!isIsoDate(input.date)) throw new Error("Enter a valid balance date.");
  const amount = minorUnits(input.balance, input.currency);
  const account: Account = { schema: 1, kind: "account", id: newId(), name, accountKind: input.accountKind, currency: input.currency, openedOn: input.date };
  const journal: Journal = {
    schema: 1,
    kind: "journal",
    id: newId(),
    purpose: "opening_position",
    date: input.date,
    currency: input.currency,
    lines: [
      { accountId: account.id, classification: "asset", debit: amount, credit: "0" },
      { accountId: systemAccountId("opening-balance-equity", input.currency), classification: "equity", debit: "0", credit: amount },
    ],
  };
  validateJournal(journal, new Map([[account.id, account]]));
  return [account, journal];
}

// ── Ledger → position ──────────────────────────────────────────────────────────────────────────────────────

export type LedgerPosition = {
  accounts: Array<Account & { balance: string }>;
  /** Liquid position per currency. Never summed across currencies. */
  positions: Record<string, string>;
  /** Σ debits and Σ credits per currency across the whole ledger — always equal for a valid ledger. */
  trialBalance: Record<string, { debit: string; credit: string }>;
};

/** Replays every journal. Any invalid, duplicated, orphaned or inconsistent record rejects the whole ledger. */
export function derivePosition(records: FinancialRecord[]): LedgerPosition {
  if (new Set(records.map((r) => r.id)).size !== records.length) throw new Error("Duplicate financial record.");
  const accounts = new Map<string, Account>();
  for (const record of records) {
    if (record.kind === "account") {
      validateAccount(record);
      accounts.set(record.id, record);
    } else if (record.kind !== "journal") {
      throw new Error("Unsupported financial record.");
    }
  }
  const ledger = new Map<string, bigint>();
  const trial = new Map<string, { debit: bigint; credit: bigint }>();
  const opened = new Set<string>();
  for (const record of records) {
    if (record.kind !== "journal") continue;
    validateJournal(record, accounts);
    if (record.purpose === "opening_position") {
      const accountId = record.lines[0]!.accountId;
      if (opened.has(accountId)) throw new Error("An account has exactly one opening position.");
      opened.add(accountId);
    }
    const totals = trial.get(record.currency) ?? { debit: ZERO, credit: ZERO };
    for (const line of record.lines) {
      const delta = BigInt(line.debit) - BigInt(line.credit);
      ledger.set(line.accountId, (ledger.get(line.accountId) ?? ZERO) + delta);
      totals.debit += BigInt(line.debit);
      totals.credit += BigInt(line.credit);
    }
    trial.set(record.currency, totals);
  }
  if (opened.size !== accounts.size) throw new Error("An account is missing its opening position.");

  const positions: Record<string, bigint> = {};
  const rows = [...accounts.values()].map((account) => {
    // Assets carry a debit-normal balance.
    const balance = ledger.get(account.id) ?? ZERO;
    positions[account.currency] = (positions[account.currency] ?? ZERO) + balance;
    return { ...account, balance: balance.toString() };
  });
  const trialBalance: LedgerPosition["trialBalance"] = {};
  for (const [currency, t] of trial) {
    if (t.debit !== t.credit) throw new Error("Ledger does not balance.");
    trialBalance[currency] = { debit: t.debit.toString(), credit: t.credit.toString() };
  }
  return {
    accounts: rows,
    positions: Object.fromEntries(Object.entries(positions).map(([c, v]) => [c, v.toString()])),
    trialBalance,
  };
}

/** True once the account has any journal — from its opening position onward its currency can never change. */
export function hasFinancialActivity(records: FinancialRecord[], accountId: string): boolean {
  return records.some((r) => r.kind === "journal" && r.lines.some((l) => l.accountId === accountId));
}
