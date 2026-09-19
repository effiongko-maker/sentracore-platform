import "server-only";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  FM_VENDOR_SELECT,
  FmVendorNotFoundError,
  FmVendorUnavailableError,
  FmVendorValidationError,
  UUID_RE,
  sanitizeSearchTerm,
  type FmVendorRow,
  type ParsedCreateVendor,
  type ParsedUpdateVendor,
  type VendorListParams,
} from "./fmVendorDomain";

type AdminClient = ReturnType<typeof createAdminClient>;

function db(): AdminClient {
  try {
    return createAdminClient();
  } catch {
    throw new FmVendorUnavailableError("Vendor storage is unavailable.");
  }
}
function throwDb(error: { code?: string; message?: string } | null, fallback: string): never {
  const message = error?.message ?? "";
  if (error?.code === "23505" || /duplicate key|unique constraint/i.test(message)) {
    throw new FmVendorValidationError("A vendor with this code already exists.");
  }
  if (error?.code === "23503" || /foreign key/i.test(message)) {
    throw new FmVendorValidationError("The vendor references an invalid profile for this organisation.");
  }
  if (error?.code === "23514" || /check constraint/i.test(message)) throw new FmVendorValidationError("Vendor values failed validation.");
  console.error("[FmVendorRepository]", fallback, error);
  throw new FmVendorUnavailableError("Vendor storage is unavailable.");
}
const txt = (rec: Record<string, unknown>, key: string) => (rec[key] != null ? String(rec[key]) : null);

function vendorRow(rec: Record<string, unknown>): FmVendorRow {
  return {
    id: String(rec.id), organisation_id: String(rec.organisation_id), name: String(rec.name), code: txt(rec, "code"),
    category: txt(rec, "category"), contact_name: txt(rec, "contact_name"), email: txt(rec, "email"), phone: txt(rec, "phone"),
    description: txt(rec, "description"), status: String(rec.status), created_by_profile_id: txt(rec, "created_by_profile_id"),
    updated_by_profile_id: txt(rec, "updated_by_profile_id"), created_at: String(rec.created_at), updated_at: String(rec.updated_at),
  };
}

export class FmVendorRepository {
  constructor(
    private readonly organisationId: string,
    private readonly admin: AdminClient = db()
  ) {}

  async get(idOrCode: string): Promise<FmVendorRow | null> {
    const target = idOrCode.trim();
    if (!target) return null;
    const q = this.admin.from("fm_vendors").select(FM_VENDOR_SELECT).eq("organisation_id", this.organisationId);
    const { data, error } = await (UUID_RE.test(target) ? q.eq("id", target) : q.ilike("code", target)).maybeSingle();
    if (error) throwDb(error, "load vendor");
    return data ? vendorRow(data as unknown as Record<string, unknown>) : null;
  }

  async list(params: VendorListParams): Promise<{ rows: FmVendorRow[]; total: number }> {
    let query = this.admin.from("fm_vendors").select(FM_VENDOR_SELECT, { count: "exact" }).eq("organisation_id", this.organisationId);
    if (params.status) query = query.eq("status", params.status);
    if (params.category) query = query.eq("category", params.category);
    const search = params.search ? sanitizeSearchTerm(params.search) : "";
    if (search) {
      const like = `%${search}%`;
      query = query.or(["name", "code", "category", "contact_name", "email", "phone", "description"].map((c) => `${c}.ilike.${like}`).join(","));
    }
    const from = (params.page - 1) * params.pageSize;
    const { data, error, count } = await query.order("created_at", { ascending: false }).order("name", { ascending: true }).range(from, from + params.pageSize - 1);
    if (error) throwDb(error, "list vendors");
    return { rows: (data ?? []).map((r) => vendorRow(r as unknown as Record<string, unknown>)), total: count ?? 0 };
  }

  private columns(f: ParsedCreateVendor | ParsedUpdateVendor): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    const set = (k: string, v: unknown) => { if (v !== undefined) out[k] = v; };
    set("name", f.name);
    set("code", f.code);
    set("category", f.category);
    set("contact_name", f.contactName);
    set("email", f.email);
    set("phone", f.phone);
    set("description", f.description);
    set("status", f.status);
    return out;
  }

  async create(input: ParsedCreateVendor, actorProfileId: string): Promise<FmVendorRow> {
    const { data, error } = await this.admin
      .from("fm_vendors")
      .insert({ ...this.columns(input), organisation_id: this.organisationId, created_by_profile_id: actorProfileId, updated_by_profile_id: actorProfileId })
      .select(FM_VENDOR_SELECT)
      .single();
    if (error) throwDb(error, "create vendor");
    if (!data) throw new FmVendorUnavailableError("Create returned no row.");
    return vendorRow(data as unknown as Record<string, unknown>);
  }

  async update(input: ParsedUpdateVendor, actorProfileId: string): Promise<FmVendorRow> {
    const existing = await this.get(input.id);
    if (!existing) throw new FmVendorNotFoundError(`Vendor ${input.id} not found.`);
    const { data, error } = await this.admin
      .from("fm_vendors")
      .update({ ...this.columns(input), updated_by_profile_id: actorProfileId })
      .eq("organisation_id", this.organisationId)
      .eq("id", existing.id)
      .select(FM_VENDOR_SELECT)
      .single();
    if (error) throwDb(error, "update vendor");
    return vendorRow(data as unknown as Record<string, unknown>);
  }

  /** Soft-deactivate only — vendors are never deleted. */
  async deactivate(idOrCode: string, actorProfileId: string): Promise<FmVendorRow> {
    const existing = await this.get(idOrCode);
    if (!existing) throw new FmVendorNotFoundError(`Vendor ${idOrCode} not found.`);
    const { data, error } = await this.admin
      .from("fm_vendors")
      .update({ status: "inactive", updated_by_profile_id: actorProfileId })
      .eq("organisation_id", this.organisationId)
      .eq("id", existing.id)
      .select(FM_VENDOR_SELECT)
      .single();
    if (error) throwDb(error, "deactivate vendor");
    return vendorRow(data as unknown as Record<string, unknown>);
  }
}
