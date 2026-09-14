/**
 * Pure domain invariants for Platform Finance posting lines.
 * Used by verify scripts and server validation before RPC.
 */

export type LedgerAmountPair = {
  debit: number;
  credit: number;
};

export type BalancedLineInput = LedgerAmountPair & {
  accountId?: string;
};

export function isPositiveFiniteAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function isNonNegativeFiniteAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** Exactly one of debit/credit must be > 0; the other must be 0. */
export function isXorDebitCredit(line: LedgerAmountPair): boolean {
  const { debit, credit } = line;
  if (!isNonNegativeFiniteAmount(debit) || !isNonNegativeFiniteAmount(credit)) {
    return false;
  }
  return (debit > 0 && credit === 0) || (credit > 0 && debit === 0);
}

export function assertXorDebitCredit(
  line: LedgerAmountPair,
  label = "line"
): void {
  if (!isXorDebitCredit(line)) {
    throw new Error(
      `${label}: exactly one of debit or credit must be positive (debit=${line.debit}, credit=${line.credit})`
    );
  }
}

export function sumDebits(lines: readonly LedgerAmountPair[]): number {
  return lines.reduce((sum, line) => sum + (line.debit || 0), 0);
}

export function sumCredits(lines: readonly LedgerAmountPair[]): number {
  return lines.reduce((sum, line) => sum + (line.credit || 0), 0);
}

/** Exact numeric equality (foundation amounts are decimal-safe as numbers for unit tests). */
export function isBalanced(lines: readonly LedgerAmountPair[]): boolean {
  if (lines.length < 2) return false;
  if (!lines.every(isXorDebitCredit)) return false;
  return sumDebits(lines) === sumCredits(lines);
}

export function assertBalanced(
  lines: readonly LedgerAmountPair[],
  label = "entry"
): void {
  if (lines.length < 2) {
    throw new Error(`${label}: at least two journal lines are required`);
  }
  lines.forEach((line, index) => {
    assertXorDebitCredit(line, `${label} line ${index + 1}`);
  });
  const debit = sumDebits(lines);
  const credit = sumCredits(lines);
  if (debit !== credit) {
    throw new Error(
      `${label}: unbalanced (debit=${debit}, credit=${credit})`
    );
  }
}

export function assertValidPostingLines(
  lines: readonly BalancedLineInput[]
): void {
  if (lines.length < 2) {
    throw new Error("at least two journal lines are required");
  }
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (!line.accountId || typeof line.accountId !== "string") {
      throw new Error(`line ${i + 1}: accountId is required`);
    }
    assertXorDebitCredit(line, `line ${i + 1}`);
  }
  assertBalanced(lines);
}
