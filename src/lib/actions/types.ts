import type {
  AuthEnabledModule,
  AuthOrganisation,
  AuthProfile,
  AuthRoleAssignment,
} from "@/lib/auth/types";

/**
 * Known platform module slugs (registry).
 * Keep this open for future modules without FM hardcoding in the executor.
 */
export type PlatformModuleSlug =
  | "facility_management"
  | "ecc_operations"
  | "construction"
  | "projects_events"
  | (string & {});

/**
 * Naming conventions (platform-wide):
 *
 * ACTION NAMES — present-tense operational intent
 *   e.g. incident.report, maintenance.request, work_order.create
 *
 * EVENT TYPES — past-tense operational facts (namespaced)
 *   e.g. facility.incident_reported, facility.work_order_completed
 */

/**
 * Authorisation surface for future action-level checks.
 * Prefer these helpers over raw roleSlug comparisons in domain code.
 */
export type ActionAuthz = {
  /** Any matching role slug (platform or organisation scoped). */
  hasRole: (slug: string | string[]) => boolean;
  /** Platform-scoped role (organisation_id null on assignment). */
  hasPlatformRole: (slug: string | string[]) => boolean;
  /** Organisation-scoped role for the home organisation. */
  hasOrganisationRole: (slug: string | string[]) => boolean;
  /**
   * Department-scoped role when assignment.departmentId matches.
   * Falls back to org-scoped role (null department) as broader access.
   */
  hasDepartmentRole: (
    departmentId: string,
    slug: string | string[]
  ) => boolean;
  /** Convenience: platform_super_admin. */
  isPlatformSuperAdmin: () => boolean;
};

export type ActionDepartment = {
  id: string;
  organisationId: string;
  name: string;
  slug: string;
  status: string;
};

/**
 * Authenticated platform context for action execution.
 * organisationId / userId must come from here — never from client input.
 */
export type ActionContext = {
  userId: string;
  email: string;
  profile: AuthProfile;
  organisation: AuthOrganisation;
  roleAssignments: AuthRoleAssignment[];
  roleSlugs: string[];
  enabledModules: AuthEnabledModule[];
  /** Resolved when the action requests a department. */
  department: ActionDepartment | null;
  /** Enabled module row for the action's required module. */
  module: AuthEnabledModule;
  authz: ActionAuthz;
  /** UTC ISO timestamp when the context was resolved. */
  now: string;
};

export type ActionDefinition<TInput, TData> = {
  /** Stable action name, e.g. "incident.report". */
  name: string;
  /** Required organisation module slug. */
  module: PlatformModuleSlug;
  input?: TInput;
  /** Optional department to resolve safely into context. */
  departmentId?: string | null;
  handler: (context: ActionContext, input: TInput) => Promise<TData>;
};
