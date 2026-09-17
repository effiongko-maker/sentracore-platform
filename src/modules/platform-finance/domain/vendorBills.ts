/**
 * Vendor Bill / External Obligation — domain source of truth.
 *
 * A Vendor Bill is an obligation asserted by a third party. It is NOT a
 * Financial Request (internal need), NOT a Payable (authorised obligation),
 * NOT a Payment (settlement), and NOT a journal posting.
 *
 * Vendor Bill is upstream of Payable: the Payable is created only when the CEO
 * approves (fully or partially), using the existing
 * platform_finance.request.approve capability.
 */

import type { PaymentDestination } from "./paymentDestination";

export const FINANCE_VENDOR_BILL_STATUSES = [
  "draft",
  "submitted",
  "under_review",
  "query",
  "resubmitted",
  "pending_ceo_approval",
  "approved",
  "partially_approved",
  "rejected",
] as const;

export type FinanceVendorBillStatus =
  (typeof FINANCE_VENDOR_BILL_STATUSES)[number];

/** Terminal statuses: the bill leaves the Vendor Bill domain. */
export const FINANCE_VENDOR_BILL_TERMINAL_STATUSES = [
  "approved",
  "partially_approved",
  "rejected",
] as const satisfies readonly FinanceVendorBillStatus[];

export type FinanceVendorBillTerminalStatus =
  (typeof FINANCE_VENDOR_BILL_TERMINAL_STATUSES)[number];

/**
 * Authoritative allowed transitions. Mirrors the Financial Request machine:
 * no CANCELLED, no paid/awaiting_payment, no Finance-side approval edge.
 */
export const FINANCE_VENDOR_BILL_TRANSITIONS: Readonly<
  Record<FinanceVendorBillStatus, readonly FinanceVendorBillStatus[]>
> = {
  draft: ["submitted"],
  submitted: ["under_review"],
  under_review: ["query", "pending_ceo_approval"],
  query: ["resubmitted"],
  resubmitted: ["under_review"],
  pending_ceo_approval: [
    "approved",
    "partially_approved",
    "rejected",
    "query",
  ],
  approved: [],
  partially_approved: [],
  rejected: [],
};

/** Statuses in which the inputter may still edit content. */
export const FINANCE_VENDOR_BILL_INPUTTER_EDITABLE_STATUSES = [
  "draft",
  "query",
  "resubmitted",
] as const satisfies readonly FinanceVendorBillStatus[];

export function isFinanceVendorBillStatus(
  value: unknown
): value is FinanceVendorBillStatus {
  return (
    typeof value === "string" &&
    (FINANCE_VENDOR_BILL_STATUSES as readonly string[]).includes(value)
  );
}

export function isAllowedFinanceVendorBillTransition(
  from: FinanceVendorBillStatus,
  to: FinanceVendorBillStatus
): boolean {
  return FINANCE_VENDOR_BILL_TRANSITIONS[from].includes(to);
}

export function assertFinanceVendorBillTransition(
  from: FinanceVendorBillStatus,
  to: FinanceVendorBillStatus,
  label = "vendor bill"
): void {
  if (!isAllowedFinanceVendorBillTransition(from, to)) {
    throw new Error(`${label}: invalid status transition from ${from} to ${to}`);
  }
}

export function isFinanceVendorBillTerminalStatus(
  status: FinanceVendorBillStatus
): boolean {
  return (
    FINANCE_VENDOR_BILL_TERMINAL_STATUSES as readonly string[]
  ).includes(status);
}

/** Denormalised payee identity — there is no vendor master in this slice. */
export const FINANCE_VENDOR_BILL_PAYEE_TYPES = [
  "vendor",
  "staff",
  "other",
] as const;

export type FinanceVendorBillPayeeType =
  (typeof FINANCE_VENDOR_BILL_PAYEE_TYPES)[number];

export const FINANCE_VENDOR_BILL_DOCUMENT_ROLES = [
  "supporting",
  "clarification",
  "other",
] as const;

export type FinanceVendorBillDocumentRole =
  (typeof FINANCE_VENDOR_BILL_DOCUMENT_ROLES)[number];

export const FINANCE_VENDOR_BILL_EVENT_TYPES = [
  "created",
  "updated",
  "submitted",
  "review_started",
  "queried",
  "resubmitted",
  "sent_to_ceo",
  "approved",
  "partially_approved",
  "rejected",
  "document_added",
  "document_removed",
  "document_superseded",
  "field_changed",
] as const;

export type FinanceVendorBillEventType =
  (typeof FINANCE_VENDOR_BILL_EVENT_TYPES)[number];

/**
 * Capability strings — company access remains a separate check.
 * There is deliberately no vendor_bill.approve: CEO authority reuses
 * platform_finance.request.approve so all obligations share one approver gate.
 */
export const FINANCE_VENDOR_BILL_CAPABILITIES = {
  view: "platform_finance.vendor_bill.view",
  create: "platform_finance.vendor_bill.create",
  review: "platform_finance.vendor_bill.review",
} as const;

export type FinanceVendorBillCapability =
  (typeof FINANCE_VENDOR_BILL_CAPABILITIES)[keyof typeof FINANCE_VENDOR_BILL_CAPABILITIES];

/** The single approval capability for every obligation, Vendor Bill included. */
export const FINANCE_VENDOR_BILL_CEO_APPROVAL_CAPABILITY =
  "platform_finance.request.approve" as const;

/**
 * Separation of duties and domain invariants encoded for the service layer.
 * Capability ≠ company access.
 */
export const FINANCE_VENDOR_BILL_SEPARATION_OF_DUTIES = {
  inputterMustNotReviewOwn: true,
  inputterMustNotApproveOwn: true,
  inputterMustNotRouteOwn: true,
  financeMustNotApprove: true,
  financeMustNotChangeBilledAmount: true,
  ceoMakesFundingDecision: true,
  ceoApprovalReusesRequestApproveCapability: true,
  inputterResolvesQueries: true,
  draftHardDeleteOnly: true,
} as const;

export const FINANCE_VENDOR_BILL_INVARIANTS = {
  companyMandatory: true,
  vendorBillIsNotFinancialRequest: true,
  vendorBillIsNotPayable: true,
  vendorBillIsNotPayment: true,
  vendorBillIsNotPosting: true,
  vendorBillIsUpstreamOfPayable: true,
  approvedCannotExceedBilled: true,
  billedAmountNeverOverwritten: true,
  goodsServicesReceivedRequiredBeforeSubmit: true,
  documentRequiredBeforeSubmit: true,
  allObligationsRequireCeoApproval: true,
  approvalCreatesPayableAtomically: true,
  rejectionCreatesNoPayable: true,
  noDuplicateSourcePayable: true,
  denormalisedPayeeNoVendorMaster: true,
  directPayableCreateIsBlocked: true,
} as const;

export type FinanceVendorBill = {
  id: string;
  organisationId: string;
  companyId: string;
  inputterProfileId: string;
  status: FinanceVendorBillStatus;
  currency: string;
  billedAmount: number;
  approvedAmount: number;
  payeeName: string;
  payeeType: FinanceVendorBillPayeeType;
  paymentDestination: PaymentDestination | null;
  invoiceReference: string | null;
  invoiceDate: string | null;
  description: string | null;
  purpose: string;
  goodsServicesReceived: boolean;
  dueDate: string | null;
  projectContractRef: string | null;
  financeNotes: string | null;
  ceoDecisionNotes: string | null;
  queriedAt: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Derived; never stored. Only meaningful once a decision exists. */
export function financeVendorBillDisallowedAmount(
  bill: Pick<FinanceVendorBill, "billedAmount" | "approvedAmount">
): number {
  return bill.billedAmount - bill.approvedAmount;
}

export type FinanceVendorBillDocument = {
  id: string;
  organisationId: string;
  vendorBillId: string;
  uploadedByProfileId: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  storageBucket: string;
  storagePath: string;
  checksum: string | null;
  documentRole: FinanceVendorBillDocumentRole;
  uploadedAt: string;
  supersededAt: string | null;
  supersededByDocumentId: string | null;
};

export type FinanceVendorBillEvent = {
  id: string;
  organisationId: string;
  vendorBillId: string;
  actorProfileId: string;
  eventType: FinanceVendorBillEventType;
  fromStatus: FinanceVendorBillStatus | null;
  toStatus: FinanceVendorBillStatus | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

/** Payable minted by CEO approval of this bill (read-only linkage). */
export type FinanceVendorBillPayableSummary = {
  id: string;
  status: string;
  payableAmount: number;
  paidAmount: number;
  currency: string;
  dueDate: string | null;
  paymentDestination: PaymentDestination | null;
};
