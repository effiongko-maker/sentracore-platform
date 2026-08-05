"use client";

import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getNavItemByPath } from "@/lib/navigation";
import { UserService } from "@/services/users/UserService";
import type { CurrentUser } from "@/types";
import { useSidebar } from "@/hooks/useSidebar";

export function TopBar() {
  const pathname = usePathname();
  const navItem = getNavItemByPath(pathname);
  const { openMobile } = useSidebar();
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    UserService.getCurrentUser().then(setUser);
  }, []);

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

      <div
        className="flex items-center gap-2.5 rounded-xl border border-border bg-card py-1.5 pl-1.5 pr-3"
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
    </header>
  );
}
