import {
  LayoutDashboard,
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
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
}

export const NAV_ITEMS: NavItem[] = [
  {
    label: "Home",
    href: "/",
    icon: LayoutDashboard,
    title: "Workspace",
    description: "Your daily launchpad — what to do today",
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
    description: "People, roles, and access control",
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
    description: "Requests, assignments, and progress",
  },
  {
    label: "Incidents",
    href: "/incidents",
    icon: AlertTriangle,
    title: "Incidents",
    description: "Safety events and critical issues",
  },
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
    label: "Dashboards",
    href: "/dashboards",
    icon: BarChart3,
    title: "Dashboards",
    description: "Analytics and operational insights",
  },
  {
    label: "Reports",
    href: "/reports",
    icon: FileBarChart2,
    title: "Reports",
    description: "Historical analysis and exports",
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
    ) ?? NAV_ITEMS[0]
  );
}
