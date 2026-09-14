import {
  LayoutDashboard,
  ClipboardList,
  AlertTriangle,
  Inbox,
  FileBarChart2,
  Banknote,
  Users,
  Brain,
  type LucideIcon,
} from "lucide-react";

export type EccNavMatch = "exact" | "prefix";

export type EccNavItem = {
  href: string;
  label: string;
  match: EccNavMatch;
  icon: LucideIcon;
};

export type EccNavGroup = {
  id: string;
  label: string;
  items: readonly EccNavItem[];
};

/**
 * ECC Operations sidebar groups — mirrors Facility Management compass sections.
 * Intelligence sits under Overview, not as a peer of Daily Ops / Issues.
 */
export const ECC_NAV_GROUPS: readonly EccNavGroup[] = [
  {
    id: "overview",
    label: "Overview",
    items: [
      {
        href: "/ecc-operations",
        label: "Overview",
        match: "exact",
        icon: LayoutDashboard,
      },
      {
        href: "/ecc-operations/intelligence",
        label: "Intelligence",
        match: "prefix",
        icon: Brain,
      },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    items: [
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
    ],
  },
  {
    id: "reporting",
    label: "Reporting",
    items: [
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
    ],
  },
] as const;

/** Flat list for callers that still iterate leaf items. */
export const ECC_NAV_ITEMS: readonly EccNavItem[] = ECC_NAV_GROUPS.flatMap(
  (group) => group.items
);

export function isEccNavItemActive(
  item: Pick<EccNavItem, "href" | "match">,
  pathname: string
): boolean {
  if (item.match === "exact") {
    return pathname === item.href;
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
