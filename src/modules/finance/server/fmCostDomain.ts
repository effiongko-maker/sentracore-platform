import type { PaginatedResult } from "@/types";
import type {
  CostCategory,
  CostRecord,
  CostReimbursability,
  CostSubmission,
  CostSubmissionLifecycleStatus,
  ReimbursementAuthorization,
  ReimbursementPayment,
} from "@/lib/operational/finance/types";

// Domain helpers are imported by verify scripts — do not add "server-only" here.

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const COST_CATEGORY_VALUES: CostCategory[] = [
  "diesel_fuel", "materials", "spare_parts", "labour", "transportation",
  "equipment", "consumables", "service", "other",
];
export const REIMBURSABILITY_VALUES: CostReimbursability[] = ["unknown", "reimbursable", "non_reimbursable"];
export const SUBMISSION_STATUS_VALUES: CostSubmissionLifecycleStatus[] = ["draft", "submitted", "queried", "cancelled"];
export const DEFAULT_CURRENCY = "NGN";

/** Statuses of a claim that lock its Cost Records against unprotected edits. */
export const LOCKING_SUBMISSION_STATUSES = ["submitted", "queried"] as const;

export class FmCostValidationError extends Error {
  readonly errorClass = "validation" as const;
  constructor(message: string) {
    super(message);
    this.name = "FmCostValidationError";
  }
}
/**
 * Migrated historical FM execution costs are source evidence, never current operational state — never editable, even
 * with the protected step-up that unlocks a claim-locked LIVE cost. Refused at the repository — the single choke
 * point for cost writes.
 */
export class FmCostReadOnlyError extends Error {
  readonly errorClass = "read_only" as const;
  constructor(message = "Imported historical costs are read-only source records and cannot be changed.") {
    super(message);
    this.name = "FmCostReadOnlyError";
  }
}

export class FmCostNotFoundError extends Error {
  readonly errorClass = "validation" as const;
  constructor(message: string) {
    super(message);
    this.name = "FmCostNotFoundError";
  }
}
export class FmCostUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FmCostUnavailableError";
  }
}
/** A protected financial action was required but not authorised. */
export class FmCostProtectedRequiredError extends Error {
  constructor(
    readonly actionId: "finance.cost.unlock_edit" | "finance.claim.edit_submitted" | "finance.authorization.revise" | "finance.payment.correct",
    message: string
  ) {
    super(message);
    this.name = "FmCostProtectedRequiredError";
  }
}

// ---------------------------------------------------------------- primitives

function optionalTrimmed(value: unknown): string | undefined {
  if (value == null) return undefined;
  const text = String(value).trim();
  return text ? text : undefined;
}
function requireTrimmed(value: unknown, label: string): string {
  const text = optionalTrimmed(value);
  if (!text) throw new FmCostValidationError(`${label} is required.`);
  return text;
}
function asRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
}
function normalizeEnum(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "_");
}
function parseEnum<T extends string>(value: unknown, allowed: readonly T[], label: string, fallback?: T): T {
  const raw = optionalTrimmed(value);
  if (!raw) {
    if (fallback) return fallback;
    throw new FmCostValidationError(`${label} is required.`);
  }
  const normalized = normalizeEnum(raw) as T;
  if (!allowed.includes(normalized)) throw new FmCostValidationError(`Invalid ${label}: ${raw}`);
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
  if (!Number.isFinite(ms)) throw new FmCostValidationError(`${label} is invalid.`);
  return new Date(ms).toISOString();
}
function nullableAmount(value: unknown, label: string, opts: { positive?: boolean } = {}): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || (opts.positive && n <= 0)) {
    throw new FmCostValidationError(`${label} must be ${opts.positive ? "a positive" : "a non-negative"} number.`);
  }
  return Math.round(n * 100) / 100;
}
function refOrUndefined(value: unknown): string | undefined {
  return optionalTrimmed(value);
}

export function sanitizeSearchTerm(value: string): string {
  return value.replace(/[,()%*_\\"']/g, " ").replace(/\s+/g, " ").trim();
}

export function paginateRows<T>(rows: T[], total: number, page: number, pageSize: number): PaginatedResult<T> {
  return { data: rows, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

function listBase(raw: Record<string, unknown>) {
  return {
    page: Math.max(1, Number(raw.page ?? 1) || 1),
    pageSize: Math.min(500, Math.max(1, Number(raw.pageSize ?? 8) || 8)),
    search: optionalTrimmed(raw.search),
  };
}

function nextCode(prefix: string, latest: string | null | undefined, now: Date): string {
  const year = now.getUTCFullYear();
  const match = String(latest ?? "").match(new RegExp(`^${prefix}-${year}-(\\d+)$`, "i"));
  const max = match ? parseInt(match[1]!, 10) || 0 : 0;
  return `${prefix}-${year}-${String(max + 1).padStart(6, "0")}`;
}
export const generateNextCostCode = (latest: string | null | undefined, now = new Date()) => nextCode("COST", latest, now);
export const generateNextSubmissionCode = (latest: string | null | undefined, now = new Date()) => nextCode("SUB", latest, now);
export const generateNextAuthorizationCode = (latest: string | null | undefined, now = new Date()) => nextCode("AUTH", latest, now);
export const generateNextPaymentCode = (latest: string | null | undefined, now = new Date()) => nextCode("PAY", latest, now);

// ------------------------------------------------------------- Cost Records

export type FmCostRecordRow = {
  id: string; organisation_id: string; code: string; recorded_at: string | null; facility_id: string;
  department_id: string | null; location: string | null; work_id: string | null; work_instruction_id: string | null;
  description: string; category: string | null; budgeted_amount: number | null; actual_amount: number;
  currency: string; reimbursability: string; evidence_reference: string | null;
  evidence_file_id: string | null; evidence_file_name: string | null; evidence_file_mime: string | null;
  evidence_file_size: number | null; evidence_file_url: string | null; notes: string | null;
  recorded_by_profile_id: string | null; created_by_profile_id: string | null; updated_by_profile_id: string | null;
  created_at: string; updated_at: string; record_origin: string;
};
export const FM_COST_RECORD_SELECT =
  "id, organisation_id, code, recorded_at, facility_id, department_id, location, work_id, work_instruction_id, description, category, budgeted_amount, actual_amount, currency, reimbursability, evidence_reference, evidence_file_id, evidence_file_name, evidence_file_mime, evidence_file_size, evidence_file_url, notes, recorded_by_profile_id, created_by_profile_id, updated_by_profile_id, created_at, updated_at, record_origin";

export type CostRecordFields = {
  recordedAt?: string;
  facilityRef?: string;
  departmentId?: string | null;
  location?: string;
  workRef?: string | null;
  workInstructionRef?: string | null;
  description?: string;
  category?: CostCategory;
  budgetedAmount?: number | null;
  actualAmount?: number;
  currency?: string;
  reimbursability?: CostReimbursability;
  evidenceReference?: string;
  notes?: string | null;
};
export type ParsedCreateCostRecord = CostRecordFields & {
  facilityRef: string; location: string; description: string; category: CostCategory;
  actualAmount: number; currency: string; reimbursability: CostReimbursability; evidenceReference: string;
};
export type ParsedUpdateCostRecord = CostRecordFields & { id: string };

export const EVIDENCE_UPLOAD_UNAVAILABLE =
  "Receipt file upload is unavailable until evidence storage moves to SentraCore™. Enter the receipt or invoice reference instead.";

function parseCostFields(raw: Record<string, unknown>): CostRecordFields {
  const out: CostRecordFields = {};
  const evidence = raw.evidence && typeof raw.evidence === "object" ? (raw.evidence as Record<string, unknown>) : undefined;
  if (evidence?.upload) throw new FmCostValidationError(EVIDENCE_UPLOAD_UNAVAILABLE);
  if (raw.recordedAt !== undefined) out.recordedAt = nullableIso(raw.recordedAt, "Recorded at") ?? undefined;
  if (raw.facilityId !== undefined) out.facilityRef = requireTrimmed(raw.facilityId, "Facility id");
  if (raw.departmentId !== undefined) out.departmentId = refOrUndefined(raw.departmentId) ?? null;
  if (raw.location !== undefined) out.location = requireTrimmed(raw.location, "Location");
  // Work / Work Instruction context is a UUID relationship; codes are accepted only as
  // input at this boundary and resolved inside the tenant (never matched against legacy rows).
  if (raw.workId !== undefined) out.workRef = refOrUndefined(raw.workId) ?? null;
  if (raw.workOrderId !== undefined) out.workInstructionRef = refOrUndefined(raw.workOrderId) ?? null;
  if (raw.description !== undefined) out.description = requireTrimmed(raw.description, "Description");
  if (raw.category !== undefined) out.category = parseEnum(raw.category, COST_CATEGORY_VALUES, "cost category");
  if (raw.budgetedAmount !== undefined) out.budgetedAmount = nullableAmount(raw.budgetedAmount, "Budgeted amount");
  if (raw.actualAmount !== undefined) {
    const amount = nullableAmount(raw.actualAmount, "Actual amount");
    if (amount == null) throw new FmCostValidationError("Actual amount must be a non-negative number.");
    out.actualAmount = amount;
  }
  if (raw.currency !== undefined) out.currency = requireTrimmed(raw.currency, "Currency").toUpperCase();
  if (raw.reimbursability !== undefined) {
    out.reimbursability = parseEnum(raw.reimbursability, REIMBURSABILITY_VALUES, "reimbursability", "unknown");
  }
  if (evidence && evidence.reference !== undefined) out.evidenceReference = requireTrimmed(evidence.reference, "Evidence reference");
  if (raw.notes !== undefined) out.notes = nullableText(raw.notes);
  return out;
}

export function parseCreateCostRecordInput(payload: unknown): ParsedCreateCostRecord {
  const f = parseCostFields(asRecord(payload));
  if (!f.facilityRef) throw new FmCostValidationError("Facility id is required.");
  if (!f.location) throw new FmCostValidationError("Location is required.");
  if (!f.description) throw new FmCostValidationError("Description is required.");
  if (!f.category) throw new FmCostValidationError("Cost category is required.");
  if (f.actualAmount === undefined) throw new FmCostValidationError("Actual amount must be a non-negative number.");
  if (!f.evidenceReference) throw new FmCostValidationError("Evidence reference is required.");
  return {
    ...f,
    facilityRef: f.facilityRef,
    location: f.location,
    description: f.description,
    category: f.category,
    actualAmount: f.actualAmount,
    currency: f.currency ?? DEFAULT_CURRENCY,
    reimbursability: f.reimbursability ?? "unknown",
    evidenceReference: f.evidenceReference,
  };
}
export function parseUpdateCostRecordInput(payload: unknown): ParsedUpdateCostRecord {
  const raw = asRecord(payload);
  return { ...parseCostFields(raw), id: requireTrimmed(raw.costId ?? raw.id, "Cost id") };
}
export function parseCostIdPayload(payload: unknown): string {
  const raw = asRecord(payload);
  return requireTrimmed(raw.costId ?? raw.id, "Cost id");
}

export type CostRecordListParams = {
  page: number; pageSize: number; search?: string; facilityId?: string;
  category?: CostCategory; reimbursability?: CostReimbursability; workId?: string; workOrderId?: string;
};
export function parseCostRecordListParams(payload: unknown): CostRecordListParams {
  const raw = asRecord(payload);
  const category = optionalTrimmed(raw.category);
  const reimb = optionalTrimmed(raw.reimbursability);
  const facilityId = optionalTrimmed(raw.facilityId);
  return {
    ...listBase(raw),
    facilityId: !facilityId || facilityId === "all" ? undefined : facilityId,
    category: !category || category === "all" ? undefined : parseEnum(category, COST_CATEGORY_VALUES, "cost category"),
    reimbursability: !reimb || reimb === "all" ? undefined : parseEnum(reimb, REIMBURSABILITY_VALUES, "reimbursability"),
    workId: optionalTrimmed(raw.workId),
    workOrderId: optionalTrimmed(raw.workOrderId),
  };
}

export type CostRecordRelations = { workCode?: string; workInstructionCode?: string };

/** Row → the frozen CostRecord compatibility contract. `workId`/`workOrderId` are display codes derived from the UUID FKs. */
export function mapFmCostRecordRow(row: FmCostRecordRow, relations: CostRecordRelations = {}): CostRecord & { costUuid: string; notes?: string } {
  return {
    costUuid: row.id,
    costId: row.code,
    recordedAt: row.recorded_at ?? undefined,
    recordOrigin: row.record_origin === "migrated_historical" ? "migrated_historical" : "operational",
    facilityId: row.facility_id,
    location: row.location ?? undefined,
    departmentId: row.department_id ?? undefined,
    workId: relations.workCode,
    workOrderId: relations.workInstructionCode,
    description: row.description,
    category: row.category ? (row.category as CostCategory) : undefined,
    budgetedAmount: row.budgeted_amount != null ? Number(row.budgeted_amount) : undefined,
    actualAmount: Number(row.actual_amount),
    currency: row.currency,
    reimbursability: row.reimbursability as CostReimbursability,
    evidence: {
      reference: row.evidence_reference ?? undefined,
      fileId: row.evidence_file_id ?? undefined,
      fileName: row.evidence_file_name ?? undefined,
      mimeType: row.evidence_file_mime ?? undefined,
      sizeBytes: row.evidence_file_size != null ? Number(row.evidence_file_size) : undefined,
      fileUrl: row.evidence_file_url ?? undefined,
    },
    recordedBy: row.recorded_by_profile_id ?? "",
    notes: row.notes ?? undefined,
  };
}

// ------------------------------------------------------------ Cost Submissions

export type FmCostSubmissionRow = {
  id: string; organisation_id: string; code: string; status: string; currency: string;
  claim_amount: number | null; markup_amount: number | null; markup_rate_percent: number | null; no_markup: boolean | null;
  facility_id: string | null; department_id: string | null; period_label: string | null; submission_kind: string | null;
  package_reference: string | null; package_type: string | null; package_date: string | null; package_notes: string | null;
  approval_id: string | null; submitted_at: string | null; submitted_by_profile_id: string | null;
  queried_at: string | null; query_notes: string | null; notes: string | null;
  created_by_profile_id: string | null; updated_by_profile_id: string | null; created_at: string; updated_at: string;
};
export const FM_COST_SUBMISSION_SELECT =
  "id, organisation_id, code, status, currency, claim_amount, markup_amount, markup_rate_percent, no_markup, facility_id, department_id, period_label, submission_kind, package_reference, package_type, package_date, package_notes, approval_id, submitted_at, submitted_by_profile_id, queried_at, query_notes, notes, created_by_profile_id, updated_by_profile_id, created_at, updated_at";

export type SubmissionFields = {
  costRefs?: string[];
  status?: CostSubmissionLifecycleStatus;
  currency?: string;
  claimAmount?: number | null;
  markupAmount?: number | null;
  markupRatePercent?: number | null;
  noMarkup?: boolean | null;
  facilityRef?: string | null;
  departmentId?: string | null;
  periodLabel?: string | null;
  submissionKind?: string | null;
  packageReference?: string | null;
  packageType?: string | null;
  packageDate?: string | null;
  packageNotes?: string | null;
  approvalRef?: string | null;
  submittedAt?: string | null;
  queriedAt?: string | null;
  queryNotes?: string | null;
  notes?: string | null;
};
export type ParsedCreateSubmission = SubmissionFields & { status: CostSubmissionLifecycleStatus; currency: string; costRefs: string[] };
export type ParsedUpdateSubmission = SubmissionFields & { id: string };

function parseSubmissionFields(raw: Record<string, unknown>): SubmissionFields {
  const out: SubmissionFields = {};
  if (raw.costRecordIds !== undefined) {
    if (!Array.isArray(raw.costRecordIds)) throw new FmCostValidationError("costRecordIds must be a list.");
    out.costRefs = [...new Set(raw.costRecordIds.map((v) => String(v).trim()).filter(Boolean))];
  }
  if (raw.status !== undefined) out.status = parseEnum(raw.status, SUBMISSION_STATUS_VALUES, "submission status");
  if (raw.currency !== undefined) out.currency = requireTrimmed(raw.currency, "Currency").toUpperCase();
  if (raw.claimAmount !== undefined) out.claimAmount = nullableAmount(raw.claimAmount, "Claim amount");
  const markup = raw.markup && typeof raw.markup === "object" ? (raw.markup as Record<string, unknown>) : undefined;
  if (markup) {
    if (markup.markupAmount !== undefined) out.markupAmount = nullableAmount(markup.markupAmount, "Markup amount");
    if (markup.markupRatePercent !== undefined) out.markupRatePercent = nullableAmount(markup.markupRatePercent, "Markup rate");
    if (markup.noMarkup !== undefined) out.noMarkup = markup.noMarkup === null ? null : markup.noMarkup === true;
  }
  if (raw.facilityId !== undefined) out.facilityRef = refOrUndefined(raw.facilityId) ?? null;
  if (raw.departmentId !== undefined) out.departmentId = refOrUndefined(raw.departmentId) ?? null;
  if (raw.periodLabel !== undefined) out.periodLabel = nullableText(raw.periodLabel);
  if (raw.submissionKind !== undefined) out.submissionKind = nullableText(raw.submissionKind);
  const pkg = raw.submissionPackage && typeof raw.submissionPackage === "object" ? (raw.submissionPackage as Record<string, unknown>) : undefined;
  if (pkg) {
    if (pkg.reference !== undefined) out.packageReference = nullableText(pkg.reference);
    if (pkg.packageType !== undefined) out.packageType = nullableText(pkg.packageType);
    if (pkg.packageDate !== undefined) out.packageDate = nullableIso(pkg.packageDate, "Package date");
    if (pkg.notes !== undefined) out.packageNotes = nullableText(pkg.notes);
  }
  // Approval is a UUID relationship to the FM Approval (code accepted only as input, resolved in-tenant).
  if (raw.approvalId !== undefined) out.approvalRef = refOrUndefined(raw.approvalId) ?? null;
  if (raw.submittedAt !== undefined) out.submittedAt = nullableIso(raw.submittedAt, "Submitted at");
  if (raw.queriedAt !== undefined) out.queriedAt = nullableIso(raw.queriedAt, "Queried at");
  if (raw.queryNotes !== undefined) out.queryNotes = nullableText(raw.queryNotes);
  if (raw.notes !== undefined) out.notes = nullableText(raw.notes);
  // refs / executionKind / executionId are NOT persisted: operational context derives
  // through the Cost Records (Work / Work Instruction) — never duplicated on the claim.
  return out;
}

export function parseCreateSubmissionInput(payload: unknown): ParsedCreateSubmission {
  const f = parseSubmissionFields(asRecord(payload));
  return { ...f, status: f.status ?? "draft", currency: f.currency ?? DEFAULT_CURRENCY, costRefs: f.costRefs ?? [] };
}
export function parseUpdateSubmissionInput(payload: unknown): ParsedUpdateSubmission {
  const raw = asRecord(payload);
  return { ...parseSubmissionFields(raw), id: requireTrimmed(raw.submissionId ?? raw.id, "Submission id") };
}
export function parseSubmissionIdPayload(payload: unknown): string {
  const raw = asRecord(payload);
  return requireTrimmed(raw.submissionId ?? raw.id, "Submission id");
}

/** A claim in `submitted`/`queried` must reference at least one Cost Record and carry its dates. */
export function assertSubmissionShape(input: {
  status: CostSubmissionLifecycleStatus;
  costCount: number;
  submittedAt?: string | null;
  queriedAt?: string | null;
}): void {
  if ((input.status === "submitted" || input.status === "queried") && input.costCount < 1) {
    throw new FmCostValidationError("At least one Cost Record is required when a claim is submitted or queried.");
  }
}

export type SubmissionListParams = { page: number; pageSize: number; search?: string; facilityId?: string; status?: CostSubmissionLifecycleStatus; approvalId?: string };
export function parseSubmissionListParams(payload: unknown): SubmissionListParams {
  const raw = asRecord(payload);
  const status = optionalTrimmed(raw.status);
  const facilityId = optionalTrimmed(raw.facilityId);
  return {
    ...listBase(raw),
    facilityId: !facilityId || facilityId === "all" ? undefined : facilityId,
    status: !status || status === "all" ? undefined : parseEnum(status, SUBMISSION_STATUS_VALUES, "submission status"),
    approvalId: optionalTrimmed(raw.approvalId),
  };
}

export type SubmissionRelations = { costCodes: string[]; approvalCode?: string };

export function mapFmCostSubmissionRow(row: FmCostSubmissionRow, relations: SubmissionRelations = { costCodes: [] }): CostSubmission & { submissionUuid: string } {
  const hasMarkup = row.markup_amount != null || row.markup_rate_percent != null || row.no_markup != null;
  const hasPackage = row.package_reference || row.package_type || row.package_date || row.package_notes;
  return {
    submissionUuid: row.id,
    submissionId: row.code,
    costRecordIds: [...relations.costCodes],
    status: row.status as CostSubmissionLifecycleStatus,
    currency: row.currency,
    claimAmount: row.claim_amount != null ? Number(row.claim_amount) : undefined,
    markup: hasMarkup
      ? {
          markupAmount: row.markup_amount != null ? Number(row.markup_amount) : undefined,
          markupRatePercent: row.markup_rate_percent != null ? Number(row.markup_rate_percent) : undefined,
          noMarkup: row.no_markup ?? undefined,
        }
      : undefined,
    facilityId: row.facility_id ?? undefined,
    departmentId: row.department_id ?? undefined,
    periodLabel: row.period_label ?? undefined,
    submissionKind: row.submission_kind ?? undefined,
    submissionPackage: hasPackage
      ? {
          reference: row.package_reference ?? undefined,
          packageType: row.package_type ?? undefined,
          packageDate: row.package_date ?? undefined,
          notes: row.package_notes ?? undefined,
        }
      : undefined,
    approvalId: relations.approvalCode,
    createdAt: row.created_at,
    createdBy: row.created_by_profile_id ?? "",
    submittedAt: row.submitted_at ?? undefined,
    submittedBy: row.submitted_by_profile_id ?? undefined,
    queriedAt: row.queried_at ?? undefined,
    queryNotes: row.query_notes ?? undefined,
    notes: row.notes ?? undefined,
  };
}

// ------------------------------------------------- Reimbursement Authorizations

export type FmAuthorizationRow = {
  id: string; organisation_id: string; code: string; submission_id: string; authorized_amount: number; currency: string;
  authorized_at: string; authorized_by_profile_id: string | null; authority_reference: string | null; notes: string | null;
  recorded_at: string; created_by_profile_id: string | null; updated_by_profile_id: string | null; created_at: string; updated_at: string;
};
export const FM_AUTHORIZATION_SELECT =
  "id, organisation_id, code, submission_id, authorized_amount, currency, authorized_at, authorized_by_profile_id, authority_reference, notes, recorded_at, created_by_profile_id, updated_by_profile_id, created_at, updated_at";

export type AuthorizationFields = {
  submissionRef?: string;
  authorizedAmount?: number;
  currency?: string;
  authorizedAt?: string;
  authorityReference?: string | null;
  notes?: string | null;
};
export type ParsedUpdateAuthorization = AuthorizationFields & { id: string };

function parseAuthorizationFields(raw: Record<string, unknown>): AuthorizationFields {
  const out: AuthorizationFields = {};
  if (raw.submissionId !== undefined) out.submissionRef = requireTrimmed(raw.submissionId, "Submission id");
  if (raw.authorizedAmount !== undefined) {
    const amount = nullableAmount(raw.authorizedAmount, "authorizedAmount", { positive: true });
    if (amount == null) throw new FmCostValidationError("authorizedAmount must be a positive number.");
    out.authorizedAmount = amount;
  }
  if (raw.currency !== undefined) out.currency = requireTrimmed(raw.currency, "Currency").toUpperCase();
  if (raw.authorizedAt !== undefined) out.authorizedAt = nullableIso(raw.authorizedAt, "Authorized at") ?? undefined;
  if (raw.authorityReference !== undefined) {
    const ref = nullableText(raw.authorityReference);
    if (typeof raw.authorityReference === "string" && raw.authorityReference.length > 0 && !raw.authorityReference.trim()) {
      throw new FmCostValidationError("authorityReference must not be blank whitespace.");
    }
    out.authorityReference = ref;
  }
  if (raw.notes !== undefined) out.notes = nullableText(raw.notes);
  return out;
}
/** `authorizedBy` in the payload is IGNORED — the authorising actor is the session profile. */
export function parseCreateAuthorizationInput(payload: unknown): AuthorizationFields & { submissionRef: string } {
  const f = parseAuthorizationFields(asRecord(payload));
  if (!f.submissionRef) throw new FmCostValidationError("submissionId is required.");
  return { ...f, submissionRef: f.submissionRef };
}
export function parseUpdateAuthorizationInput(payload: unknown): ParsedUpdateAuthorization {
  const raw = asRecord(payload);
  return { ...parseAuthorizationFields(raw), id: requireTrimmed(raw.authorizationId ?? raw.id, "authorizationId") };
}
export function parseAuthorizationIdPayload(payload: unknown): string {
  const raw = asRecord(payload);
  return requireTrimmed(raw.authorizationId ?? raw.id, "authorizationId");
}
export type SubmissionScopedListParams = { page: number; pageSize: number; search?: string; submissionId?: string };
export function parseSubmissionScopedListParams(payload: unknown): SubmissionScopedListParams {
  const raw = asRecord(payload);
  return { ...listBase(raw), submissionId: optionalTrimmed(raw.submissionId) };
}

export function mapFmAuthorizationRow(row: FmAuthorizationRow, submissionCode: string): ReimbursementAuthorization & { authorizationUuid: string } {
  return {
    authorizationUuid: row.id,
    authorizationId: row.code,
    submissionId: submissionCode,
    authorizedAmount: Number(row.authorized_amount),
    currency: row.currency,
    authorizedAt: row.authorized_at,
    authorizedBy: row.authorized_by_profile_id ?? "",
    authorityReference: row.authority_reference ?? undefined,
    notes: row.notes ?? undefined,
    recordedAt: row.recorded_at,
  };
}

// ------------------------------------------------------ Reimbursement Payments

export type FmPaymentRow = {
  id: string; organisation_id: string; code: string; submission_id: string; received_amount: number; currency: string;
  received_at: string; reference: string | null; method: string | null; evidence_reference: string | null; notes: string | null;
  recorded_at: string; recorded_by_profile_id: string | null; created_by_profile_id: string | null;
  updated_by_profile_id: string | null; created_at: string; updated_at: string;
};
export const FM_PAYMENT_SELECT =
  "id, organisation_id, code, submission_id, received_amount, currency, received_at, reference, method, evidence_reference, notes, recorded_at, recorded_by_profile_id, created_by_profile_id, updated_by_profile_id, created_at, updated_at";

export type PaymentFields = {
  submissionRef?: string;
  receivedAmount?: number;
  currency?: string;
  receivedAt?: string;
  reference?: string | null;
  method?: string | null;
  evidenceReference?: string | null;
  notes?: string | null;
};
export type ParsedUpdatePayment = PaymentFields & { id: string };

function parsePaymentFields(raw: Record<string, unknown>): PaymentFields {
  const out: PaymentFields = {};
  if (raw.submissionId !== undefined) out.submissionRef = requireTrimmed(raw.submissionId, "Submission id");
  if (raw.receivedAmount !== undefined) {
    const amount = nullableAmount(raw.receivedAmount, "receivedAmount", { positive: true });
    if (amount == null) throw new FmCostValidationError("receivedAmount must be a positive number.");
    out.receivedAmount = amount;
  }
  if (raw.currency !== undefined) out.currency = requireTrimmed(raw.currency, "Currency").toUpperCase();
  if (raw.receivedAt !== undefined) out.receivedAt = nullableIso(raw.receivedAt, "Received at") ?? undefined;
  if (raw.reference !== undefined) out.reference = nullableText(raw.reference);
  if (raw.method !== undefined) out.method = nullableText(raw.method);
  if (raw.evidenceReference !== undefined) out.evidenceReference = nullableText(raw.evidenceReference);
  if (raw.notes !== undefined) out.notes = nullableText(raw.notes);
  return out;
}
/** `recordedBy` in the payload is IGNORED — the recording actor is the session profile. */
export function parseCreatePaymentInput(payload: unknown): PaymentFields & { submissionRef: string; receivedAmount: number } {
  const f = parsePaymentFields(asRecord(payload));
  if (!f.submissionRef) throw new FmCostValidationError("submissionId is required.");
  if (f.receivedAmount === undefined) throw new FmCostValidationError("receivedAmount must be a positive number.");
  return { ...f, submissionRef: f.submissionRef, receivedAmount: f.receivedAmount };
}
export function parseUpdatePaymentInput(payload: unknown): ParsedUpdatePayment {
  const raw = asRecord(payload);
  return { ...parsePaymentFields(raw), id: requireTrimmed(raw.paymentId ?? raw.id, "paymentId") };
}
export function parsePaymentIdPayload(payload: unknown): string {
  const raw = asRecord(payload);
  return requireTrimmed(raw.paymentId ?? raw.id, "paymentId");
}

export function mapFmPaymentRow(row: FmPaymentRow, submissionCode: string): ReimbursementPayment & { paymentUuid: string } {
  return {
    paymentUuid: row.id,
    paymentId: row.code,
    submissionId: submissionCode,
    receivedAmount: Number(row.received_amount),
    currency: row.currency,
    receivedAt: row.received_at,
    reference: row.reference ?? undefined,
    method: row.method ?? undefined,
    evidenceReference: row.evidence_reference ?? undefined,
    notes: row.notes ?? undefined,
    recordedAt: row.recorded_at,
    recordedBy: row.recorded_by_profile_id ?? "",
  };
}
