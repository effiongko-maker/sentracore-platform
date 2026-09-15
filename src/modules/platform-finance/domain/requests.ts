/**
 * Financial Requests — Slice 1 domain source of truth.
 * Status transition map and SoD constants only (no executable transition engine).
 */

export const FINANCIAL_REQUEST_STATUSES = [
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

export type FinancialRequestStatus =
  (typeof FINANCIAL_REQUEST_STATUSES)[number];

/** Terminal statuses: request leaves the Financial Request domain. */
export const FINANCIAL_REQUEST_TERMINAL_STATUSES = [
  "approved",
  "partially_approved",
  "rejected",
] as const satisfies readonly FinancialRequestStatus[];

export type FinancialRequestTerminalStatus =
  (typeof FINANCIAL_REQUEST_TERMINAL_STATUSES)[number];

/**
 * Authoritative allowed transitions for Slice 2+ service layer.
 * No RETURNED / CANCELLED / paid / awaiting_payment statuses.
 */
export const FINANCIAL_REQUEST_TRANSITIONS: Readonly<
  Record<FinancialRequestStatus, readonly FinancialRequestStatus[]>
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

export function isFinancialRequestStatus(
  value: unknown
): value is FinancialRequestStatus {
  return (
    typeof value === "string" &&
    (FINANCIAL_REQUEST_STATUSES as readonly string[]).includes(value)
  );
}

export function isAllowedFinancialRequestTransition(
  from: FinancialRequestStatus,
  to: FinancialRequestStatus
): boolean {
  return FINANCIAL_REQUEST_TRANSITIONS[from].includes(to);
}

export function assertFinancialRequestTransition(
  from: FinancialRequestStatus,
  to: FinancialRequestStatus,
  label = "financial request"
): void {
  if (!isAllowedFinancialRequestTransition(from, to)) {
    throw new Error(
      `${label}: invalid status transition from ${from} to ${to}`
    );
  }
}

export function isFinancialRequestTerminalStatus(
  status: FinancialRequestStatus
): boolean {
  return (FINANCIAL_REQUEST_TERMINAL_STATUSES as readonly string[]).includes(
    status
  );
}

export const FINANCIAL_REQUEST_PAYEE_TYPES = [
  "vendor",
  "staff",
  "other",
] as const;

export type FinancialRequestPayeeType =
  (typeof FINANCIAL_REQUEST_PAYEE_TYPES)[number];

export const FINANCIAL_REQUEST_DOCUMENT_ROLES = [
  "supporting",
  "clarification",
  "other",
] as const;

export type FinancialRequestDocumentRole =
  (typeof FINANCIAL_REQUEST_DOCUMENT_ROLES)[number];

export const FINANCIAL_REQUEST_EVENT_TYPES = [
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
  "field_changed",
] as const;

export type FinancialRequestEventType =
  (typeof FINANCIAL_REQUEST_EVENT_TYPES)[number];

/** Capability strings — company access remains separate. */
export const FINANCIAL_REQUEST_CAPABILITIES = {
  create: "platform_finance.request.create",
  view_own: "platform_finance.request.view_own",
  review: "platform_finance.request.review",
  approve: "platform_finance.request.approve",
} as const;

export type FinancialRequestCapability =
  (typeof FINANCIAL_REQUEST_CAPABILITIES)[keyof typeof FINANCIAL_REQUEST_CAPABILITIES];

/**
 * Separation of duties (encoded for Slice 2 auth; not enforced by executable services yet).
 * Capability ≠ company access.
 */
export const FINANCIAL_REQUEST_SEPARATION_OF_DUTIES = {
  requesterMustNotApproveOwn: true,
  requesterMustNotReviewOwn: true,
  financeMustNotChangeRequestedAmount: true,
  financeMustNotRewritePurpose: true,
  financeMustNotApprove: true,
  ceoMakesFundingDecision: true,
  draftHardDeleteOnly: true,
  paidAmountRemainsZeroInV1: true,
} as const;

export type FinancialRequestCategory = {
  id: string;
  organisationId: string;
  slug: string;
  name: string;
  status: "active" | "inactive";
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type FinancialRequest = {
  id: string;
  organisationId: string;
  companyId: string;
  requesterProfileId: string;
  status: FinancialRequestStatus;
  currency: string;
  requestedAmount: number;
  approvedAmount: number;
  paidAmount: number;
  categoryId: string;
  purpose: string;
  description: string | null;
  payeeName: string;
  payeeType: FinancialRequestPayeeType;
  requiredByDate: string | null;
  externalReference: string | null;
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

/** Derived outstanding; do not store as a mutable column. */
export function financialRequestOutstandingAmount(
  request: Pick<FinancialRequest, "approvedAmount" | "paidAmount">
): number {
  return request.approvedAmount - request.paidAmount;
}

export type FinancialRequestDocument = {
  id: string;
  organisationId: string;
  requestId: string;
  uploadedByProfileId: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  storageBucket: string;
  storagePath: string;
  checksum: string | null;
  documentRole: FinancialRequestDocumentRole;
  uploadedAt: string;
  supersededAt: string | null;
  supersededByDocumentId: string | null;
};

export type FinancialRequestEvent = {
  id: string;
  organisationId: string;
  requestId: string;
  actorProfileId: string;
  eventType: FinancialRequestEventType;
  fromStatus: FinancialRequestStatus | null;
  toStatus: FinancialRequestStatus | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

/** Seeded v1 category slugs (org-scoped rows created in migration for paychex). */
export const FINANCIAL_REQUEST_CATEGORY_SEEDS = [
  { slug: "diesel_fuel", name: "Diesel / Fuel", sortOrder: 10 },
  { slug: "travel", name: "Travel", sortOrder: 20 },
  { slug: "accommodation", name: "Accommodation", sortOrder: 30 },
  { slug: "procurement", name: "Procurement", sortOrder: 40 },
  { slug: "petty_cash", name: "Petty Cash", sortOrder: 50 },
  { slug: "vendor_payment", name: "Vendor Payment", sortOrder: 60 },
  { slug: "project_expenditure", name: "Project Expenditure", sortOrder: 70 },
  { slug: "training", name: "Training", sortOrder: 80 },
  { slug: "event", name: "Event", sortOrder: 90 },
  {
    slug: "other_operational_expense",
    name: "Other Operational Expense",
    sortOrder: 100,
  },
] as const;
