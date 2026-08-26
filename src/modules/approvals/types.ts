export type ApprovalStatus =
  | "draft"
  | "awaiting_decision"
  | "approved"
  | "rejected"
  | "returned"
  | "cancelled"
  | "expired"
  | "closed"
  /** @deprecated → draft */
  | "generated"
  | "awaiting_submission"
  /** @deprecated → awaiting_decision */
  | "submitted"
  | "awaiting_response";

export type ApprovalDecisionOutcome =
  | "approved"
  | "rejected"
  | "partially_approved";

export type ApprovalSubmissionMethod =
  | "physical_delivery"
  | "email"
  | "client_portal"
  | "courier"
  | "other";

export type ApprovalFollowUpMethod =
  | "phone"
  | "email"
  | "physical_visit"
  | "client_portal"
  | "other";

export type ApprovalType =
  | "standard_maintenance"
  | "variation"
  | "equipment_replacement"
  | "emergency";

export type ApprovalSort = "newest" | "oldest" | "title_asc" | "title_desc";

export type ApprovalActivityAction =
  | "approval_created"
  | "approval_package_generated"
  | "approval_submitted"
  | "approval_followed_up"
  | "approval_approved"
  | "approval_partially_approved"
  | "approval_rejected"
  | "approval_cancelled"
  | "approval_document_uploaded"
  | "approval_updated";

export interface ApprovalActivityEntry {
  id: string;
  action: ApprovalActivityAction;
  at: string;
  summary: string;
  actorUserId?: string;
  data?: Record<string, unknown>;
}

export interface ApprovalAttachmentRef {
  fileName: string;
  mimeType?: string;
  sizeBytes?: number;
}

/** Formal client / authority approval request linked to a Work Order. */
export interface Approval {
  id: string;
  title: string;
  type: ApprovalType;
  workOrderId: string;
  facilityId: string;
  assetId?: string;
  status: ApprovalStatus;
  description?: string;
  reason?: string;
  coverLetter?: string;
  templateId?: string;
  clientName?: string;
  clientAddress?: string;
  approvalAmount?: number;
  approvedAmount?: number;
  currency?: string;
  requestedByUserId?: string;
  approvedByUserId?: string;
  generatedAt?: string;
  submittedAt?: string;
  decisionAt?: string;
  decisionNotes?: string;
  decisionOutcome?: ApprovalDecisionOutcome;
  decisionReference?: string;
  expiresAt?: string;
  submissionMethod?: ApprovalSubmissionMethod | string;
  submittedTo?: string;
  submissionReference?: string;
  acknowledgementFileName?: string;
  acknowledgementFileMime?: string;
  acknowledgementFileSize?: number;
  decisionDocumentFileName?: string;
  decisionDocumentFileMime?: string;
  decisionDocumentFileSize?: number;
  lastFollowUpAt?: string;
  lastActivityAt?: string;
  lastActivitySummary?: string;
  /** JSON string of ApprovalActivityEntry[] persisted on the sheet */
  activityLog?: string;
  activities?: ApprovalActivityEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateApprovalInput {
  title: string;
  workOrderId: string;
  facilityId: string;
  type?: ApprovalType;
  assetId?: string;
  status?: ApprovalStatus;
  description?: string;
  reason?: string;
  coverLetter?: string;
  templateId?: string;
  clientName?: string;
  clientAddress?: string;
  approvalAmount?: number;
  approvedAmount?: number;
  currency?: string;
  requestedByUserId?: string;
  approvedByUserId?: string;
  generatedAt?: string;
  submittedAt?: string;
  decisionAt?: string;
  decisionNotes?: string;
  decisionOutcome?: ApprovalDecisionOutcome;
  decisionReference?: string;
  expiresAt?: string;
  submissionMethod?: string;
  submittedTo?: string;
  submissionReference?: string;
  acknowledgementFileName?: string;
  acknowledgementFileMime?: string;
  acknowledgementFileSize?: number;
  decisionDocumentFileName?: string;
  decisionDocumentFileMime?: string;
  decisionDocumentFileSize?: number;
  lastFollowUpAt?: string;
  lastActivityAt?: string;
  lastActivitySummary?: string;
  activityLog?: string;
}

export type UpdateApprovalInput = Partial<CreateApprovalInput>;

export interface ApprovalListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: ApprovalStatus | "all";
  type?: ApprovalType | "all";
  facilityId?: string | "all";
  workOrderId?: string | "all";
  sort?: ApprovalSort;
}

export type ApprovalModalState =
  | { type: "closed" }
  | { type: "generate"; workOrderId: string }
  | { type: "edit"; approval: Approval }
  | { type: "view"; approval: Approval }
  | { type: "package"; approval: Approval }
  | { type: "submit"; approval: Approval }
  | { type: "follow_up"; approval: Approval }
  | { type: "decision"; approval: Approval }
  | { type: "deactivate"; approval: Approval };

export interface ApprovalTemplateDefinition {
  id: ApprovalType;
  title: string;
  description: string;
  body: string;
}

export interface SubmitApprovalInput {
  submittedAt: string;
  submissionMethod: ApprovalSubmissionMethod;
  submittedTo?: string;
  submissionReference?: string;
  notes?: string;
  acknowledgement?: ApprovalAttachmentRef;
}

export interface FollowUpApprovalInput {
  followedUpAt: string;
  method: ApprovalFollowUpMethod;
  contactPerson?: string;
  outcomeNotes: string;
  nextFollowUpAt?: string;
}

export interface RecordApprovalDecisionInput {
  decision: ApprovalDecisionOutcome;
  decisionAt: string;
  approvedAmount?: number;
  decisionReference?: string;
  decisionNotes?: string;
  decisionDocument?: ApprovalAttachmentRef;
}
