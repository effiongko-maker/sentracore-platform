/**
 * Facility Management operating distinction between Work Order and Job Order.
 *
 * These are both actual operational instructions used to get work carried out.
 * They are independent of reimbursability (NCC reimbursable vs non-reimbursable).
 *
 * Order Type is an explicit user selection persisted on the Work Order:
 *   orderType === "work_order" → Work Order
 *   orderType === "job_order" → Job Order
 *   orderType missing / blank / invalid (legacy) → Work Order
 *
 * Estimated cost is a financial attribute only and must never classify Order Type.
 * There is no ₦1m threshold and no "undetermined" Order Type in the register filter.
 */

export type WorkInstructionKind = "work_order" | "job_order";

/**
 * @deprecated Undetermined is no longer part of Order Type resolution.
 * Kept only for label map compatibility during transition.
 */
export type WorkInstructionKindOrUndetermined =
  | WorkInstructionKind
  | "undetermined";

export const WORK_INSTRUCTION_KIND_OPTIONS: readonly WorkInstructionKind[] = [
  "work_order",
  "job_order",
] as const;

export const WORK_INSTRUCTION_KIND_LABELS: Record<
  WorkInstructionKindOrUndetermined,
  string
> = {
  work_order: "Work Order",
  job_order: "Job Order",
  undetermined: "Not determined",
};

export const WORK_INSTRUCTION_KIND_SUMMARIES: Record<
  WorkInstructionKind,
  string
> = {
  work_order:
    "Operational instruction classified as a Work Order. Estimated cost is independent.",
  job_order:
    "Operational instruction classified as a Job Order. Estimated cost is independent.",
};

function normalizeOrderType(
  value: unknown
): WorkInstructionKind | undefined {
  if (value == null) return undefined;
  const normalized = String(value).trim().toLowerCase().replace(/\s+/g, "_");
  if (normalized === "work_order" || normalized === "job_order") {
    return normalized;
  }
  return undefined;
}

/**
 * Resolve Order Type from the persisted `orderType` field.
 * Legacy records without Order Type default to Work Order.
 * Invalid values do not become Job Order.
 * Does not inspect estimatedCost.
 */
export function resolveWorkInstructionKind(input: {
  orderType?: string | null;
  /** @deprecated Ignored — estimated cost does not classify Order Type. */
  estimatedCost?: number | null;
}): WorkInstructionKind {
  const kind = normalizeOrderType(input.orderType);
  if (kind) return kind;
  return "work_order";
}

export function workInstructionKindLabel(kind: WorkInstructionKind): string {
  return WORK_INSTRUCTION_KIND_LABELS[kind];
}

export type OrderTypeSelectionResult =
  | { ok: true; kind: WorkInstructionKind }
  | { ok: false; message: string };

/**
 * Require an explicit Work Order or Job Order selection for create/update.
 * Estimated cost is not consulted.
 */
export function validateOrderTypeSelection(
  orderType: WorkInstructionKind | "" | null | undefined
): OrderTypeSelectionResult {
  const kind = normalizeOrderType(orderType);
  if (!kind) {
    return {
      ok: false,
      message: "Select Order Type: Work Order or Job Order.",
    };
  }
  return { ok: true, kind };
}

/**
 * Issue execution refs use the same persisted Order Type resolver.
 */
export function executionKindFromWorkInstruction(input: {
  orderType?: string | null;
  /** @deprecated Ignored — estimated cost does not classify Order Type. */
  estimatedCost?: number | null;
}): WorkInstructionKind {
  return resolveWorkInstructionKind(input);
}
