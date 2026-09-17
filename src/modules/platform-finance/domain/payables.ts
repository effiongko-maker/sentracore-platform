/**
 * Payables — domain source of truth (Slice 1 foundation + Slice 2 lifecycle).
 * Obligation records distinct from Financial Requests, Payments, and Journal.
 *
 * Banking-boundary statuses SCHEDULED / PAYMENT_PENDING / PAID remain in the
 * status model but transition RPCs are not implemented until Banking/Payments exists.
 */

import type { PaymentDestination } from "./paymentDestination";

export const FINANCE_PAYABLE_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "scheduled",
  "payment_pending",
  "paid",
  "rejected",
  "cancelled",
  "disputed",
] as const;

export type FinancePayableStatus = (typeof FINANCE_PAYABLE_STATUSES)[number];

/** Primary happy-path statuses (excludes exception states). */
export const FINANCE_PAYABLE_PRIMARY_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "scheduled",
  "payment_pending",
  "paid",
] as const satisfies readonly FinancePayableStatus[];

export const FINANCE_PAYABLE_EXCEPTION_STATUSES = [
  "rejected",
  "cancelled",
  "disputed",
] as const satisfies readonly FinancePayableStatus[];

/**
 * Authoritative allowed transitions.
 * SCHEDULED / PAYMENT_PENDING / PAID edges are reserved for Banking/Payments (not implemented in Slice 2).
 * Query returns PENDING_APPROVAL → DRAFT (no invented QUERY status).
 */
export const FINANCE_PAYABLE_TRANSITIONS: Readonly<
  Record<FinancePayableStatus, readonly FinancePayableStatus[]>
> = {
  draft: ["pending_approval", "cancelled"],
  pending_approval: ["approved", "rejected", "cancelled", "draft"],
  approved: ["scheduled", "payment_pending", "disputed", "cancelled"],
  scheduled: ["payment_pending", "disputed", "cancelled"],
  payment_pending: ["paid", "disputed"],
  paid: [],
  rejected: [],
  cancelled: [],
  disputed: ["approved", "cancelled"],
};

/** Banking/Payments-owned transitions — not implemented in Slice 2 RPCs. */
export const FINANCE_PAYABLE_BANKING_DEFERRED_TRANSITIONS = [
  "scheduled",
  "payment_pending",
  "paid",
] as const satisfies readonly FinancePayableStatus[];

export function isFinancePayableStatus(
  value: unknown
): value is FinancePayableStatus {
  return (
    typeof value === "string" &&
    (FINANCE_PAYABLE_STATUSES as readonly string[]).includes(value)
  );
}

export function isAllowedFinancePayableTransition(
  from: FinancePayableStatus,
  to: FinancePayableStatus
): boolean {
  return FINANCE_PAYABLE_TRANSITIONS[from].includes(to);
}

export function assertFinancePayableTransition(
  from: FinancePayableStatus,
  to: FinancePayableStatus,
  label = "payable"
): void {
  if (!isAllowedFinancePayableTransition(from, to)) {
    throw new Error(`${label}: invalid status transition from ${from} to ${to}`);
  }
}

export const FINANCE_PAYABLE_SOURCE_TYPES = [
  "financial_request",
  "vendor_bill",
] as const;

export type FinancePayableSourceType =
  (typeof FINANCE_PAYABLE_SOURCE_TYPES)[number];

export function isFinancePayableSourceType(
  value: unknown
): value is FinancePayableSourceType {
  return (
    typeof value === "string" &&
    (FINANCE_PAYABLE_SOURCE_TYPES as readonly string[]).includes(value)
  );
}

/** Denormalised payee identity — no finance_vendors master in v1. */
export const FINANCE_PAYABLE_PAYEE_TYPES = [
  "vendor",
  "staff",
  "other",
] as const;

export type FinancePayablePayeeType =
  (typeof FINANCE_PAYABLE_PAYEE_TYPES)[number];

export const FINANCE_PAYABLE_EVENT_TYPES = [
  "created",
  "updated",
  "submitted",
  "approved",
  "rejected",
  "scheduled",
  "payment_initiated",
  "paid",
  "cancelled",
  "disputed",
  "document_added",
  "document_removed",
  "document_superseded",
  "field_changed",
] as const;

export type FinancePayableEventType =
  (typeof FINANCE_PAYABLE_EVENT_TYPES)[number];

export const FINANCE_PAYABLE_DOCUMENT_ROLES = [
  "supporting",
  "clarification",
  "other",
] as const;

export type FinancePayableDocumentRole =
  (typeof FINANCE_PAYABLE_DOCUMENT_ROLES)[number];

/** Capability strings — company access remains separate. */
export const FINANCE_PAYABLE_CAPABILITIES = {
  view: "platform_finance.payable.view",
  create: "platform_finance.payable.create",
  review: "platform_finance.payable.review",
  approve: "platform_finance.payable.approve",
} as const;

export type FinancePayableCapability =
  (typeof FINANCE_PAYABLE_CAPABILITIES)[keyof typeof FINANCE_PAYABLE_CAPABILITIES];

export const FINANCE_PAYABLE_INVARIANTS = {
  companyMandatory: true,
  facilityNeverDeterminesCompany: true,
  payableAmountMustBePositive: true,
  paidAmountNonNegative: true,
  paidCannotExceedPayable: true,
  outstandingIsDerived: true,
  requestIsNotPayable: true,
  payableIsNotPayment: true,
  payableIsNotJournal: true,
  noDuplicateSourcePayable: true,
  rejectedRequestCreatesNoPayable: true,
} as const;

export type FinancePayable = {
  id: string;
  organisationId: string;
  companyId: string;
  createdByProfileId: string;
  status: FinancePayableStatus;
  currency: string;
  payableAmount: number;
  paidAmount: number;
  payeeName: string;
  payeeType: FinancePayablePayeeType;
  paymentDestination: PaymentDestination | null;
  description: string | null;
  dueDate: string | null;
  sourceType: FinancePayableSourceType;
  sourceId: string;
  projectContractRef: string | null;
  periodId: string | null;
  createdAt: string;
  updatedAt: string;
};

/** API/read model — outstanding is derived, never stored. */
export type FinancePayableView = FinancePayable & {
  outstandingAmount: number;
};

/** Optional FR enrichment for request-originated payables (persisted fields only). */
export type FinancePayableSourceRequestSummary = {
  id: string;
  purpose: string;
  categoryId: string;
  externalReference: string | null;
  requiredByDate: string | null;
};

/** Derived outstanding; do not store as a mutable column. */
export function financePayableOutstandingAmount(
  payable: Pick<FinancePayable, "payableAmount" | "paidAmount">
): number {
  return payable.payableAmount - payable.paidAmount;
}

export function toFinancePayableView(payable: FinancePayable): FinancePayableView {
  return {
    ...payable,
    outstandingAmount: financePayableOutstandingAmount(payable),
  };
}

export type FinancePayableEvent = {
  id: string;
  organisationId: string;
  payableId: string;
  actorProfileId: string;
  eventType: FinancePayableEventType;
  fromStatus: FinancePayableStatus | null;
  toStatus: FinancePayableStatus | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type FinancePayableDocument = {
  id: string;
  organisationId: string;
  payableId: string;
  uploadedByProfileId: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  storageBucket: string;
  storagePath: string;
  checksum: string | null;
  documentRole: FinancePayableDocumentRole;
  uploadedAt: string;
  supersededAt: string | null;
  supersededByDocumentId: string | null;
};
