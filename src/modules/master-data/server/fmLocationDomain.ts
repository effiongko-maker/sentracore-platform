import type { PaginatedResult } from "@/types";
import type {
  CreateMasterDataInput,
  LocationCatalog,
  LocationCatalogItem,
  MasterDataItem,
  MasterDataListParams,
  MasterDataStatus,
  UpdateMasterDataInput,
} from "@/modules/master-data/types";

export const LOCATION_MASTER_DATA_ENTITIES = [
  "departments",
  "buildings",
  "floors",
  "rooms",
] as const;

export type LocationMasterDataEntity =
  (typeof LOCATION_MASTER_DATA_ENTITIES)[number];

export const LOCATION_CODE_PREFIX: Record<LocationMasterDataEntity, string> = {
  departments: "DEP",
  buildings: "BLD",
  floors: "FLR",
  rooms: "RM",
};

export const LOCATION_TABLE: Record<LocationMasterDataEntity, string> = {
  departments: "fm_departments",
  buildings: "fm_buildings",
  floors: "fm_floors",
  rooms: "fm_rooms",
};

const MASTER_DATA_STATUSES: readonly MasterDataStatus[] = [
  "active",
  "inactive",
  "pending",
];

export class FmLocationValidationError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = "FmLocationValidationError";
  }
}

export class FmLocationNotFoundError extends Error {
  readonly status = 404;
  constructor(message = "Location record not found.") {
    super(message);
    this.name = "FmLocationNotFoundError";
  }
}

export class FmLocationUnavailableError extends Error {
  readonly status = 503;
  constructor(message = "Location storage is unavailable.") {
    super(message);
    this.name = "FmLocationUnavailableError";
  }
}

export type FmLocationRow = {
  id: string;
  organisation_id: string;
  facility_id: string;
  building_id: string | null;
  floor_id: string | null;
  name: string;
  code: string | null;
  status: string;
  description: string | null;
  level: string | null;
  created_at: string;
  updated_at: string;
};

export function isLocationMasterDataEntity(
  value: string
): value is LocationMasterDataEntity {
  return (LOCATION_MASTER_DATA_ENTITIES as readonly string[]).includes(value);
}

export function isMasterDataStatus(value: string): value is MasterDataStatus {
  return (MASTER_DATA_STATUSES as readonly string[]).includes(value);
}

export function mapLocationStatus(value: string): MasterDataStatus {
  const normalized = String(value ?? "active")
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (isMasterDataStatus(normalized)) return normalized;
  if (normalized === "suspended") return "inactive";
  return "pending";
}

export function isCatalogVisibleStatus(status: string): boolean {
  const mapped = mapLocationStatus(status);
  return mapped === "active" || mapped === "pending";
}

/**
 * Compatibility mapping: clean DB row → current MasterDataItem API shape.
 * Includes facility/building/floor aliases so remaining Sheet-era readers
 * still resolve parents without a permanent alias table.
 */
export function mapFmLocationRowToApi(
  entity: LocationMasterDataEntity,
  row: FmLocationRow
): MasterDataItem {
  const facilityId = row.facility_id;
  const buildingId = row.building_id ?? undefined;
  const floorId = row.floor_id ?? undefined;
  const description = row.description?.trim() || undefined;
  const level =
    entity === "floors" ? row.level?.trim() || undefined : undefined;
  const code = row.code?.trim() || row.id;
  const item: MasterDataItem = {
    id: row.id,
    name: row.name,
    code,
    status: mapLocationStatus(row.status),
    description,
    facilityId,
    buildingId,
    floorId,
    level,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  return item;
}

export function mapFmLocationRowToCatalogItem(
  entity: LocationMasterDataEntity,
  row: FmLocationRow
): LocationCatalogItem {
  return {
    id: row.id,
    name: row.name,
    facilityId: row.facility_id,
    buildingId: entity === "floors" || entity === "rooms"
      ? row.building_id ?? undefined
      : undefined,
    floorId: entity === "rooms" ? row.floor_id ?? undefined : undefined,
  };
}

export function emptyLocationCatalog(): LocationCatalog {
  return {
    facilities: [],
    buildings: [],
    floors: [],
    rooms: [],
  };
}

export function paginateLocationRows<T>(
  rows: T[],
  page: number,
  pageSize: number
): PaginatedResult<T> {
  const safePage = page < 1 ? 1 : page;
  const safeSize = pageSize < 1 ? 10 : pageSize;
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

export function generateNextLocationCode(
  prefix: string,
  existingCodes: string[]
): string {
  const re = new RegExp(`^${prefix}-(\\d+)$`, "i");
  let max = 0;
  for (const code of existingCodes) {
    const match = String(code || "").match(re);
    if (!match) continue;
    const n = parseInt(match[1]!, 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}-${String(max + 1).padStart(4, "0")}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new FmLocationValidationError("Master-data payload is required.");
  }
  return value as Record<string, unknown>;
}

function optionalTrimmed(value: unknown): string | undefined {
  if (value == null) return undefined;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : undefined;
}

function pickAlias(
  raw: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = optionalTrimmed(raw[key]);
    if (value) return value;
  }
  return undefined;
}

export function parseLocationEntity(payload: unknown): LocationMasterDataEntity {
  const raw = asRecord(payload);
  const entity = optionalTrimmed(raw.entity)?.toLowerCase();
  if (!entity) {
    throw new FmLocationValidationError("Master-data entity is required.");
  }
  if (entity === "vendors") {
    throw new FmLocationValidationError(
      "Vendors are served by the FM Vendor service, not the location service."
    );
  }
  if (!isLocationMasterDataEntity(entity)) {
    throw new FmLocationValidationError(
      `Unknown master-data entity: ${entity}`
    );
  }
  return entity;
}

function parseStatus(value: unknown, fallback: MasterDataStatus): MasterDataStatus {
  const raw = optionalTrimmed(value);
  if (!raw) return fallback;
  const normalized = raw.toLowerCase().replace(/\s+/g, "_");
  if (!isMasterDataStatus(normalized)) {
    throw new FmLocationValidationError("Status is invalid.");
  }
  return normalized;
}

export function parseLocationListParams(payload: unknown): MasterDataListParams {
  const raw =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  const entity = parseLocationEntity(raw);
  const page = Number(raw.page ?? 1);
  const pageSize = Number(raw.pageSize ?? 10);
  return {
    entity,
    page: Number.isFinite(page) ? page : 1,
    pageSize: Number.isFinite(pageSize) ? pageSize : 10,
    search: raw.search != null ? String(raw.search) : "",
    status:
      raw.status != null && String(raw.status).trim() !== ""
        ? (String(raw.status) as MasterDataStatus | "all")
        : "all",
    facilityId:
      raw.facilityId != null && String(raw.facilityId).trim() !== ""
        ? (String(raw.facilityId) as string | "all")
        : "all",
    buildingId:
      raw.buildingId != null && String(raw.buildingId).trim() !== ""
        ? (String(raw.buildingId) as string | "all")
        : "all",
    floorId:
      raw.floorId != null && String(raw.floorId).trim() !== ""
        ? (String(raw.floorId) as string | "all")
        : "all",
  };
}

export function filterLocationItems(
  items: MasterDataItem[],
  params: MasterDataListParams
): MasterDataItem[] {
  const search = String(params.search ?? "")
    .toLowerCase()
    .trim();
  const status =
    params.status && params.status !== "all"
      ? String(params.status).toLowerCase()
      : undefined;
  const facilityId =
    params.facilityId && params.facilityId !== "all"
      ? params.facilityId.trim()
      : undefined;
  const buildingId =
    params.buildingId && params.buildingId !== "all"
      ? params.buildingId.trim()
      : undefined;
  const floorId =
    params.floorId && params.floorId !== "all"
      ? params.floorId.trim()
      : undefined;

  return items.filter((item) => {
    if (status && String(item.status).toLowerCase() !== status) return false;
    if (facilityId && item.facilityId !== facilityId) return false;
    if (buildingId && item.buildingId !== buildingId) return false;
    if (floorId && item.floorId !== floorId) return false;
    if (search) {
      const haystack = [item.name, item.code, item.description, item.level, item.id]
        .map((value) => String(value ?? "").toLowerCase())
        .join(" ");
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

export function parseCreateLocationInput(
  payload: unknown
): CreateMasterDataInput {
  const raw = asRecord(payload);
  const entity = parseLocationEntity(raw);
  const name = optionalTrimmed(raw.name);
  if (!name) {
    throw new FmLocationValidationError("Name is required.");
  }

  const facilityId = pickAlias(raw, "facilityId", "facility");
  const buildingId = pickAlias(raw, "buildingId", "building");
  const floorId = pickAlias(raw, "floorId", "floor");

  if (entity === "departments" || entity === "buildings") {
    if (!facilityId) {
      throw new FmLocationValidationError("Facility is required.");
    }
  }
  if (entity === "floors") {
    if (!buildingId) {
      throw new FmLocationValidationError("Building is required.");
    }
  }
  if (entity === "rooms") {
    if (!floorId) {
      throw new FmLocationValidationError("Floor is required.");
    }
  }

  return {
    entity,
    name,
    code: optionalTrimmed(raw.code),
    status: parseStatus(raw.status, "active"),
    description: optionalTrimmed(raw.description),
    facilityId,
    buildingId,
    floorId,
    level: entity === "floors" ? optionalTrimmed(raw.level) : undefined,
  };
}

export function parseUpdateLocationInput(
  payload: unknown
): UpdateMasterDataInput {
  const raw = asRecord(payload);
  const entity = parseLocationEntity(raw);
  const id = optionalTrimmed(raw.id);
  if (!id) {
    throw new FmLocationValidationError("Id is required.");
  }

  const name = optionalTrimmed(raw.name);
  const patch: UpdateMasterDataInput = {
    entity,
    id,
  };
  if (name !== undefined) patch.name = name;
  if ("status" in raw) patch.status = parseStatus(raw.status, "active");
  if ("description" in raw) {
    patch.description = optionalTrimmed(raw.description) ?? "";
  }
  if ("facilityId" in raw || "facility" in raw) {
    patch.facilityId = pickAlias(raw, "facilityId", "facility");
  }
  if ("buildingId" in raw || "building" in raw) {
    patch.buildingId = pickAlias(raw, "buildingId", "building");
  }
  if ("floorId" in raw || "floor" in raw) {
    patch.floorId = pickAlias(raw, "floorId", "floor");
  }
  if (entity === "floors" && "level" in raw) {
    patch.level = optionalTrimmed(raw.level) ?? "";
  }
  return patch;
}

export function parseLocationIdPayload(payload: unknown): {
  entity: LocationMasterDataEntity;
  id: string;
} {
  const raw = asRecord(payload);
  const entity = parseLocationEntity(raw);
  const id = optionalTrimmed(raw.id);
  if (!id) {
    throw new FmLocationValidationError("Master-data id is required.");
  }
  return { entity, id };
}
