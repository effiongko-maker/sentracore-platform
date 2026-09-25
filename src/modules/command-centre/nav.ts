import {
  CalendarCheck,
  Gavel,
  LayoutDashboard,
  Landmark,
  ShieldAlert,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

/**
 * Executive Office navigation — the organisation-level executive layer (route base /command-centre, the established
 * Executive Office route). Overview is the landing lens; the other lenses establish the information architecture and
 * are honest foundation routes until their capabilities are introduced. Operating environments keep ownership of
 * their records and workflows; lenses summarise and link to them, never duplicate them.
 */
export const EXECUTIVE_OFFICE_BASE = "/command-centre";

export type ExecutiveLensId = "decisions" | "performance" | "financial-position" | "commitments" | "risk-attention";

export type ExecutiveOfficeNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  match: "exact" | "prefix";
};

export type ExecutiveLens = ExecutiveOfficeNavItem & {
  id: ExecutiveLensId;
  /** What the lens is for, in one line. */
  purpose: string;
  /** Honest foundation statement for the lens route while its capability is not yet built. */
  foundation: string;
  /** Where the lens's existing live signal is shown today (an Overview section), or null. */
  overviewSection: { anchor: string; label: string } | null;
};

export const EXECUTIVE_OFFICE_LENSES: readonly ExecutiveLens[] = [
  {
    id: "decisions",
    href: `${EXECUTIVE_OFFICE_BASE}/decisions`,
    label: "Decisions",
    icon: Gavel,
    match: "prefix",
    purpose: "What is awaiting your executive decision — Finance approvals. Facility Management Payment Approvals are client decisions, followed in Facility Management.",
    foundation: "Decision intelligence will appear here as Executive Office capabilities are introduced.",
    overviewSection: { anchor: "scc-decisions", label: "Your Decisions" },
  },
  {
    id: "performance",
    href: `${EXECUTIVE_OFFICE_BASE}/performance`,
    label: "Performance",
    icon: TrendingUp,
    match: "prefix",
    purpose: "How each operating environment is performing.",
    foundation: "Performance analysis will appear here as Executive Office capabilities are introduced.",
    overviewSection: { anchor: "scc-pulse-heading", label: "Organisational Pulse" },
  },
  {
    id: "financial-position",
    href: `${EXECUTIVE_OFFICE_BASE}/financial-position`,
    label: "Financial Position",
    icon: Landmark,
    match: "prefix",
    purpose: "Where financial position stands across Finance and Facility Management.",
    foundation: "The financial position across Finance and Facility Management will appear here as Executive Office capabilities are introduced.",
    overviewSection: { anchor: "scc-pulse-heading", label: "Organisational Pulse — Finance and Facility Management" },
  },
  {
    id: "commitments",
    href: `${EXECUTIVE_OFFICE_BASE}/commitments`,
    label: "Commitments",
    icon: CalendarCheck,
    match: "prefix",
    purpose: "Executive commitments that are open, approaching or overdue.",
    foundation: "A dedicated commitments view will appear here as Executive Office capabilities are introduced.",
    overviewSection: { anchor: "commitments", label: "Executive Commitments" },
  },
  {
    id: "risk-attention",
    href: `${EXECUTIVE_OFFICE_BASE}/risk-attention`,
    label: "Risk & Attention",
    icon: ShieldAlert,
    match: "prefix",
    purpose: "Matters across the organisation that need executive attention.",
    foundation: "Risk intelligence will appear here as Executive Office capabilities are introduced.",
    overviewSection: { anchor: "scc-attention", label: "Needs Your Attention" },
  },
];

export const EXECUTIVE_OFFICE_NAV_ITEMS: readonly ExecutiveOfficeNavItem[] = [
  { href: EXECUTIVE_OFFICE_BASE, label: "Overview", icon: LayoutDashboard, match: "exact" },
  ...EXECUTIVE_OFFICE_LENSES,
];

export function getExecutiveLens(id: ExecutiveLensId): ExecutiveLens {
  const lens = EXECUTIVE_OFFICE_LENSES.find((entry) => entry.id === id);
  if (!lens) throw new Error(`Unknown Executive Office lens: ${id}`);
  return lens;
}

export function isExecutiveNavItemActive(item: ExecutiveOfficeNavItem, pathname: string): boolean {
  if (item.match === "exact") return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** Breadcrumb label for an Executive Office path ("Overview" for the landing route). */
export function executiveOfficeSectionLabel(pathname: string): string | null {
  const item = EXECUTIVE_OFFICE_NAV_ITEMS.find((entry) => isExecutiveNavItemActive(entry, pathname));
  return item ? item.label : null;
}
