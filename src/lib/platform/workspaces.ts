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
    status: "in_development",
    statusLabel: "In development",
    statusDetail: "Being built for your organisation",
    description:
      "Support the reporting, monitoring and operational activity of Emergency Communication Centres.",
    previewHref: "/workspaces/ecc-operations",
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

/**
 * Workspace currently entered for this route.
 * Distinct from catalog `status: "active"` (product is live/available).
 */
export function resolveCurrentWorkspaceId(
  pathname: string
): WorkspaceId | null {
  if (isPlatformHomePath(pathname)) return null;

  // Platform Finance workspace entry (never /finance — that is FM Finance).
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
  return (
    pathname.startsWith("/intelligence") ||
    pathname.startsWith("/dashboards") ||
    pathname.startsWith("/reports") ||
    pathname.startsWith("/facilities") ||
    pathname.startsWith("/assets") ||
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
    pathname.startsWith("/platform")
  );
}

export function isWorkspacePreviewPath(pathname: string): boolean {
  return pathname.startsWith("/workspaces/");
}
