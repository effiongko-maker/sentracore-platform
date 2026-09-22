/**
 * The ONE authoritative classification of SentraCore™ workspaces for account provisioning.
 *
 * Product laws this encodes:
 *   - HOME WORKSPACE / MODULE BOUNDARY ≠ BUSINESS AUTHORITY. Choosing a home establishes an operating boundary and a
 *     default destination. It grants no capability and no data scope.
 *   - Only genuine operating environments can be a MODULE-BOUND HOME. Executive landing, administration and the
 *     private Private Office surface are not roles a person is "bound" to.
 *
 * Everything that lists workspaces — the DB-mirrored bound-module set (moduleBoundary.ts), the landing preference
 * set (landingWorkspace.ts), the Admin Console's Create Account / access-scope UI — derives from this file. The two DB
 * constraints that mirror it (profiles_access_scope_valid, profiles_landing_workspace_valid) are checked against it by
 * scripts/verify-home-workspaces.mts, so a workspace cannot drift in one place only.
 *
 * Pure data: safe to import from client components.
 */

export type WorkspaceKind =
  /** An operating environment a person can be confined to. */
  | "module_home"
  /** An executive surface for platform-scope identities: a landing preference, never a bound home. */
  | "executive_landing"
  /** Administrative functionality derived from administrative authority — not a business workspace. */
  | "authority_derived"
  /** Nested/private surface: never selectable as any home or landing. */
  | "private_nested";

export type WorkspaceRegistryEntry = {
  id: string;
  label: string;
  route: string;
  kind: WorkspaceKind;
  /** Selectable as a module-bound home (profiles.home_module). */
  moduleBoundHome: boolean;
  /** Selectable as a platform-scope landing preference (profiles.landing_workspace). */
  landingSelectable: boolean;
  /** What a home in this workspace still needs before the person can DO anything (never inferred from the home). */
  requiresExplicit: ReadonlyArray<"capability_grants" | "facility_assignment" | "finance_company_access">;
  /** Whether a facility assignment / FM operating role is meaningful for this home. */
  facilityContext: boolean;
  /** Why the workspace is (not) a selectable home. Shown in the Admin Console. */
  note: string;
};

export const WORKSPACE_REGISTRY = [
  {
    id: "facility_management",
    label: "Facility Management",
    route: "/operations",
    kind: "module_home",
    moduleBoundHome: true,
    landingSelectable: true,
    requiresExplicit: ["capability_grants", "facility_assignment"],
    facilityContext: true,
    note: "Operating environment. Facility assignment, operating role and FM capabilities are explicit.",
  },
  {
    id: "ecc_operations",
    label: "ECC Operations",
    route: "/ecc-operations",
    kind: "module_home",
    moduleBoundHome: true,
    landingSelectable: true,
    requiresExplicit: ["capability_grants"],
    facilityContext: false,
    note: "Operating environment with its own capability family. No FM facility assignment.",
  },
  {
    id: "platform_finance",
    label: "Platform Finance",
    route: "/platform-finance",
    kind: "module_home",
    moduleBoundHome: true,
    landingSelectable: true,
    requiresExplicit: ["capability_grants", "finance_company_access"],
    facilityContext: false,
    note: "Operating environment for Finance personnel. Company access and platform_finance.* capabilities are explicit and separate from this home; not FM Costs & Claims (finance.*).",
  },
  {
    id: "command_centre",
    label: "Executive Office",
    route: "/command-centre",
    kind: "executive_landing",
    moduleBoundHome: false,
    landingSelectable: true,
    requiresExplicit: ["capability_grants"],
    facilityContext: false,
    note: "Executive surface spanning the platform. Only a platform-scope landing preference; a module-bound identity can never reach it.",
  },
  {
    id: "admin_console",
    label: "Admin Console",
    route: "/admin",
    kind: "authority_derived",
    moduleBoundHome: false,
    landingSelectable: false,
    requiresExplicit: [],
    facilityContext: false,
    note: "Administrative functionality derived from Super Admin authority. Not a business home workspace.",
  },
  {
    id: "private_office",
    label: "Private Office",
    route: "/command-centre/private-office",
    kind: "private_nested",
    moduleBoundHome: false,
    landingSelectable: false,
    requiresExplicit: [],
    facilityContext: false,
    note: "Private, nested surface. Never a selectable home or landing.",
  },
] as const satisfies readonly WorkspaceRegistryEntry[];

export type WorkspaceRegistryId = (typeof WORKSPACE_REGISTRY)[number]["id"];

type IdWhere<K extends "moduleBoundHome" | "landingSelectable"> = Extract<
  (typeof WORKSPACE_REGISTRY)[number],
  Record<K, true>
>["id"];

export type BoundHomeId = IdWhere<"moduleBoundHome">;
export type LandingId = IdWhere<"landingSelectable">;

export const MODULE_BOUND_HOME_IDS = WORKSPACE_REGISTRY.filter((w) => w.moduleBoundHome).map(
  (w) => w.id
) as unknown as readonly BoundHomeId[];

export const LANDING_SELECTABLE_IDS = WORKSPACE_REGISTRY.filter((w) => w.landingSelectable).map(
  (w) => w.id
) as unknown as readonly LandingId[];

/** Selectable module-bound homes with what the Admin Console needs to render them. */
export const MODULE_BOUND_HOME_OPTIONS: ReadonlyArray<WorkspaceRegistryEntry> = WORKSPACE_REGISTRY.filter(
  (w) => w.moduleBoundHome
);

export const LANDING_OPTIONS: ReadonlyArray<WorkspaceRegistryEntry> = WORKSPACE_REGISTRY.filter(
  (w) => w.landingSelectable
);

export function workspaceEntry(id: string | null | undefined): WorkspaceRegistryEntry | null {
  return WORKSPACE_REGISTRY.find((w) => w.id === id) ?? null;
}

export function workspaceLabel(id: string | null | undefined): string {
  return workspaceEntry(id)?.label ?? "Invalid home module";
}
