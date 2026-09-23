import type { PaginatedResult } from "@/types";
import type {
  Approval,
  ApprovalActivityAction,
  ApprovalActivityEntry,
  ApprovalDecisionOutcome,
  ApprovalListParams,
  ApprovalStatus,
  ApprovalType,
} from "@/modules/approvals/types";

// Domain helpers are imported by verify scripts — do not add "server-only" here.

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const APPROVAL_STATUS_VALUES: ApprovalStatus[] = [
  "draft",
  "awaiting_decision",
  "approved",
  "rejected",
  "returned",
  "cancelled",
  "expired",
  "closed",
];
export const APPROVAL_TYPE_VALUES: ApprovalType[] = [
  "standard_maintenance",
  "variation",
  "equipment_replacement",
  "emergency",
];
export const DECISION_OUTCOME_VALUES: ApprovalDecisionOutcome[] = ["approved", "rejected", "partially_approved"];
export const ACTIVITY_ACTION_VALUES: ApprovalActivityAction[] = [
  "approval_created",
  "approval_package_generated",
  "approval_submitted",
  "approval_followed_up",
  "approval_approved",
  "approval_partially_approved",
  "approval_rejected",
  "approval_cancelled",
  "approval_document_uploaded",
  "approval_updated",
];

/** Statuses awaiting staff/client action — the Operational Picture "awaiting action". */
export const AWAITING_ACTION_STATUSES = ["draft", "awaiting_decision"] as const;

export class FmApprovalValidationError extends Error {
  readonly errorClass = "validation" as const;
  constructor(message: string) {
    super(message);
    this.name = "FmApprovalValidationError";
  }
}
export class FmApprovalNotFoundError extends Error {
  readonly errorClass = "validation" as const;
  constructor(message: string) {
    super(message);
    this.name = "FmApprovalNotFoundError";
  }
}
export class FmApprovalUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FmApprovalUnavailableError";
  }
}

export type FmApprovalRow = {
  id: string;
  organisation_id: string;
  code: string;
  /** NULL only for provenance-backed source-register Approvals (DB-enforced). */
  work_instruction_id: string | null;
  /** The Work the client decision is for (Job Order route: the Approval precedes the Job Order). */
  work_id: string | null;
  title: string;
  /** NULL only for provenance-backed source-register Approvals (DB-enforced). */
  approval_type: string | null;
  status: string;
  description: string | null;
  reason: string | null;
  cover_letter: string | null;
  template_id: string | null;
  client_name: string | null;
  client_address: string | null;
  approval_amount: number | null;
  approved_amount: number | null;
  currency: string | null;
  requested_by_profile_id: string | null;
  decided_by_profile_id: string | null;
  generated_at: string | null;
  submitted_at: string | null;
  decision_at: string | null;
  decision_notes: string | null;
  decision_outcome: string | null;
  decision_reference: string | null;
  expires_at: string | null;
  submission_method: string | null;
  submitted_to: string | null;
  submission_reference: string | null;
  acknowledgement_file_name: string | null;
  acknowledgement_file_mime: string | null;
  acknowledgement_file_size: number | null;
  decision_document_file_name: string | null;
  decision_document_file_mime: string | null;
  decision_document_file_size: number | null;
  last_follow_up_at: string | null;
  source_note: string | null;
  created_by_profile_id: string | null;
  updated_by_profile_id: string | null;
  created_at: string;
  updated_at: string;
};

export const FM_APPROVAL_SELECT =
  "id, organisation_id, code, work_instruction_id, work_id, title, approval_type, status, description, reason, cover_letter, template_id, client_name, client_address, approval_amount, approved_amount, currency, requested_by_profile_id, decided_by_profile_id, generated_at, submitted_at, decision_at, decision_notes, decision_outcome, decision_reference, expires_at, submission_method, submitted_to, submission_reference, acknowledgement_file_name, acknowledgement_file_mime, acknowledgement_file_size, decision_document_file_name, decision_document_file_mime, decision_document_file_size, last_follow_up_at, source_note, created_by_profile_id, updated_by_profile_id, created_at, updated_at";

export type FmApprovalActivityRow = {
  id: string;
  approval_id: string;
  action: string;
  occurred_at: string;
  summary: string;
  actor_profile_id: string | null;
  data: Record<string, unknown> | null;
};

/** Context derived at read time through Work Instruction -> Work. Never stored here. */
export type FmApprovalRelations = {
  workInstructionCode?: string;
  /** Code of the Work the Approval belongs to (fm_approvals.work_id). */
  workCode?: string;
  facilityId?: string;
  assetRef?: string;
  /** Governed migration provenance (fm_migration_provenance) when the Approval came from a source register. */
  sourceRecord?: { workbook: string; sheet: string; row: number };
  activities: FmApprovalActivityRow[];
};

function optionalTrimmed(value: unknown): string | undefined {
  if (value == null) return undefined;
  const text = String(value).trim();
  return text ? text : undefined;
}
function requireTrimmed(value: unknown, label: string): string {
  const text = optionalTrimmed(value);
  if (!text) throw new FmApprovalValidationError(`${label} is required.`);
  return text;
}
function asRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
}
function normalizeEnum(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "_");
}

const STATUS_ALIASES: Record<string, ApprovalStatus> = {
  draft: "draft",
  generated: "draft",
  awaiting_submission: "draft",
  submitted: "awaiting_decision",
  awaiting_response: "awaiting_decision",
  awaiting_decision: "awaiting_decision",
  approved: "approved",
  rejected: "rejected",
  returned: "returned",
  returned_for_clarification: "returned",
  query: "returned",
  cancelled: "cancelled",
  canceled: "cancelled",
  expired: "expired",
  closed: "closed",
};

export function parseApprovalStatus(value: unknown, fallback?: ApprovalStatus): ApprovalStatus {
  const raw = optionalTrimmed(value);
  if (!raw) {
    if (fallback) return fallback;
    throw new FmApprovalValidationError("Status is required.");
  }
  const mapped = STATUS_ALIASES[normalizeEnum(raw)];
  if (!mapped) throw new FmApprovalValidationError(`Invalid approval status: ${raw}`);
  return mapped;
}

const TYPE_ALIASES: Record<string, ApprovalType> = {
  standard_maintenance: "standard_maintenance",
  variation: "variation",
  additional_works: "variation",
  equipment_replacement: "equipment_replacement",
  emergency: "emergency",
  emergency_works: "emergency",
};
function parseApprovalType(value: unknown): ApprovalType {
  const raw = optionalTrimmed(value);
  if (!raw) return "standard_maintenance";
  const mapped = TYPE_ALIASES[normalizeEnum(raw)];
  if (!mapped) throw new FmApprovalValidationError(`Invalid approval type: ${raw}`);
  return mapped;
}
function parseOutcome(value: unknown): ApprovalDecisionOutcome | undefined {
  const raw = optionalTrimmed(value);
  if (!raw) return undefined;
  const normalized = normalizeEnum(raw) as ApprovalDecisionOutcome;
  if (!DECISION_OUTCOME_VALUES.includes(normalized)) {
    throw new FmApprovalValidationError(`Invalid decision outcome: ${raw}`);
  }
  return normalized;
}

function nullableText(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return optionalTrimmed(value) ?? null;
}
function nullableIso(value: unknown, label: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || optionalTrimmed(value) === undefined) return null;
  const ms = Date.parse(String(value));
  if (!Number.isFinite(ms)) throw new FmApprovalValidationError(`${label} is invalid.`);
  return new Date(ms).toISOString();
}
function nullableAmount(value: unknown, label: string): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new FmApprovalValidationError(`${label} must be a non-negative number.`);
  return n;
}
function nullableSize(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new FmApprovalValidationError("File size must be a non-negative number.");
  return Math.round(n);
}
function profileIdOrUndefined(value: string | undefined, label: string): string | undefined {
  if (!value) return undefined;
  if (/^USR-/i.test(value)) return undefined;
  if (!UUID_RE.test(value)) throw new FmApprovalValidationError(`${label} must be a profile UUID.`);
  return value;
}

/** Decision-bearing payload keys. Only the protected decision path may write them. */
export const DECISION_KEYS = [
  "decisionAt",
  "decisionOutcome",
  "decisionNotes",
  "decisionReference",
  "approvedAmount",
  "approvedByUserId",
  "decisionDocumentFileName",
  "decisionDocumentFileMime",
  "decisionDocumentFileSize",
] as const;

export type ApprovalFields = {
  workInstructionRef?: string;
  /** Work UUID or code — a Work-level client Approval (Job Order route, before any Job Order exists). */
  workRef?: string;
  title?: string;
  approvalType?: ApprovalType;
  status?: ApprovalStatus;
  description?: string | null;
  reason?: string | null;
  coverLetter?: string | null;
  templateId?: string | null;
  clientName?: string | null;
  clientAddress?: string | null;
  approvalAmount?: number | null;
  currency?: string | null;
  requestedByProfileId?: string | null;
  generatedAt?: string | null;
  submittedAt?: string | null;
  expiresAt?: string | null;
  submissionMethod?: string | null;
  submittedTo?: string | null;
  submissionReference?: string | null;
  acknowledgementFileName?: string | null;
  acknowledgementFileMime?: string | null;
  acknowledgementFileSize?: number | null;
  lastFollowUpAt?: string | null;
  // decision-bearing (protected path only)
  decisionAt?: string | null;
  decisionOutcome?: ApprovalDecisionOutcome | null;
  decisionNotes?: string | null;
  decisionReference?: string | null;
  approvedAmount?: number | null;
  decidedByProfileId?: string | null;
  decisionDocumentFileName?: string | null;
  decisionDocumentFileMime?: string | null;
  decisionDocumentFileSize?: number | null;
};

export type ParsedCreateApproval = ApprovalFields & {
  /** Exactly one of workInstructionRef / workRef. */
  workInstructionRef?: string;
  title: string;
  approvalType: ApprovalType;
  status: ApprovalStatus;
};
export type ParsedUpdateApproval = ApprovalFields & { id: string };

/**
 * A recorded client decision is left only through an explicit path: a rejected Work-level Approval may be reopened to
 * draft for revision (approval.revise_rejected — one Approval process per Work) or cancelled; an approved decision is
 * final. Returns a refusal message, or null when the status change is allowed.
 */
export function approvalStatusChangeBlock(input: {
  from: string;
  to: string;
  reopenRejected: boolean;
  isWorkLevel: boolean;
}): string | null {
  if (input.reopenRejected) {
    if (input.from !== "rejected" || input.to !== "draft") {
      return "Only a rejected approval can be reopened, and it returns to draft.";
    }
    if (!input.isWorkLevel) {
      return "Only a Work-level client approval (Job Order route) is revised and resubmitted.";
    }
    return null;
  }
  if (input.to === input.from) return null;
  if (input.from === "approved") return "An approved client decision is final.";
  if (input.from === "rejected" && input.to !== "cancelled") {
    return "A rejected approval is reopened only through Revise & resubmit.";
  }
  return null;
}

export type ParseOptions = {
  allowDecision: boolean;
  /**
   * Revision reopen only (approval.revise_rejected): decision keys may be CLEARED (null) — never given a value — so the
   * protected approval.record_decision remains the only writer of a client decision.
   */
  clearDecision?: boolean;
};

const DECISION_FIELD_BY_KEY: Record<(typeof DECISION_KEYS)[number], keyof ApprovalFields> = {
  decisionAt: "decisionAt",
  decisionOutcome: "decisionOutcome",
  decisionNotes: "decisionNotes",
  decisionReference: "decisionReference",
  approvedAmount: "approvedAmount",
  approvedByUserId: "decidedByProfileId",
  decisionDocumentFileName: "decisionDocumentFileName",
  decisionDocumentFileMime: "decisionDocumentFileMime",
  decisionDocumentFileSize: "decisionDocumentFileSize",
};

function parseFields(raw: Record<string, unknown>, options: ParseOptions): ApprovalFields {
  if (!options.allowDecision) {
    for (const key of DECISION_KEYS) {
      if (options.clearDecision && raw[key] === null) continue;
      if (raw[key] !== undefined) {
        throw new FmApprovalValidationError(
          "Approval decisions must be recorded via the approval.record_decision server action."
        );
      }
    }
  }
  const out: ApprovalFields = {};
  if (raw.workOrderId !== undefined) {
    const ref = optionalTrimmed(raw.workOrderId);
    if (ref) out.workInstructionRef = ref;
  }
  if (raw.workId !== undefined) {
    const ref = optionalTrimmed(raw.workId);
    if (ref) out.workRef = ref;
  }
  if (raw.title !== undefined) out.title = requireTrimmed(raw.title, "Title");
  if (raw.type !== undefined) out.approvalType = parseApprovalType(raw.type);
  if (raw.status !== undefined) out.status = parseApprovalStatus(raw.status);
  if (raw.description !== undefined) out.description = nullableText(raw.description);
  if (raw.reason !== undefined) out.reason = nullableText(raw.reason);
  if (raw.coverLetter !== undefined) out.coverLetter = nullableText(raw.coverLetter);
  if (raw.templateId !== undefined) out.templateId = nullableText(raw.templateId);
  if (raw.clientName !== undefined) out.clientName = nullableText(raw.clientName);
  if (raw.clientAddress !== undefined) out.clientAddress = nullableText(raw.clientAddress);
  if (raw.approvalAmount !== undefined) out.approvalAmount = nullableAmount(raw.approvalAmount, "Approval amount");
  if (raw.currency !== undefined) out.currency = nullableText(raw.currency);
  if (raw.requestedByUserId !== undefined) {
    out.requestedByProfileId = profileIdOrUndefined(optionalTrimmed(raw.requestedByUserId), "Requester") ?? null;
  }
  if (raw.generatedAt !== undefined) out.generatedAt = nullableIso(raw.generatedAt, "Generated at");
  if (raw.submittedAt !== undefined) out.submittedAt = nullableIso(raw.submittedAt, "Submitted at");
  if (raw.expiresAt !== undefined) out.expiresAt = nullableIso(raw.expiresAt, "Expires at");
  if (raw.submissionMethod !== undefined) out.submissionMethod = nullableText(raw.submissionMethod);
  if (raw.submittedTo !== undefined) out.submittedTo = nullableText(raw.submittedTo);
  if (raw.submissionReference !== undefined) out.submissionReference = nullableText(raw.submissionReference);
  if (raw.acknowledgementFileName !== undefined) out.acknowledgementFileName = nullableText(raw.acknowledgementFileName);
  if (raw.acknowledgementFileMime !== undefined) out.acknowledgementFileMime = nullableText(raw.acknowledgementFileMime);
  if (raw.acknowledgementFileSize !== undefined) out.acknowledgementFileSize = nullableSize(raw.acknowledgementFileSize);
  if (raw.lastFollowUpAt !== undefined) out.lastFollowUpAt = nullableIso(raw.lastFollowUpAt, "Last follow-up");
  if (options.allowDecision) {
    if (raw.decisionAt !== undefined) out.decisionAt = nullableIso(raw.decisionAt, "Decision at");
    if (raw.decisionOutcome !== undefined) out.decisionOutcome = parseOutcome(raw.decisionOutcome) ?? null;
    if (raw.decisionNotes !== undefined) out.decisionNotes = nullableText(raw.decisionNotes);
    if (raw.decisionReference !== undefined) out.decisionReference = nullableText(raw.decisionReference);
    if (raw.approvedAmount !== undefined) out.approvedAmount = nullableAmount(raw.approvedAmount, "Approved amount");
    if (raw.approvedByUserId !== undefined) {
      out.decidedByProfileId = profileIdOrUndefined(optionalTrimmed(raw.approvedByUserId), "Decision actor") ?? null;
    }
    if (raw.decisionDocumentFileName !== undefined) out.decisionDocumentFileName = nullableText(raw.decisionDocumentFileName);
    if (raw.decisionDocumentFileMime !== undefined) out.decisionDocumentFileMime = nullableText(raw.decisionDocumentFileMime);
    if (raw.decisionDocumentFileSize !== undefined) out.decisionDocumentFileSize = nullableSize(raw.decisionDocumentFileSize);
  } else if (options.clearDecision) {
    // Only nulls get here (checked above): the recorded decision leaves the row for a revision.
    for (const key of DECISION_KEYS) {
      if (raw[key] === null) (out as Record<string, unknown>)[DECISION_FIELD_BY_KEY[key]] = null;
    }
  }

  return out;
}

/** Facility and Asset context are inherited through the Work Instruction — inputs are ignored. */
export function parseCreateApprovalInput(payload: unknown, options: ParseOptions): ParsedCreateApproval {
  const raw = asRecord(payload);
  const fields = parseFields(raw, options);
  if (!fields.workInstructionRef && !fields.workRef) {
    throw new FmApprovalValidationError("Work order id is required for an approval request.");
  }
  if (fields.workInstructionRef && fields.workRef) {
    throw new FmApprovalValidationError("An approval request is for either the Work or one Work Instruction, not both.");
  }
  return {
    ...fields,
    title: requireTrimmed(raw.title, "Approval title"),
    approvalType: fields.approvalType ?? "standard_maintenance",
    status: fields.status ?? "draft",
  };
}

export function parseUpdateApprovalInput(payload: unknown, options: ParseOptions): ParsedUpdateApproval {
  const raw = asRecord(payload);
  return { ...parseFields(raw, options), id: requireTrimmed(raw.id, "Approval id") };
}

export function parseApprovalIdPayload(payload: unknown): string {
  return requireTrimmed(asRecord(payload).id, "Approval id");
}

export type ParsedApprovalActivity = {
  action: ApprovalActivityAction;
  at?: string;
  summary: string;
  actorProfileId?: string | null;
  data?: Record<string, unknown>;
};

export function parseApprovalActivity(entry: unknown): ParsedApprovalActivity {
  const raw = asRecord(entry);
  const action = optionalTrimmed(raw.action) as ApprovalActivityAction | undefined;
  if (!action || !ACTIVITY_ACTION_VALUES.includes(action)) {
    throw new FmApprovalValidationError("Invalid approval activity action.");
  }
  return {
    action,
    at: nullableIso(raw.at, "Activity time") ?? undefined,
    summary: requireTrimmed(raw.summary, "Activity summary"),
    actorProfileId: profileIdOrUndefined(optionalTrimmed(raw.actorUserId), "Activity actor") ?? null,
    data: raw.data && typeof raw.data === "object" ? (raw.data as Record<string, unknown>) : undefined,
  };
}

export function parseApprovalListParams(payload: unknown): ApprovalListParams {
  const raw = asRecord(payload);
  const opt = (key: string) => optionalTrimmed(raw[key]);
  const status = opt("status");
  const type = opt("type");
  const sort = opt("sort");
  return {
    page: Math.max(1, Number(raw.page ?? 1) || 1),
    pageSize: Math.min(500, Math.max(1, Number(raw.pageSize ?? 8) || 8)),
    search: opt("search"),
    status: !status || status.toLowerCase() === "all" ? "all" : parseApprovalStatus(status),
    type: !type || type.toLowerCase() === "all" ? "all" : parseApprovalType(type),
    facilityId: opt("facilityId") ?? "all",
    workOrderId: opt("workOrderId") ?? "all",
    sort: sort === "oldest" || sort === "title_asc" || sort === "title_desc" ? sort : "newest",
    includeOperationalPictureTotals: raw.includeOperationalPictureTotals === true,
    asOf: opt("asOf"),
  };
}

export function sanitizeSearchTerm(value: string): string {
  return value.replace(/[,()%*_\\"']/g, " ").replace(/\s+/g, " ").trim();
}

function activityEntry(row: FmApprovalActivityRow): ApprovalActivityEntry {
  return {
    id: row.id,
    action: row.action as ApprovalActivityAction,
    at: row.occurred_at,
    summary: row.summary,
    actorUserId: row.actor_profile_id ?? undefined,
    data: row.data && Object.keys(row.data).length > 0 ? row.data : undefined,
  };
}

/**
 * Map row → the frozen Approval compatibility contract.
 * `workOrderId` is the Work Instruction code; `facilityId` / `assetId` are
 * inherited through it. `activityLog` is a read-only projection of the
 * append-only activity rows; last-activity fields are derived from it.
 */
export function mapFmApprovalRowToApproval(
  row: FmApprovalRow,
  relations: FmApprovalRelations = { activities: [] }
): Approval {
  const activities = [...relations.activities].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  const last = activities[activities.length - 1];
  const entries = activities.map(activityEntry);
  return {
    id: row.code,
    approvalUuid: row.id,
    title: row.title,
    type: (row.approval_type as ApprovalType | null) ?? undefined,
    workOrderId: relations.workInstructionCode ?? "",
    workId: relations.workCode,
    facilityId: relations.facilityId ?? "",
    assetId: relations.assetRef,
    status: row.status as ApprovalStatus,
    description: row.description ?? undefined,
    reason: row.reason ?? undefined,
    coverLetter: row.cover_letter ?? undefined,
    templateId: row.template_id ?? undefined,
    clientName: row.client_name ?? undefined,
    clientAddress: row.client_address ?? undefined,
    approvalAmount: row.approval_amount != null ? Number(row.approval_amount) : undefined,
    approvedAmount: row.approved_amount != null ? Number(row.approved_amount) : undefined,
    currency: row.currency ?? undefined,
    requestedByUserId: row.requested_by_profile_id ?? undefined,
    approvedByUserId: row.decided_by_profile_id ?? undefined,
    generatedAt: row.generated_at ?? undefined,
    submittedAt: row.submitted_at ?? undefined,
    decisionAt: row.decision_at ?? undefined,
    decisionNotes: row.decision_notes ?? undefined,
    decisionOutcome: (row.decision_outcome as ApprovalDecisionOutcome | null) ?? undefined,
    decisionReference: row.decision_reference ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    submissionMethod: row.submission_method ?? undefined,
    submittedTo: row.submitted_to ?? undefined,
    submissionReference: row.submission_reference ?? undefined,
    acknowledgementFileName: row.acknowledgement_file_name ?? undefined,
    acknowledgementFileMime: row.acknowledgement_file_mime ?? undefined,
    acknowledgementFileSize: row.acknowledgement_file_size != null ? Number(row.acknowledgement_file_size) : undefined,
    decisionDocumentFileName: row.decision_document_file_name ?? undefined,
    decisionDocumentFileMime: row.decision_document_file_mime ?? undefined,
    decisionDocumentFileSize: row.decision_document_file_size != null ? Number(row.decision_document_file_size) : undefined,
    lastFollowUpAt: row.last_follow_up_at ?? undefined,
    sourceNote: row.source_note ?? undefined,
    sourceRecord: relations.sourceRecord,
    lastActivityAt: last?.occurred_at ?? row.updated_at,
    lastActivitySummary: last?.summary ?? "Approval request created",
    activityLog: entries.length ? JSON.stringify(entries) : undefined,
    activities: entries,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** APR-YYYY-###### — next code given the highest existing code for that year. */
export function generateNextApprovalCode(latestCodeForYear: string | null | undefined, now = new Date()): string {
  const year = now.getUTCFullYear();
  const match = String(latestCodeForYear ?? "").match(new RegExp(`^APR-${year}-(\\d+)$`, "i"));
  const max = match ? parseInt(match[1]!, 10) || 0 : 0;
  return `APR-${year}-${String(max + 1).padStart(6, "0")}`;
}

export function paginateApprovalRows<T>(rows: T[], total: number, page: number, pageSize: number): PaginatedResult<T> {
  return { data: rows, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export type ApprovalOperationalPicture = { state: "healthy"; awaitingAction: number };

/** Complete-register Operational Picture: draft (awaiting submission) + awaiting_decision. */
export function summarizeApprovalOperationalPicture(rows: Array<{ status: string }>): ApprovalOperationalPicture {
  let awaitingAction = 0;
  for (const row of rows) {
    if ((AWAITING_ACTION_STATUSES as readonly string[]).includes(row.status)) awaitingAction += 1;
  }
  return { state: "healthy", awaitingAction };
}
