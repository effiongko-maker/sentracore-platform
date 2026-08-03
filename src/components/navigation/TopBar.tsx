"use client";

import { Bell, Menu, Search } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getNavItemByPath } from "@/lib/navigation";
import { UserService } from "@/services";
import type { CurrentUser, NotificationItem } from "@/types";
import { useSidebar } from "@/hooks/useSidebar";
import { NotificationPanel } from "@/components/layout/NotificationPanel";
import { cn } from "@/lib/utils";

const MOCK_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "n1",
    title: "Critical incident opened",
    message: "Plant Room 3 water ingress requires attention.",
    read: false,
    createdAt: "2026-08-03T10:55:00Z",
    type: "danger",
  },
  {
    id: "n2",
    title: "Approval pending",
    message: "Spare parts purchase for Chiller #04.",
    read: false,
    createdAt: "2026-08-03T08:30:00Z",
    type: "warning",
  },
  {
    id: "n3",
    title: "Maintenance due tomorrow",
    message: "Chiller #02 preventive service scheduled.",
    read: true,
    createdAt: "2026-08-02T16:00:00Z",
    type: "info",
  },
];

export function TopBar() {
  const pathname = usePathname();
  const navItem = getNavItemByPath(pathname);
  const { openMobile } = useSidebar();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    UserService.getCurrentUser().then(setUser);
  }, []);

  const unread = MOCK_NOTIFICATIONS.filter((item) => !item.read).length;

  return (
    <header className="sticky top-0 z-30 flex h-[var(--sc-header-height)] items-center justify-between gap-4 border-b border-border/80 bg-white/85 px-4 backdrop-blur-md sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={openMobile}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card text-muted outline-none transition-colors duration-200 hover:bg-slate-50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent/30 lg:hidden"
          aria-label="Open navigation"
        >
          <Menu className="h-4 w-4" aria-hidden />
        </button>

        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold text-primary">
            {navItem.title}
          </h1>
          <p className="hidden truncate text-xs text-muted sm:block">
            {navItem.description}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <div className="relative hidden md:block">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search operations..."
            aria-label="Search operations"
            className="h-10 w-64 rounded-[12px] border border-border bg-slate-50/80 pl-10 pr-3 text-sm outline-none transition-all duration-200 placeholder:text-slate-400 hover:border-slate-300 focus:border-accent/40 focus:bg-white focus:ring-2 focus:ring-accent/15 lg:w-80"
          />
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setNotificationsOpen((open) => !open)}
            className={cn(
              "relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card text-muted outline-none transition-colors duration-200 hover:bg-slate-50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent/30",
              notificationsOpen && "bg-slate-50 text-foreground"
            )}
            aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
            aria-expanded={notificationsOpen}
            aria-haspopup="dialog"
          >
            <Bell className="h-4 w-4" aria-hidden />
            {unread > 0 ? (
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-danger ring-2 ring-white" />
            ) : null}
          </button>

          <NotificationPanel
            open={notificationsOpen}
            onClose={() => setNotificationsOpen(false)}
            notifications={MOCK_NOTIFICATIONS}
          />
        </div>

        <div
          className="flex items-center gap-2.5 rounded-xl border border-border bg-card py-1.5 pl-1.5 pr-3 transition-colors duration-200 hover:bg-slate-50/80"
          title={user ? `${user.name} · ${user.role}` : undefined}
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-primary text-xs font-semibold text-white">
            {user?.avatarInitials ?? "—"}
          </div>
          <div className="hidden min-w-0 sm:block">
            <p className="truncate text-sm font-medium text-foreground">
              {user?.name ?? "Loading..."}
            </p>
            <p className="truncate text-[11px] capitalize text-muted">
              {user?.role ?? ""}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
