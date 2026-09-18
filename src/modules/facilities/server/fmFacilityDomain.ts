import type {
  CreateFacilityInput,
  Facility,
  FacilityListParams,
  FacilityStatus,
  FacilityType,
  UpdateFacilityInput,
} from "@/modules/facilities/types";
import { FACILITY_STATUSES, FACILITY_TYPES } from "@/modules/facilities/constants";
import type { PaginatedResult } from "@/types";

export const FM_FACILITY_MODULE_SLUG = "facility_management" as const;

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class FmFacilityValidationError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = "FmFacilityValidationError";
  }
}

export class FmFacilityNotFoundError extends Error {
  readonly status = 404;
  constructor(message = "Facility not found.") {
    super(message);
    this.name = "FmFacilityNotFoundError";
  }
}

export class FmFacilityUnavailableError extends Error {
  readonly status = 503;
  constructor(message = "Facility storage is unavailable.") {
    super(message);
    this.name = "FmFacilityUnavailableError";
  }
}

export type FmFacilityRow = {
  id: string;
  organisation_id: string;
  code: string;
  name: string;
  status: string;
  facility_type: string | null;
  location_text: string | null;
  size_sqm: number | string | null;
  description: string | null;
  created_by_profile_id: string | null;
  updated_by_profile_id: string | null;
  created_at: string;
  updated_at: string;
};

export function isFacilityStatus(value: string): value is FacilityStatus {
  return (FACILITY_STATUSES as readonly string[]).includes(value);
}

export function isFacilityType(value: string): value is FacilityType {
  return (FACILITY_TYPES as readonly string[]).includes(value);
}

/**
 * Compatibility mapping: clean DB row → current Facility API shape.
 * manager is not stored (future assignment). Empty string preserves UI contract.
 */
export function mapFmFacilityRowToApi(row: FmFacilityRow): Facility {
  const type = row.facility_type && isFacilityType(row.facility_type)
    ? row.facility_type
    : "office";
  const status = isFacilityStatus(row.status) ? row.status : "pending";
  return {
    id: row.id,
    name: row.name,
    code: row.code || row.id,
    location: row.location_text ?? "",
    type,
    manager: "",
    status,
    description: row.description ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function paginateRows<T>(
  rows: T[],
  page: number,
  pageSize: number
): PaginatedResult<T> {
  const safePage = page < 1 ? 1 : page;
  const safeSize = pageSize < 1 ? 8 : pageSize;
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / safeSize));
  const start = (safePage - 1) * safeSize;
  return {
    data: rows.slice(start, start + safeSize),
    page: safePage,
    pageSize: safeSize,
    total,
    totalPages,
  };
}

export function parseFacilityListParams(payload: unknown): FacilityListParams {
  const raw =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  const page = Number(raw.page ?? 1);
  const pageSize = Number(raw.pageSize ?? 8);
  const search = raw.search != null ? String(raw.search) : "";
  const status = raw.status != null ? String(raw.status) : "all";
  const type = raw.type != null ? String(raw.type) : "all";
  const location = raw.location != null ? String(raw.location) : "all";
  return {
    page: Number.isFinite(page) ? page : 1,
    pageSize: Number.isFinite(pageSize) ? pageSize : 8,
    search,
    status: status === "all" || isFacilityStatus(status) ? status : "all",
    type: type === "all" || isFacilityType(type) ? type : "all",
    location,
  };
}

export function filterFacilityRows(
  rows: Facility[],
  params: FacilityListParams
): Facility[] {
  const search = String(params.search ?? "")
    .toLowerCase()
    .trim();
  const status = params.status;
  const type = params.type;
  const location = params.location;

  return rows.filter((row) => {
    const matchesSearch =
      !search ||
      row.name.toLowerCase().includes(search) ||
      row.code.toLowerCase().includes(search) ||
      row.location.toLowerCase().includes(search) ||
      row.manager.toLowerCase().includes(search);

    const matchesStatus =
      !status || status === "all" || row.status === status;
    const matchesType = !type || type === "all" || row.type === type;
    const matchesLocation =
      !location || location === "all" || row.location === location;

    return matchesSearch && matchesStatus && matchesType && matchesLocation;
  });
}

export function generateNextFacilityCode(existingCodes: string[]): string {
  let max = 0;
  for (const code of existingCodes) {
    const match = String(code || "").match(/FAC-(\d+)/i);
    if (!match) continue;
    const n = parseInt(match[1]!, 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  const next = max + 1;
  return `FAC-${String(next).padStart(4, "0")}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new FmFacilityValidationError("Facility payload is required.");
  }
  return value as Record<string, unknown>;
}

function optionalTrimmed(value: unknown): string | undefined {
  if (value == null) return undefined;
  return String(value).trim();
}

export function parseCreateFacilityInput(
  payload: unknown
): CreateFacilityInput {
  const raw = asRecord(payload);
  const name = optionalTrimmed(raw.name);
  if (!name) throw new FmFacilityValidationError("Facility name is required.");

  const location = optionalTrimmed(raw.location) ?? "";
  if (!location) {
    throw new FmFacilityValidationError("Location is required.");
  }

  const typeRaw = optionalTrimmed(raw.type) ?? "office";
  const type = typeRaw.toLowerCase().replace(/\s+/g, "_");
  if (!isFacilityType(type)) {
    throw new FmFacilityValidationError("Facility type is invalid.");
  }

  const statusRaw = optionalTrimmed(raw.status) ?? "pending";
  const status = statusRaw.toLowerCase().replace(/\s+/g, "_");
  if (!isFacilityStatus(status)) {
    throw new FmFacilityValidationError("Facility status is invalid.");
  }

  const code = optionalTrimmed(raw.code);
  const description = optionalTrimmed(raw.description);

  return {
    name,
    ...(code ? { code } : {}),
    location,
    type,
    manager: optionalTrimmed(raw.manager) ?? "",
    status,
    ...(description ? { description } : {}),
  };
}

export function parseUpdateFacilityInput(
  payload: unknown
): { id: string } & UpdateFacilityInput {
  const raw = asRecord(payload);
  const id = optionalTrimmed(raw.id);
  if (!id) throw new FmFacilityValidationError("Facility id is required.");

  const next: { id: string } & UpdateFacilityInput = { id };
  if (raw.name !== undefined) {
    const name = optionalTrimmed(raw.name);
    if (!name) throw new FmFacilityValidationError("Facility name is required.");
    next.name = name;
  }
  if (raw.location !== undefined) {
    const location = optionalTrimmed(raw.location);
    if (!location) {
      throw new FmFacilityValidationError("Location is required.");
    }
    next.location = location;
  }
  if (raw.type !== undefined) {
    const type = String(raw.type)
      .toLowerCase()
      .replace(/\s+/g, "_");
    if (!isFacilityType(type)) {
      throw new FmFacilityValidationError("Facility type is invalid.");
    }
    next.type = type;
  }
  if (raw.status !== undefined) {
    const status = String(raw.status)
      .toLowerCase()
      .replace(/\s+/g, "_");
    if (!isFacilityStatus(status)) {
      throw new FmFacilityValidationError("Facility status is invalid.");
    }
    next.status = status;
  }
  if (raw.description !== undefined) {
    next.description = optionalTrimmed(raw.description) || undefined;
  }
  if (raw.manager !== undefined) {
    next.manager = optionalTrimmed(raw.manager) ?? "";
  }
  return next;
}

export function parseFacilityIdPayload(payload: unknown): string {
  const raw = asRecord(payload);
  const id = optionalTrimmed(raw.id);
  if (!id) throw new FmFacilityValidationError("Facility id is required.");
  return id;
}
