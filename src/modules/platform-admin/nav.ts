import { Activity, Blocks, KeyRound, LayoutDashboard, Users, type LucideIcon } from "lucide-react";

export type AdminNavItem = { href: string; label: string; icon: LucideIcon; match: (pathname: string) => boolean };

/** Admin Console sections — the platform control plane, not a business module. */
export const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, match: (p) => p === "/admin" },
  { href: "/admin/people", label: "People", icon: Users, match: (p) => p.startsWith("/admin/people") },
  { href: "/admin/access", label: "Access", icon: KeyRound, match: (p) => p.startsWith("/admin/access") },
  { href: "/admin/modules", label: "Modules", icon: Blocks, match: (p) => p.startsWith("/admin/modules") },
  { href: "/admin/audit", label: "Audit", icon: Activity, match: (p) => p.startsWith("/admin/audit") },
];
