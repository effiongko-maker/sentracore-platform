"use client";

import { LogOut, Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { getNavContextByPath } from "@/lib/navigation";
import { signOut } from "@/lib/auth/actions";
import { UserService } from "@/services/users/UserService";
import type { CurrentUser } from "@/types";
import { useSidebar } from "@/hooks/useSidebar";
import { cn } from "@/lib/utils";

export function TopBar() {
  const pathname = usePathname();
  const { group, areaLabel, archetype } = getNavContextByPath(pathname);
  const { openMobile } = useSidebar();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [pending, startTransition] = useTransition();

  const isIntelligence = archetype === "briefing";
  const isHome = group?.id === "home";

  useEffect(() => {
    let cancelled = false;
    UserService.getCurrentUser()
      .then((identity) => {
        if (!cancelled) setUser(identity);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-[var(--sc-header-height)] items-center justify-between gap-4 border-b px-4 backdrop-blur-md sm:px-6",
        isIntelligence
          ? "sc-shell-header-intelligence border-[var(--sc-rule)] bg-[color-mix(in_srgb,var(--sc-canvas-intelligence)_92%,white)]"
          : "border-border/80 bg-white/88"
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={openMobile}
          className={cn(
            "inline-flex h-9 w-9 items-center justify-center rounded-[var(--sc-radius-control)] border outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-accent/30 lg:hidden",
            isIntelligence
              ? "border-[var(--sc-rule)] bg-white/50 text-[var(--sc-ink-muted)]"
              : "border-border bg-card text-muted hover:bg-slate-50 hover:text-foreground"
          )}
          aria-label="Open navigation"
        >
          <Menu className="h-4 w-4" aria-hidden />
        </button>

        {!isIntelligence ? (
          <div className="min-w-0">
            {isHome ? (
              <p className="sc-text-module">Home</p>
            ) : (
              <p className="sc-text-area truncate">{areaLabel}</p>
            )}
          </div>
        ) : (
          <p className="sc-intel-greeting hidden sm:block">Operational briefing</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div
          className={cn(
            "flex items-center gap-2.5 rounded-[var(--sc-radius-control)] border py-1.5 pl-1.5 pr-3",
            isIntelligence
              ? "border-[var(--sc-rule)] bg-white/55"
              : "border-border bg-card"
          )}
          title={
            user
              ? `${user.name} · ${user.role}${
                  user.organisationName ? ` · ${user.organisationName}` : ""
                }`
              : undefined
          }
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-primary text-xs font-semibold text-white">
            {user?.avatarInitials ?? "—"}
          </div>
          <div className="hidden min-w-0 sm:block">
            <p className="truncate text-sm font-medium text-foreground">
              {user?.name ?? "Loading..."}
            </p>
            <p className="truncate text-[11px] text-muted">
              {user?.organisationName
                ? `${user.role} · ${user.organisationName}`
                : (user?.role ?? "")}
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => signOut())}
          className={cn(
            "inline-flex h-9 w-9 items-center justify-center rounded-[var(--sc-radius-control)] border outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-accent/30 disabled:opacity-60",
            isIntelligence
              ? "border-[var(--sc-rule)] bg-white/55 text-[var(--sc-ink-muted)] hover:bg-white/80"
              : "border-border bg-card text-muted hover:bg-slate-50 hover:text-foreground"
          )}
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </header>
  );
}
