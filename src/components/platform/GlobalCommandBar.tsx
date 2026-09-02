"use client";

import { Menu, Search } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { signOut } from "@/lib/auth/actions";
import {
  resolveBreadcrumbSegments,
} from "@/lib/platform/layers";
import { UserService } from "@/services/users/UserService";
import type { CurrentUser } from "@/types";
import { usePlatformShell } from "@/hooks/usePlatformShell";
import { usePathname } from "next/navigation";

export function GlobalCommandBar() {
  const pathname = usePathname();
  const { openMobileNav, openCommandPalette } = usePlatformShell();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [pending, startTransition] = useTransition();

  const breadcrumb = resolveBreadcrumbSegments(pathname);

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
    <header className="os-command-bar print:hidden">
      <div className="os-command-context">
        <button
          type="button"
          className="os-mobile-menu"
          onClick={openMobileNav}
          aria-label="Open navigation"
        >
          <Menu className="h-4 w-4" />
        </button>

        <div className="os-command-breadcrumb hidden min-w-0 sm:flex">
          {breadcrumb.map((segment, index) => (
            <span key={`${segment}-${index}`} className="contents">
              {index > 0 ? (
                <span className="text-[var(--os-ink-faint)]">/</span>
              ) : null}
              <span
                className={
                  index === breadcrumb.length - 1
                    ? "os-command-module truncate"
                    : "os-command-layer"
                }
              >
                {segment}
              </span>
            </span>
          ))}
        </div>
      </div>

      <button
        type="button"
        className="os-command-trigger"
        onClick={openCommandPalette}
        aria-label="Open command palette"
      >
        <Search className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
        <span>Search or jump to…</span>
        <kbd className="os-command-kbd">⌘K</kbd>
      </button>

      <div className="os-command-actions">
        {user?.organisationName ? (
          <span className="hidden text-xs text-[var(--os-ink-faint)] lg:inline">
            {user.organisationName}
          </span>
        ) : null}
        <div className="os-command-user" title={user?.organisationName ?? undefined}>
          <span className="os-command-avatar">{user?.avatarInitials ?? "—"}</span>
          <span className="hidden max-w-[8rem] truncate md:inline">
            {user?.name ?? "Loading"}
          </span>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => signOut())}
          className="text-xs font-medium text-[var(--os-ink-faint)] hover:text-[var(--os-ink-soft)]"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
