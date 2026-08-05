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
  BarChart3,
  FileBarChart2,
  Settings2,
  MessageSquarePlus,
  Database,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
}

/** Primary sidebar navigation — production-ready modules only. */
export const NAV_ITEMS: NavItem[] = [
  {
    label: "Home",
    href: "/",
    icon: Home,
    title: "Home",
    description: "Your work for today — assignments, schedule, and quick actions",
  },
  {
    label: "Facilities",
    href: "/facilities",
    icon: Building2,
    title: "Facilities",
    description: "Sites, buildings, and locations",
  },
  {
    label: "Assets",
    href: "/assets",
    icon: Package,
    title: "Assets",
    description: "Track and manage operational assets",
  },
  {
    label: "Users",
    href: "/users",
    icon: Users,
    title: "Users",
    description: "People, roles, and access",
  },
  {
    label: "Master Data",
    href: "/master-data",
    icon: Database,
    title: "Master Data",
    description: "Departments, buildings, floors, rooms, and vendors",
  },
  {
    label: "Requests",
    href: "/occupant-requests",
    icon: MessageSquarePlus,
    title: "Requests",
    description: "Submit maintenance requests and incident reports",
  },
  {
    label: "Maintenance",
    href: "/maintenance",
    icon: Wrench,
    title: "Maintenance",
    description: "Schedules, plans, and preventive work",
  },
  {
    label: "Work Orders",
    href: "/work-orders",
    icon: ClipboardList,
    title: "Work Orders",
    description: "Assignments, progress, and completion",
  },
  {
    label: "Incidents",
    href: "/incidents",
    icon: AlertTriangle,
    title: "Incidents",
    description: "Safety events and critical issues",
  },
  {
    label: "Dashboard",
    href: "/dashboards",
    icon: BarChart3,
    title: "Dashboard",
    description: "Live operational health, KPIs, and attention queues",
  },
  {
    label: "Reports",
    href: "/reports",
    icon: FileBarChart2,
    title: "Reports",
    description: "Generate client-facing operational reports",
  },
];

/**
 * Modules kept out of the primary sidebar but still routable via deep links.
 * Used only for TopBar title/description resolution.
 */
const SECONDARY_NAV_ITEMS: NavItem[] = [
  {
    label: "Inventory",
    href: "/inventory",
    icon: Boxes,
    title: "Inventory",
    description: "Stock levels and consumables",
  },
  {
    label: "Utilities",
    href: "/utilities",
    icon: Zap,
    title: "Utilities",
    description: "Energy, water, and utility metering",
  },
  {
    label: "Platform",
    href: "/platform",
    icon: Settings2,
    title: "Platform",
    description: "Settings, modules, and configuration",
  },
];

export function getNavItemByPath(pathname: string): NavItem {
  if (pathname === "/") return NAV_ITEMS[0];
  return (
    NAV_ITEMS.find(
      (item) => item.href !== "/" && pathname.startsWith(item.href)
    ) ??
    SECONDARY_NAV_ITEMS.find(
      (item) => item.href !== "/" && pathname.startsWith(item.href)
    ) ??
    NAV_ITEMS[0]
  );
}
