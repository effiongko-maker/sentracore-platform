"use client";

import { LogOut } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { signOut } from "@/lib/auth/actions";
import { FM_OPERATING_COMPANY_NAME } from "@/lib/platform/workspaces";
import { UserService } from "@/services/users/UserService";
import type { CurrentUser } from "@/types";

export function IntelligenceChrome() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [pending, startTransition] = useTransition();

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
    <div className="ix-chrome">
      <span className="ix-chrome-layer">Intelligence</span>
      {/* FM Intelligence is an FM-scoped surface — the operating-company identity is fixed to Trivnet here,
          never derived from the underlying tenant organisation. */}
      <div className="ix-chrome-user" title={FM_OPERATING_COMPANY_NAME}>
        <span className="ix-chrome-avatar">{user?.avatarInitials ?? "—"}</span>
        <span className="hidden sm:inline">{user?.name ?? "Loading"}</span>
      </div>
      <button
        type="button"
        className="ix-chrome-signout"
        disabled={pending}
        onClick={() => startTransition(() => signOut())}
        aria-label="Sign out"
        title="Sign out"
      >
        <LogOut className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
