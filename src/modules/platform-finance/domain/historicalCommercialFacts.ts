/**
 * Platform Finance — Historical Commercial Facts.
 *
 * Preserves pre-SentraCore™ client commercial facts (submitted/authorised/received amounts, source payment
 * status, payment datetime, commercial reference, source counterparty text) WITHOUT pretending SentraCore™
 * participated in the original transaction. Deliberately NOT finance_invoices / finance_receivables /
 * finance_receipts / finance_transactions / finance_requests — see the migration comment on
 * platform_finance_historical_commercial_facts for why none of those can hold this truthfully.
 *
 * Foundation only. No import has run yet; no UI reads this module yet.
 */

export const HISTORICAL_COMMERCIAL_FACT_RECORD_ORIGIN = "migrated_historical" as const;

export type PlatformFinanceHistoricalCommercialFact = {
  id: string;
  organisationId: string;
  code: string;
  recordOrigin: typeof HISTORICAL_COMMERCIAL_FACT_RECORD_ORIGIN;
  description: string;

  /** Independently evidenced. Never defaulted, never derived from one another. */
  submittedAmount: number | null;
  authorisedAmount: number | null;
  amountReceived: number | null;
  currency: string;

  /** The source's OWN status text, verbatim (e.g. "Paid", "Pending") — never a SentraCore™ workflow status. */
  sourcePaymentStatus: string | null;

  /** Parsed payment datetime (when the source cell resolved to one) plus the raw source text, always preserved. */
  paymentDatetime: string | null;
  paymentDatetimeSourceText: string | null;

  /** Free text only — no counterparty/reference relationship is asserted. */
  commercialReference: string | null;
  sourceCounterpartyText: string | null;

  /** Populated only where an already-governed CERTAIN relationship exists. Never inferred by this module. */
  fmWorkId: string | null;
  fmWorkInstructionId: string | null;

  createdByProfileId: string | null;
  updatedByProfileId: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Import-time input. record_origin is never accepted here — the table default (and its immutability trigger)
 * are the only source of truth, matching fm_work / fm_cost_records.
 */
export type PlatformFinanceHistoricalCommercialFactInput = {
  code: string;
  description: string;
  submittedAmount?: number | null;
  authorisedAmount?: number | null;
  amountReceived?: number | null;
  currency?: string;
  sourcePaymentStatus?: string | null;
  paymentDatetime?: string | null;
  paymentDatetimeSourceText?: string | null;
  commercialReference?: string | null;
  sourceCounterpartyText?: string | null;
  fmWorkId?: string | null;
  fmWorkInstructionId?: string | null;
};

export type DerivedCommercialSpreadBasis = "authorised" | "submitted";

export type DerivedCommercialSpread = {
  basis: DerivedCommercialSpreadBasis;
  /** The independently evidenced commercial amount used as the minuend (authorised, else submitted). */
  commercialAmount: number;
  /** The independently evidenced FM execution cost for the same transaction (sum of linked fm_cost_records). */
  executionCost: number;
  spread: number;
};

/**
 * Read-time only — the caller never persists this. Requires BOTH inputs to be independently evidenced for the
 * SAME transaction (the historical fact's own submitted/authorised amount, and an FM execution cost genuinely
 * linked to it via the shared, already-governed fm_work_id / fm_work_instruction_id). Authorised amount is
 * preferred over submitted when both are present, since it is the confirmed contractual figure; submitted is
 * used only when authorised is absent. Returns null when either side of the comparison is not evidenced —
 * never falls back to zero or to the other amount as a substitute.
 */
export function deriveCommercialSpread(
  fact: Pick<PlatformFinanceHistoricalCommercialFact, "authorisedAmount" | "submittedAmount">,
  executionCost: number | null
): DerivedCommercialSpread | null {
  if (executionCost == null) return null;

  const basis: DerivedCommercialSpreadBasis | null =
    fact.authorisedAmount != null ? "authorised" : fact.submittedAmount != null ? "submitted" : null;
  if (!basis) return null;

  const commercialAmount = basis === "authorised" ? fact.authorisedAmount! : fact.submittedAmount!;
  return {
    basis,
    commercialAmount,
    executionCost,
    spread: commercialAmount - executionCost,
  };
}

export function isValidHistoricalCommercialFactAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** Mirrors the HIST/COST/SUB/... nextCode(prefix, latest, now) convention used across fmCostDomain.ts. */
export function generateNextHistoricalFactCode(latest: string | null | undefined, now = new Date()): string {
  const year = now.getUTCFullYear();
  const match = String(latest ?? "").match(new RegExp(`^HIST-${year}-(\\d+)$`, "i"));
  const max = match ? parseInt(match[1]!, 10) || 0 : 0;
  return `HIST-${year}-${String(max + 1).padStart(6, "0")}`;
}
