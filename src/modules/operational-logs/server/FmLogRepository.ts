import "server-only";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  FmLogNotFoundError,
  FmLogUnavailableError,
  FmLogValidationError,
  UUID_RE,
  generateNextLogCode,
  sanitizeSearchTerm,
  type FmLogSpec,
  type LogListParams,
  type ParsedWrite,
} from "./fmLogDomain";

type AdminClient = ReturnType<typeof createAdminClient>;
const CODE_RETRY_LIMIT = 5;
type Row = Record<string, unknown>;

function db(): AdminClient {
  try {
    return createAdminClient();
  } catch {
    throw new FmLogUnavailableError("Operational log storage is unavailable.");
  }
}
function isUnique(error: { code?: string; message?: string } | null) {
  return error?.code === "23505" || /duplicate key|unique constraint/i.test(error?.message ?? "");
}
function throwDb(error: { code?: string; message?: string } | null, fallback: string): never {
  const message = error?.message ?? "";
  if (isUnique(error)) throw new FmLogValidationError("A record with this reference already exists.");
  if (error?.code === "23503" || /foreign key/i.test(message)) throw new FmLogValidationError("The record references an invalid facility or person for this organisation.");
  if (error?.code === "23514" || /check constraint/i.test(message)) throw new FmLogValidationError("Values failed validation.");
  if (error?.code === "22P02" || error?.code === "22003") throw new FmLogValidationError("A value is out of range or malformed.");
  console.error("[FmLogRepository]", fallback, error);
  throw new FmLogUnavailableError("Operational log storage is unavailable.");
}

/** Shared mechanics over a per-domain spec. The spec — not this class — owns the fields. */
export class FmLogRepository {
  constructor(
    private readonly spec: FmLogSpec,
    private readonly organisationId: string,
    private readonly admin: AdminClient = db()
  ) {}

  // -------------------------------------------------------------- facility

  /** Facility comes from an explicit reference (UUID, or a facility code accepted as input). Never guessed. */
  private async resolveFacilityId(ref: string): Promise<string> {
    const target = ref.trim();
    const q = this.admin.from("fm_facilities").select("id").eq("organisation_id", this.organisationId);
    const { data, error } = UUID_RE.test(target) ? await q.eq("id", target).maybeSingle() : await q.ilike("code", target).maybeSingle();
    if (error) throwDb(error, "resolve facility");
    if (!data) throw new FmLogValidationError("Facility not found in this organisation.");
    return String((data as { id: string }).id);
  }

  // ----------------------------------------------------------------- items (consumables)

  private async itemMap(ids: string[]): Promise<Map<string, { code: string; name: string }>> {
    const out = new Map<string, { code: string; name: string }>();
    if (ids.length === 0) return out;
    const { data, error } = await this.admin.from("fm_consumables_items").select("id, code, name").eq("organisation_id", this.organisationId).in("id", [...new Set(ids)]);
    if (error) throwDb(error, "load items");
    for (const r of data ?? []) out.set(String((r as Row).id), { code: String((r as Row).code), name: String((r as Row).name) });
    return out;
  }
  private async resolveItemRef(ref: string): Promise<string | null> {
    const t = ref.trim();
    const q = this.admin.from("fm_consumables_items").select("id").eq("organisation_id", this.organisationId);
    const { data, error } = await (UUID_RE.test(t) ? q.eq("id", t) : q.ilike("code", t)).maybeSingle();
    if (error) throwDb(error, "resolve item");
    return data ? String((data as Row).id) : null;
  }
  /** The item is the per-facility stock identity: found by (facility, name), created on first use. */
  private async findOrCreateItem(facilityId: string, name: string, actor: string): Promise<string> {
    const { data, error } = await this.admin.from("fm_consumables_items").select("id").eq("organisation_id", this.organisationId).eq("facility_id", facilityId).ilike("name", name.replace(/[%_\\]/g, (c) => `\\${c}`)).maybeSingle();
    if (error) throwDb(error, "find item");
    if (data) return String((data as Row).id);
    for (let attempt = 0; attempt < CODE_RETRY_LIMIT; attempt += 1) {
      const year = new Date().getUTCFullYear();
      const { data: latest, error: lerr } = await this.admin.from("fm_consumables_items").select("code").eq("organisation_id", this.organisationId).ilike("code", `ITEM-${year}-%`).order("code", { ascending: false }).limit(1);
      if (lerr) throwDb(lerr, "allocate item code");
      const code = generateNextLogCode("ITEM", ((latest ?? [])[0] as Row | undefined)?.code as string | undefined);
      const ins = await this.admin.from("fm_consumables_items").insert({ organisation_id: this.organisationId, code, facility_id: facilityId, name, created_by_profile_id: actor }).select("id").single();
      if (ins.error) {
        if (isUnique(ins.error)) {
          // A concurrent create of the same (facility, name) wins — reuse it; a code collision retries.
          const again = await this.admin.from("fm_consumables_items").select("id").eq("organisation_id", this.organisationId).eq("facility_id", facilityId).ilike("name", name.replace(/[%_\\]/g, (c) => `\\${c}`)).maybeSingle();
          if (again.data) return String((again.data as Row).id);
          if (attempt < CODE_RETRY_LIMIT - 1) continue;
        }
        throwDb(ins.error, "create item");
      }
      return String((ins.data as Row).id);
    }
    throw new FmLogUnavailableError("Unable to allocate an item reference.");
  }
  /** Reorder level carries forward from the item's most recent prior update (existing product behaviour). */
  private async carriedReorder(itemId: string, excludeId?: string): Promise<number | null> {
    let q = this.admin.from("fm_consumables_updates").select("reorder_level").eq("organisation_id", this.organisationId).eq("item_id", itemId).not("reorder_level", "is", null);
    if (excludeId) q = q.neq("id", excludeId);
    const { data, error } = await q.order("log_date", { ascending: false }).order("created_at", { ascending: false }).limit(1);
    if (error) throwDb(error, "carry reorder level");
    const v = ((data ?? [])[0] as Row | undefined)?.reorder_level;
    return v == null ? null : Number(v);
  }

  // ------------------------------------------------------------------ reads

  /**
   * Migrated historical consumables REGISTER evidence (read-only). Quantities and units are returned exactly as
   * stored: NULL stays null (never 0), each unit stays with its own field, and nothing is summed or reconciled.
   */
  async listRegisterEntries(): Promise<Record<string, unknown>[]> {
    if (this.spec.resource !== "consumables-update") throw new FmLogValidationError("Register entries belong to consumables only.");
    const cols = "id, facility_id, item_id, snapshot_date, opening_quantity, opening_unit, received_quantity, received_unit, issued_quantity, issued_unit, closing_quantity, closing_unit, reorder_level_quantity, reorder_level_unit, raw_opening, raw_received, raw_issued, raw_closing, raw_reorder_level, created_at";
    const rows: Row[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await this.admin.from("fm_consumables_register_entries").select(cols).eq("organisation_id", this.organisationId).order("created_at", { ascending: true }).order("id", { ascending: true }).range(offset, offset + 999);
      if (error) throwDb(error, "load consumables register entries");
      const batch = (data ?? []) as unknown as Row[];
      rows.push(...batch);
      if (batch.length < 1000) break;
    }
    const items = await this.itemMap(rows.map((r) => String(r.item_id)));
    const qty = (r: Row, key: string, raw: string) => ({
      quantity: r[`${key}_quantity`] == null ? null : Number(r[`${key}_quantity`]),
      unit: r[`${key}_unit`] == null ? null : String(r[`${key}_unit`]),
      raw: r[raw] == null ? null : String(r[raw]),
    });
    return rows.map((r) => ({
      id: String(r.id),
      itemId: String(r.item_id),
      itemCode: items.get(String(r.item_id))?.code ?? "",
      itemName: items.get(String(r.item_id))?.name ?? "",
      facilityId: String(r.facility_id),
      snapshotDate: r.snapshot_date == null ? null : String(r.snapshot_date),
      opening: qty(r, "opening", "raw_opening"),
      received: qty(r, "received", "raw_received"),
      issued: qty(r, "issued", "raw_issued"),
      closing: qty(r, "closing", "raw_closing"),
      reorderLevel: qty(r, "reorder_level", "raw_reorder_level"),
      recordOrigin: "migrated_historical",
    }));
  }

  private async hydrate(rows: Row[]) {
    const ctx = this.spec.resource === "consumables-update" ? { itemById: await this.itemMap(rows.map((r) => String(r.item_id))) } : undefined;
    return rows.map((r) => this.spec.map(r, ctx));
  }

  private async get(idOrCode: string): Promise<Row | null> {
    const t = idOrCode.trim();
    if (!t) return null;
    const q = this.admin.from(this.spec.table).select(this.spec.select).eq("organisation_id", this.organisationId);
    const { data, error } = await (UUID_RE.test(t) ? q.eq("id", t) : q.ilike("code", t)).maybeSingle();
    if (error) throwDb(error, "load record");
    return (data as unknown as Row) ?? null;
  }

  async getById(idOrCode: string): Promise<Record<string, unknown>> {
    const row = await this.get(idOrCode);
    if (!row) throw new FmLogNotFoundError(`${this.spec.label} ${idOrCode} not found.`);
    return (await this.hydrate([row]))[0];
  }

  async list(params: LogListParams): Promise<{ rows: Record<string, unknown>[]; total: number }> {
    let query = this.admin.from(this.spec.table).select(this.spec.select, { count: "exact" }).eq("organisation_id", this.organisationId);
    if (params.facilityId) {
      const id = await this.resolveFacilityId(params.facilityId).catch((e) => (e instanceof FmLogValidationError ? null : Promise.reject(e)));
      if (!id) return { rows: [], total: 0 };
      query = query.eq("facility_id", id);
    }
    if (params.status) query = query.ilike("status", `%${sanitizeSearchTerm(params.status)}%`);
    if (params.dateFrom) query = query.gte("log_date", params.dateFrom);
    if (params.dateTo) query = query.lte("log_date", params.dateTo);
    if (params.extras.nextDueFrom) query = query.gte("next_due_date", params.extras.nextDueFrom);
    if (params.extras.nextDueTo) query = query.lte("next_due_date", params.extras.nextDueTo);
    for (const [col, value] of params.extras.eq) query = query.eq(col, value);

    if (this.spec.resource === "consumables-update") {
      if (params.extras.itemRef) {
        const id = await this.resolveItemRef(params.extras.itemRef);
        if (!id) return { rows: [], total: 0 };
        query = query.eq("item_id", id);
      }
      const nameTerm = params.extras.itemName ? sanitizeSearchTerm(params.extras.itemName) : "";
      if (nameTerm) {
        const { data, error } = await this.admin.from("fm_consumables_items").select("id").eq("organisation_id", this.organisationId).ilike("name", `%${nameTerm}%`);
        if (error) throwDb(error, "filter items");
        const ids = (data ?? []).map((r) => String((r as Row).id));
        if (ids.length === 0) return { rows: [], total: 0 };
        query = query.in("item_id", ids);
      }
    }
    const search = params.search ? sanitizeSearchTerm(params.search) : "";
    if (search) {
      const like = `%${search}%`;
      const parts = this.spec.searchColumns.map((c) => `${c}.ilike.${like}`);
      if (this.spec.resource === "consumables-update") {
        const { data, error } = await this.admin.from("fm_consumables_items").select("id").eq("organisation_id", this.organisationId).or(`name.ilike.${like},code.ilike.${like}`);
        if (error) throwDb(error, "search items");
        const ids = (data ?? []).map((r) => String((r as Row).id));
        if (ids.length) parts.push(`item_id.in.(${ids.join(",")})`);
      }
      query = query.or(parts.join(","));
    }

    const extra = this.spec.extraSorts?.[params.sort];
    if (extra) query = query.order(extra.column, { ascending: extra.ascending }).order("created_at", { ascending: false });
    else if (params.sort === "oldest") query = query.order("created_at", { ascending: true }).order("code", { ascending: true });
    else if (params.sort === "date_asc") query = query.order("log_date", { ascending: true }).order("created_at", { ascending: true });
    else if (params.sort === "date_desc") query = query.order("log_date", { ascending: false }).order("created_at", { ascending: false });
    else query = query.order("created_at", { ascending: false }).order("code", { ascending: false });

    const from = (params.page - 1) * params.pageSize;
    const { data, error, count } = await query.range(from, from + params.pageSize - 1);
    if (error) throwDb(error, "list records");
    return { rows: await this.hydrate((data ?? []) as unknown as Row[]), total: count ?? 0 };
  }

  // ----------------------------------------------------------------- writes

  private async latestCode(): Promise<string | null> {
    const year = new Date().getUTCFullYear();
    const { data, error } = await this.admin.from(this.spec.table).select("code").eq("organisation_id", this.organisationId).ilike("code", `${this.spec.prefix}-${year}-%`).order("code", { ascending: false }).limit(1);
    if (error) throwDb(error, "allocate code");
    return ((data ?? [])[0] as Row | undefined)?.code as string | null ?? null;
  }

  async create(input: ParsedWrite, actor: string): Promise<Record<string, unknown>> {
    const columns: Row = { ...input.columns };
    if (this.spec.facility) {
      // Explicit facility reference only — a missing facility is a validation error, never a guess.
      const facilityId = await this.resolveFacilityId(input.facilityRef ?? "");
      columns.facility_id = facilityId;
      if (this.spec.resource === "consumables-update") {
        const itemId = await this.findOrCreateItem(facilityId, input.itemName!, actor);
        columns.item_id = itemId;
        if (!input.reorderSupplied) columns.reorder_level = await this.carriedReorder(itemId);
      }
    }
    for (let attempt = 0; attempt < CODE_RETRY_LIMIT; attempt += 1) {
      const code = generateNextLogCode(this.spec.prefix, await this.latestCode());
      const { data, error } = await this.admin
        .from(this.spec.table)
        .insert({ ...columns, organisation_id: this.organisationId, code, created_by_profile_id: actor, updated_by_profile_id: actor })
        .select(this.spec.select)
        .single();
      if (error) {
        if (isUnique(error) && /_code_uidx/.test(error.message ?? "") && attempt < CODE_RETRY_LIMIT - 1) continue;
        throwDb(error, "create record");
      }
      return (await this.hydrate([data as unknown as Row]))[0];
    }
    throw new FmLogUnavailableError("Unable to allocate a reference.");
  }

  async update(id: string, input: ParsedWrite, actor: string): Promise<Record<string, unknown>> {
    const existing = await this.get(id);
    if (!existing) throw new FmLogNotFoundError(`${this.spec.label} ${id} not found.`);
    const patch: Row = { ...input.columns, updated_by_profile_id: actor };
    if (this.spec.facility) {
      const facilityId = input.facilityRef ? await this.resolveFacilityId(input.facilityRef) : String(existing.facility_id);
      if (input.facilityRef) patch.facility_id = facilityId;
      if (this.spec.resource === "consumables-update") {
        // Changing the facility or the item name re-resolves the per-facility item identity.
        if (input.facilityRef || input.itemName) {
          const current = (await this.itemMap([String(existing.item_id)])).get(String(existing.item_id));
          const itemId = await this.findOrCreateItem(facilityId, input.itemName ?? current?.name ?? "", actor);
          patch.item_id = itemId;
          if (!input.reorderSupplied && !("reorder_level" in patch) && itemId !== String(existing.item_id)) patch.reorder_level = await this.carriedReorder(itemId, String(existing.id));
        }
      }
    }
    const { data, error } = await this.admin.from(this.spec.table).update(patch).eq("organisation_id", this.organisationId).eq("id", String(existing.id)).select(this.spec.select).single();
    if (error) throwDb(error, "update record");
    return (await this.hydrate([data as unknown as Row]))[0];
  }
}
