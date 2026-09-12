import {
  LayoutDashboard,
  ClipboardList,
  AlertTriangle,
  Inbox,
  FileBarChart2,
  Banknote,
  Users,
  type LucideIcon,
} from "lucide-react";

export type EccNavMatch = "exact" | "prefix";

export type EccNavItem = {
  href: string;
  label: string;
  match: EccNavMatch;
  icon: LucideIcon;
};

export const ECC_NAV_ITEMS: readonly EccNavItem[] = [
  {
    href: "/ecc-operations",
    label: "Overview",
    match: "exact",
    icon: LayoutDashboard,
  },
  {
    href: "/ecc-operations/daily-ops",
    label: "Daily operations",
    match: "prefix",
    icon: ClipboardList,
  },
  {
    href: "/ecc-operations/issues",
    label: "Issues",
    match: "prefix",
    icon: AlertTriangle,
  },
  {
    href: "/ecc-operations/requests",
    label: "Requests",
    match: "prefix",
    icon: Inbox,
  },
  {
    href: "/ecc-operations/people",
    label: "People",
    match: "prefix",
    icon: Users,
  },
  {
    href: "/ecc-operations/reporting",
    label: "Reporting",
    match: "prefix",
    icon: FileBarChart2,
  },
  {
    href: "/ecc-operations/finance",
    label: "Finance",
    match: "prefix",
    icon: Banknote,
  },
] as const;

export function isEccNavItemActive(
  item: Pick<EccNavItem, "href" | "match">,
  pathname: string
): boolean {
  if (item.match === "exact") {
    return pathname === item.href;
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
