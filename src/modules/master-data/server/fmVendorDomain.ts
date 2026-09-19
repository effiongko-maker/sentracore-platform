import type { PaginatedResult } from "@/types";
import { VENDOR_CATEGORIES } from "@/modules/master-data/constants";
import type { MasterDataItem, MasterDataStatus } from "@/modules/master-data/types";

// Domain helpers are imported by verify scripts — do not add "server-only" here.

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const VENDOR_STATUS_VALUES: MasterDataStatus[] = ["active", "pending", "inactive"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class FmVendorValidationError extends Error {
  readonly errorClass = "validation" as const;
  constructor(message: string) {
    super(message);
    this.name = "FmVendorValidationError";
  }
}
export class FmVendorNotFoundError extends Error {
  readonly errorClass = "validation" as const;
  constructor(message: string) {
    super(message);
    this.name = "FmVendorNotFoundError";
  }
}
export class FmVendorUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FmVendorUnavailableError";
  }
}

function asRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
}
function optionalTrimmed(value: unknown): string | undefined {
  if (value == null) return undefined;
  const text = String(value).trim();
  return text ? text : undefined;
}
/** undefined = not supplied; "" / null = clear. */
function nullableText(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return optionalTrimmed(value) ?? null;
}
export function sanitizeSearchTerm(value: string): string {
  return value.replace(/[,()%_*\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}
export function paginateRows<T>(rows: T[], total: number, page: number, pageSize: number): PaginatedResult<T> {
  return { data: rows, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** True when a master-data payload targets the vendors entity. */
export function isVendorPayload(payload: unknown): boolean {
  return optionalTrimmed(asRecord(payload).entity)?.toLowerCase() === "vendors";
}

function parseCategory(value: unknown): string | null | undefined {
  const raw = nullableText(value);
  if (raw === undefined || raw === null) return raw;
  const match = VENDOR_CATEGORIES.find((c) => c.toLowerCase() === raw.toLowerCase());
  if (!match) throw new FmVendorValidationError(`Invalid vendor category: ${raw}`);
  return match;
}
function parseStatus(value: unknown): MasterDataStatus | undefined {
  const raw = optionalTrimmed(value);
  if (!raw) return undefined;
  const token = raw.toLowerCase().replace(/\s+/g, "_") as MasterDataStatus;
  if (!VENDOR_STATUS_VALUES.includes(token)) throw new FmVendorValidationError(`Invalid vendor status: ${raw}`);
  return token;
}
function parseEmail(value: unknown): string | null | undefined {
  const email = nullableText(value);
  if (email && !EMAIL_RE.test(email)) throw new FmVendorValidationError("Enter a valid email address.");
  return email;
}

export type FmVendorRow = {
  id: string;
  organisation_id: string;
  name: string;
  code: string | null;
  category: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  description: string | null;
  status: string;
  created_by_profile_id: string | null;
  updated_by_profile_id: string | null;
  created_at: string;
  updated_at: string;
};

export const FM_VENDOR_SELECT =
  "id, organisation_id, name, code, category, contact_name, email, phone, description, status, created_by_profile_id, updated_by_profile_id, created_at, updated_at";

/** Row → the master-data contract. `id` is the UUID; `code` is an optional user reference. */
export function mapFmVendorRow(row: FmVendorRow): MasterDataItem {
  return {
    id: row.id,
    name: row.name,
    code: row.code ?? "",
    status: row.status as MasterDataStatus,
    description: row.description ?? undefined,
    category: row.category ?? undefined,
    contactName: row.contact_name ?? undefined,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type VendorFields = {
  name?: string;
  code?: string | null;
  category?: string | null;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  description?: string | null;
  status?: MasterDataStatus;
};
export type ParsedCreateVendor = VendorFields & { name: string };
export type ParsedUpdateVendor = VendorFields & { id: string };

function parseFields(raw: Record<string, unknown>): VendorFields {
  const out: VendorFields = {};
  if (raw.name !== undefined) {
    const name = optionalTrimmed(raw.name);
    if (!name) throw new FmVendorValidationError("Vendor name is required.");
    out.name = name;
  }
  if (raw.code !== undefined) out.code = nullableText(raw.code);
  if (raw.category !== undefined) out.category = parseCategory(raw.category);
  if (raw.contactName !== undefined) out.contactName = nullableText(raw.contactName);
  if (raw.email !== undefined) out.email = parseEmail(raw.email);
  if (raw.phone !== undefined) out.phone = nullableText(raw.phone);
  if (raw.description !== undefined) out.description = nullableText(raw.description);
  if (raw.status !== undefined) out.status = parseStatus(raw.status);
  return out;
}

export function parseCreateVendorInput(payload: unknown): ParsedCreateVendor {
  const f = parseFields(asRecord(payload));
  if (!f.name) throw new FmVendorValidationError("Vendor name is required.");
  return { ...f, name: f.name, status: f.status ?? "active" };
}
export function parseUpdateVendorInput(payload: unknown): ParsedUpdateVendor {
  const raw = asRecord(payload);
  const id = optionalTrimmed(raw.id);
  if (!id) throw new FmVendorValidationError("Vendor id is required.");
  return { ...parseFields(raw), id };
}
export function parseVendorIdPayload(payload: unknown): string {
  const id = optionalTrimmed(asRecord(payload).id);
  if (!id) throw new FmVendorValidationError("Vendor id is required.");
  return id;
}

export type VendorListParams = { page: number; pageSize: number; search?: string; status?: MasterDataStatus; category?: string };
export function parseVendorListParams(payload: unknown): VendorListParams {
  const raw = asRecord(payload);
  const all = (v: unknown) => {
    const t = optionalTrimmed(v);
    return !t || t.toLowerCase() === "all" ? undefined : t;
  };
  const status = all(raw.status);
  const category = all(raw.category);
  return {
    page: Math.max(1, Number(raw.page ?? 1) || 1),
    pageSize: Math.min(500, Math.max(1, Number(raw.pageSize ?? 10) || 10)),
    search: optionalTrimmed(raw.search),
    status: status ? parseStatus(status) : undefined,
    category: category ? (parseCategory(category) ?? undefined) : undefined,
  };
}
