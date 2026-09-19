import type { PaginatedResult } from "@/types";
import type {
  WorkOrder,
  WorkOrderListParams,
  WorkOrderMaintenanceType,
  WorkOrderOrderType,
  WorkOrderPriority,
  WorkOrderSource,
  WorkOrderStatus,
  WorkOrderType,
} from "@/modules/work-orders/types";

// Domain helpers are imported by verify scripts — do not add "server-only" here.

export const FM_WORK_INSTRUCTION_MODULE_SLUG = "facility_management";

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const ORDER_TYPE_VALUES: WorkOrderOrderType[] = ["work_order", "job_order"];
export const WORK_CATEGORY_VALUES: WorkOrderType[] = [
  "corrective",
  "preventive",
  "inspection",
  "reactive",
  "project",
  "other",
];
export const INSTRUCTION_STATUS_VALUES: WorkOrderStatus[] = [
  "draft",
  "open",
  "assigned",
  "in_progress",
  "on_hold",
  "completed",
  "cancelled",
  "closed",
];
export const INSTRUCTION_PRIORITY_VALUES: WorkOrderPriority[] = ["low", "medium", "high", "critical"];
export const INSTRUCTION_SOURCE_VALUES: WorkOrderSource[] = [
  "manual",
  "preventive_schedule",
  "incident",
  "inspection",
  "request",
  "system",
];
export const MAINTENANCE_TYPE_VALUES: WorkOrderMaintenanceType[] = ["planned", "unplanned"];

/** Statuses counted by the Operational Picture / assignment (existing product semantics). */
export const ASSIGNED_INSTRUCTION_STATUSES = ["open", "assigned", "in_progress", "on_hold"] as const;
/** Statuses that make an instruction "active" for asset/people workload. */
export const ACTIVE_INSTRUCTION_STATUSES = ["draft", "open", "assigned", "in_progress", "on_hold"] as const;

export class FmWorkInstructionValidationError extends Error {
  readonly errorClass = "validation" as const;
  constructor(message: string) {
    super(message);
    this.name = "FmWorkInstructionValidationError";
  }
}
export class FmWorkInstructionNotFoundError extends Error {
  readonly errorClass = "validation" as const;
  constructor(message: string) {
    super(message);
    this.name = "FmWorkInstructionNotFoundError";
  }
}
export class FmWorkInstructionUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FmWorkInstructionUnavailableError";
  }
}

export type FmWorkInstructionRow = {
  id: string;
  organisation_id: string;
  code: string;
  order_type: string;
  work_id: string;
  facility_id: string;
  title: string;
  description: string | null;
  instruction_text: string | null;
  work_category: string;
  maintenance_type: string | null;
  source: string;
  category_id: string | null;
  asset_ref: string | null;
  parent_instruction_id: string | null;
  reported_by_profile_id: string | null;
  assigned_to_profile_id: string | null;
  status: string;
  priority: string;
  hold_reason: string | null;
  requested_at: string;
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  due_at: string | null;
  sla_due_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  estimated_hours: number | null;
  actual_hours: number | null;
  estimated_cost: number | null;
  actual_cost: number | null;
  downtime_minutes: number | null;
  completion_notes: string | null;
  work_performed: string | null;
  requires_approval: boolean;
  operational_event_id: string | null;
  created_by_profile_id: string | null;
  updated_by_profile_id: string | null;
  created_at: string;
  updated_at: string;
};

export const FM_WORK_INSTRUCTION_SELECT =
  "id, organisation_id, code, order_type, work_id, facility_id, title, description, instruction_text, work_category, maintenance_type, source, category_id, asset_ref, parent_instruction_id, reported_by_profile_id, assigned_to_profile_id, status, priority, hold_reason, requested_at, scheduled_start_at, scheduled_end_at, due_at, sla_due_at, started_at, completed_at, estimated_hours, actual_hours, estimated_cost, actual_cost, downtime_minutes, completion_notes, work_performed, requires_approval, operational_event_id, created_by_profile_id, updated_by_profile_id, created_at, updated_at";

/** Relationships derived at read time — never stored as arrays or duplicated. */
export type FmWorkInstructionRelations = {
  workCode?: string;
  /** Incident code derived THROUGH the Work (fm_work.incident_id). */
  incidentCode?: string;
  parentCode?: string;
  /** Code of this instruction's Approval (fm_approvals.work_instruction_id) — derived. */
  approvalCode?: string;
};

function optionalTrimmed(value: unknown): string | undefined {
  if (value == null) return undefined;
  const text = String(value).trim();
  return text ? text : undefined;
}
function requireTrimmed(value: unknown, label: string): string {
  const text = optionalTrimmed(value);
  if (!text) throw new FmWorkInstructionValidationError(`${label} is required.`);
  return text;
}
function asRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
}
function normalizeEnum(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "_");
}
function parseEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
  fallback?: T
): T {
  const raw = optionalTrimmed(value);
  if (!raw) {
    if (fallback) return fallback;
    throw new FmWorkInstructionValidationError(`${label} is required.`);
  }
  const normalized = normalizeEnum(raw) as T;
  if (!allowed.includes(normalized)) {
    throw new FmWorkInstructionValidationError(`Invalid work instruction ${label}: ${raw}`);
  }
  return normalized;
}

/**
 * Order Type is an explicit manual selection. It is NEVER inferred — not from
 * estimated cost, actual cost, or any amount. Missing/invalid input is an error
 * on create; on update it is simply not changed unless provided.
 */
export function parseOrderType(value: unknown): WorkOrderOrderType {
  const raw = optionalTrimmed(value);
  if (!raw) {
    throw new FmWorkInstructionValidationError("Select Order Type: Work Order or Job Order.");
  }
  const normalized = normalizeEnum(raw) as WorkOrderOrderType;
  if (!ORDER_TYPE_VALUES.includes(normalized)) {
    throw new FmWorkInstructionValidationError("Select Order Type: Work Order or Job Order.");
  }
  return normalized;
}

export function parseInstructionStatus(value: unknown, fallback?: WorkOrderStatus): WorkOrderStatus {
  const raw = optionalTrimmed(value);
  if (!raw) {
    if (fallback) return fallback;
    throw new FmWorkInstructionValidationError("Status is required.");
  }
  const normalized = normalizeEnum(raw);
  const mapped = (normalized === "new" ? "open" : normalized) as WorkOrderStatus;
  if (!INSTRUCTION_STATUS_VALUES.includes(mapped)) {
    throw new FmWorkInstructionValidationError(`Invalid work instruction status: ${raw}`);
  }
  return mapped;
}

function optionalIso(value: unknown, label: string): string | undefined {
  const raw = optionalTrimmed(value);
  if (!raw) return undefined;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) throw new FmWorkInstructionValidationError(`${label} is invalid.`);
  return new Date(ms).toISOString();
}
function nullableIso(value: unknown, label: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || optionalTrimmed(value) === undefined) return null;
  return optionalIso(value, label) ?? null;
}
function nullableText(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return optionalTrimmed(value) ?? null;
}
function nullableNumber(value: unknown, label: string): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new FmWorkInstructionValidationError(`${label} must be a non-negative number.`);
  }
  return n;
}
function profileIdOrUndefined(value: string | undefined, label: string): string | undefined {
  if (!value) return undefined;
  if (/^USR-/i.test(value)) return undefined;
  if (!UUID_RE.test(value)) {
    throw new FmWorkInstructionValidationError(`${label} must be a profile UUID.`);
  }
  return value;
}

export type InstructionFields = {
  orderType?: WorkOrderOrderType;
  workRef?: string;
  title?: string;
  description?: string | null;
  instructionText?: string | null;
  workCategory?: WorkOrderType;
  maintenanceType?: WorkOrderMaintenanceType | null;
  source?: WorkOrderSource;
  categoryId?: string | null;
  assetRef?: string | null;
  parentRef?: string | null;
  reportedByProfileId?: string | null;
  assignedToProfileId?: string | null;
  status?: WorkOrderStatus;
  priority?: WorkOrderPriority;
  holdReason?: string | null;
  requestedAt?: string;
  scheduledStartAt?: string | null;
  scheduledEndAt?: string | null;
  dueAt?: string | null;
  slaDueAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  estimatedHours?: number | null;
  actualHours?: number | null;
  estimatedCost?: number | null;
  actualCost?: number | null;
  downtimeMinutes?: number | null;
  completionNotes?: string | null;
  workPerformed?: string | null;
  requiresApproval?: boolean;
  operationalEventId?: string | null;
  /** Only a consistency assertion — facility is inherited from the Work. */
  assertFacilityRef?: string;
  /** Only a consistency assertion — Incident context is derived through the Work. */
  assertIncidentRef?: string;
};

export type ParsedCreateInstruction = InstructionFields & {
  orderType: WorkOrderOrderType;
  workRef: string;
  title: string;
  workCategory: WorkOrderType;
  source: WorkOrderSource;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  requestedAt: string;
};
export type ParsedUpdateInstruction = InstructionFields & { id: string };

function parseFields(raw: Record<string, unknown>): InstructionFields {
  const out: InstructionFields = {};
  if (raw.orderType !== undefined) out.orderType = parseOrderType(raw.orderType);
  if (raw.maintenanceId !== undefined) {
    const ref = optionalTrimmed(raw.maintenanceId);
    if (ref) out.workRef = ref;
  }
  if (raw.title !== undefined) out.title = requireTrimmed(raw.title, "Title");
  if (raw.description !== undefined) out.description = nullableText(raw.description);
  if (raw.workInstructions !== undefined) out.instructionText = nullableText(raw.workInstructions);
  if (raw.type !== undefined) out.workCategory = parseEnum(raw.type, WORK_CATEGORY_VALUES, "type");
  if (raw.maintenanceType !== undefined) {
    const mt = optionalTrimmed(raw.maintenanceType);
    out.maintenanceType = mt ? parseEnum(mt, MAINTENANCE_TYPE_VALUES, "maintenance type") : null;
  }
  if (raw.source !== undefined) out.source = parseEnum(raw.source, INSTRUCTION_SOURCE_VALUES, "source");
  if (raw.categoryId !== undefined) out.categoryId = nullableText(raw.categoryId);
  if (raw.assetId !== undefined) out.assetRef = nullableText(raw.assetId);
  if (raw.parentWorkOrderId !== undefined) out.parentRef = nullableText(raw.parentWorkOrderId);
  if (raw.reportedByUserId !== undefined) {
    out.reportedByProfileId = profileIdOrUndefined(optionalTrimmed(raw.reportedByUserId), "Reporter") ?? null;
  }
  if (raw.assignedToUserId !== undefined) {
    out.assignedToProfileId = profileIdOrUndefined(optionalTrimmed(raw.assignedToUserId), "Assignee") ?? null;
  }
  if (raw.status !== undefined) out.status = parseInstructionStatus(raw.status);
  if (raw.priority !== undefined) out.priority = parseEnum(raw.priority, INSTRUCTION_PRIORITY_VALUES, "priority");
  if (raw.holdReason !== undefined) out.holdReason = nullableText(raw.holdReason);
  if (raw.requestedAt !== undefined) {
    const at = optionalIso(raw.requestedAt, "Requested at");
    if (at) out.requestedAt = at;
  }
  if (raw.scheduledStartAt !== undefined) out.scheduledStartAt = nullableIso(raw.scheduledStartAt, "Scheduled start");
  if (raw.scheduledEndAt !== undefined) out.scheduledEndAt = nullableIso(raw.scheduledEndAt, "Scheduled end");
  if (raw.dueAt !== undefined) out.dueAt = nullableIso(raw.dueAt, "Due at");
  if (raw.slaDueAt !== undefined) out.slaDueAt = nullableIso(raw.slaDueAt, "SLA due at");
  if (raw.startedAt !== undefined) out.startedAt = nullableIso(raw.startedAt, "Started at");
  if (raw.completedAt !== undefined) out.completedAt = nullableIso(raw.completedAt, "Completed at");
  if (raw.estimatedHours !== undefined) out.estimatedHours = nullableNumber(raw.estimatedHours, "Estimated hours");
  if (raw.actualHours !== undefined) out.actualHours = nullableNumber(raw.actualHours, "Actual hours");
  if (raw.estimatedCost !== undefined) out.estimatedCost = nullableNumber(raw.estimatedCost, "Estimated cost");
  if (raw.actualCost !== undefined) out.actualCost = nullableNumber(raw.actualCost, "Actual cost");
  if (raw.downtimeMinutes !== undefined) {
    const n = nullableNumber(raw.downtimeMinutes, "Downtime");
    out.downtimeMinutes = n == null ? n : Math.round(n);
  }
  if (raw.completionNotes !== undefined) out.completionNotes = nullableText(raw.completionNotes);
  if (raw.workPerformed !== undefined) out.workPerformed = nullableText(raw.workPerformed);
  if (raw.requiresApproval !== undefined) out.requiresApproval = raw.requiresApproval === true;
  // approvalId is DERIVED from the Approval's work_instruction_id FK — never written here.
  if (raw.operationalEventId !== undefined) {
    const id = optionalTrimmed(raw.operationalEventId);
    out.operationalEventId = id && UUID_RE.test(id) ? id : null;
  }
  const facility = optionalTrimmed(raw.facilityId);
  if (facility) out.assertFacilityRef = facility;
  const incident = optionalTrimmed(raw.incidentId);
  if (incident) out.assertIncidentRef = incident;
  return out;
}

/**
 * Create requires Work (instructions are downstream of Work) and an explicit
 * Order Type. Facility and Incident context are inherited from the Work; a
 * supplied value is only checked for consistency.
 */
export function parseCreateInstructionInput(payload: unknown): ParsedCreateInstruction {
  const raw = asRecord(payload);
  const fields = parseFields(raw);
  if (!fields.workRef) {
    throw new FmWorkInstructionValidationError(
      "A Work Instruction belongs to Work — select the Work it instructs."
    );
  }
  const status = fields.status ?? "open";
  return {
    ...fields,
    orderType: parseOrderType(raw.orderType),
    workRef: fields.workRef,
    title: requireTrimmed(raw.title, "Work Instruction title"),
    workCategory: fields.workCategory ?? "corrective",
    source: fields.source ?? "manual",
    status,
    priority: fields.priority ?? "medium",
    requestedAt: fields.requestedAt ?? new Date().toISOString(),
  };
}

export function parseUpdateInstructionInput(payload: unknown): ParsedUpdateInstruction {
  const raw = asRecord(payload);
  return { ...parseFields(raw), id: requireTrimmed(raw.id, "Work Instruction id") };
}

export function parseInstructionIdPayload(payload: unknown): string {
  return requireTrimmed(asRecord(payload).id, "Work Instruction id");
}

export function parseInstructionListParams(payload: unknown): WorkOrderListParams {
  const raw = asRecord(payload);
  const opt = (key: string) => optionalTrimmed(raw[key]);
  const all = <T extends string>(value: string | undefined, allowed: readonly T[], label: string) =>
    !value || value.toLowerCase() === "all" ? ("all" as const) : parseEnum(value, allowed, label);
  const due = opt("dueDate");
  const sort = opt("sort");
  return {
    page: Math.max(1, Number(raw.page ?? 1) || 1),
    pageSize: Math.min(500, Math.max(1, Number(raw.pageSize ?? 8) || 8)),
    search: opt("search"),
    status: (() => {
      const v = opt("status");
      if (!v || v.toLowerCase() === "all") return "all" as const;
      return parseInstructionStatus(v);
    })(),
    priority: all(opt("priority"), INSTRUCTION_PRIORITY_VALUES, "priority"),
    facilityId: opt("facilityId") ?? "all",
    assignedToUserId: opt("assignedToUserId") ?? "all",
    type: all(opt("type"), WORK_CATEGORY_VALUES, "type"),
    assetId: opt("assetId") ?? "all",
    maintenanceId: opt("maintenanceId") ?? "all",
    dueDate:
      due === "overdue" || due === "next_7_days" || due === "no_due" ? due : "all",
    sort:
      sort === "oldest" || sort === "title_asc" || sort === "title_desc" ? sort : "newest",
    includeOperationalPictureTotals: raw.includeOperationalPictureTotals === true,
    asOf: opt("asOf"),
  };
}

export function sanitizeSearchTerm(value: string): string {
  return value.replace(/[,()%*_\\"']/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Map row → the frozen Work Order compatibility contract.
 * `maintenanceId` is the Work code; `incidentId` is derived THROUGH the Work.
 */
export function mapFmWorkInstructionRowToWorkOrder(
  row: FmWorkInstructionRow,
  relations: FmWorkInstructionRelations = {}
): WorkOrder {
  return {
    id: row.code,
    workOrderUuid: row.id,
    title: row.title,
    description: row.description ?? undefined,
    type: row.work_category as WorkOrderType,
    orderType: row.order_type as WorkOrderOrderType,
    maintenanceType: (row.maintenance_type as WorkOrderMaintenanceType | null) ?? undefined,
    source: row.source as WorkOrderSource,
    categoryId: row.category_id ?? undefined,
    workInstructions: row.instruction_text ?? undefined,
    facilityId: row.facility_id,
    assetId: row.asset_ref ?? undefined,
    reportedByUserId: row.reported_by_profile_id ?? undefined,
    incidentId: relations.incidentCode,
    maintenanceId: relations.workCode,
    parentWorkOrderId: relations.parentCode,
    operationalEventId: row.operational_event_id ?? undefined,
    assignedToUserId: row.assigned_to_profile_id ?? undefined,
    requestedAt: row.requested_at,
    scheduledStartAt: row.scheduled_start_at ?? undefined,
    scheduledEndAt: row.scheduled_end_at ?? undefined,
    dueAt: row.due_at ?? undefined,
    status: row.status as WorkOrderStatus,
    priority: row.priority as WorkOrderPriority,
    holdReason: row.hold_reason ?? undefined,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    estimatedHours: row.estimated_hours != null ? Number(row.estimated_hours) : undefined,
    actualHours: row.actual_hours != null ? Number(row.actual_hours) : undefined,
    estimatedCost: row.estimated_cost != null ? Number(row.estimated_cost) : undefined,
    actualCost: row.actual_cost != null ? Number(row.actual_cost) : undefined,
    completionNotes: row.completion_notes ?? undefined,
    workPerformed: row.work_performed ?? undefined,
    downtimeMinutes: row.downtime_minutes ?? undefined,
    slaDueAt: row.sla_due_at ?? undefined,
    requiresApproval: row.requires_approval,
    approvalId: relations.approvalCode,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdByUserId: row.created_by_profile_id ?? undefined,
    updatedByUserId: row.updated_by_profile_id ?? undefined,
  };
}

/** WO-YYYY-###### — next code given the highest existing code for that year. */
export function generateNextInstructionCode(
  latestCodeForYear: string | null | undefined,
  now = new Date()
): string {
  const year = now.getUTCFullYear();
  const match = String(latestCodeForYear ?? "").match(new RegExp(`^WO-${year}-(\\d+)$`, "i"));
  const max = match ? parseInt(match[1]!, 10) || 0 : 0;
  return `WO-${year}-${String(max + 1).padStart(6, "0")}`;
}

export function paginateInstructionRows<T>(
  rows: T[],
  total: number,
  page: number,
  pageSize: number
): PaginatedResult<T> {
  return { data: rows, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

function dayKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

export type WorkInstructionOperationalPicture = {
  state: "healthy";
  awaitingAction: number;
  overdue: number;
};

/**
 * Complete-register Operational Picture for Work Instructions — the same
 * predicates the Apps Script mirror used (Phase 0A semantics):
 * counted statuses open|assigned|in_progress|on_hold; awaiting = on_hold;
 * overdue = (due_at ?? sla_due_at) day before asOf.
 */
export function summarizeInstructionOperationalPicture(
  rows: Array<{ status: string; due_at: string | null; sla_due_at: string | null }>,
  asOf: string
): WorkInstructionOperationalPicture {
  const result: WorkInstructionOperationalPicture = { state: "healthy", awaitingAction: 0, overdue: 0 };
  const today = dayKey(asOf);
  for (const row of rows) {
    if (!(ASSIGNED_INSTRUCTION_STATUSES as readonly string[]).includes(row.status)) continue;
    if (row.status === "on_hold") result.awaitingAction += 1;
    const due = row.due_at ?? row.sla_due_at;
    if (due && dayKey(due) < today) result.overdue += 1;
  }
  return result;
}
