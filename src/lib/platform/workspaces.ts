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

export const OPERATIONS_HOME = {
  label: "Home",
  href: "/operations",
} as const;

export const PLATFORM_WORKSPACES: PlatformWorkspace[] = [
  {
    id: "operations",
    label: "Operations Management",
    title: "Operations Management",
    status: "active",
    statusLabel: "Active",
    description:
      "Manage the organisation's physical environment, operational activity, maintenance, incidents and work.",
    href: OPERATIONS_HOME.href,
  },
  {
    id: "ecc-operations",
    label: "ECC Operations",
    title: "ECC Operations",
    status: "in_development",
    statusLabel: "In development",
    statusDetail: "Being built for your organisation",
    description:
      "Manage the reporting, monitoring and operational activity of Emergency Communication Centres.",
    previewHref: "/workspaces/ecc-operations",
    capabilities: ["Calls", "Events", "Reporting"],
  },
  {
    id: "finance",
    label: "Finance",
    title: "Finance",
    status: "in_development",
    statusLabel: "In development",
    statusDetail: "Being built for your organisation",
    description:
      "Financial operations, planning, treasury and expenditure management.",
    previewHref: "/workspaces/finance",
    capabilities: ["Treasury", "Planning", "Expenditure"],
  },
  {
    id: "construction",
    label: "Construction",
    title: "Construction",
    status: "planned",
    statusLabel: "Planned",
    statusDetail: "Coming to SentraCore",
    description:
      "Project execution, site activity, progress and construction operations.",
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
      "Planning and coordinating projects, programmes and organisational events.",
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
    pathname.startsWith("/maintenance") ||
    pathname.startsWith("/work-orders") ||
    pathname.startsWith("/incidents") ||
    pathname.startsWith("/inventory") ||
    pathname.startsWith("/utilities") ||
    pathname.startsWith("/platform")
  );
}

export function isWorkspacePreviewPath(pathname: string): boolean {
  return pathname.startsWith("/workspaces/");
}
