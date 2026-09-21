import type { PaginatedResult } from "@/types";
import type {
  Asset,
  AssetCategory,
  AssetCondition,
  AssetCriticality,
  AssetSort,
  AssetStatus,
} from "@/modules/assets/types";

// Domain helpers are imported by verify scripts — do not add "server-only" here.

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ASSET_CATEGORY_VALUES: AssetCategory[] = ["hvac", "power", "electrical", "mechanical", "vertical_transport", "fire_safety", "it", "other"];
export const ASSET_CONDITION_VALUES: AssetCondition[] = ["excellent", "good", "fair", "poor", "unknown"];
export const ASSET_STATUS_VALUES: AssetStatus[] = ["active", "inactive", "pending", "suspended"];
export const ASSET_CRITICALITY_VALUES: AssetCriticality[] = ["unassessed", "low", "medium", "high", "critical"];
export const ASSET_SORT_VALUES: AssetSort[] = ["newest", "oldest", "name_asc", "name_desc"];

export class FmAssetValidationError extends Error {
  readonly errorClass = "validation" as const;
  constructor(message: string) {
    super(message);
    this.name = "FmAssetValidationError";
  }
}
export class FmAssetNotFoundError extends Error {
  readonly errorClass = "validation" as const;
  constructor(message: string) {
    super(message);
    this.name = "FmAssetNotFoundError";
  }
}
export class FmAssetUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FmAssetUnavailableError";
  }
}

// ---------------------------------------------------------------- primitives

function optionalTrimmed(value: unknown): string | undefined {
  if (value == null) return undefined;
  const text = String(value).trim();
  return text ? text : undefined;
}
function asRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
}
function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}
function parseEnum<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  const raw = optionalTrimmed(value);
  if (!raw) throw new FmAssetValidationError(`${label} is required.`);
  const token = normalizeToken(raw) as T;
  if (!allowed.includes(token)) throw new FmAssetValidationError(`Invalid ${label}: ${raw}`);
  return token;
}
/** undefined = not supplied; "" / null = clear. */
function nullableText(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return optionalTrimmed(value) ?? null;
}
function nullableDate(value: unknown, label: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || optionalTrimmed(value) === undefined) return null;
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    if (Number.isNaN(Date.parse(`${raw}T00:00:00Z`))) throw new FmAssetValidationError(`${label} is invalid.`);
    return raw;
  }
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) throw new FmAssetValidationError(`${label} is invalid.`);
  return new Date(ms).toISOString().slice(0, 10);
}
export function sanitizeSearchTerm(value: string): string {
  return value.replace(/[,()%_*\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}
export function paginateRows<T>(rows: T[], total: number, page: number, pageSize: number): PaginatedResult<T> {
  return { data: rows, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export function generateNextAssetCode(latest: string | null | undefined, now = new Date()): string {
  const year = now.getUTCFullYear();
  const match = String(latest ?? "").match(new RegExp(`^AST-${year}-(\\d+)$`, "i"));
  const next = match ? parseInt(match[1], 10) + 1 : 1;
  return `AST-${year}-${String(next).padStart(6, "0")}`;
}

// ------------------------------------------------------------------- rows

export type FmAssetRow = {
  id: string;
  organisation_id: string;
  code: string;
  facility_id: string;
  name: string;
  category: string;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  install_date: string | null;
  warranty_expiry: string | null;
  oem_id: string | null;
  condition: string;
  status: string;
  criticality: string;
  assigned_to_profile_id: string | null;
  created_by_profile_id: string | null;
  updated_by_profile_id: string | null;
  created_at: string;
  updated_at: string;
};

export const FM_ASSET_SELECT =
  "id, organisation_id, code, facility_id, name, category, manufacturer, model, serial_number, install_date, warranty_expiry, oem_id, condition, status, criticality, assigned_to_profile_id, created_by_profile_id, updated_by_profile_id, created_at, updated_at";

export type AssetRelations = { facilityName?: string; assignedToName?: string };

/** Row → the Asset contract. `id` is the UUID; `code` is display only. */
export function mapFmAssetRow(row: FmAssetRow, relations: AssetRelations = {}, recordOrigin: "operational" | "migrated_historical" = "operational"): Asset {
  return {
    id: row.id,
    code: row.code,
    facilityId: row.facility_id,
    facility: relations.facilityName ?? "",
    name: row.name,
    category: row.category as AssetCategory,
    manufacturer: row.manufacturer ?? "",
    model: row.model ?? "",
    serialNumber: row.serial_number ?? "",
    installDate: row.install_date ?? "",
    warrantyExpiry: row.warranty_expiry ?? "",
    oemId: row.oem_id ?? "",
    condition: row.condition as AssetCondition,
    status: row.status as AssetStatus,
    assignedToUserId: row.assigned_to_profile_id ?? "",
    assignedTo: relations.assignedToName ?? "",
    criticality: row.criticality as AssetCriticality,
    recordOrigin,
  };
}

// ---------------------------------------------------------------- inputs

export type AssetFields = {
  facilityRef?: string;
  name?: string;
  category?: AssetCategory;
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  installDate?: string | null;
  warrantyExpiry?: string | null;
  oemId?: string | null;
  condition?: AssetCondition;
  status?: AssetStatus;
  criticality?: AssetCriticality;
  /** Profile UUID, or null to clear. */
  assignedToUserId?: string | null;
};
export type ParsedCreateAsset = AssetFields & { name: string; facilityRef: string };
export type ParsedUpdateAsset = AssetFields & { id: string };

function parseFields(raw: Record<string, unknown>): AssetFields {
  const out: AssetFields = {};
  if (raw.facilityId !== undefined) {
    const ref = optionalTrimmed(raw.facilityId);
    if (ref) out.facilityRef = ref;
  }
  if (raw.name !== undefined) {
    const name = optionalTrimmed(raw.name);
    if (!name) throw new FmAssetValidationError("Asset name is required.");
    out.name = name;
  }
  if (raw.category !== undefined) out.category = parseEnum(raw.category, ASSET_CATEGORY_VALUES, "category");
  if (raw.condition !== undefined) out.condition = parseEnum(raw.condition, ASSET_CONDITION_VALUES, "condition");
  if (raw.status !== undefined) out.status = parseEnum(raw.status, ASSET_STATUS_VALUES, "status");
  if (raw.criticality !== undefined) out.criticality = parseEnum(raw.criticality, ASSET_CRITICALITY_VALUES, "criticality");
  if (raw.manufacturer !== undefined) out.manufacturer = nullableText(raw.manufacturer);
  if (raw.model !== undefined) out.model = nullableText(raw.model);
  if (raw.serialNumber !== undefined) out.serialNumber = nullableText(raw.serialNumber);
  if (raw.oemId !== undefined) out.oemId = nullableText(raw.oemId);
  if (raw.installDate !== undefined) out.installDate = nullableDate(raw.installDate, "Install date");
  if (raw.warrantyExpiry !== undefined) out.warrantyExpiry = nullableDate(raw.warrantyExpiry, "Warranty expiry");
  if (raw.assignedToUserId !== undefined) {
    const id = raw.assignedToUserId === null ? undefined : optionalTrimmed(raw.assignedToUserId);
    if (id && !UUID_RE.test(id)) throw new FmAssetValidationError("Assigned person must be a profile UUID.");
    out.assignedToUserId = id ?? null;
  }
  // The Sheet's free-text assignedTo / facility NAME are NOT accepted as identity.
  return out;
}

export function parseCreateAssetInput(payload: unknown): ParsedCreateAsset {
  const f = parseFields(asRecord(payload));
  if (!f.name) throw new FmAssetValidationError("Asset name is required.");
  if (!f.facilityRef) throw new FmAssetValidationError("Facility is required.");
  return { ...f, name: f.name, facilityRef: f.facilityRef };
}
export function parseUpdateAssetInput(payload: unknown): ParsedUpdateAsset {
  const raw = asRecord(payload);
  const id = optionalTrimmed(raw.id);
  if (!id) throw new FmAssetValidationError("Asset id is required.");
  return { ...parseFields(raw), id };
}
export function parseAssetIdPayload(payload: unknown): string {
  const id = optionalTrimmed(asRecord(payload).id);
  if (!id) throw new FmAssetValidationError("Asset id is required.");
  return id;
}

export type AssetListParams = {
  page: number;
  pageSize: number;
  search?: string;
  status?: AssetStatus;
  category?: AssetCategory;
  criticality?: AssetCriticality;
  facilityId?: string;
  sort: AssetSort;
};
export function parseAssetListParams(payload: unknown): AssetListParams {
  const raw = asRecord(payload);
  const all = (v: unknown) => {
    const t = optionalTrimmed(v);
    return !t || t.toLowerCase() === "all" ? undefined : t;
  };
  const sortRaw = optionalTrimmed(raw.sort);
  const sort = sortRaw && (ASSET_SORT_VALUES as string[]).includes(sortRaw) ? (sortRaw as AssetSort) : "newest";
  const status = all(raw.status);
  const category = all(raw.category);
  const criticality = all(raw.criticality);
  return {
    page: Math.max(1, Number(raw.page ?? 1) || 1),
    pageSize: Math.min(500, Math.max(1, Number(raw.pageSize ?? 8) || 8)),
    search: optionalTrimmed(raw.search),
    status: status ? parseEnum(status, ASSET_STATUS_VALUES, "status") : undefined,
    category: category ? parseEnum(category, ASSET_CATEGORY_VALUES, "category") : undefined,
    criticality: criticality ? parseEnum(criticality, ASSET_CRITICALITY_VALUES, "criticality") : undefined,
    facilityId: all(raw.facilityId),
    sort,
  };
}

/** Workload/lookup inputs are UUIDs only — a display code is not a relationship key. */
export function uuidsOnly(values: readonly string[]): string[] {
  return [...new Set(values.map((v) => String(v).trim()).filter((v) => UUID_RE.test(v)))];
}
