import "server-only";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  FM_ASSET_SELECT,
  FmAssetNotFoundError,
  FmAssetUnavailableError,
  FmAssetValidationError,
  UUID_RE,
  generateNextAssetCode,
  sanitizeSearchTerm,
  type AssetListParams,
  type AssetRelations,
  type FmAssetRow,
  type ParsedCreateAsset,
  type ParsedUpdateAsset,
} from "./fmAssetDomain";

type AdminClient = ReturnType<typeof createAdminClient>;
const CODE_RETRY_LIMIT = 5;

function db(): AdminClient {
  try {
    return createAdminClient();
  } catch {
    throw new FmAssetUnavailableError("Asset storage is unavailable.");
  }
}
function isUnique(error: { code?: string; message?: string } | null): boolean {
  return error?.code === "23505" || /duplicate key|unique constraint/i.test(error?.message ?? "");
}
function throwDb(error: { code?: string; message?: string } | null, fallback: string): never {
  const message = error?.message ?? "";
  if (isUnique(error)) throw new FmAssetValidationError("An asset with this reference already exists.");
  if (error?.code === "23503" || /foreign key/i.test(message)) {
    throw new FmAssetValidationError("The asset references an invalid facility or person for this organisation.");
  }
  if (error?.code === "23514" || /check constraint/i.test(message)) throw new FmAssetValidationError("Values failed validation.");
  console.error("[FmAssetRepository]", fallback, error);
  throw new FmAssetUnavailableError("Asset storage is unavailable.");
}
const str = (rec: Record<string, unknown>, key: string) => String(rec[key] ?? "");
const txt = (rec: Record<string, unknown>, key: string) => (rec[key] != null ? String(rec[key]) : null);

function assetRow(rec: Record<string, unknown>): FmAssetRow {
  return {
    id: str(rec, "id"), organisation_id: str(rec, "organisation_id"), code: str(rec, "code"), facility_id: str(rec, "facility_id"),
    name: str(rec, "name"), category: str(rec, "category"), manufacturer: txt(rec, "manufacturer"), model: txt(rec, "model"),
    serial_number: txt(rec, "serial_number"), install_date: txt(rec, "install_date"), warranty_expiry: txt(rec, "warranty_expiry"),
    oem_id: txt(rec, "oem_id"), condition: str(rec, "condition"), status: str(rec, "status"), criticality: str(rec, "criticality"),
    assigned_to_profile_id: txt(rec, "assigned_to_profile_id"), created_by_profile_id: txt(rec, "created_by_profile_id"),
    updated_by_profile_id: txt(rec, "updated_by_profile_id"), created_at: str(rec, "created_at"), updated_at: str(rec, "updated_at"),
    // NULL/absent = operational; the database column is authoritative (migrated_historical is never inferred).
    record_origin: rec.record_origin != null ? String(rec.record_origin) : "operational",
  };
}

export class FmAssetRepository {
  constructor(
    private readonly organisationId: string,
    private readonly admin: AdminClient = db()
  ) {}

  private async resolveFacilityId(ref: string): Promise<string> {
    const target = ref.trim();
    const query = this.admin.from("fm_facilities").select("id").eq("organisation_id", this.organisationId);
    const { data, error } = UUID_RE.test(target) ? await query.eq("id", target).maybeSingle() : await query.ilike("code", target).maybeSingle();
    if (error) throwDb(error, "resolve facility");
    if (!data) throw new FmAssetValidationError("Facility not found in this organisation.");
    return String((data as { id: string }).id);
  }
  private async assertProfile(id: string): Promise<void> {
    const { data, error } = await this.admin.from("profiles").select("id").eq("organisation_id", this.organisationId).eq("id", id).maybeSingle();
    if (error) throwDb(error, "resolve profile");
    if (!data) throw new FmAssetValidationError("Assigned person not found in this organisation.");
  }

  /**
   * Resolve an Asset reference (UUID, or a display code accepted as INPUT only)
   * to its tenant-scoped UUID. Used by Incident / Work / Work Instruction writes.
   * The caller stores the UUID — never the code.
   */
  async resolveAssetId(ref: string): Promise<string> {
    const found = await this.get(ref);
    if (!found) throw new FmAssetValidationError(`Asset ${ref.trim()} not found in this organisation.`);
    return found.id;
  }

  /** Tenant-scoped UUID for an Asset reference, or null when it does not exist. */
  async findId(ref: string): Promise<string | null> {
    return (await this.get(ref))?.id ?? null;
  }

  async get(idOrCode: string): Promise<FmAssetRow | null> {
    const target = idOrCode.trim();
    if (!target) return null;
    const q = this.admin.from("fm_assets").select(FM_ASSET_SELECT).eq("organisation_id", this.organisationId);
    const { data, error } = await (UUID_RE.test(target) ? q.eq("id", target) : q.eq("code", target.toUpperCase())).maybeSingle();
    if (error) throwDb(error, "load asset");
    return data ? assetRow(data as unknown as Record<string, unknown>) : null;
  }

  async list(params: AssetListParams): Promise<{ rows: FmAssetRow[]; total: number }> {
    let query = this.admin.from("fm_assets").select(FM_ASSET_SELECT, { count: "exact" }).eq("organisation_id", this.organisationId);
    if (params.status) query = query.eq("status", params.status);
    if (params.category) query = query.eq("category", params.category);
    if (params.criticality) query = query.eq("criticality", params.criticality);
    if (params.facilityId) {
      const id = await this.resolveFacilityId(params.facilityId).catch((e) => (e instanceof FmAssetValidationError ? null : Promise.reject(e)));
      if (!id) return { rows: [], total: 0 };
      query = query.eq("facility_id", id);
    }
    const search = params.search ? sanitizeSearchTerm(params.search) : "";
    if (search) {
      const like = `%${search}%`;
      query = query.or(["name", "code", "serial_number", "manufacturer", "model", "oem_id"].map((c) => `${c}.ilike.${like}`).join(","));
    }
    if (params.sort === "oldest") query = query.order("created_at", { ascending: true }).order("code", { ascending: true });
    else if (params.sort === "name_asc") query = query.order("name", { ascending: true }).order("code", { ascending: true });
    else if (params.sort === "name_desc") query = query.order("name", { ascending: false }).order("code", { ascending: false });
    else query = query.order("created_at", { ascending: false }).order("code", { ascending: false });
    const from = (params.page - 1) * params.pageSize;
    const { data, error, count } = await query.range(from, from + params.pageSize - 1);
    if (error) throwDb(error, "list assets");
    return { rows: (data ?? []).map((r) => assetRow(r as unknown as Record<string, unknown>)), total: count ?? 0 };
  }

  /** Facility and assignee display names, projected from their UUIDs. */
  async relations(rows: FmAssetRow[]): Promise<Map<string, AssetRelations>> {
    const out = new Map<string, AssetRelations>();
    if (rows.length === 0) return out;
    const facilityIds = [...new Set(rows.map((r) => r.facility_id))];
    const profileIds = [...new Set(rows.map((r) => r.assigned_to_profile_id).filter((v): v is string => !!v))];
    const [facilities, profiles] = await Promise.all([
      this.admin.from("fm_facilities").select("id, name").eq("organisation_id", this.organisationId).in("id", facilityIds),
      profileIds.length
        ? this.admin.from("profiles").select("id, full_name, first_name, last_name").eq("organisation_id", this.organisationId).in("id", profileIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (facilities.error) throwDb(facilities.error, "load facility names");
    if (profiles.error) throwDb(profiles.error, "load assignee names");
    const facilityName = new Map((facilities.data ?? []).map((f) => [String((f as { id: string }).id), String((f as { name: string }).name)]));
    const personName = new Map(
      (profiles.data ?? []).map((p) => {
        const rec = p as { id: string; full_name?: string | null; first_name?: string | null; last_name?: string | null };
        const name = rec.full_name?.trim() || [rec.first_name, rec.last_name].filter(Boolean).join(" ").trim();
        return [rec.id, name] as const;
      })
    );
    for (const row of rows) {
      out.set(row.id, {
        facilityName: facilityName.get(row.facility_id),
        assignedToName: row.assigned_to_profile_id ? personName.get(row.assigned_to_profile_id) : undefined,
      });
    }
    return out;
  }

  private async latestCode(): Promise<string | null> {
    const year = new Date().getUTCFullYear();
    const { data, error } = await this.admin
      .from("fm_assets").select("code").eq("organisation_id", this.organisationId).ilike("code", `AST-${year}-%`)
      .order("code", { ascending: false }).limit(1);
    if (error) throwDb(error, "allocate code");
    return ((data ?? [])[0] as { code?: string } | undefined)?.code ?? null;
  }

  private columns(f: ParsedCreateAsset | ParsedUpdateAsset): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    const set = (k: string, v: unknown) => { if (v !== undefined) out[k] = v; };
    set("name", f.name);
    set("category", f.category);
    set("manufacturer", f.manufacturer);
    set("model", f.model);
    set("serial_number", f.serialNumber);
    set("install_date", f.installDate);
    set("warranty_expiry", f.warrantyExpiry);
    set("oem_id", f.oemId);
    set("condition", f.condition);
    set("status", f.status);
    set("criticality", f.criticality);
    return out;
  }

  async create(input: ParsedCreateAsset, actorProfileId: string): Promise<FmAssetRow> {
    const facilityId = await this.resolveFacilityId(input.facilityRef);
    if (input.assignedToUserId) await this.assertProfile(input.assignedToUserId);
    for (let attempt = 0; attempt < CODE_RETRY_LIMIT; attempt += 1) {
      const code = generateNextAssetCode(await this.latestCode());
      const { data, error } = await this.admin
        .from("fm_assets")
        .insert({
          ...this.columns(input),
          organisation_id: this.organisationId,
          code,
          facility_id: facilityId,
          assigned_to_profile_id: input.assignedToUserId ?? null,
          created_by_profile_id: actorProfileId,
          updated_by_profile_id: actorProfileId,
        })
        .select(FM_ASSET_SELECT)
        .single();
      if (error) {
        if (isUnique(error) && /_code_uidx/.test(error.message ?? "") && attempt < CODE_RETRY_LIMIT - 1) continue;
        throwDb(error, "create asset");
      }
      if (!data) throw new FmAssetUnavailableError("Create returned no row.");
      return assetRow(data as unknown as Record<string, unknown>);
    }
    throw new FmAssetUnavailableError("Unable to allocate an asset reference.");
  }

  async update(input: ParsedUpdateAsset, actorProfileId: string): Promise<FmAssetRow> {
    const existing = await this.get(input.id);
    if (!existing) throw new FmAssetNotFoundError(`Asset ${input.id} not found.`);
    const patch: Record<string, unknown> = { ...this.columns(input), updated_by_profile_id: actorProfileId };
    if (input.facilityRef) patch.facility_id = await this.resolveFacilityId(input.facilityRef);
    if (input.assignedToUserId !== undefined) {
      if (input.assignedToUserId) await this.assertProfile(input.assignedToUserId);
      patch.assigned_to_profile_id = input.assignedToUserId;
    }
    const { data, error } = await this.admin
      .from("fm_assets").update(patch).eq("organisation_id", this.organisationId).eq("id", existing.id).select(FM_ASSET_SELECT).single();
    if (error) {
      if (error.code === "23503") {
        throw new FmAssetValidationError("The asset's facility cannot change while incidents, work or work instructions in another facility reference it.");
      }
      throwDb(error, "update asset");
    }
    return assetRow(data as unknown as Record<string, unknown>);
  }

  /** Soft-deactivate only — assets are never deleted. */
  async deactivate(idOrCode: string, actorProfileId: string): Promise<FmAssetRow> {
    const existing = await this.get(idOrCode);
    if (!existing) throw new FmAssetNotFoundError(`Asset ${idOrCode} not found.`);
    const { data, error } = await this.admin
      .from("fm_assets").update({ status: "inactive", updated_by_profile_id: actorProfileId })
      .eq("organisation_id", this.organisationId).eq("id", existing.id).select(FM_ASSET_SELECT).single();
    if (error) throwDb(error, "deactivate asset");
    return assetRow(data as unknown as Record<string, unknown>);
  }
}
