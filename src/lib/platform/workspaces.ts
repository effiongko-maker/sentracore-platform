export type WorkspaceStatus = "active" | "in_development" | "planned";

export type WorkspaceId =
  | "operations"
  | "ecc-operations"
  | "finance"
  | "construction"
  | "projects-events";

export interface PlatformWorkspace {
  id: WorkspaceId;
  /** Short nav label */
  label: string;
  /** Full product name */
  title: string;
  status: WorkspaceStatus;
  statusLabel: string;
  /** Quiet status language for non-active environments */
  statusDetail?: string;
  description: string;
  /** Active workspace entry path */
  href?: string;
  /** Preview route for non-active workspaces */
  previewHref?: string;
  capabilities?: string[];
}

export const PLATFORM_HOME = {
  label: "Platform Home",
  href: "/",
} as const;

/** Facility Management workspace home (route unchanged for compatibility). */
export const OPERATIONS_HOME = {
  label: "Home",
  href: "/operations",
} as const;

export const PLATFORM_WORKSPACES: PlatformWorkspace[] = [
  {
    id: "operations",
    label: "Facility Management",
    title: "Facility Management",
    status: "active",
    statusLabel: "Active",
    description:
      "Manage facilities, assets, issues, work and operational execution across your environments.",
    href: OPERATIONS_HOME.href,
    capabilities: [
      "Facilities",
      "Assets",
      "Issues",
      "Work",
      "Work Orders",
    ],
  },
  {
    id: "ecc-operations",
    label: "ECC Operations",
    title: "ECC Operations",
    status: "active",
    statusLabel: "Active",
    description:
      "Support the reporting, monitoring and operational activity of Emergency Communication Centres.",
    href: "/ecc-operations",
    capabilities: ["Reporting", "Monitoring", "Centre Operations"],
  },
  {
    /**
     * Platform-level Finance workspace (SentraCore → Finance).
     * Distinct from Facility Management → Finance (`FM_FINANCE_HOME` / `/finance`).
     * Must never share the FM Finance route.
     */
    id: "finance",
    label: "Finance",
    title: "Finance",
    status: "in_development",
    statusLabel: "In development",
    statusDetail: "Being built for your organisation",
    description:
      "Organisation-wide financial operations, planning and reporting.",
    previewHref: "/workspaces/finance",
    capabilities: [
      "Financial controls",
      "Organisation reporting",
      "Platform finance activity",
    ],
  },
  {
    id: "construction",
    label: "Construction",
    title: "Construction",
    status: "planned",
    statusLabel: "Planned",
    statusDetail: "Coming to SentraCore",
    description:
      "Project delivery, contractors and site management.",
    previewHref: "/workspaces/construction",
    capabilities: ["Sites", "Progress", "Cost"],
  },
  {
    id: "projects-events",
    label: "Projects & Events",
    title: "Projects & Events",
    status: "planned",
    statusLabel: "Planned",
    statusDetail: "Coming to SentraCore",
    description:
      "Plan and execute projects, events and strategic initiatives.",
    previewHref: "/workspaces/projects-events",
    capabilities: ["Projects", "Tasks", "Events"],
  },
];

/**
 * Facility Management → Finance home.
 * Owned by the Facility Management (`operations`) workspace — not platform Finance.
 */
export const FM_FINANCE_HOME = {
  label: "Finance",
  href: "/finance",
} as const;

export function getWorkspace(id: WorkspaceId): PlatformWorkspace | undefined {
  return PLATFORM_WORKSPACES.find((workspace) => workspace.id === id);
}

/** Org module slug that gates enterability for a live workspace (if any). */
export const WORKSPACE_MODULE_SLUG: Partial<
  Record<WorkspaceId, "facility_management" | "ecc_operations">
> = {
  operations: "facility_management",
  "ecc-operations": "ecc_operations",
};

export type WorkspaceDirectoryState =
  | { kind: "enter"; href: string }
  | { kind: "no_access"; label: "No access" }
  | { kind: "unavailable"; label: string }
  | { kind: "loading" };

type WorkspaceAccessOptions = {
  /**
   * Org-enabled modules. `null` means not yet resolved (or session fetch failed).
   * Callers must pass `sessionLoading` so null is not mistaken for "no access".
   */
  enabledModules: Array<{ slug: string; status: string }> | null;
  sessionLoading?: boolean;
  isSuperAdmin?: boolean;
};

function hasEnabledModule(
  enabledModules: Array<{ slug: string; status: string }>,
  slug: string
): boolean {
  return enabledModules.some(
    (module) => module.slug === slug && module.status === "enabled"
  );
}

/**
 * Module directory / switcher enterability.
 * Visibility ≠ authorization — server gates remain authoritative.
 */
export function resolveWorkspaceDirectoryState(
  workspace: PlatformWorkspace,
  options: WorkspaceAccessOptions
): WorkspaceDirectoryState {
  if (workspace.status === "in_development") {
    return {
      kind: "unavailable",
      label: workspace.statusLabel || "In development",
    };
  }
  if (workspace.status === "planned") {
    return {
      kind: "unavailable",
      label: workspace.statusLabel || "Coming soon",
    };
  }
  if (workspace.status !== "active" || !workspace.href) {
    return { kind: "unavailable", label: "Coming soon" };
  }

  const moduleSlug = WORKSPACE_MODULE_SLUG[workspace.id];
  if (!moduleSlug) {
    return { kind: "enter", href: workspace.href };
  }

  if (options.sessionLoading || options.enabledModules === null) {
    // Unresolved enablement must not be treated as "no access".
    return { kind: "loading" };
  }

  if (
    options.isSuperAdmin ||
    hasEnabledModule(options.enabledModules, moduleSlug)
  ) {
    return { kind: "enter", href: workspace.href };
  }

  return { kind: "no_access", label: "No access" };
}

/** Enter href for sidebar / switcher, or null when non-enterable. */
export function workspaceHref(
  workspace: PlatformWorkspace,
  options: WorkspaceAccessOptions
): string | null {
  const state = resolveWorkspaceDirectoryState(workspace, options);
  return state.kind === "enter" ? state.href : null;
}

/** Workspaces the current user may enter (sidebar + switcher). */
export function listEnterableWorkspaces(
  options: WorkspaceAccessOptions
): Array<PlatformWorkspace & { href: string }> {
  const result: Array<PlatformWorkspace & { href: string }> = [];
  for (const workspace of PLATFORM_WORKSPACES) {
    const href = workspaceHref(workspace, options);
    if (href) result.push({ ...workspace, href });
  }
  return result;
}

/**
 * Workspace currently entered for this route.
 * Distinct from catalog `status: "active"` (product is live/available).
 */
export function resolveCurrentWorkspaceId(
  pathname: string
): WorkspaceId | null {
  if (isPlatformHomePath(pathname)) return null;

  if (isEccOperationsPath(pathname)) {
    return "ecc-operations";
  }

  // Platform Finance module route (catalogue stays in_development / no href).
  if (isPlatformFinancePath(pathname)) {
    return "finance";
  }

  // Platform Finance workspace preview (never /finance — that is FM Finance).
  if (pathname.startsWith("/workspaces/")) {
    const slug = pathname.slice("/workspaces/".length).split("/")[0] ?? "";
    if (slug && getWorkspace(slug as WorkspaceId)) {
      return slug as WorkspaceId;
    }
    return null;
  }

  // Facility Management home + FM module routes (including FM Finance).
  if (
    pathname === OPERATIONS_HOME.href ||
    pathname.startsWith(`${OPERATIONS_HOME.href}/`) ||
    pathname === FM_FINANCE_HOME.href ||
    pathname.startsWith(`${FM_FINANCE_HOME.href}/`) ||
    isOperationsPath(pathname)
  ) {
    return "operations";
  }

  return null;
}

export function resolveCurrentWorkspace(
  pathname: string
): PlatformWorkspace | null {
  const id = resolveCurrentWorkspaceId(pathname);
  return id ? getWorkspace(id) ?? null : null;
}

/** Primary live workspace for platform marketing surfaces (not route-current). */
export function getActiveWorkspace(): PlatformWorkspace {
  return PLATFORM_WORKSPACES.find((workspace) => workspace.status === "active")!;
}

export function isPlatformHomePath(pathname: string): boolean {
  return pathname === "/" || pathname === "";
}

export function isOperationsPath(pathname: string): boolean {
  if (pathname === OPERATIONS_HOME.href) return true;
  if (pathname.startsWith("/workspaces")) return false;
  if (isPlatformHomePath(pathname)) return false;
  // Platform Finance must not be treated as FM (/platform prefix alone is insufficient).
  if (isPlatformFinancePath(pathname)) return false;
  if (isEccOperationsPath(pathname)) return false;
  return (
    pathname.startsWith("/intelligence") ||
    pathname.startsWith("/dashboards") ||
    pathname.startsWith("/reports") ||
    pathname.startsWith("/facilities") ||
    pathname.startsWith("/assets") ||
    pathname.startsWith("/operational-registers") ||
    pathname.startsWith("/generator-log") ||
    pathname.startsWith("/energy-reading") ||
    pathname.startsWith("/diesel-usage") ||
    pathname.startsWith("/consumables-update") ||
    pathname.startsWith("/waste-log") ||
    pathname.startsWith("/fumigation-log") ||
    pathname.startsWith("/deep-cleaning-log") ||
    pathname.startsWith("/users") ||
    pathname.startsWith("/master-data") ||
    pathname.startsWith("/occupant-requests") ||
    pathname.startsWith("/requests") ||
    pathname.startsWith("/issues") ||
    pathname.startsWith("/work") ||
    pathname.startsWith("/maintenance") ||
    pathname.startsWith("/work-orders") ||
    pathname.startsWith("/approvals") ||
    pathname.startsWith("/finance") ||
    pathname.startsWith("/notifications") ||
    pathname.startsWith("/incidents") ||
    pathname.startsWith("/inventory") ||
    pathname.startsWith("/utilities") ||
    pathname === "/platform" ||
    pathname.startsWith("/platform/")
  );
}

export function isWorkspacePreviewPath(pathname: string): boolean {
  return pathname.startsWith("/workspaces/");
}

/** ECC Operations workspace routes (not Facility Management). */
export function isEccOperationsPath(pathname: string): boolean {
  return (
    pathname === "/ecc-operations" || pathname.startsWith("/ecc-operations/")
  );
}

/**
 * Platform Finance module routes (not FM `/finance`, not catalogue href).
 * Catalogue Finance remains `in_development` without an `href`.
 */
export function isPlatformFinancePath(pathname: string): boolean {
  return (
    pathname === "/platform-finance" ||
    pathname.startsWith("/platform-finance/")
  );
}

/**
 * Platform chrome without FM operating layers
 * (workspace previews + ECC / Platform Finance foundation shells).
 */
export function isPlatformWorkspaceSurfacePath(pathname: string): boolean {
  return (
    isWorkspacePreviewPath(pathname) ||
    isEccOperationsPath(pathname) ||
    isPlatformFinancePath(pathname)
  );
}
