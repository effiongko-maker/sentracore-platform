import "server-only";
import { createAdminClient } from "@/utils/supabase/admin";
import type { CreateFacilityInput, UpdateFacilityInput } from "@/modules/facilities/types";
import {
  FmFacilityNotFoundError,
  FmFacilityUnavailableError,
  FmFacilityValidationError,
  UUID_RE,
  generateNextFacilityCode,
  type FmFacilityRow,
} from "./fmFacilityDomain";

type AdminClient = ReturnType<typeof createAdminClient>;

function db(): AdminClient {
  try {
    return createAdminClient();
  } catch {
    throw new FmFacilityUnavailableError("Facility storage is unavailable.");
  }
}

function throwDb(
  error: { code?: string; message?: string } | null,
  fallback: string
): never {
  const message = error?.message?.trim() || fallback;
  if (error?.code === "23505" || /duplicate key|unique constraint/i.test(message)) {
    throw new FmFacilityValidationError(
      "A facility with this code already exists in the organisation."
    );
  }
  if (error?.code === "23514" || /check constraint/i.test(message)) {
    throw new FmFacilityValidationError("Facility values failed validation.");
  }
  if (
    /fetch failed|econn|timeout|temporarily unavailable|jwt|invalid api key/i.test(
      message
    )
  ) {
    throw new FmFacilityUnavailableError("Facility storage is unavailable.");
  }
  throw new FmFacilityUnavailableError("Facility storage is unavailable.");
}

function asRow(value: unknown): FmFacilityRow {
  const rec = value as Record<string, unknown>;
  return {
    id: String(rec.id),
    organisation_id: String(rec.organisation_id),
    code: String(rec.code ?? ""),
    name: String(rec.name ?? ""),
    status: String(rec.status ?? "pending"),
    facility_type: rec.facility_type != null ? String(rec.facility_type) : null,
    location_text: rec.location_text != null ? String(rec.location_text) : null,
    size_sqm: rec.size_sqm as number | string | null,
    description: rec.description != null ? String(rec.description) : null,
    created_by_profile_id:
      rec.created_by_profile_id != null
        ? String(rec.created_by_profile_id)
        : null,
    updated_by_profile_id:
      rec.updated_by_profile_id != null
        ? String(rec.updated_by_profile_id)
        : null,
    created_at: String(rec.created_at ?? ""),
    updated_at: String(rec.updated_at ?? ""),
  };
}

export class FmFacilitiesRepository {
  constructor(
    private readonly organisationId: string,
    private readonly admin: AdminClient = db()
  ) {}

  async listRows(): Promise<FmFacilityRow[]> {
    const { data, error } = await this.admin
      .from("fm_facilities")
      .select(
        "id, organisation_id, code, name, status, facility_type, location_text, size_sqm, description, created_by_profile_id, updated_by_profile_id, created_at, updated_at"
      )
      .eq("organisation_id", this.organisationId)
      .order("name", { ascending: true })
      .order("id", { ascending: true });

    if (error) throwDb(error, "Unable to load facilities.");
    return (data ?? []).map(asRow);
  }

  async getByIdOrCode(idOrCode: string): Promise<FmFacilityRow | null> {
    const target = idOrCode.trim();
    if (!target) return null;

    if (UUID_RE.test(target)) {
      const { data, error } = await this.admin
        .from("fm_facilities")
        .select(
          "id, organisation_id, code, name, status, facility_type, location_text, size_sqm, description, created_by_profile_id, updated_by_profile_id, created_at, updated_at"
        )
        .eq("organisation_id", this.organisationId)
        .eq("id", target)
        .maybeSingle();
      if (error) throwDb(error, "Unable to load facility.");
      return data ? asRow(data) : null;
    }

    const { data, error } = await this.admin
      .from("fm_facilities")
      .select(
        "id, organisation_id, code, name, status, facility_type, location_text, size_sqm, description, created_by_profile_id, updated_by_profile_id, created_at, updated_at"
      )
      .eq("organisation_id", this.organisationId)
      .ilike("code", target)
      .maybeSingle();
    if (error) throwDb(error, "Unable to load facility.");
    return data ? asRow(data) : null;
  }

  async nextCode(requested?: string): Promise<string> {
    const explicit = requested?.trim();
    if (explicit) return explicit;

    const { data, error } = await this.admin
      .from("fm_facilities")
      .select("code")
      .eq("organisation_id", this.organisationId);
    if (error) throwDb(error, "Unable to allocate facility code.");
    const codes = (data ?? []).map((row) => String((row as { code?: string }).code ?? ""));
    return generateNextFacilityCode(codes);
  }

  async create(
    input: CreateFacilityInput,
    actorProfileId: string | null
  ): Promise<FmFacilityRow> {
    const code = await this.nextCode(input.code);
    const { data, error } = await this.admin
      .from("fm_facilities")
      .insert({
        organisation_id: this.organisationId,
        code,
        name: input.name.trim(),
        status: input.status,
        facility_type: input.type,
        location_text: input.location.trim(),
        description: input.description?.trim() || null,
        created_by_profile_id: actorProfileId,
        updated_by_profile_id: actorProfileId,
      })
      .select(
        "id, organisation_id, code, name, status, facility_type, location_text, size_sqm, description, created_by_profile_id, updated_by_profile_id, created_at, updated_at"
      )
      .single();

    if (error) throwDb(error, "Unable to create facility.");
    if (!data) throw new FmFacilityUnavailableError("Unable to create facility.");
    return asRow(data);
  }

  async update(
    id: string,
    input: UpdateFacilityInput,
    actorProfileId: string | null
  ): Promise<FmFacilityRow> {
    const existing = await this.getByIdOrCode(id);
    if (!existing) throw new FmFacilityNotFoundError(`Facility ${id} not found.`);

    const patch: Record<string, unknown> = {
      updated_by_profile_id: actorProfileId,
    };
    if (input.name !== undefined) patch.name = input.name.trim();
    if (input.location !== undefined) patch.location_text = input.location.trim();
    if (input.type !== undefined) patch.facility_type = input.type;
    if (input.status !== undefined) patch.status = input.status;
    if (input.description !== undefined) {
      patch.description = input.description?.trim() || null;
    }
    // code and manager are not persisted as mutable facility facts.

    const { data, error } = await this.admin
      .from("fm_facilities")
      .update(patch)
      .eq("organisation_id", this.organisationId)
      .eq("id", existing.id)
      .select(
        "id, organisation_id, code, name, status, facility_type, location_text, size_sqm, description, created_by_profile_id, updated_by_profile_id, created_at, updated_at"
      )
      .single();

    if (error) throwDb(error, "Unable to update facility.");
    if (!data) throw new FmFacilityNotFoundError(`Facility ${id} not found.`);
    return asRow(data);
  }

  async deactivate(
    id: string,
    actorProfileId: string | null
  ): Promise<FmFacilityRow> {
    return this.update(id, { status: "inactive" }, actorProfileId);
  }
}
