/**
 * Platform authentication / tenancy context (Supabase Auth + core tables).
 * Distinct from Apps Script FM `User` / `CurrentUser` operational types.
 */

export type ProfileStatus = "invited" | "active" | "suspended" | "inactive";

export interface AuthProfile {
  id: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  jobTitle: string | null;
  organisationId: string | null;
  status: ProfileStatus;
  /** platform | module — module-bound identities are restricted to homeModule (see moduleBoundary.ts). */
  accessScope?: "platform" | "module";
  homeModule?: string | null;
  /** UX routing preference for platform-scope identities only (see landingWorkspace.ts). Never authority. */
  landingWorkspace?: string | null;
}

export interface AuthOrganisation {
  id: string;
  name: string;
  slug: string;
  status: string;
  /**
   * Authoritative IANA timezone (organisations.timezone). Null only if the row
   * could not supply one — operational date semantics must then fail explicitly.
   */
  timezone?: string | null;
}

export interface AuthRoleAssignment {
  id: string;
  roleId: string;
  roleSlug: string;
  roleName: string;
  organisationId: string | null;
  departmentId: string | null;
  isPlatformRole: boolean;
}

export interface AuthEnabledModule {
  id: string;
  moduleId: string;
  slug: string;
  name: string;
  status: "enabled" | "disabled" | "preparing";
}

export interface PlatformSession {
  userId: string;
  email: string;
  profile: AuthProfile;
  organisation: AuthOrganisation | null;
  roleAssignments: AuthRoleAssignment[];
  roleSlugs: string[];
  enabledModules: AuthEnabledModule[];
}

/** Compact identity for chrome (TopBar) — derived from PlatformSession. */
export interface SessionIdentity {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarInitials: string;
  organisationId: string | null;
  organisationName: string | null;
  roleSlugs: string[];
}
