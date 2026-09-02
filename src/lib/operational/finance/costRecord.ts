/**
 * CostRecord domain — validation and pure helpers.
 * No I/O, no persistence, no inference of reimbursability from context.
 */

import type {
  CostCategory,
  CostEvidence,
  CostRecord,
  CostReimbursability,
  FinancialCurrencyCode,
} from "./types";

/** Canonical cost categories (machine keys). */
export const COST_CATEGORIES = [
  "diesel_fuel",
  "materials",
  "spare_parts",
  "labour",
  "transportation",
  "equipment",
  "consumables",
  "service",
  "other",
] as const;

/** Human-readable labels for UI and reporting. */
export const COST_CATEGORY_LABELS: Record<CostCategory, string> = {
  diesel_fuel: "Diesel / Fuel",
  materials: "Materials",
  spare_parts: "Spare Parts",
  labour: "Labour",
  transportation: "Transportation",
  equipment: "Equipment",
  consumables: "Consumables",
  service: "Service",
  other: "Other",
};

export const COST_REIMBURSABILITY_VALUES = [
  "unknown",
  "reimbursable",
  "non_reimbursable",
] as const;

const CATEGORY_SET = new Set<string>(COST_CATEGORIES);
const REIMBURSABILITY_SET = new Set<string>(COST_REIMBURSABILITY_VALUES);

export type CostRecordValidationResult =
  | { valid: true }
  | { valid: false; errors: string[] };

function isNonNegativeAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Evidence must include a non-empty reference establishing audit basis. */
export function isCostRecordEvidenceComplete(
  evidence: CostEvidence | undefined | null
): boolean {
  return isNonEmptyString(evidence?.reference);
}

export function isValidCostCategory(
  category: unknown
): category is CostCategory {
  return typeof category === "string" && CATEGORY_SET.has(category);
}

export function isValidCostReimbursability(
  value: unknown
): value is CostReimbursability {
  return typeof value === "string" && REIMBURSABILITY_SET.has(value);
}

export function isCostRecordReimbursable(record: Pick<CostRecord, "reimbursability">): boolean {
  return record.reimbursability === "reimbursable";
}

export function hasOperationalReference(
  record: Pick<CostRecord, "workId" | "workOrderId" | "jobOrderId">
): boolean {
  return Boolean(
    record.workId?.trim() ||
      record.workOrderId?.trim() ||
      record.jobOrderId?.trim()
  );
}

/**
 * Authoritative monetary amount for a CostRecord.
 * actualAmount is the sole authoritative value — never falls back to budgetedAmount.
 */
export function getAuthoritativeAmount(
  record: Pick<CostRecord, "actualAmount">
): number {
  return record.actualAmount;
}

/**
 * Pure domain validation for CostRecord shape and invariants.
 * Does not verify facility/WO/JO/user existence.
 */
export function validateCostRecord(
  record: Partial<CostRecord>
): CostRecordValidationResult {
  const errors: string[] = [];

  if (!isNonEmptyString(record.costId)) {
    errors.push("costId is required");
  }
  if (!isNonEmptyString(record.recordedAt)) {
    errors.push("recordedAt is required");
  }
  if (!isNonEmptyString(record.facilityId)) {
    errors.push("facilityId is required");
  }
  if (!isNonEmptyString(record.location)) {
    errors.push("location is required");
  }
  if (!isNonEmptyString(record.description)) {
    errors.push("description is required");
  }
  if (!isNonEmptyString(record.recordedBy)) {
    errors.push("recordedBy is required");
  }
  if (!isValidCostCategory(record.category)) {
    errors.push("category must be a canonical cost category");
  }
  if (!isValidCostReimbursability(record.reimbursability)) {
    errors.push("reimbursability must be unknown, reimbursable, or non_reimbursable");
  }
  if (!isNonNegativeAmount(record.actualAmount)) {
    errors.push("actualAmount must be a non-negative number");
  }
  if (!isNonEmptyString(record.currency)) {
    errors.push("currency is required");
  }
  if (
    record.budgetedAmount !== undefined &&
    !isNonNegativeAmount(record.budgetedAmount)
  ) {
    errors.push("budgetedAmount must be a non-negative number when supplied");
  }
  if (!record.evidence || !isCostRecordEvidenceComplete(record.evidence)) {
    errors.push("supporting/originating evidence with reference is required");
  }

  const optionalIdFields: Array<[string, unknown]> = [
    ["departmentId", record.departmentId],
    ["workId", record.workId],
    ["workOrderId", record.workOrderId],
    ["jobOrderId", record.jobOrderId],
  ];
  for (const [field, value] of optionalIdFields) {
    if (value !== undefined && !isNonEmptyString(value)) {
      errors.push(`${field} must be a non-empty string when supplied`);
    }
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

/** Default operational currency when callers omit currency on draft records. */
export const DEFAULT_COST_RECORD_CURRENCY: FinancialCurrencyCode = "NGN";
