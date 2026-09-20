import "server-only";
import { createAdminClient } from "@/utils/supabase/admin";
import type { AssignablePerson } from "../types";

/**
 * Narrow operational read for assignment pickers.
 *
 * Returns ONLY what assignment needs — profile UUID, display name, descriptive
 * operational role and the assigned facility UUID. No email, no auth/admin
 * metadata, no capability grants, no platform roles. Organisation-scoped;
 * only people with an ACTIVE facility assignment and an ACTIVE profile.
 * Failure throws — it is never an empty list.
 */
export async function loadAssignablePeople(
  organisationId: string,
  admin: ReturnType<typeof createAdminClient> = createAdminClient()
): Promise<AssignablePerson[]> {
  const { data: assignments, error } = await admin
    .from("fm_facility_assignments")
    .select("profile_id, facility_id, operational_role, updated_at")
    .eq("organisation_id", organisationId)
    .eq("status", "active")
    .order("updated_at", { ascending: false });
  if (error) throw new Error("Assignable people could not be read.");

  const byProfile = new Map<string, { facilityId: string; role: string }>();
  for (const row of assignments ?? []) {
    const profileId = String(row.profile_id);
    if (byProfile.has(profileId)) continue;
    byProfile.set(profileId, {
      facilityId: String(row.facility_id ?? ""),
      role: String(row.operational_role ?? ""),
    });
  }
  if (byProfile.size === 0) return [];

  const { data: profiles, error: profileError } = await admin
    .from("profiles")
    .select("id, full_name, first_name, last_name, status")
    .eq("organisation_id", organisationId)
    .eq("status", "active")
    .in("id", [...byProfile.keys()]);
  if (profileError) throw new Error("Assignable people could not be read.");

  const people: AssignablePerson[] = [];
  for (const profile of profiles ?? []) {
    const assignment = byProfile.get(String(profile.id));
    if (!assignment) continue;
    const name =
      String(profile.full_name ?? "").trim() ||
      [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim();
    if (!name) continue;
    people.push({
      id: String(profile.id),
      name,
      role: assignment.role,
      facilityId: assignment.facilityId,
    });
  }
  return people.sort((a, b) => a.name.localeCompare(b.name));
}
