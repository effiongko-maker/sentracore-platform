import type { PaginatedResult } from "@/types";
import type {
  CreateMaintenanceInput,
  Maintenance,
  MaintenanceCatalogEntry,
  MaintenanceListParams,
  MaintenancePriority,
  MaintenanceSource,
  MaintenanceStatus,
  MaintenanceType,
  UpdateMaintenanceInput,
} from "@/modules/maintenance/types";
import { ACTIVE_MAINTENANCE_STATUSES } from "@/lib/operational/workload/activeStatuses";

// Domain helpers are imported by verify scripts — do not add "server-only" here.

export const FM_WORK_MODULE_SLUG = "facility_management";

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const WORK_STATUSES: MaintenanceStatus[] = [
  "requested",
  "triaged",
  "scheduled",
  "in_progress",
  "on_hold",
  "completed",
  "cancelled",
];

export const WORK_PRIORITIES: MaintenancePriority[] = [
  "low",
  "medium",
  "high",
  "critical",
];

export const WORK_SOURCES: MaintenanceSource[] = [
  "manual",
  "request",
  "incident",
  "event",
  "schedule",
  "system",
];

export const WORK_KINDS: MaintenanceType[] = [
  "preventive",
  "corrective",
  "inspection",
  "predictive",
  "routine",
  "other",
];

export class FmWorkValidationError extends Error {
  readonly errorClass = "validation" as const;
  constructor(message: string) {
    super(message);
    this.name = "FmWorkValidationError";
  }
}

/**
 * Migrated historical Work is source evidence, never current operational state. Refused at the repository — the single
 * choke point for Work writes — so no route, action or orchestration path can edit, treat, complete, cancel, assign,
 * re-date or re-link it.
 */
export class FmWorkReadOnlyError extends Error {
  readonly errorClass = "read_only" as const;
  constructor(
    message = "Imported historical Work is a read-only source record and cannot be changed."
  ) {
    super(message);
    this.name = "FmWorkReadOnlyError";
  }
}

export class FmWorkNotFoundError extends Error {
  readonly errorClass = "validation" as const;
  constructor(message: string) {
    super(message);
    this.name = "FmWorkNotFoundError";
  }
}

export class FmWorkUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FmWorkUnavailableError";
  }
}

export type FmWorkRow = {
  id: string;
  organisation_id: string;
  code: string;
  facility_id: string;
  title: string;
  description: string | null;
  work_kind: string | null;
  source: string;
  priority: string;
  status: string;
  asset_id: string | null;
  /** fm_requests.id — tenant-safe provenance FK. */
  source_request_id: string | null;
  /** Display code of the source Request; hydrated by the repository (not a column). */
  source_request_code: string | null;
  /** fm_incidents.id — tenant-safe provenance FK. */
  incident_id: string | null;
  /** Display code of the treated Incident; hydrated by the repository (not a column). */
  incident_code: string | null;
  /** Codes of the Work Instructions whose work_id is this Work (derived, not a column). */
  work_instruction_codes: string[];
  assigned_to_profile_id: string | null;
  reported_by_profile_id: string | null;
  hold_reason: string | null;
  requires_work_instruction: boolean;
  operational_event_id: string | null;
  reported_at: string | null;
  record_origin?: string;
  due_at: string | null;
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  completion_notes: string | null;
  category_id: string | null;
  department: string | null;
  created_by_profile_id: string | null;
  updated_by_profile_id: string | null;
  created_at: string;
  updated_at: string;
};

export const FM_WORK_SELECT =
  "id, organisation_id, code, facility_id, title, description, work_kind, source, priority, status, asset_id, source_request_id, incident_id, assigned_to_profile_id, reported_by_profile_id, hold_reason, requires_work_instruction, operational_event_id, reported_at, record_origin, due_at, scheduled_start_at, scheduled_end_at, started_at, completed_at, completion_notes, category_id, department, created_by_profile_id, updated_by_profile_id, created_at, updated_at";

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new FmWorkValidationError("Work payload is required.");
  }
  return value as Record<string, unknown>;
}

function optionalTrimmed(value: unknown): string | undefined {
  if (value == null) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

function requireTrimmed(value: unknown, label: string): string {
  const text = optionalTrimmed(value);
  if (!text) throw new FmWorkValidationError(`${label} is required.`);
  return text;
}

function normalizeEnum(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "_");
}

function parseStatus(value: unknown, fallback?: MaintenanceStatus): MaintenanceStatus {
  const raw = optionalTrimmed(value);
  if (!raw) {
    if (fallback) return fallback;
    throw new FmWorkValidationError("Status is required.");
  }
  const normalized = normalizeEnum(raw);
  const mapped =
    normalized === "open" || normalized === "new" ? "requested" : normalized;
  if (!WORK_STATUSES.includes(mapped as MaintenanceStatus)) {
    throw new FmWorkValidationError(`Invalid Work status: ${raw}`);
  }
  return mapped as MaintenanceStatus;
}

function parsePriority(
  value: unknown,
  fallback?: MaintenancePriority
): MaintenancePriority {
  const raw = optionalTrimmed(value);
  if (!raw) {
    if (fallback) return fallback;
    throw new FmWorkValidationError("Priority is required.");
  }
  const normalized = normalizeEnum(raw) as MaintenancePriority;
  if (!WORK_PRIORITIES.includes(normalized)) {
    throw new FmWorkValidationError(`Invalid Work priority: ${raw}`);
  }
  return normalized;
}

function parseSource(
  value: unknown,
  fallback: MaintenanceSource = "manual"
): MaintenanceSource {
  const raw = optionalTrimmed(value);
  if (!raw) return fallback;
  const normalized = normalizeEnum(raw) as MaintenanceSource;
  if (!WORK_SOURCES.includes(normalized)) {
    throw new FmWorkValidationError(`Invalid Work source: ${raw}`);
  }
  return normalized;
}

function parseWorkKind(value: unknown): MaintenanceType | null {
  const raw = optionalTrimmed(value);
  if (!raw) return null;
  const normalized = normalizeEnum(raw) as MaintenanceType;
  if (!WORK_KINDS.includes(normalized)) {
    throw new FmWorkValidationError(`Invalid Work kind: ${raw}`);
  }
  return normalized;
}

function rejectUsrIdentity(value: string | undefined, label: string): string | undefined {
  if (!value) return undefined;
  if (/^USR-/i.test(value)) {
    // Never persist legacy Sheet people IDs on fm_work.
    return undefined;
  }
  if (!UUID_RE.test(value)) {
    throw new FmWorkValidationError(`${label} must be a profile UUID.`);
  }
  return value;
}

export function generateNextWorkCode(
  existingCodes: string[],
  now = new Date()
): string {
  const year = now.getUTCFullYear();
  const prefix = `WRK-${year}-`;
  let max = 0;
  for (const code of existingCodes) {
    const match = String(code || "").match(
      new RegExp(`^WRK-${year}-(\\d+)$`, "i")
    );
    if (!match) continue;
    const n = parseInt(match[1]!, 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(6, "0")}`;
}

/**
 * Map DB row → frozen Maintenance compatibility contract.
 * work_kind null → type "corrective" only at this adapter boundary (UI contract).
 * workOrderIds are never stored; response leaves them empty unless caller overlays.
 */
export function mapFmWorkRowToMaintenance(row: FmWorkRow): Maintenance {
  // work_kind NULL = the source did not establish a Work type: leave it unset (never "corrective").
  const type = row.work_kind ? (row.work_kind as MaintenanceType) : undefined;
  return {
    id: row.code,
    workUuid: row.id,
    title: row.title,
    description: row.description ?? undefined,
    type,
    source: row.source as MaintenanceSource,
    categoryId: row.category_id ?? undefined,
    department: row.department ?? undefined,
    facilityId: row.facility_id,
    assetId: row.asset_id ?? undefined,
    reportedByUserId: row.reported_by_profile_id ?? undefined,
    assignedToUserId: row.assigned_to_profile_id ?? undefined,
    operationalEventId: row.operational_event_id ?? undefined,
    eventId: row.operational_event_id ?? undefined,
    incidentId: row.incident_code ?? undefined,
    workOrderId: row.work_instruction_codes[0],
    workOrderIds: [...row.work_instruction_codes],
    sourceRequestId: row.source_request_code ?? undefined,
    priority: row.priority as MaintenancePriority,
    status: row.status as MaintenanceStatus,
    holdReason: row.hold_reason ?? undefined,
    requiresWorkOrder: row.requires_work_instruction,
    reportedAt: row.reported_at ?? undefined,
    recordOrigin: row.record_origin === "migrated_historical" ? "migrated_historical" : "operational",
    scheduledStartAt: row.scheduled_start_at ?? undefined,
    scheduledEndAt: row.scheduled_end_at ?? undefined,
    dueAt: row.due_at ?? undefined,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    completionNotes: row.completion_notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdByUserId: row.created_by_profile_id ?? undefined,
    updatedByUserId: row.updated_by_profile_id ?? undefined,
  };
}

export function mapFmWorkRowToCatalog(row: FmWorkRow): MaintenanceCatalogEntry {
  return { id: row.code, title: row.title };
}

export type ParsedCreateWork = {
  title: string;
  description?: string;
  workKind: MaintenanceType | null;
  source: MaintenanceSource;
  categoryId?: string;
  department?: string;
  facilityId: string;
  assetRef?: string;
  sourceRequestRef?: string;
  incidentRef?: string;
  assignedToProfileId?: string;
  reportedByProfileId?: string;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  holdReason?: string;
  requiresWorkInstruction: boolean;
  operationalEventId?: string;
  reportedAt: string;
  scheduledStartAt?: string;
  scheduledEndAt?: string;
  dueAt?: string;
  startedAt?: string;
  completedAt?: string;
  completionNotes?: string;
};

export type ParsedUpdateWork = Partial<ParsedCreateWork> & { id: string };

export function parseCreateWorkInput(payload: unknown): ParsedCreateWork {
  const raw = asRecord(payload);
  const title = requireTrimmed(raw.title, "Title");
  const facilityId = requireTrimmed(raw.facilityId, "Facility");
  const priority = parsePriority(raw.priority);
  const status = parseStatus(raw.status, "requested");
  const source = parseSource(raw.source, "manual");
  const workKind = parseWorkKind(raw.type ?? raw.workKind);
  const reportedAt =
    optionalTrimmed(raw.reportedAt) ?? new Date().toISOString();

  let completedAt = optionalTrimmed(raw.completedAt);
  if (status === "completed" && !completedAt) {
    completedAt = new Date().toISOString();
  }

  return {
    title,
    description: optionalTrimmed(raw.description),
    workKind,
    source,
    categoryId: optionalTrimmed(raw.categoryId),
    department: optionalTrimmed(raw.department),
    facilityId,
    assetRef: optionalTrimmed(raw.assetId),
    sourceRequestRef: optionalTrimmed(raw.sourceRequestId),
    incidentRef: optionalTrimmed(raw.incidentId),
    assignedToProfileId: rejectUsrIdentity(
      optionalTrimmed(raw.assignedToUserId),
      "Assignee"
    ),
    reportedByProfileId: rejectUsrIdentity(
      optionalTrimmed(raw.reportedByUserId),
      "Reporter"
    ),
    priority,
    status,
    holdReason: optionalTrimmed(raw.holdReason),
    requiresWorkInstruction: Boolean(raw.requiresWorkOrder === true),
    operationalEventId: optionalTrimmed(
      raw.operationalEventId ?? raw.eventId
    ),
    reportedAt,
    scheduledStartAt: optionalTrimmed(raw.scheduledStartAt),
    scheduledEndAt: optionalTrimmed(raw.scheduledEndAt),
    dueAt: optionalTrimmed(raw.dueAt),
    startedAt: optionalTrimmed(raw.startedAt),
    completedAt,
    completionNotes: optionalTrimmed(raw.completionNotes),
  };
}

export function parseUpdateWorkInput(payload: unknown): ParsedUpdateWork {
  const raw = asRecord(payload);
  const id = requireTrimmed(raw.id, "Work id");
  const out: ParsedUpdateWork = { id };

  if (raw.title !== undefined) out.title = requireTrimmed(raw.title, "Title");
  if (raw.description !== undefined) {
    out.description = optionalTrimmed(raw.description);
  }
  if (raw.type !== undefined || raw.workKind !== undefined) {
    out.workKind = parseWorkKind(raw.type ?? raw.workKind);
  }
  if (raw.source !== undefined) out.source = parseSource(raw.source);
  if (raw.categoryId !== undefined) {
    out.categoryId = optionalTrimmed(raw.categoryId);
  }
  if (raw.department !== undefined) {
    out.department = optionalTrimmed(raw.department);
  }
  if (raw.facilityId !== undefined) {
    out.facilityId = requireTrimmed(raw.facilityId, "Facility");
  }
  if (raw.assetId !== undefined) out.assetRef = optionalTrimmed(raw.assetId);
  if (raw.sourceRequestId !== undefined) {
    out.sourceRequestRef = optionalTrimmed(raw.sourceRequestId);
  }
  if (raw.incidentId !== undefined) {
    out.incidentRef = optionalTrimmed(raw.incidentId);
  }
  if (raw.assignedToUserId !== undefined) {
    const trimmed = optionalTrimmed(raw.assignedToUserId);
    out.assignedToProfileId = trimmed
      ? rejectUsrIdentity(trimmed, "Assignee")
      : undefined;
  }
  if (raw.reportedByUserId !== undefined) {
    const trimmed = optionalTrimmed(raw.reportedByUserId);
    out.reportedByProfileId = trimmed
      ? rejectUsrIdentity(trimmed, "Reporter")
      : undefined;
  }
  if (raw.priority !== undefined) out.priority = parsePriority(raw.priority);
  if (raw.status !== undefined) out.status = parseStatus(raw.status);
  if (raw.holdReason !== undefined) {
    out.holdReason = optionalTrimmed(raw.holdReason);
  }
  if (raw.requiresWorkOrder !== undefined) {
    out.requiresWorkInstruction = Boolean(raw.requiresWorkOrder);
  }
  // workOrderIds may arrive from WO back-link orchestration — treat as
  // requires_work_instruction signal only; never persist child ID arrays.
  if (
    Array.isArray(raw.workOrderIds) &&
    raw.workOrderIds.length > 0 &&
    raw.requiresWorkOrder === undefined
  ) {
    out.requiresWorkInstruction = true;
  }
  if (raw.workOrderId != null && String(raw.workOrderId).trim()) {
    out.requiresWorkInstruction = true;
  }
  if (raw.operationalEventId !== undefined || raw.eventId !== undefined) {
    out.operationalEventId = optionalTrimmed(
      raw.operationalEventId ?? raw.eventId
    );
  }
  if (raw.reportedAt !== undefined) {
    out.reportedAt = requireTrimmed(raw.reportedAt, "Reported at");
  }
  if (raw.scheduledStartAt !== undefined) {
    out.scheduledStartAt = optionalTrimmed(raw.scheduledStartAt);
  }
  if (raw.scheduledEndAt !== undefined) {
    out.scheduledEndAt = optionalTrimmed(raw.scheduledEndAt);
  }
  if (raw.dueAt !== undefined) out.dueAt = optionalTrimmed(raw.dueAt);
  if (raw.startedAt !== undefined) {
    out.startedAt = optionalTrimmed(raw.startedAt);
  }
  if (raw.completedAt !== undefined) {
    out.completedAt = optionalTrimmed(raw.completedAt);
  }
  if (raw.completionNotes !== undefined) {
    out.completionNotes = optionalTrimmed(raw.completionNotes);
  }

  if (out.status === "completed" && out.completedAt === undefined) {
    out.completedAt = new Date().toISOString();
  }

  return out;
}

export function parseWorkIdPayload(payload: unknown): string {
  const raw = asRecord(payload);
  return requireTrimmed(raw.id, "Work id");
}

export function parseWorkListParams(
  payload: unknown
): MaintenanceListParams {
  if (payload == null) return {};
  const raw = asRecord(payload);
  return {
    page: raw.page != null ? Number(raw.page) : undefined,
    pageSize: raw.pageSize != null ? Number(raw.pageSize) : undefined,
    search: optionalTrimmed(raw.search),
    priority: (optionalTrimmed(raw.priority) as MaintenanceListParams["priority"]) ?? "all",
    status: (optionalTrimmed(raw.status) as MaintenanceListParams["status"]) ?? "all",
    type: (optionalTrimmed(raw.type) as MaintenanceListParams["type"]) ?? "all",
    facilityId: optionalTrimmed(raw.facilityId) ?? "all",
    assignedToUserId: optionalTrimmed(raw.assignedToUserId) ?? "all",
    requiresWorkOrder:
      raw.requiresWorkOrder === true
        ? true
        : raw.requiresWorkOrder === false
          ? false
          : "all",
    sort: optionalTrimmed(raw.sort) as MaintenanceListParams["sort"],
    includeCriticalWorkTotal: Boolean(raw.includeCriticalWorkTotal),
    includeOperationalPictureTotals: Boolean(
      raw.includeOperationalPictureTotals
    ),
    asOf: optionalTrimmed(raw.asOf),
  };
}

export function filterWorkRows(
  rows: Maintenance[],
  params: MaintenanceListParams
): Maintenance[] {
  const search = String(params.search ?? "")
    .toLowerCase()
    .trim();
  const priority = params.priority && params.priority !== "all" ? params.priority : undefined;
  const status = params.status && params.status !== "all" ? params.status : undefined;
  const type = params.type && params.type !== "all" ? params.type : undefined;
  const facility =
    params.facilityId && params.facilityId !== "all"
      ? String(params.facilityId).trim().toLowerCase()
      : undefined;
  const assignee =
    params.assignedToUserId && params.assignedToUserId !== "all"
      ? String(params.assignedToUserId).trim().toLowerCase()
      : undefined;
  const requires =
    params.requiresWorkOrder === true || params.requiresWorkOrder === false
      ? params.requiresWorkOrder
      : undefined;

  return rows.filter((row) => {
    if (priority === "high_or_critical") {
      if (row.priority !== "high" && row.priority !== "critical") return false;
    } else if (priority && row.priority !== priority) {
      return false;
    }
    if (status === "active") {
      if (!ACTIVE_MAINTENANCE_STATUSES.has(row.status)) return false;
    } else if (status && row.status !== status) {
      return false;
    }
    if (type && row.type !== type) return false;
    if (
      facility &&
      String(row.facilityId).toLowerCase() !== facility
    ) {
      return false;
    }
    if (
      assignee &&
      String(row.assignedToUserId ?? "").toLowerCase() !== assignee
    ) {
      return false;
    }
    if (requires !== undefined && Boolean(row.requiresWorkOrder) !== requires) {
      return false;
    }
    if (search) {
      const haystack = [
        row.id,
        row.title,
        row.description,
        row.status,
        row.priority,
        row.facilityId,
        row.assignedToUserId,
      ]
        .map((v) => String(v ?? "").toLowerCase())
        .join(" ");
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

export function sortWorkRows(
  rows: Maintenance[],
  sort?: MaintenanceListParams["sort"]
): Maintenance[] {
  // Unknown reporting dates (migrated historical Work) always sort LAST in either direction.
  const compareReportedAt = (a: Maintenance, b: Maintenance, direction: 1 | -1): number => {
    if (!a.reportedAt && !b.reportedAt) return 0;
    if (!a.reportedAt) return 1;
    if (!b.reportedAt) return -1;
    return direction * a.reportedAt.localeCompare(b.reportedAt);
  };
  const copy = [...rows];
  switch (sort) {
    case "oldest":
      return copy.sort((a, b) => compareReportedAt(a, b, 1));
    case "title_asc":
      return copy.sort((a, b) => a.title.localeCompare(b.title));
    case "title_desc":
      return copy.sort((a, b) => b.title.localeCompare(a.title));
    case "newest":
    default:
      return copy.sort((a, b) => compareReportedAt(a, b, -1));
  }
}

export function paginateWorkRows<T>(
  rows: T[],
  page: number,
  pageSize: number
): PaginatedResult<T> {
  const safePage = page < 1 ? 1 : page;
  const safeSize = pageSize < 1 ? 8 : pageSize;
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / safeSize) || 1);
  const start = (safePage - 1) * safeSize;
  return {
    data: rows.slice(start, start + safeSize),
    page: safePage,
    pageSize: safeSize,
    total,
    totalPages,
  };
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function isBeforeDay(iso: string | undefined, asOf: string): boolean {
  if (!iso) return false;
  return dayKey(iso) < dayKey(asOf);
}

export type WorkOperationalPicture = {
  state: "healthy";
  critical: number;
  inProgress: number;
  awaitingAction: number;
  overdue: number;
};

/** Complete-register Operational Picture for Work (Phase 0A semantics). */
export function summarizeWorkOperationalPicture(
  rows: Maintenance[],
  asOf: string
): WorkOperationalPicture {
  const result: WorkOperationalPicture = {
    state: "healthy",
    critical: 0,
    inProgress: 0,
    awaitingAction: 0,
    overdue: 0,
  };
  for (const row of rows) {
    if (!ACTIVE_MAINTENANCE_STATUSES.has(row.status)) continue;
    if (row.priority === "high" || row.priority === "critical") {
      result.critical += 1;
    }
    if (row.status === "in_progress") result.inProgress += 1;
    const needsInstruction =
      Boolean(row.requiresWorkOrder) &&
      !row.workOrderId &&
      !(row.workOrderIds && row.workOrderIds.length > 0);
    if (row.status === "on_hold" || needsInstruction) {
      result.awaitingAction += 1;
    }
    if (isBeforeDay(row.dueAt, asOf)) result.overdue += 1;
  }
  return result;
}

export function countCriticalWork(rows: Maintenance[]): number {
  let count = 0;
  for (const row of rows) {
    if (!ACTIVE_MAINTENANCE_STATUSES.has(row.status)) continue;
    if (row.priority === "high" || row.priority === "critical") count += 1;
  }
  return count;
}

export type CreateMaintenanceInputLike = CreateMaintenanceInput;
export type UpdateMaintenanceInputLike = UpdateMaintenanceInput & { id?: string };
