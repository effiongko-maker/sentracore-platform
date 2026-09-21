import type { PaginatedResult } from "@/types";
import type {
  Incident,
  IncidentChannel,
  IncidentListParams,
  IncidentSeverity,
  IncidentSource,
  IncidentStatus,
  IncidentType,
} from "@/modules/incidents/types";

// Domain helpers are imported by verify scripts — do not add "server-only" here.

export const FM_INCIDENT_MODULE_SLUG = "facility_management";

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const INCIDENT_STATUS_VALUES: IncidentStatus[] = [
  "reported",
  "triaged",
  "investigating",
  "contained",
  "resolved",
  "closed",
  "cancelled",
];
export const INCIDENT_TYPE_VALUES: IncidentType[] = [
  "equipment_failure",
  "safety",
  "security",
  "utility_failure",
  "environmental",
  "observation",
  "service_request",
  "complaint",
  "other",
];
export const INCIDENT_SEVERITY_VALUES: IncidentSeverity[] = [
  "low",
  "medium",
  "high",
  "critical",
];
export const INCIDENT_SOURCE_VALUES: IncidentSource[] = [
  "manual",
  "technician",
  "sensor",
  "tenant",
  "security",
  "system",
  "external",
  "request",
];
export const INCIDENT_CHANNEL_VALUES: IncidentChannel[] = [
  "portal",
  "mobile",
  "phone",
  "email",
  "radio",
  "walk_in",
  "system",
  "other",
];

export class FmIncidentValidationError extends Error {
  readonly errorClass = "validation" as const;
  constructor(message: string) {
    super(message);
    this.name = "FmIncidentValidationError";
  }
}

export class FmIncidentNotFoundError extends Error {
  readonly errorClass = "validation" as const;
  constructor(message: string) {
    super(message);
    this.name = "FmIncidentNotFoundError";
  }
}

/**
 * A migrated historical Incident is a read-only source fact: it cannot be edited, transitioned, cancelled or
 * re-linked through ANY route. Enforced at the repository — the single choke point for incident writes.
 */
export class FmIncidentReadOnlyError extends Error {
  readonly errorClass = "read_only" as const;
  constructor(message = "Migrated historical incidents are read-only source records and cannot be changed.") {
    super(message);
    this.name = "FmIncidentReadOnlyError";
  }
}

export class FmIncidentUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FmIncidentUnavailableError";
  }
}

export type FmIncidentRow = {
  id: string;
  organisation_id: string;
  code: string;
  facility_id: string;
  title: string;
  description: string | null;
  location_detail: string | null;
  incident_type: string;
  source: string;
  category_id: string | null;
  severity: string;
  status: string;
  reported_via: string | null;
  is_emergency: boolean;
  people_affected: number | null;
  hold_reason: string | null;
  requires_work_instruction: boolean;
  source_request_id: string | null;
  parent_incident_id: string | null;
  asset_id: string | null;
  reported_by_profile_id: string | null;
  assigned_to_profile_id: string | null;
  operational_event_id: string | null;
  reported_at: string;
  record_origin?: string;
  discovered_at: string | null;
  acknowledged_at: string | null;
  response_due_at: string | null;
  contained_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  immediate_actions: string | null;
  root_cause: string | null;
  corrective_actions: string | null;
  preventive_actions: string | null;
  resolution_notes: string | null;
  created_by_profile_id: string | null;
  updated_by_profile_id: string | null;
  created_at: string;
  updated_at: string;
};

export const FM_INCIDENT_SELECT =
  "id, organisation_id, code, facility_id, title, description, location_detail, incident_type, source, category_id, severity, status, reported_via, is_emergency, people_affected, hold_reason, requires_work_instruction, source_request_id, parent_incident_id, asset_id, reported_by_profile_id, assigned_to_profile_id, operational_event_id, reported_at, record_origin, discovered_at, acknowledged_at, response_due_at, contained_at, resolved_at, closed_at, immediate_actions, root_cause, corrective_actions, preventive_actions, resolution_notes, created_by_profile_id, updated_by_profile_id, created_at, updated_at";

/** Relationships derived at read time — never stored on the Incident row. */
export type FmIncidentRelations = {
  /** Work codes (WRK-*) whose incident_id is this Incident. */
  maintenanceIds: string[];
  /** Display code of the source Request, if any. */
  sourceRequestCode?: string;
  /** Display code of the parent Incident, if any. */
  parentIncidentCode?: string;
  /** Work Instruction codes derived through this Incident's Work (Incident → Work → Work Instruction). */
  workOrderIds?: string[];
};

export const EMPTY_INCIDENT_RELATIONS: FmIncidentRelations = {
  maintenanceIds: [],
};

function optionalTrimmed(value: unknown): string | undefined {
  if (value == null) return undefined;
  const text = String(value).trim();
  return text ? text : undefined;
}

function requireTrimmed(value: unknown, label: string): string {
  const text = optionalTrimmed(value);
  if (!text) throw new FmIncidentValidationError(`${label} is required.`);
  return text;
}

function asRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === "object"
    ? (payload as Record<string, unknown>)
    : {};
}

function normalizeEnum(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "_");
}

function parseEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
  opts: { fallback?: T; aliases?: Record<string, T> } = {}
): T {
  const raw = optionalTrimmed(value);
  if (!raw) {
    if (opts.fallback) return opts.fallback;
    throw new FmIncidentValidationError(`${label} is required.`);
  }
  const normalized = normalizeEnum(raw);
  const mapped = (opts.aliases?.[normalized] ?? normalized) as T;
  if (!allowed.includes(mapped)) {
    throw new FmIncidentValidationError(`Invalid incident ${label}: ${raw}`);
  }
  return mapped;
}

export function parseIncidentStatus(value: unknown, fallback?: IncidentStatus) {
  return parseEnum(value, INCIDENT_STATUS_VALUES, "status", {
    fallback,
    aliases: { open: "reported" },
  });
}

function optionalIso(value: unknown, label: string): string | undefined {
  const raw = optionalTrimmed(value);
  if (!raw) return undefined;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) {
    throw new FmIncidentValidationError(`${label} is invalid.`);
  }
  return new Date(ms).toISOString();
}

/**
 * Profile UUIDs only. Legacy Sheet `USR-*` ids are never persisted; other
 * non-UUID values are rejected rather than guessed.
 */
function profileIdOrUndefined(
  value: string | undefined,
  label: string
): string | undefined {
  if (!value) return undefined;
  if (/^USR-/i.test(value)) return undefined;
  if (!UUID_RE.test(value)) {
    throw new FmIncidentValidationError(`${label} must be a profile UUID.`);
  }
  return value;
}

const LINK_ARRAY_KEYS = [
  "maintenanceIds",
  "Maintenance IDs",
  "Work Order IDs",
] as const;

function assertNoMaintenanceArrays(raw: Record<string, unknown>): void {
  for (const key of LINK_ARRAY_KEYS) {
    if (key === "Work Order IDs") continue;
    const value = raw[key];
    if (value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    throw new FmIncidentValidationError(
      "Incident Work links are derived from Work and cannot be written on an Incident."
    );
  }
}

export type IncidentFields = {
  title?: string;
  description?: string | null;
  locationDetail?: string | null;
  incidentType?: IncidentType;
  source?: IncidentSource;
  categoryId?: string | null;
  severity?: IncidentSeverity;
  status?: IncidentStatus;
  reportedVia?: IncidentChannel | null;
  isEmergency?: boolean;
  peopleAffected?: number | null;
  holdReason?: string | null;
  requiresWorkInstruction?: boolean;
  sourceRequestRef?: string | null;
  parentIncidentRef?: string | null;
  assetRef?: string | null;
  reportedByProfileId?: string | null;
  assignedToProfileId?: string | null;
  operationalEventId?: string | null;
  reportedAt?: string;
  discoveredAt?: string | null;
  acknowledgedAt?: string | null;
  responseDueAt?: string | null;
  containedAt?: string | null;
  resolvedAt?: string | null;
  closedAt?: string | null;
  immediateActions?: string | null;
  rootCause?: string | null;
  correctiveActions?: string | null;
  preventiveActions?: string | null;
  resolutionNotes?: string | null;
  facilityId?: string;
};

export type ParsedCreateIncident = IncidentFields & {
  title: string;
  facilityId: string;
  incidentType: IncidentType;
  source: IncidentSource;
  severity: IncidentSeverity;
  status: IncidentStatus;
  reportedAt: string;
};

export type ParsedUpdateIncident = IncidentFields & { id: string };

function nullable(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return optionalTrimmed(value) ?? null;
}

function nullableIso(value: unknown, label: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || optionalTrimmed(value) === undefined) return null;
  return optionalIso(value, label) ?? null;
}

function nullableInt(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw new FmIncidentValidationError("People affected must be a whole number.");
  }
  return n;
}

function parseFields(raw: Record<string, unknown>): IncidentFields {
  assertNoMaintenanceArrays(raw);
  const out: IncidentFields = {};
  if (raw.title !== undefined) out.title = requireTrimmed(raw.title, "Title");
  if (raw.description !== undefined) out.description = nullable(raw.description);
  if (raw.locationDetail !== undefined) out.locationDetail = nullable(raw.locationDetail);
  if (raw.type !== undefined || raw.incidentType !== undefined) {
    out.incidentType = parseEnum(
      raw.type ?? raw.incidentType,
      INCIDENT_TYPE_VALUES,
      "type"
    );
  }
  if (raw.source !== undefined) {
    out.source = parseEnum(raw.source, INCIDENT_SOURCE_VALUES, "source");
  }
  if (raw.categoryId !== undefined) out.categoryId = nullable(raw.categoryId);
  if (raw.severity !== undefined) {
    out.severity = parseEnum(raw.severity, INCIDENT_SEVERITY_VALUES, "severity");
  }
  if (raw.status !== undefined) out.status = parseIncidentStatus(raw.status);
  if (raw.reportedVia !== undefined) {
    const via = optionalTrimmed(raw.reportedVia);
    out.reportedVia = via
      ? parseEnum(via, INCIDENT_CHANNEL_VALUES, "reported via")
      : null;
  }
  if (raw.isEmergency !== undefined) out.isEmergency = raw.isEmergency === true;
  if (raw.peopleAffected !== undefined) out.peopleAffected = nullableInt(raw.peopleAffected);
  if (raw.holdReason !== undefined) out.holdReason = nullable(raw.holdReason);
  if (raw.requiresWorkOrder !== undefined) {
    out.requiresWorkInstruction = raw.requiresWorkOrder === true;
  }
  if (raw.sourceRequestId !== undefined) out.sourceRequestRef = nullable(raw.sourceRequestId);
  if (raw.parentIncidentId !== undefined) out.parentIncidentRef = nullable(raw.parentIncidentId);
  if (raw.assetId !== undefined) out.assetRef = nullable(raw.assetId);

  if (raw.reportedByUserId !== undefined) {
    out.reportedByProfileId =
      profileIdOrUndefined(optionalTrimmed(raw.reportedByUserId), "Reporter") ?? null;
  }
  if (raw.assignedToUserId !== undefined) {
    out.assignedToProfileId =
      profileIdOrUndefined(optionalTrimmed(raw.assignedToUserId), "Assignee") ?? null;
  }
  if (raw.operationalEventId !== undefined) {
    const id = optionalTrimmed(raw.operationalEventId);
    // Only a Supabase event UUID is valid here (never an INC-* id).
    out.operationalEventId = id && UUID_RE.test(id) ? id : null;
  }
  if (raw.reportedAt !== undefined) {
    const at = optionalIso(raw.reportedAt, "Reported at");
    if (at) out.reportedAt = at;
  }
  if (raw.discoveredAt !== undefined) out.discoveredAt = nullableIso(raw.discoveredAt, "Discovered at");
  if (raw.acknowledgedAt !== undefined) out.acknowledgedAt = nullableIso(raw.acknowledgedAt, "Acknowledged at");
  if (raw.responseDueAt !== undefined) out.responseDueAt = nullableIso(raw.responseDueAt, "Response due at");
  if (raw.containedAt !== undefined) out.containedAt = nullableIso(raw.containedAt, "Contained at");
  if (raw.resolvedAt !== undefined) out.resolvedAt = nullableIso(raw.resolvedAt, "Resolved at");
  if (raw.closedAt !== undefined) out.closedAt = nullableIso(raw.closedAt, "Closed at");
  if (raw.immediateActions !== undefined) out.immediateActions = nullable(raw.immediateActions);
  if (raw.rootCause !== undefined) out.rootCause = nullable(raw.rootCause);
  if (raw.correctiveActions !== undefined) out.correctiveActions = nullable(raw.correctiveActions);
  if (raw.preventiveActions !== undefined) out.preventiveActions = nullable(raw.preventiveActions);
  if (raw.resolutionNotes !== undefined) out.resolutionNotes = nullable(raw.resolutionNotes);
  if (raw.facilityId !== undefined) out.facilityId = requireTrimmed(raw.facilityId, "Facility");
  return out;
}

export function parseCreateIncidentInput(payload: unknown): ParsedCreateIncident {
  const raw = asRecord(payload);
  const fields = parseFields(raw);
  return {
    ...fields,
    title: requireTrimmed(raw.title, "Incident title"),
    facilityId: requireTrimmed(raw.facilityId, "Facility id"),
    incidentType: fields.incidentType ?? "other",
    source: fields.source ?? "manual",
    severity: fields.severity ?? "medium",
    status: fields.status ?? "reported",
    reportedAt: fields.reportedAt ?? new Date().toISOString(),
  };
}

export function parseUpdateIncidentInput(payload: unknown): ParsedUpdateIncident {
  const raw = asRecord(payload);
  return { ...parseFields(raw), id: requireTrimmed(raw.id, "Incident id") };
}

export function parseIncidentIdPayload(payload: unknown): string {
  return requireTrimmed(asRecord(payload).id, "Incident id");
}

export function parseIncidentListParams(payload: unknown): IncidentListParams {
  const raw = asRecord(payload);
  const status = optionalTrimmed(raw.status);
  const severity = optionalTrimmed(raw.severity);
  const requires = raw.requiresWorkOrder;
  return {
    page: Math.max(1, Number(raw.page ?? 1) || 1),
    pageSize: Math.min(500, Math.max(1, Number(raw.pageSize ?? 8) || 8)),
    search: optionalTrimmed(raw.search),
    status:
      !status || status.toLowerCase() === "all"
        ? "all"
        : parseIncidentStatus(status),
    severity:
      !severity || severity.toLowerCase() === "all"
        ? "all"
        : parseEnum(severity, INCIDENT_SEVERITY_VALUES, "severity"),
    facilityId: optionalTrimmed(raw.facilityId) ?? "all",
    assignedToUserId: optionalTrimmed(raw.assignedToUserId) ?? "all",
    requiresWorkOrder:
      requires === undefined || requires === "all"
        ? "all"
        : requires === true || requires === "true" || requires === 1,
  };
}

export function sanitizeSearchTerm(value: string): string {
  return value.replace(/[,()%*_\\"']/g, " ").replace(/\s+/g, " ").trim();
}

export function mapFmIncidentRowToIncident(
  row: FmIncidentRow,
  relations: FmIncidentRelations = EMPTY_INCIDENT_RELATIONS
): Incident {
  const workOrderIds = relations.workOrderIds ?? [];
  return {
    id: row.code,
    incidentUuid: row.id,
    title: row.title,
    description: row.description ?? undefined,
    type: row.incident_type as IncidentType,
    source: row.source as IncidentSource,
    categoryId: row.category_id ?? undefined,
    facilityId: row.facility_id,
    assetId: row.asset_id ?? undefined,
    locationDetail: row.location_detail ?? undefined,
    reportedByUserId: row.reported_by_profile_id ?? undefined,
    assignedToUserId: row.assigned_to_profile_id ?? undefined,
    workOrderId: workOrderIds[0],
    workOrderIds,
    maintenanceIds: [...relations.maintenanceIds],
    parentIncidentId: relations.parentIncidentCode,
    sourceRequestId: relations.sourceRequestCode,
    operationalEventId: row.operational_event_id ?? undefined,
    reportedAt: row.reported_at,
    discoveredAt: row.discovered_at ?? undefined,
    reportedVia: (row.reported_via as IncidentChannel | null) ?? undefined,
    severity: row.severity as IncidentSeverity,
    recordOrigin: row.record_origin === "migrated_historical" ? "migrated_historical" : "operational",
    peopleAffected: row.people_affected ?? undefined,
    isEmergency: row.is_emergency,
    status: row.status as IncidentStatus,
    holdReason: row.hold_reason ?? undefined,
    requiresWorkOrder: row.requires_work_instruction,
    acknowledgedAt: row.acknowledged_at ?? undefined,
    responseDueAt: row.response_due_at ?? undefined,
    containedAt: row.contained_at ?? undefined,
    resolvedAt: row.resolved_at ?? undefined,
    closedAt: row.closed_at ?? undefined,
    immediateActions: row.immediate_actions ?? undefined,
    rootCause: row.root_cause ?? undefined,
    correctiveActions: row.corrective_actions ?? undefined,
    preventiveActions: row.preventive_actions ?? undefined,
    resolutionNotes: row.resolution_notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdByUserId: row.created_by_profile_id ?? undefined,
    updatedByUserId: row.updated_by_profile_id ?? undefined,
  };
}

/** INC-YYYY-###### — next code given the highest existing code for that year. */
export function generateNextIncidentCode(
  latestCodeForYear: string | null | undefined,
  now = new Date()
): string {
  const year = now.getUTCFullYear();
  const match = String(latestCodeForYear ?? "").match(
    new RegExp(`^INC-${year}-(\\d+)$`, "i")
  );
  const max = match ? parseInt(match[1]!, 10) || 0 : 0;
  return `INC-${year}-${String(max + 1).padStart(6, "0")}`;
}

export function paginateIncidentRows<T>(
  rows: T[],
  total: number,
  page: number,
  pageSize: number
): PaginatedResult<T> {
  return {
    data: rows,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
