import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import type {
  AuthEnabledModule,
  AuthOrganisation,
  AuthProfile,
  AuthRoleAssignment,
  PlatformSession,
  SessionIdentity,
} from "@/lib/auth/types";

function initialsFromName(name: string, email: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  }
  if (parts.length === 1 && parts[0]!.length >= 2) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  return (email.slice(0, 2) || "SC").toUpperCase();
}

function mapProfile(row: Record<string, unknown>): AuthProfile {
  return {
    id: String(row.id),
    firstName: row.first_name ? String(row.first_name) : null,
    lastName: row.last_name ? String(row.last_name) : null,
    fullName: row.full_name ? String(row.full_name) : null,
    avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
    jobTitle: row.job_title ? String(row.job_title) : null,
    organisationId: row.organisation_id ? String(row.organisation_id) : null,
    status: String(row.status ?? "invited") as AuthProfile["status"],
  };
}

/**
 * Load the authenticated platform session (profile, org, roles, enabled modules).
 * Returns null when there is no Supabase Auth session.
 */
export async function getPlatformSession(): Promise<PlatformSession | null> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profileRow, error: profileError } = await supabase
    .from("profiles")
    .select(
      "id, first_name, last_name, full_name, avatar_url, job_title, organisation_id, status"
    )
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profileRow) {
    // Auth user exists but profile missing — treat as incomplete session.
    return null;
  }

  const profile = mapProfile(profileRow as Record<string, unknown>);

  let organisation: AuthOrganisation | null = null;
  if (profile.organisationId) {
    const { data: orgRow } = await supabase
      .from("organisations")
      .select("id, name, slug, status")
      .eq("id", profile.organisationId)
      .maybeSingle();

    if (orgRow) {
      organisation = {
        id: String(orgRow.id),
        name: String(orgRow.name),
        slug: String(orgRow.slug),
        status: String(orgRow.status),
      };
    }
  }

  const { data: assignmentRows } = await supabase
    .from("user_role_assignments")
    .select(
      `
      id,
      role_id,
      organisation_id,
      department_id,
      roles (
        id,
        name,
        slug,
        is_platform_role,
        status
      )
    `
    )
    .eq("profile_id", user.id);

  const roleAssignments: AuthRoleAssignment[] = (assignmentRows ?? [])
    .map((row) => {
      const roleRaw = row.roles;
      const role = Array.isArray(roleRaw) ? roleRaw[0] : roleRaw;
      if (!role || typeof role !== "object") return null;
      const r = role as Record<string, unknown>;
      if (String(r.status) !== "active") return null;
      return {
        id: String(row.id),
        roleId: String(row.role_id),
        roleSlug: String(r.slug),
        roleName: String(r.name),
        organisationId: row.organisation_id
          ? String(row.organisation_id)
          : null,
        departmentId: row.department_id ? String(row.department_id) : null,
        isPlatformRole: Boolean(r.is_platform_role),
      } satisfies AuthRoleAssignment;
    })
    .filter((row): row is AuthRoleAssignment => row !== null);

  const roleSlugs = [...new Set(roleAssignments.map((r) => r.roleSlug))];

  let enabledModules: AuthEnabledModule[] = [];
  if (profile.organisationId) {
    const { data: moduleRows } = await supabase
      .from("organisation_modules")
      .select(
        `
        id,
        module_id,
        status,
        modules (
          id,
          name,
          slug,
          status
        )
      `
      )
      .eq("organisation_id", profile.organisationId)
      .eq("status", "enabled");

    enabledModules = [];
    for (const row of moduleRows ?? []) {
      const modRaw = row.modules;
      const mod = Array.isArray(modRaw) ? modRaw[0] : modRaw;
      if (!mod || typeof mod !== "object") continue;
      const m = mod as Record<string, unknown>;
      if (String(m.status) !== "active") continue;
      enabledModules.push({
        id: String(row.id),
        moduleId: String(row.module_id),
        slug: String(m.slug),
        name: String(m.name),
        status: "enabled",
      });
    }
  }

  return {
    userId: user.id,
    email: user.email ?? "",
    profile,
    organisation,
    roleAssignments,
    roleSlugs,
    enabledModules,
  };
}

export function toSessionIdentity(
  session: PlatformSession
): SessionIdentity {
  const name =
    session.profile.fullName?.trim() ||
    [session.profile.firstName, session.profile.lastName]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    session.email;

  const primaryRole =
    session.roleAssignments.find((r) => !r.isPlatformRole)?.roleName ??
    session.roleAssignments[0]?.roleName ??
    "Member";

  return {
    id: session.userId,
    name,
    email: session.email,
    role: primaryRole,
    avatarInitials: initialsFromName(name, session.email),
    organisationId: session.organisation?.id ?? session.profile.organisationId,
    organisationName: session.organisation?.name ?? null,
    roleSlugs: session.roleSlugs,
  };
}

export async function requirePlatformSession(): Promise<PlatformSession> {
  const session = await getPlatformSession();
  if (!session) {
    throw new Error("Unauthorized");
  }
  return session;
}
