import {
  LayoutDashboard,
  FolderOpen,
  FileInput,
  FileText,
  Calculator,
  Landmark,
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Settings,
  BookOpen,
  CalendarRange,
  Receipt,
  Building2,
  type LucideIcon,
} from "lucide-react";

export type PlatformFinanceNavMatch = "exact" | "prefix";

export type PlatformFinanceNavLeaf = {
  href: string | null;
  label: string;
  match: PlatformFinanceNavMatch;
  icon: LucideIcon;
  /** Unfinished destinations — visible, not navigable. */
  comingSoon?: boolean;
};

export type PlatformFinanceNavItem = PlatformFinanceNavLeaf & {
  /** Nested section children (Accounting, Billing, Payables). */
  children?: readonly PlatformFinanceNavLeaf[];
};

/**
 * Finance sidebar information architecture.
 * Live leaves keep real routes; unfinished destinations stay comingSoon.
 */
export const PLATFORM_FINANCE_NAV_ITEMS: readonly PlatformFinanceNavItem[] = [
  {
    href: "/platform-finance",
    label: "Overview",
    match: "exact",
    icon: LayoutDashboard,
  },
  {
    href: "/platform-finance/accounting",
    label: "Accounting",
    match: "prefix",
    icon: Calculator,
    children: [
      {
        href: "/platform-finance/accounting/journal",
        label: "Journal",
        match: "prefix",
        icon: BookOpen,
      },
      {
        href: "/platform-finance/accounting/general-ledger",
        label: "General Ledger",
        match: "prefix",
        icon: BookOpen,
      },
      {
        href: null,
        label: "Trial Balance",
        match: "prefix",
        icon: BarChart3,
        comingSoon: true,
      },
      {
        href: null,
        label: "P&L",
        match: "prefix",
        icon: BarChart3,
        comingSoon: true,
      },
      {
        href: null,
        label: "Balance Sheet",
        match: "prefix",
        icon: BarChart3,
        comingSoon: true,
      },
      {
        href: null,
        label: "Cash Flow",
        match: "prefix",
        icon: BarChart3,
        comingSoon: true,
      },
      {
        href: "/platform-finance/accounting/chart-of-accounts",
        label: "Chart of Accounts",
        match: "prefix",
        icon: BookOpen,
      },
      {
        href: "/platform-finance/accounting/periods",
        label: "Periods",
        match: "prefix",
        icon: CalendarRange,
      },
    ],
  },
  {
    href: null,
    label: "Billing & Invoicing",
    match: "prefix",
    icon: Receipt,
    children: [
      {
        href: "/platform-finance/invoices",
        label: "Invoices",
        match: "prefix",
        icon: FileText,
      },
      {
        href: "/platform-finance/counterparties",
        label: "Counterparties",
        match: "prefix",
        icon: Building2,
      },
      {
        href: "/platform-finance/receivables",
        label: "Receivables",
        match: "prefix",
        icon: ArrowDownLeft,
      },
      {
        href: "/platform-finance/receipts",
        label: "Receipts",
        match: "prefix",
        icon: Receipt,
      },
    ],
  },
  {
    href: null,
    label: "Payables",
    match: "prefix",
    icon: ArrowUpRight,
    children: [
      {
        href: "/platform-finance/vendor-bills",
        label: "Vendor Bills",
        match: "prefix",
        icon: FileInput,
      },
      {
        href: "/platform-finance/payables",
        label: "Payables",
        match: "prefix",
        icon: ArrowUpRight,
      },
    ],
  },
  {
    href: "/platform-finance/cash-banks",
    label: "Cash & Banks",
    match: "prefix",
    icon: Landmark,
  },
  {
    href: "/platform-finance/requests",
    label: "Financial Requests",
    match: "prefix",
    icon: FolderOpen,
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

/** In-workspace Accounting surfaces — order matches Finance IA. */
export type AccountingSubnavItem = {
  href: string | null;
  label: string;
  icon: LucideIcon;
  comingSoon?: boolean;
};

export const PLATFORM_FINANCE_ACCOUNTING_SUBNAV: readonly AccountingSubnavItem[] =
  [
    {
      href: "/platform-finance/accounting/journal",
      label: "Journal",
      icon: BookOpen,
    },
    {
      href: "/platform-finance/accounting/general-ledger",
      label: "General Ledger",
      icon: BookOpen,
    },
    {
      href: null,
      label: "Trial Balance",
      icon: BarChart3,
      comingSoon: true,
    },
    { href: null, label: "P&L", icon: BarChart3, comingSoon: true },
    {
      href: null,
      label: "Balance Sheet",
      icon: BarChart3,
      comingSoon: true,
    },
    { href: null, label: "Cash Flow", icon: BarChart3, comingSoon: true },
    {
      href: "/platform-finance/accounting/chart-of-accounts",
      label: "Chart of Accounts",
      icon: BookOpen,
    },
    {
      href: "/platform-finance/accounting/periods",
      label: "Periods",
      icon: CalendarRange,
    },
  ] as const;

export function isPlatformFinanceNavItemActive(
  item: Pick<PlatformFinanceNavLeaf, "href" | "match">,
  pathname: string
): boolean {
  if (!item.href) return false;
  if (item.match === "exact") {
    return pathname === item.href;
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** True when the item or any child matches the current path. */
export function isPlatformFinanceNavSectionActive(
  item: PlatformFinanceNavItem,
  pathname: string
): boolean {
  if (isPlatformFinanceNavItemActive(item, pathname)) return true;
  return (
    item.children?.some((child) =>
      isPlatformFinanceNavItemActive(child, pathname)
    ) ?? false
  );
}

export function isAccountingSubnavActive(
  href: string | null,
  pathname: string
): boolean {
  if (!href) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}
