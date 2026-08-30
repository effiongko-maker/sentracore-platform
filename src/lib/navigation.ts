import {
  Home,
  Building2,
  Package,
  Users,
  Wrench,
  ClipboardList,
  AlertTriangle,
  Boxes,
  Zap,
  FileBarChart2,
  Settings2,
  MessageSquarePlus,
  Inbox,
  Database,
  ScanSearch,
  FileCheck2,
  type LucideIcon,
} from "lucide-react";
import type { AuthEnabledModule } from "@/lib/auth/types";
import type { PlatformModuleSlug } from "@/lib/actions/types";
import { hasModule } from "@/lib/actions/moduleAccess";

export type NavGroupId =
  | "home"
  | "organise"
  | "operate"
  | "understand"
  | "communicate";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Page-level title — shown in PageHeader, not duplicated in TopBar. */
  title: string;
  description: string;
  /** When set, item is hidden unless this module is enabled. */
  moduleSlug?: PlatformModuleSlug;
}

export interface NavGroup {
  id: NavGroupId;
  label: string;
  items: NavItem[];
}

const FM_MODULE: PlatformModuleSlug = "facility_management";

function item(
  partial: NavItem & { moduleSlug?: PlatformModuleSlug }
): NavItem {
  return { moduleSlug: FM_MODULE, ...partial };
}

/** Grouped primary navigation — production-ready modules only. */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: "home",
    label: "Home",
    items: [
      {
        label: "Home",
        href: "/operations",
        icon: Home,
        title: "Home",
        description:
          "Your work for today — assignments, schedule, and quick actions",
      },
    ],
  },
  {
    id: "organise",
    label: "Organise",
    items: [
      item({
        label: "Facilities",
        href: "/facilities",
        icon: Building2,
        title: "Facilities",
        description: "Sites, buildings, and locations",
      }),
      item({
        label: "Assets",
        href: "/assets",
        icon: Package,
        title: "Assets",
        description: "Track and manage operational assets",
      }),
      item({
        label: "Users",
        href: "/users",
        icon: Users,
        title: "Users",
        description: "People, roles, and access",
      }),
      item({
        label: "Master Data",
        href: "/master-data",
        icon: Database,
        title: "Master Data",
        description: "Departments, buildings, floors, rooms, and vendors",
      }),
    ],
  },
  {
    id: "operate",
    label: "Operate",
    items: [
      item({
        label: "Submit request",
        href: "/occupant-requests",
        icon: MessageSquarePlus,
        title: "Submit request",
        description: "Report a maintenance need or incident",
      }),
      item({
        label: "Request Queue",
        href: "/requests",
        icon: Inbox,
        title: "Request Queue",
        description: "Incoming reports requiring facility review",
      }),
      item({
        label: "Maintenance",
        href: "/maintenance",
        icon: Wrench,
        title: "Maintenance",
        description: "Schedules, plans, and preventive work",
      }),
      item({
        label: "Work Orders",
        href: "/work-orders",
        icon: ClipboardList,
        title: "Work Orders",
        description: "Assignments, progress, and completion",
      }),
      item({
        label: "Approvals",
        href: "/approvals",
        icon: FileCheck2,
        title: "Approvals",
        description: "Client authorisation to proceed with work",
      }),
      item({
        label: "Incidents",
        href: "/incidents",
        icon: AlertTriangle,
        title: "Incidents",
        description: "Safety events and critical issues",
      }),
    ],
  },
  {
    id: "understand",
    label: "Understand",
    items: [
      item({
        label: "Intelligence",
        href: "/intelligence",
        icon: ScanSearch,
        title: "Intelligence",
        description: "What matters across your operation",
      }),
    ],
  },
  {
    id: "communicate",
    label: "Communicate",
    items: [
      item({
        label: "Reports",
        href: "/reports",
        icon: FileBarChart2,
        title: "Reports",
        description: "Generate client-facing operational reports",
      }),
    ],
  },
];

/** Flat list derived from groups — for backwards compatibility. */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

/**
 * Modules kept out of the primary sidebar but still routable via deep links.
 * Used only for TopBar context resolution.
 */
const SECONDARY_NAV_ITEMS: NavItem[] = [
  {
    label: "Inventory",
    href: "/inventory",
    icon: Boxes,
    title: "Inventory",
    description: "Stock levels and consumables",
    moduleSlug: FM_MODULE,
  },
  {
    label: "Utilities",
    href: "/utilities",
    icon: Zap,
    title: "Utilities",
    description: "Energy, water, and utility metering",
    moduleSlug: FM_MODULE,
  },
  {
    label: "Platform",
    href: "/platform",
    icon: Settings2,
    title: "Platform",
    description: "Settings, modules, and configuration",
  },
];

export type PageArchetypeHint =
  | "briefing"
  | "workspace"
  | "snapshot"
  | "operational-list"
  | "reference-admin"
  | "guided-flow";

const ARCHETYPE_BY_HREF: Record<string, PageArchetypeHint> = {
  "/": "workspace",
  "/intelligence": "briefing",
  "/dashboards": "snapshot",
  "/incidents": "operational-list",
  "/maintenance": "operational-list",
  "/work-orders": "operational-list",
  "/approvals": "operational-list",
  "/requests": "operational-list",
  "/facilities": "reference-admin",
  "/assets": "reference-admin",
  "/users": "reference-admin",
  "/master-data": "reference-admin",
  "/reports": "guided-flow",
  "/occupant-requests": "guided-flow",
};

export interface NavContext {
  group: NavGroup | null;
  item: NavItem;
  /** TopBar shows area wayfinding; page owns the primary title. */
  areaLabel: string;
  archetype: PageArchetypeHint;
}

function resolveNavItem(pathname: string): NavItem {
  if (pathname === "/" || pathname === "/operations") return NAV_ITEMS[0];
  return (
    NAV_ITEMS.find(
      (entry) =>
        entry.href !== "/" &&
        entry.href !== "/operations" &&
        pathname.startsWith(entry.href)
    ) ??
    SECONDARY_NAV_ITEMS.find(
      (entry) => entry.href !== "/" && pathname.startsWith(entry.href)
    ) ??
    NAV_ITEMS[0]
  );
}

function resolveNavGroup(item: NavItem): NavGroup | null {
  return NAV_GROUPS.find((group) => group.items.some((i) => i.href === item.href)) ?? null;
}

function resolveArchetype(item: NavItem): PageArchetypeHint {
  if (item.href === "/" || item.href === "/operations") return "workspace";
  const match = Object.entries(ARCHETYPE_BY_HREF).find(
    ([href]) => href !== "/" && item.href.startsWith(href)
  );
  return match?.[1] ?? "operational-list";
}

export function getNavContextByPath(pathname: string): NavContext {
  const item = resolveNavItem(pathname);
  const group = resolveNavGroup(item);
  const areaLabel =
    group?.id === "home" ? "Home" : (group?.label ?? item.label);

  return {
    group,
    item,
    areaLabel,
    archetype: resolveArchetype(item),
  };
}

/** @deprecated Prefer getNavContextByPath for shell orientation. */
export function getNavItemByPath(pathname: string): NavItem {
  return getNavContextByPath(pathname).item;
}

export function filterNavGroups(
  groups: NavGroup[],
  enabledModules: AuthEnabledModule[] | null
): NavGroup[] {
  if (!enabledModules) {
    return groups;
  }

  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (entry) =>
          !entry.moduleSlug || hasModule(enabledModules, entry.moduleSlug)
      ),
    }))
    .filter((group) => group.items.length > 0);
}
