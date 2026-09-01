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
      "Manage facilities, assets, issues, work and operational execution from one connected environment.",
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
    id: "finance",
    label: "Finance",
    title: "Finance",
    status: "active",
    statusLabel: "Active",
    description:
      "Operational financial position — costs, reimbursement submissions, client authorisation, and payment across facility operations.",
    href: "/finance",
    capabilities: [
      "Operational costs",
      "Reimbursement submissions",
      "Client authorisation",
      "Payment position",
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
      "Manage construction activity, site operations, progress and project delivery.",
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
      "Plan, coordinate and manage projects, programmes and events across the organisation.",
    previewHref: "/workspaces/projects-events",
    capabilities: ["Projects", "Tasks", "Events"],
  },
];

export function getWorkspace(id: WorkspaceId): PlatformWorkspace | undefined {
  return PLATFORM_WORKSPACES.find((workspace) => workspace.id === id);
}

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
    pathname.startsWith("/incidents") ||
    pathname.startsWith("/inventory") ||
    pathname.startsWith("/utilities") ||
    pathname.startsWith("/platform")
  );
}

export function isWorkspacePreviewPath(pathname: string): boolean {
  return pathname.startsWith("/workspaces/");
}
