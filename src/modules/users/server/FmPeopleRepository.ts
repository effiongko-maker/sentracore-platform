import "server-only";
import { createAdminClient } from "@/utils/supabase/admin";
import { FmFacilitiesRepository } from "@/modules/facilities/server/FmFacilitiesRepository";
import {
  FmPeopleNotFoundError,
  FmPeopleUnavailableError,
  FmPeopleValidationError,
  type EligibleProfile,
  type FmFacilityAssignmentRow,
  type FmPeopleDirectoryRow,
} from "./fmPeopleDomain";

type AdminClient = ReturnType<typeof createAdminClient>;

const SELECT_ASSIGNMENT =
  "id, organisation_id, profile_id, facility_id, operational_role, status, created_at, updated_at";

function db(): AdminClient {
  try {
    return createAdminClient();
  } catch {
    throw new FmPeopleUnavailableError("People directory is unavailable.");
  }
}

function throwDb(
  error: { code?: string; message?: string } | null,
  fallback: string
): never {
  const message = error?.message?.trim() || fallback;
  if (error?.code === "23505" || /duplicate key|unique constraint/i.test(message)) {
    throw new FmPeopleValidationError(
      "This person is already assigned to that facility."
    );
  }
  if (error?.code === "23503" || /foreign key/i.test(message)) {
    throw new FmPeopleValidationError(
      "Profile or facility is invalid for this organisation."
    );
  }
  if (error?.code === "23514" || /check constraint/i.test(message)) {
    throw new FmPeopleValidationError("Assignment values failed validation.");
  }
  throw new FmPeopleUnavailableError("People directory is unavailable.");
}

function asAssignment(value: unknown): FmFacilityAssignmentRow {
  const rec = value as Record<string, unknown>;
  return {
    id: String(rec.id),
    organisation_id: String(rec.organisation_id),
    profile_id: String(rec.profile_id),
    facility_id: String(rec.facility_id),
    operational_role: String(rec.operational_role),
    status: String(rec.status ?? "active"),
    created_at: String(rec.created_at ?? ""),
    updated_at: String(rec.updated_at ?? ""),
  };
}

function profileName(row: {
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}): string {
  const full = String(row.full_name ?? "").trim();
  if (full) return full;
  return [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
}

export class FmPeopleRepository {
  constructor(
    private readonly organisationId: string,
    private readonly admin: AdminClient = db(),
    private readonly facilities = new FmFacilitiesRepository(organisationId, admin)
  ) {}

  async listDirectoryRows(): Promise<FmPeopleDirectoryRow[]> {
    const { data, error } = await this.admin
      .from("fm_facility_assignments")
      .select(SELECT_ASSIGNMENT)
      .eq("organisation_id", this.organisationId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
    if (error) throwDb(error, "Unable to load people.");
    const assignments = (data ?? []).map(asAssignment);
    if (assignments.length === 0) return [];

    const profileIds = [...new Set(assignments.map((row) => row.profile_id))];
    const facilityIds = [...new Set(assignments.map((row) => row.facility_id))];

    const [{ data: profiles, error: profileError }, { data: facilityRows, error: facilityError }] =
      await Promise.all([
        this.admin
          .from("profiles")
          .select("id, full_name, first_name, last_name, status, avatar_url, organisation_id")
          .eq("organisation_id", this.organisationId)
          .in("id", profileIds),
        this.admin
          .from("fm_facilities")
          .select("id, name, code")
          .eq("organisation_id", this.organisationId)
          .in("id", facilityIds),
      ]);
    if (profileError) throwDb(profileError, "Unable to load people.");
    if (facilityError) throwDb(facilityError, "Unable to load people.");

    const profileMap = new Map(
      (profiles ?? []).map((row) => [String(row.id), row as Record<string, unknown>])
    );
    const facilityMap = new Map(
      (facilityRows ?? []).map((row) => [String(row.id), row as Record<string, unknown>])
    );
    const emails = await this.loadEmails(profileIds);

    return assignments.map((row) => {
      const profile = profileMap.get(row.profile_id) ?? {};
      const facility = facilityMap.get(row.facility_id) ?? {};
      return {
        ...row,
        profile_full_name:
          profile.full_name != null ? String(profile.full_name) : null,
        profile_first_name:
          profile.first_name != null ? String(profile.first_name) : null,
        profile_last_name:
          profile.last_name != null ? String(profile.last_name) : null,
        profile_status: String(profile.status ?? "active"),
        profile_avatar_url:
          profile.avatar_url != null ? String(profile.avatar_url) : null,
        facility_name: String(facility.name ?? ""),
        facility_code: String(facility.code ?? ""),
        email: emails.get(row.profile_id) ?? "",
      };
    });
  }

  async listEligibleProfiles(): Promise<EligibleProfile[]> {
    const { data: profiles, error } = await this.admin
      .from("profiles")
      .select("id, full_name, first_name, last_name, status")
      .eq("organisation_id", this.organisationId)
      .eq("status", "active")
      .order("full_name", { ascending: true });
    if (error) throwDb(error, "Unable to load eligible profiles.");
    const rows = profiles ?? [];
    const emails = await this.loadEmails(rows.map((row) => String(row.id)));
    return rows.map((row) => ({
      id: String(row.id),
      name: profileName(row) || emails.get(String(row.id)) || "Unnamed person",
      email: emails.get(String(row.id)) ?? "",
      status: String(row.status ?? "active"),
    }));
  }

  async getByProfileId(profileId: string): Promise<FmPeopleDirectoryRow[]> {
    const rows = await this.listDirectoryRows();
    return rows.filter((row) => row.profile_id === profileId);
  }

  async getAssignment(id: string): Promise<FmFacilityAssignmentRow | null> {
    const { data, error } = await this.admin
      .from("fm_facility_assignments")
      .select(SELECT_ASSIGNMENT)
      .eq("organisation_id", this.organisationId)
      .eq("id", id)
      .maybeSingle();
    if (error) throwDb(error, "Unable to load assignment.");
    return data ? asAssignment(data) : null;
  }

  private async resolveFacilityId(idOrCodeOrName: string): Promise<string> {
    const target = idOrCodeOrName.trim();
    const byIdOrCode = await this.facilities.getByIdOrCode(target);
    if (byIdOrCode) return byIdOrCode.id;
    const { data, error } = await this.admin
      .from("fm_facilities")
      .select("id, name")
      .eq("organisation_id", this.organisationId)
      .ilike("name", target)
      .maybeSingle();
    if (error) throwDb(error, "Unable to resolve facility.");
    if (!data) {
      throw new FmPeopleValidationError("Facility is invalid for this organisation.");
    }
    return String(data.id);
  }

  private async assertProfileInOrg(profileId: string): Promise<void> {
    const { data, error } = await this.admin
      .from("profiles")
      .select("id, organisation_id, status")
      .eq("id", profileId)
      .maybeSingle();
    if (error) throwDb(error, "Unable to load profile.");
    if (!data || String(data.organisation_id) !== this.organisationId) {
      throw new FmPeopleValidationError("Profile is not in this organisation.");
    }
  }

  async createAssignment(input: {
    profileId: string;
    facilityId: string;
    role: string;
    status: "active" | "inactive";
    actorProfileId: string | null;
  }): Promise<FmFacilityAssignmentRow> {
    await this.assertProfileInOrg(input.profileId);
    const facilityId = await this.resolveFacilityId(input.facilityId);
    const { data: existing, error: existingError } = await this.admin
      .from("fm_facility_assignments")
      .select(SELECT_ASSIGNMENT)
      .eq("organisation_id", this.organisationId)
      .eq("profile_id", input.profileId)
      .eq("facility_id", facilityId)
      .maybeSingle();
    if (existingError) throwDb(existingError, "Unable to create assignment.");
    if (existing) {
      return this.updateAssignment(
        String((existing as { id: string }).id),
        {
          role: input.role,
          status: input.status,
        },
        input.actorProfileId
      );
    }
    const { data, error } = await this.admin
      .from("fm_facility_assignments")
      .insert({
        organisation_id: this.organisationId,
        profile_id: input.profileId,
        facility_id: facilityId,
        operational_role: input.role,
        status: input.status,
        created_by_profile_id: input.actorProfileId,
        updated_by_profile_id: input.actorProfileId,
      })
      .select(SELECT_ASSIGNMENT)
      .single();
    if (error) throwDb(error, "Unable to create assignment.");
    if (!data) {
      throw new FmPeopleUnavailableError("Unable to create assignment.");
    }
    return asAssignment(data);
  }

  async updateAssignment(
    assignmentId: string,
    input: {
      facilityId?: string;
      role?: string;
      status?: "active" | "inactive";
    },
    actorProfileId: string | null
  ): Promise<FmFacilityAssignmentRow> {
    const existing = await this.getAssignment(assignmentId);
    if (!existing) {
      throw new FmPeopleNotFoundError(`Assignment ${assignmentId} not found.`);
    }
    const patch: Record<string, unknown> = {
      updated_by_profile_id: actorProfileId,
    };
    if (input.facilityId) {
      patch.facility_id = await this.resolveFacilityId(input.facilityId);
    }
    if (input.role) patch.operational_role = input.role;
    if (input.status) patch.status = input.status;
    const { data, error } = await this.admin
      .from("fm_facility_assignments")
      .update(patch)
      .eq("organisation_id", this.organisationId)
      .eq("id", existing.id)
      .select(SELECT_ASSIGNMENT)
      .single();
    if (error) throwDb(error, "Unable to update assignment.");
    if (!data) {
      throw new FmPeopleNotFoundError(`Assignment ${assignmentId} not found.`);
    }
    return asAssignment(data);
  }

  async deactivateProfileAssignments(
    profileId: string,
    actorProfileId: string | null
  ): Promise<FmFacilityAssignmentRow[]> {
    const existing = await this.getByProfileId(profileId);
    const active = existing.filter((row) => row.status === "active");
    if (active.length === 0) {
      throw new FmPeopleNotFoundError(`No active assignment for ${profileId}.`);
    }
    const updated: FmFacilityAssignmentRow[] = [];
    for (const row of active) {
      updated.push(
        await this.updateAssignment(row.id, { status: "inactive" }, actorProfileId)
      );
    }
    return updated;
  }

  private async loadEmails(profileIds: string[]): Promise<Map<string, string>> {
    const emails = new Map<string, string>();
    for (const id of profileIds) {
      const { data, error } = await this.admin.auth.admin.getUserById(id);
      if (error) {
        throw new FmPeopleUnavailableError("People directory is unavailable.");
      }
      emails.set(id, data.user?.email ?? "");
    }
    return emails;
  }
}
