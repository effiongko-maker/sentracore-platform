import type { PaginatedResult } from "@/types";
import type {
  CreateRequestInput,
  RequestListParams,
  RequestRecord,
  RequestStatus,
  RequestType,
} from "@/modules/requests/types";

// Domain helpers are imported by verify scripts — do not add "server-only" here.

export const FM_REQUEST_MODULE_SLUG = "facility_management";

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const REQUEST_STATUS_VALUES: RequestStatus[] = [
  "submitted",
  "under_review",
  "being_treated",
  "resolved",
  "closed",
  "cancelled",
];

export const REQUEST_TYPE_VALUES: RequestType[] = ["maintenance", "incident"];

export class FmRequestValidationError extends Error {
  readonly errorClass = "validation" as const;
  constructor(message: string) {
    super(message);
    this.name = "FmRequestValidationError";
  }
}

export class FmRequestNotFoundError extends Error {
  readonly errorClass = "validation" as const;
  constructor(message: string) {
    super(message);
    this.name = "FmRequestNotFoundError";
  }
}

export class FmRequestUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FmRequestUnavailableError";
  }
}

export type FmRequestRow = {
  id: string;
  organisation_id: string;
  code: string;
  facility_id: string;
  title: string;
  description: string | null;
  location_detail: string | null;
  request_type: string | null;
  status: string;
  occurred_at: string;
  reporter_name: string | null;
  reporter_contact: string | null;
  reported_by_profile_id: string | null;
  created_by_profile_id: string | null;
  updated_by_profile_id: string | null;
  created_at: string;
  updated_at: string;
};

export const FM_REQUEST_SELECT =
  "id, organisation_id, code, facility_id, title, description, location_detail, request_type, status, occurred_at, reporter_name, reporter_contact, reported_by_profile_id, created_by_profile_id, updated_by_profile_id, created_at, updated_at";

/** Relationships derived at read time — never stored on the Request row. */
export type FmRequestLinks = {
  /** Work codes (WRK-*) whose source_request_id is this Request. */
  maintenanceIds: string[];
  /** Transitional opaque Incident refs from fm_request_incident_links. */
  incidentIds: string[];
};

export const EMPTY_REQUEST_LINKS: FmRequestLinks = {
  maintenanceIds: [],
  incidentIds: [],
};

function optionalTrimmed(value: unknown): string | undefined {
  if (value == null) return undefined;
  const text = String(value).trim();
  return text ? text : undefined;
}

function requireTrimmed(value: unknown, label: string): string {
  const text = optionalTrimmed(value);
  if (!text) throw new FmRequestValidationError(`${label} is required.`);
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

export function parseRequestStatus(
  value: unknown,
  fallback?: RequestStatus
): RequestStatus {
  const raw = optionalTrimmed(value);
  if (!raw) {
    if (fallback) return fallback;
    throw new FmRequestValidationError("Status is required.");
  }
  const normalized = normalizeEnum(raw) as RequestStatus;
  if (!REQUEST_STATUS_VALUES.includes(normalized)) {
    throw new FmRequestValidationError(`Invalid request status: ${raw}`);
  }
  return normalized;
}

function parseRequestType(value: unknown): RequestType | undefined {
  const raw = optionalTrimmed(value);
  if (!raw) return undefined;
  const normalized = normalizeEnum(raw) as RequestType;
  if (!REQUEST_TYPE_VALUES.includes(normalized)) {
    throw new FmRequestValidationError(
      `Invalid request type: ${raw}. Expected maintenance|incident.`
    );
  }
  return normalized;
}

function optionalIso(value: unknown, label: string): string | undefined {
  const raw = optionalTrimmed(value);
  if (!raw) return undefined;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) {
    throw new FmRequestValidationError(`${label} is invalid.`);
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
    throw new FmRequestValidationError(`${label} must be a profile UUID.`);
  }
  return value;
}

export type ParsedCreateRequest = {
  title: string;
  description?: string;
  facilityId: string;
  locationDetail?: string;
  requestType?: RequestType;
  status: RequestStatus;
  occurredAt: string;
  reporterName?: string;
  reporterContact?: string;
  reportedByProfileId?: string;
};

export type ParsedUpdateRequest = {
  id: string;
  title?: string;
  description?: string | null;
  facilityId?: string;
  locationDetail?: string | null;
  requestType?: RequestType;
  occurredAt?: string;
  reporterName?: string | null;
  reporterContact?: string | null;
  reportedByProfileId?: string | null;
};

const LINK_KEYS = [
  "maintenanceIds",
  "incidentIds",
  "workOrderIds",
  "Maintenance IDs",
  "Incident IDs",
  "Work Order IDs",
] as const;

function assertNoLinkArrays(raw: Record<string, unknown>): void {
  for (const key of LINK_KEYS) {
    const value = raw[key];
    if (value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    throw new FmRequestValidationError(
      "Request treatment links are derived from Work and cannot be written on a Request."
    );
  }
}

export function parseCreateRequestInput(
  payload: unknown
): ParsedCreateRequest {
  const raw = asRecord(payload);
  assertNoLinkArrays(raw);
  return {
    title: requireTrimmed(raw.title, "Request title"),
    description: optionalTrimmed(raw.description),
    facilityId: requireTrimmed(raw.facilityId, "Facility id"),
    locationDetail: optionalTrimmed(raw.locationDetail),
    requestType: parseRequestType(raw.requestType),
    status: parseRequestStatus(raw.status, "submitted"),
    occurredAt:
      optionalIso(raw.occurredAt, "Occurred at") ?? new Date().toISOString(),
    reporterName: optionalTrimmed(raw.reporterName),
    reporterContact: optionalTrimmed(raw.reporterContact),
    reportedByProfileId: profileIdOrUndefined(
      optionalTrimmed(raw.reportedByUserId),
      "Reporter"
    ),
  };
}

function nullableText(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return optionalTrimmed(value) ?? null;
}

/**
 * Descriptive update only. Status is a lifecycle transition and is NOT
 * accepted here (see FmRequestServerService.transitionStatus).
 */
export function parseUpdateRequestInput(payload: unknown): ParsedUpdateRequest {
  const raw = asRecord(payload);
  assertNoLinkArrays(raw);
  const id = requireTrimmed(raw.id, "Request id");
  if (raw.status !== undefined) {
    throw new FmRequestValidationError(
      "Request status must change through Request treatment actions."
    );
  }
  const out: ParsedUpdateRequest = { id };
  if (raw.title !== undefined) out.title = requireTrimmed(raw.title, "Title");
  if (raw.description !== undefined) out.description = nullableText(raw.description);
  if (raw.facilityId !== undefined) {
    out.facilityId = requireTrimmed(raw.facilityId, "Facility id");
  }
  if (raw.locationDetail !== undefined) {
    out.locationDetail = nullableText(raw.locationDetail);
  }
  if (raw.requestType !== undefined) {
    const type = parseRequestType(raw.requestType);
    if (type) out.requestType = type;
  }
  if (raw.occurredAt !== undefined) {
    const at = optionalIso(raw.occurredAt, "Occurred at");
    if (at) out.occurredAt = at;
  }
  if (raw.reporterName !== undefined) out.reporterName = nullableText(raw.reporterName);
  if (raw.reporterContact !== undefined) {
    out.reporterContact = nullableText(raw.reporterContact);
  }
  if (raw.reportedByUserId !== undefined) {
    const trimmed = optionalTrimmed(raw.reportedByUserId);
    out.reportedByProfileId = trimmed
      ? (profileIdOrUndefined(trimmed, "Reporter") ?? null)
      : null;
  }
  return out;
}

export function parseRequestIdPayload(payload: unknown): string {
  return requireTrimmed(asRecord(payload).id, "Request id");
}

export function parseRequestListParams(payload: unknown): RequestListParams {
  const raw = asRecord(payload);
  const status = optionalTrimmed(raw.status);
  const facilityId = optionalTrimmed(raw.facilityId);
  return {
    page: Math.max(1, Number(raw.page ?? 1) || 1),
    pageSize: Math.min(500, Math.max(1, Number(raw.pageSize ?? 8) || 8)),
    search: optionalTrimmed(raw.search),
    status: status ? (parseRequestStatusOrAll(status) as RequestListParams["status"]) : "all",
    facilityId: facilityId ?? "all",
  };
}

function parseRequestStatusOrAll(value: string): RequestStatus | "all" {
  if (value.toLowerCase() === "all") return "all";
  return parseRequestStatus(value);
}

/**
 * Sanitise free text for a PostgREST `or()` ilike filter: drop the characters
 * that carry filter-grammar or LIKE wildcard meaning.
 */
export function sanitizeSearchTerm(value: string): string {
  return value.replace(/[,()%*_\\"']/g, " ").replace(/\s+/g, " ").trim();
}

export function mapFmRequestRowToRecord(
  row: FmRequestRow,
  links: FmRequestLinks = EMPTY_REQUEST_LINKS
): RequestRecord {
  return {
    id: row.code,
    requestUuid: row.id,
    title: row.title,
    description: row.description ?? undefined,
    facilityId: row.facility_id,
    occurredAt: row.occurred_at,
    locationDetail: row.location_detail ?? undefined,
    reporterName: row.reporter_name ?? undefined,
    reporterContact: row.reporter_contact ?? undefined,
    reportedByUserId: row.reported_by_profile_id ?? undefined,
    requestType: (row.request_type as RequestType | null) ?? undefined,
    status: row.status as RequestStatus,
    incidentIds: [...links.incidentIds],
    maintenanceIds: [...links.maintenanceIds],
    // Work Instructions are not coupled to Requests. Derive via Work/Incident.
    workOrderIds: [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdByUserId: row.created_by_profile_id ?? undefined,
    updatedByUserId: row.updated_by_profile_id ?? undefined,
  };
}

/** REQ-YYYY-###### — next code given the highest existing code for that year. */
export function generateNextRequestCode(
  latestCodeForYear: string | null | undefined,
  now = new Date()
): string {
  const year = now.getUTCFullYear();
  let max = 0;
  const match = String(latestCodeForYear ?? "").match(
    new RegExp(`^REQ-${year}-(\\d+)$`, "i")
  );
  if (match) {
    const n = parseInt(match[1]!, 10);
    if (Number.isFinite(n)) max = n;
  }
  return `REQ-${year}-${String(max + 1).padStart(6, "0")}`;
}

export function paginateRequestRows<T>(
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

export type CreateRequestInputLike = CreateRequestInput;
