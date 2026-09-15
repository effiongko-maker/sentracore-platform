import {
  LayoutDashboard,
  FolderOpen,
  Calculator,
  Landmark,
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type PlatformFinanceNavMatch = "exact" | "prefix";

export type PlatformFinanceNavItem = {
  href: string | null;
  label: string;
  match: PlatformFinanceNavMatch;
  icon: LucideIcon;
  /** Unfinished destinations — visible, not navigable. */
  comingSoon?: boolean;
};

/**
 * Finance sidebar (reference Overview). Only Overview is live in this slice.
 */
export const PLATFORM_FINANCE_NAV_ITEMS: readonly PlatformFinanceNavItem[] = [
  {
    href: "/platform-finance",
    label: "Overview",
    match: "exact",
    icon: LayoutDashboard,
  },
  {
    href: null,
    label: "Requests",
    match: "prefix",
    icon: FolderOpen,
    comingSoon: true,
  },
  {
    href: null,
    label: "Accounting",
    match: "prefix",
    icon: Calculator,
    comingSoon: true,
  },
  {
    href: null,
    label: "Cash & Banks",
    match: "prefix",
    icon: Landmark,
    comingSoon: true,
  },
  {
    href: null,
    label: "Receivables",
    match: "prefix",
    icon: ArrowDownLeft,
    comingSoon: true,
  },
  {
    href: null,
    label: "Payables",
    match: "prefix",
    icon: ArrowUpRight,
    comingSoon: true,
  },
  {
    href: null,
    label: "Reports",
    match: "prefix",
    icon: BarChart3,
    comingSoon: true,
  },
  {
    href: null,
    label: "Settings",
    match: "prefix",
    icon: Settings,
    comingSoon: true,
  },
] as const;

export function isPlatformFinanceNavItemActive(
  item: Pick<PlatformFinanceNavItem, "href" | "match">,
  pathname: string
): boolean {
  if (!item.href) return false;
  if (item.match === "exact") {
    return pathname === item.href;
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
