import type { AuthRoleAssignment } from "@/lib/auth/types";
import type { ActionAuthz } from "./types";

function asList(slug: string | string[]): string[] {
  return Array.isArray(slug) ? slug : [slug];
}

/**
 * Build authorisation helpers from role assignments.
 * Keeps role checks out of domain handlers.
 */
export function createActionAuthz(
  roleAssignments: AuthRoleAssignment[],
  organisationId: string
): ActionAuthz {
  const slugs = new Set(roleAssignments.map((r) => r.roleSlug));

  return {
    hasRole(slug) {
      return asList(slug).some((s) => slugs.has(s));
    },

    hasPlatformRole(slug) {
      const wanted = new Set(asList(slug));
      return roleAssignments.some(
        (r) =>
          r.isPlatformRole &&
          r.organisationId === null &&
          wanted.has(r.roleSlug)
      );
    },

    hasOrganisationRole(slug) {
      const wanted = new Set(asList(slug));
      return roleAssignments.some(
        (r) =>
          !r.isPlatformRole &&
          r.organisationId === organisationId &&
          wanted.has(r.roleSlug)
      );
    },

    hasDepartmentRole(departmentId, slug) {
      const wanted = new Set(asList(slug));
      return roleAssignments.some(
        (r) =>
          !r.isPlatformRole &&
          r.organisationId === organisationId &&
          wanted.has(r.roleSlug) &&
          (r.departmentId === null || r.departmentId === departmentId)
      );
    },

    isPlatformSuperAdmin() {
      return roleAssignments.some(
        (r) =>
          r.roleSlug === "platform_super_admin" &&
          r.isPlatformRole &&
          r.organisationId === null
      );
    },
  };
}
