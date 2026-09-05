/**
 * Visibility surfaces — what a user may SEE / DRILL INTO.
 * Distinct from mutation capabilities (ops.create, finance.pay, …).
 *
 * A surface may be visible without any write capability on that domain.
 */

import type { OperatingAccess } from "./resolveAccess";
import { accessCan } from "./resolveAccess";
import type { AccessCapability } from "./capabilities";

export const VISIBILITY_SURFACES = [
  "home",
  "operations",
  "approvals",
  "finance",
  "users",
  "requests",
  "organise",
  "intelligence",
  "reports",
] as const;

export type VisibilitySurface = (typeof VISIBILITY_SURFACES)[number];

export type AccessVisibility = {
  surfaces: ReadonlySet<VisibilitySurface>;
  /** True when the actor may mutate operational registers. */
  canMutateOperations: boolean;
  /** True when the actor may create/submit finance records. */
  canMutateFinance: boolean;
  /** True when the actor may authorize/pay finance. */
  canAuthorizeFinance: boolean;
  /** True when the actor may manage people. */
  canManageUsers: boolean;
  /** True when the actor may manage approval packages (not just view). */
  canManageApprovals: boolean;
  /** Executive / Boss read-only broad oversight. */
  isExecutiveOversight: boolean;
};

const ALL_SURFACES: readonly VisibilitySurface[] = VISIBILITY_SURFACES;

/** Href prefix → surface for nav filtering. */
const HREF_SURFACE_RULES: Array<{ prefix: string; surface: VisibilitySurface }> =
  [
    { prefix: "/finance", surface: "finance" },
    { prefix: "/users", surface: "users" },
    { prefix: "/occupant-requests", surface: "requests" },
    { prefix: "/requests", surface: "operations" },
    { prefix: "/approvals", surface: "approvals" },
    { prefix: "/intelligence", surface: "intelligence" },
    { prefix: "/reports", surface: "reports" },
    { prefix: "/operations", surface: "home" },
    { prefix: "/dashboards", surface: "home" },
    { prefix: "/issues", surface: "operations" },
    { prefix: "/work-orders", surface: "operations" },
    { prefix: "/work", surface: "operations" },
    { prefix: "/maintenance", surface: "operations" },
    { prefix: "/incidents", surface: "operations" },
    { prefix: "/notifications", surface: "home" },
    { prefix: "/facilities", surface: "organise" },
    { prefix: "/assets", surface: "organise" },
    { prefix: "/master-data", surface: "organise" },
  ];

export function surfaceForHref(href: string): VisibilitySurface | null {
  const path = href.split("?")[0] ?? href;
  for (const rule of HREF_SURFACE_RULES) {
    if (path === rule.prefix || path.startsWith(`${rule.prefix}/`)) {
      return rule.surface;
    }
  }
  return null;
}

function surfacesFromCapabilities(
  access: Pick<OperatingAccess, "capabilities" | "role" | "unassigned" | "hasAdminOverride">
): Set<VisibilitySurface> {
  // Super Admin / legacy unassigned / FM: full platform surfaces
  if (
    access.hasAdminOverride ||
    access.unassigned ||
    access.role === "facility_manager"
  ) {
    return new Set(ALL_SURFACES);
  }

  if (access.role === "executive") {
    // Broad VIEW / DRILL-DOWN — no People admin, no Intelligence product required
    return new Set<VisibilitySurface>([
      "home",
      "operations",
      "approvals",
      "finance",
      "requests",
      "organise",
      "reports",
    ]);
  }

  if (access.role === "ncc_client") {
    // Requests portal only — isolate from internal FM / Finance surfaces
    return new Set<VisibilitySurface>(["requests"]);
  }

  const surfaces = new Set<VisibilitySurface>(["home"]);

  if (accessCan(access, "ops.view")) {
    surfaces.add("operations");
    surfaces.add("approvals");
    surfaces.add("organise");
  }
  if (accessCan(access, "finance.view")) {
    surfaces.add("finance");
  }
  if (accessCan(access, "users.view")) {
    surfaces.add("users");
  }
  if (accessCan(access, "requests.view")) {
    surfaces.add("requests");
  }

  // FM Staff / Finance / Liaison with ops.view also get reports drill-down
  if (accessCan(access, "ops.view") || accessCan(access, "finance.view")) {
    surfaces.add("reports");
  }

  // Intelligence remains FM/SA-oriented (full surfaces); staff with ops can open if linked
  if (
    access.role === "fm_staff" ||
    accessCan(access, "ops.create")
  ) {
    surfaces.add("intelligence");
  }

  return surfaces;
}

export function resolveAccessVisibility(
  access: OperatingAccess
): AccessVisibility {
  const surfaces = surfacesFromCapabilities(access);
  return {
    surfaces,
    canMutateOperations:
      accessCan(access, "ops.create") || accessCan(access, "ops.edit"),
    canMutateFinance:
      accessCan(access, "finance.create") ||
      accessCan(access, "finance.submit"),
    canAuthorizeFinance:
      accessCan(access, "finance.authorize") ||
      accessCan(access, "finance.pay"),
    canManageUsers: accessCan(access, "users.manage"),
    canManageApprovals: accessCan(access, "approvals.manage"),
    isExecutiveOversight: access.role === "executive",
  };
}

export function canSeeSurface(
  visibility: AccessVisibility,
  surface: VisibilitySurface
): boolean {
  return visibility.surfaces.has(surface);
}

export function canSeeHref(
  visibility: AccessVisibility,
  href: string
): boolean {
  const surface = surfaceForHref(href);
  if (!surface) return true;
  return canSeeSurface(visibility, surface);
}

/** Mutation capability required for a Home "next action" id, if any. */
export function mutationCapabilityForQuickAction(
  actionId: string
): AccessCapability | null {
  switch (actionId) {
    case "log-issue":
      return "ops.create";
    case "create-work-order":
      return "ops.view"; // browse WO is view; create gated elsewhere
    case "manage-facilities":
      return "ops.view";
    default:
      return null;
  }
}
