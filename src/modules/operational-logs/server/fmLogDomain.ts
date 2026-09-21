import type { PaginatedResult } from "@/types";

// Pure domain helpers — imported by verify scripts, so no "server-only" here.
//
// The seven FM logs are SEPARATE domains that share transport mechanics. This
// file holds the shared mechanics (errors, parsing primitives, paging, code
// allocation) plus one explicit spec per domain describing ITS fields.

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type FmLogResource =
  | "generator-log"
  | "energy-reading"
  | "diesel-usage"
  | "waste-log"
  | "fumigation-log"
  | "deep-cleaning-log"
  | "consumables-update";

export const FM_LOG_RESOURCES: readonly FmLogResource[] = [
  "generator-log",
  "energy-reading",
  "diesel-usage",
  "waste-log",
  "fumigation-log",
  "deep-cleaning-log",
  "consumables-update",
];

export class FmLogValidationError extends Error {
  readonly errorClass = "validation" as const;
  constructor(message: string) {
    super(message);
    this.name = "FmLogValidationError";
  }
}
export class FmLogNotFoundError extends Error {
  readonly errorClass = "validation" as const;
  constructor(message: string) {
    super(message);
    this.name = "FmLogNotFoundError";
  }
}
export class FmLogUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FmLogUnavailableError";
  }
}

// ----------------------------------------------------------------- primitives

const asRecord = (payload: unknown): Record<string, unknown> => (payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {});
function text(value: unknown): string | undefined {
  if (value == null) return undefined;
  const t = String(value).trim();
  return t ? t : undefined;
}
function requiredText(raw: Record<string, unknown>, key: string, label: string): string {
  const v = text(raw[key]);
  if (!v) throw new FmLogValidationError(`${label} is required.`);
  return v;
}
/** Only validates when supplied (update). Blank is rejected for required fields. */
function optionalRequiredText(raw: Record<string, unknown>, key: string, label: string): string | undefined {
  if (raw[key] === undefined) return undefined;
  return requiredText(raw, key, label);
}
/** undefined = not supplied; blank/null = clear. */
function nullableText(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return text(value) ?? null;
}
function number(raw: Record<string, unknown>, key: string, label: string): number {
  const v = raw[key];
  if (v === undefined || v === null || String(v).trim() === "") throw new FmLogValidationError(`${label} is required.`);
  const n = Number(v);
  if (!Number.isFinite(n)) throw new FmLogValidationError(`${label} must be a number.`);
  return n;
}
function optionalNumber(raw: Record<string, unknown>, key: string, label: string): number | undefined {
  return raw[key] === undefined ? undefined : number(raw, key, label);
}
/** Optional numeric where blank means "not supplied / default". */
function looseNumber(raw: Record<string, unknown>, key: string, label: string): number | null | undefined {
  if (raw[key] === undefined) return undefined;
  if (raw[key] === null || String(raw[key]).trim() === "") return null;
  const n = Number(raw[key]);
  if (!Number.isFinite(n)) throw new FmLogValidationError(`${label} must be a number.`);
  return n;
}
export function normalizeDate(value: unknown, label: string): string {
  const raw = text(value);
  if (!raw) throw new FmLogValidationError(`${label} is required.`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    if (Number.isNaN(Date.parse(`${raw}T00:00:00Z`))) throw new FmLogValidationError(`${label} is invalid.`);
    return raw;
  }
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) throw new FmLogValidationError(`${label} is invalid.`);
  return new Date(ms).toISOString().slice(0, 10);
}
function isoInstant(value: unknown, label: string): string {
  const raw = text(value);
  if (!raw) throw new FmLogValidationError(`${label} is required.`);
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) throw new FmLogValidationError(`${label} is invalid.`);
  return new Date(ms).toISOString();
}
export function sanitizeSearchTerm(value: string): string {
  return value.replace(/[,()%_*\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}
export function paginateRows<T>(rows: T[], total: number, page: number, pageSize: number): PaginatedResult<T> {
  return { data: rows, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
export function generateNextLogCode(prefix: string, latest: string | null | undefined, now = new Date()): string {
  const year = now.getUTCFullYear();
  const match = String(latest ?? "").match(new RegExp(`^${prefix}-${year}-(\\d+)$`, "i"));
  const next = match ? parseInt(match[1], 10) + 1 : 1;
  return `${prefix}-${year}-${String(next).padStart(6, "0")}`;
}

// --------------------------------------------------------------------- specs

export type ParsedWrite = {
  /** Facility reference (UUID or code, accepted as INPUT only) — resolved in-tenant by the repository. */
  facilityRef?: string;
  columns: Record<string, unknown>;
  /** Consumables only: the item name, resolved to a per-facility item identity. */
  itemName?: string;
  /** Consumables only: reorder level explicitly supplied (undefined = carry forward). */
  reorderSupplied?: boolean;
};

export type ListExtras = { eq: Array<[string, string]>; nextDueFrom?: string; nextDueTo?: string; itemRef?: string; itemName?: string };

export type FmLogSpec = {
  resource: FmLogResource;
  label: string;
  table: string;
  prefix: string;
  /** True when the product scopes this log to a facility. Generator / Energy are organisation-level. */
  facility: boolean;
  select: string;
  searchColumns: string[];
  /** Extra sorts beyond newest / oldest / date_asc / date_desc. */
  extraSorts?: Record<string, { column: string; ascending: boolean }>;
  parseCreate(payload: unknown): ParsedWrite;
  parseUpdate(payload: unknown): { id: string } & ParsedWrite;
  parseExtras(raw: Record<string, unknown>): ListExtras;
  map(row: Record<string, unknown>, ctx?: { itemById?: Map<string, { code: string; name: string }>; migrated?: Set<string> }): Record<string, unknown>;
};

function updateId(raw: Record<string, unknown>, label: string): string {
  const id = text(raw.id);
  if (!id) throw new FmLogValidationError(`${label} id is required.`);
  return id;
}
function put(cols: Record<string, unknown>, key: string, value: unknown) {
  if (value !== undefined) cols[key] = value;
}
const s = (row: Record<string, unknown>, key: string) => String(row[key] ?? "");
const n = (row: Record<string, unknown>, key: string) => (row[key] == null ? 0 : Number(row[key]));
const optS = (row: Record<string, unknown>, key: string) => (row[key] != null && String(row[key]) !== "" ? String(row[key]) : undefined);
function base(row: Record<string, unknown>) {
  return {
    id: s(row, "code"),
    logUuid: s(row, "id"),
    createdAt: s(row, "created_at"),
    updatedAt: s(row, "updated_at"),
    createdByUserId: optS(row, "created_by_profile_id"),
    updatedByUserId: optS(row, "updated_by_profile_id"),
  };
}
const COMMON = "id, organisation_id, code, log_date, created_by_profile_id, updated_by_profile_id, created_at, updated_at";
const eq = (raw: Record<string, unknown>, ...pairs: Array<[string, string]>): ListExtras["eq"] =>
  pairs.flatMap(([key, col]) => {
    const v = text(raw[key]);
    return v && v.toLowerCase() !== "all" ? ([[col, v]] as Array<[string, string]>) : [];
  });

export const GENERATOR_SPEC: FmLogSpec = {
  resource: "generator-log", label: "Generator log", table: "fm_generator_logs", prefix: "GENLOG", facility: false,
  select: `${COMMON}, generator, started_at, ended_at, hours, fuel_used, remarks, log_basis, start_meter_reading, end_meter_reading, asset_id, record_origin`,
  searchColumns: ["generator", "remarks", "code"],
  parseCreate(p) {
    const r = asRecord(p);
    // Hours are always DERIVED from start/end — a supplied value is ignored.
    return { columns: { log_date: normalizeDate(r.date, "Date"), generator: requiredText(r, "generator", "Generator"), started_at: isoInstant(r.startedAt, "Start"), ended_at: isoInstant(r.endedAt, "End"), fuel_used: number(r, "fuelUsed", "Fuel used"), remarks: nullableText(r.remarks) ?? null } };
  },
  parseUpdate(p) {
    const r = asRecord(p);
    const c: Record<string, unknown> = {};
    if (r.date !== undefined) c.log_date = normalizeDate(r.date, "Date");
    put(c, "generator", optionalRequiredText(r, "generator", "Generator"));
    if (r.startedAt !== undefined) c.started_at = isoInstant(r.startedAt, "Start");
    if (r.endedAt !== undefined) c.ended_at = isoInstant(r.endedAt, "End");
    put(c, "fuel_used", optionalNumber(r, "fuelUsed", "Fuel used"));
    put(c, "remarks", nullableText(r.remarks));
    return { id: updateId(r, "Generator log"), columns: c };
  },
  parseExtras: (r) => ({ eq: eq(r, ["generator", "generator"]) }),
  // Unknown stays unknown: a historical hour-meter log has NO clock times, and a NULL fuel_used is "not
  // recorded" — it is never rendered as 0. Runtime (hours) is derived by the database from the basis.
  map: (row) => ({
    ...base(row),
    date: s(row, "log_date"),
    generator: s(row, "generator"),
    startedAt: optS(row, "started_at") ?? null,
    endedAt: optS(row, "ended_at") ?? null,
    hours: n(row, "hours"),
    fuelUsed: row.fuel_used == null ? null : Number(row.fuel_used),
    remarks: optS(row, "remarks"),
    logBasis: s(row, "log_basis") || "clock_times",
    startMeterReading: row.start_meter_reading == null ? null : Number(row.start_meter_reading),
    endMeterReading: row.end_meter_reading == null ? null : Number(row.end_meter_reading),
    assetId: optS(row, "asset_id") ?? null,
    recordOrigin: s(row, "record_origin") || "operational",
  }),
};

export const ENERGY_SPEC: FmLogSpec = {
  resource: "energy-reading", label: "Energy reading", table: "fm_energy_readings", prefix: "ENRG", facility: false,
  select: `${COMMON}, meter, reading, remarks`,
  searchColumns: ["meter", "remarks", "code"],
  parseCreate(p) {
    const r = asRecord(p);
    return { columns: { log_date: normalizeDate(r.date, "Date"), meter: requiredText(r, "meter", "Meter"), reading: number(r, "reading", "Reading"), remarks: nullableText(r.remarks) ?? null } };
  },
  parseUpdate(p) {
    const r = asRecord(p);
    const c: Record<string, unknown> = {};
    if (r.date !== undefined) c.log_date = normalizeDate(r.date, "Date");
    put(c, "meter", optionalRequiredText(r, "meter", "Meter"));
    put(c, "reading", optionalNumber(r, "reading", "Reading"));
    put(c, "remarks", nullableText(r.remarks));
    return { id: updateId(r, "Energy reading"), columns: c };
  },
  parseExtras: (r) => ({ eq: eq(r, ["meter", "meter"]) }),
  map: (row) => ({ ...base(row), date: s(row, "log_date"), meter: s(row, "meter"), reading: n(row, "reading"), remarks: optS(row, "remarks") }),
};

export const DIESEL_SPEC: FmLogSpec = {
  resource: "diesel-usage", label: "Diesel usage", table: "fm_diesel_usage", prefix: "DSLU", facility: true,
  select: `${COMMON}, facility_id, generator_ref, opening_level, added, closing_level, consumption`,
  searchColumns: ["generator_ref", "code"],
  parseCreate(p) {
    const r = asRecord(p);
    // Consumption is DERIVED (opening + added − closing); a supplied value is ignored.
    const added = looseNumber(r, "added", "Added");
    return { facilityRef: requiredText(r, "facilityId", "Facility"), columns: { log_date: normalizeDate(r.date, "Date"), generator_ref: requiredText(r, "generatorId", "Generator"), opening_level: number(r, "openingLevel", "Opening level"), added: added ?? 0, closing_level: number(r, "closingLevel", "Closing level") } };
  },
  parseUpdate(p) {
    const r = asRecord(p);
    const c: Record<string, unknown> = {};
    if (r.date !== undefined) c.log_date = normalizeDate(r.date, "Date");
    put(c, "generator_ref", optionalRequiredText(r, "generatorId", "Generator"));
    put(c, "opening_level", optionalNumber(r, "openingLevel", "Opening level"));
    const added = looseNumber(r, "added", "Added");
    if (added !== undefined) c.added = added ?? 0;
    put(c, "closing_level", optionalNumber(r, "closingLevel", "Closing level"));
    return { id: updateId(r, "Diesel usage"), facilityRef: optionalRequiredText(r, "facilityId", "Facility"), columns: c };
  },
  parseExtras: (r) => ({ eq: eq(r, ["generatorId", "generator_ref"]) }),
  // recordOrigin comes from the migration provenance ledger (the table has no origin column): a migrated row's
  // generator_ref is a SOURCE LABEL (the tank checklist), not a generator identity.
  map: (row, ctx) => ({ ...base(row), date: s(row, "log_date"), facilityId: s(row, "facility_id"), generatorId: s(row, "generator_ref"), openingLevel: n(row, "opening_level"), added: n(row, "added"), closingLevel: n(row, "closing_level"), consumption: n(row, "consumption"), recordOrigin: ctx?.migrated?.has(String(row.id)) ? "migrated_historical" : "operational" }),
};

export const WASTE_SPEC: FmLogSpec = {
  resource: "waste-log", label: "Waste log", table: "fm_waste_logs", prefix: "WLOG", facility: true,
  select: `${COMMON}, facility_id, waste_type, quantity, unit, disposal_method, remarks`,
  searchColumns: ["waste_type", "unit", "disposal_method", "remarks", "code"],
  parseCreate(p) {
    const r = asRecord(p);
    return { facilityRef: requiredText(r, "facilityId", "Facility"), columns: { log_date: normalizeDate(r.date, "Date"), waste_type: requiredText(r, "wasteType", "Waste type"), quantity: number(r, "quantity", "Quantity"), unit: requiredText(r, "unit", "Unit"), disposal_method: requiredText(r, "disposalMethod", "Disposal method"), remarks: nullableText(r.remarks) ?? null } };
  },
  parseUpdate(p) {
    const r = asRecord(p);
    const c: Record<string, unknown> = {};
    if (r.date !== undefined) c.log_date = normalizeDate(r.date, "Date");
    put(c, "waste_type", optionalRequiredText(r, "wasteType", "Waste type"));
    put(c, "quantity", optionalNumber(r, "quantity", "Quantity"));
    put(c, "unit", optionalRequiredText(r, "unit", "Unit"));
    put(c, "disposal_method", optionalRequiredText(r, "disposalMethod", "Disposal method"));
    put(c, "remarks", nullableText(r.remarks));
    return { id: updateId(r, "Waste log"), facilityRef: optionalRequiredText(r, "facilityId", "Facility"), columns: c };
  },
  parseExtras: (r) => ({ eq: eq(r, ["wasteType", "waste_type"]) }),
  map: (row) => ({ ...base(row), date: s(row, "log_date"), facilityId: s(row, "facility_id"), wasteType: s(row, "waste_type"), quantity: n(row, "quantity"), unit: s(row, "unit"), disposalMethod: s(row, "disposal_method"), remarks: optS(row, "remarks") }),
};

export const FUMIGATION_SPEC: FmLogSpec = {
  resource: "fumigation-log", label: "Fumigation log", table: "fm_fumigation_logs", prefix: "FLOG", facility: true,
  select: `${COMMON}, facility_id, area_treated, pest_type, vendor_name, next_due_date, remarks`,
  searchColumns: ["area_treated", "pest_type", "vendor_name", "remarks", "code"],
  extraSorts: { next_due_asc: { column: "next_due_date", ascending: true }, next_due_desc: { column: "next_due_date", ascending: false } },
  parseCreate(p) {
    const r = asRecord(p);
    // vendor is a free-text label — deliberately NOT resolved to fm_vendors.
    return { facilityRef: requiredText(r, "facilityId", "Facility"), columns: { log_date: normalizeDate(r.date, "Date"), area_treated: requiredText(r, "areaTreated", "Area treated"), pest_type: requiredText(r, "pestType", "Pest type"), vendor_name: requiredText(r, "vendor", "Vendor"), next_due_date: normalizeDate(r.nextDueDate, "Next due date"), remarks: nullableText(r.remarks) ?? null } };
  },
  parseUpdate(p) {
    const r = asRecord(p);
    const c: Record<string, unknown> = {};
    if (r.date !== undefined) c.log_date = normalizeDate(r.date, "Date");
    put(c, "area_treated", optionalRequiredText(r, "areaTreated", "Area treated"));
    put(c, "pest_type", optionalRequiredText(r, "pestType", "Pest type"));
    put(c, "vendor_name", optionalRequiredText(r, "vendor", "Vendor"));
    if (r.nextDueDate !== undefined) c.next_due_date = normalizeDate(r.nextDueDate, "Next due date");
    put(c, "remarks", nullableText(r.remarks));
    return { id: updateId(r, "Fumigation log"), facilityRef: optionalRequiredText(r, "facilityId", "Facility"), columns: c };
  },
  parseExtras(r) {
    const from = text(r.nextDueFrom);
    const to = text(r.nextDueTo);
    return { eq: [], nextDueFrom: from ? normalizeDate(from, "Next due from") : undefined, nextDueTo: to ? normalizeDate(to, "Next due to") : undefined };
  },
  map: (row) => ({ ...base(row), date: s(row, "log_date"), facilityId: s(row, "facility_id"), areaTreated: s(row, "area_treated"), pestType: s(row, "pest_type"), vendor: s(row, "vendor_name"), nextDueDate: s(row, "next_due_date"), remarks: optS(row, "remarks") }),
};

export const DEEP_CLEANING_SPEC: FmLogSpec = {
  resource: "deep-cleaning-log", label: "Deep cleaning log", table: "fm_deep_cleaning_logs", prefix: "DCLOG", facility: true,
  select: `${COMMON}, facility_id, area, vendor_team, status, remarks`,
  searchColumns: ["area", "vendor_team", "status", "remarks", "code"],
  parseCreate(p) {
    const r = asRecord(p);
    return { facilityRef: requiredText(r, "facilityId", "Facility"), columns: { log_date: normalizeDate(r.date, "Date"), area: requiredText(r, "area", "Area"), vendor_team: requiredText(r, "vendorTeam", "Vendor/Team"), status: requiredText(r, "status", "Status"), remarks: nullableText(r.remarks) ?? null } };
  },
  parseUpdate(p) {
    const r = asRecord(p);
    const c: Record<string, unknown> = {};
    if (r.date !== undefined) c.log_date = normalizeDate(r.date, "Date");
    put(c, "area", optionalRequiredText(r, "area", "Area"));
    put(c, "vendor_team", optionalRequiredText(r, "vendorTeam", "Vendor/Team"));
    put(c, "status", optionalRequiredText(r, "status", "Status"));
    put(c, "remarks", nullableText(r.remarks));
    return { id: updateId(r, "Deep cleaning log"), facilityRef: optionalRequiredText(r, "facilityId", "Facility"), columns: c };
  },
  parseExtras: () => ({ eq: [] }),
  map: (row) => ({ ...base(row), date: s(row, "log_date"), facilityId: s(row, "facility_id"), area: s(row, "area"), vendorTeam: s(row, "vendor_team"), status: s(row, "status"), remarks: optS(row, "remarks") }),
};

export const CONSUMABLES_SPEC: FmLogSpec = {
  resource: "consumables-update", label: "Consumables update", table: "fm_consumables_updates", prefix: "CNUP", facility: true,
  select: `${COMMON}, facility_id, item_id, opening, received, issued, closing, reorder_level`,
  searchColumns: ["code"],
  parseCreate(p) {
    const r = asRecord(p);
    const received = looseNumber(r, "received", "Received");
    const reorder = looseNumber(r, "reorderLevel", "Reorder level");
    // Closing is DERIVED (opening + received − issued); a supplied value is ignored.
    return {
      facilityRef: requiredText(r, "facilityId", "Facility"),
      itemName: requiredText(r, "itemName", "Item name"),
      reorderSupplied: reorder !== undefined && reorder !== null,
      columns: { log_date: normalizeDate(r.date, "Date"), opening: number(r, "opening", "Opening"), received: received ?? 0, issued: number(r, "issued", "Issued"), ...(reorder !== undefined && reorder !== null ? { reorder_level: reorder } : {}) },
    };
  },
  parseUpdate(p) {
    const r = asRecord(p);
    const c: Record<string, unknown> = {};
    if (r.date !== undefined) c.log_date = normalizeDate(r.date, "Date");
    put(c, "opening", optionalNumber(r, "opening", "Opening"));
    const received = looseNumber(r, "received", "Received");
    if (received !== undefined) c.received = received ?? 0;
    put(c, "issued", optionalNumber(r, "issued", "Issued"));
    const reorder = looseNumber(r, "reorderLevel", "Reorder level");
    if (reorder !== undefined) c.reorder_level = reorder;
    return { id: updateId(r, "Consumables update"), facilityRef: optionalRequiredText(r, "facilityId", "Facility"), itemName: optionalRequiredText(r, "itemName", "Item name"), reorderSupplied: reorder !== undefined && reorder !== null, columns: c };
  },
  parseExtras(r) {
    const item = text(r.itemId);
    const name = text(r.itemName);
    return { eq: [], itemRef: item && item.toLowerCase() !== "all" ? item : undefined, itemName: name && name.toLowerCase() !== "all" ? name : undefined };
  },
  map(row, ctx) {
    const item = ctx?.itemById?.get(s(row, "item_id"));
    return { ...base(row), itemId: item?.code ?? "", itemUuid: s(row, "item_id"), date: s(row, "log_date"), facilityId: s(row, "facility_id"), itemName: item?.name ?? "", opening: n(row, "opening"), received: n(row, "received"), issued: n(row, "issued"), closing: n(row, "closing"), reorderLevel: row.reorder_level == null ? undefined : Number(row.reorder_level) };
  },
};

export const FM_LOG_SPECS: Record<FmLogResource, FmLogSpec> = {
  "generator-log": GENERATOR_SPEC,
  "energy-reading": ENERGY_SPEC,
  "diesel-usage": DIESEL_SPEC,
  "waste-log": WASTE_SPEC,
  "fumigation-log": FUMIGATION_SPEC,
  "deep-cleaning-log": DEEP_CLEANING_SPEC,
  "consumables-update": CONSUMABLES_SPEC,
};

// ---------------------------------------------------------------- list params

export type LogListParams = {
  page: number;
  pageSize: number;
  search?: string;
  facilityId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  sort: string;
  extras: ListExtras;
};
export function parseLogListParams(spec: FmLogSpec, payload: unknown): LogListParams {
  const r = asRecord(payload);
  const all = (v: unknown) => {
    const t = text(v);
    return !t || t.toLowerCase() === "all" ? undefined : t;
  };
  const from = text(r.dateFrom);
  const to = text(r.dateTo);
  const sortRaw = text(r.sort) ?? "newest";
  const allowed = new Set(["newest", "oldest", "date_asc", "date_desc", ...Object.keys(spec.extraSorts ?? {})]);
  return {
    page: Math.max(1, Number(r.page ?? 1) || 1),
    pageSize: Math.min(500, Math.max(1, Number(r.pageSize ?? 8) || 8)),
    search: text(r.search),
    facilityId: spec.facility ? all(r.facilityId) : undefined,
    status: spec.resource === "deep-cleaning-log" ? all(r.status) : undefined,
    dateFrom: from ? normalizeDate(from, "Date from") : undefined,
    dateTo: to ? normalizeDate(to, "Date to") : undefined,
    sort: allowed.has(sortRaw) ? sortRaw : "newest",
    extras: spec.parseExtras(r),
  };
}

export function parseLogIdPayload(payload: unknown, label: string): string {
  const id = text(asRecord(payload).id);
  if (!id) throw new FmLogValidationError(`${label} id is required.`);
  return id;
}
