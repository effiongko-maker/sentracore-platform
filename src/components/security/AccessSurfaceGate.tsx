"use client";

import { usePathname, useRouter } from "next/navigation";
import { ShieldAlert, ShieldOff } from "lucide-react";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { useOperatingAccess } from "@/hooks/useOperatingAccess";
import {
  canSeeHref,
  resolveAccessVisibility,
  surfaceForHref,
} from "@/lib/access";

/**
 * Route / deep-link guard: deny surfaces the actor cannot see.
 * Uses resolveAccessVisibility — not role-specific allowlists.
 * API capability gates remain authoritative for mutations.
 */
export function AccessSurfaceGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { access, loading, error, reload } = useOperatingAccess();
  const surface = surfaceForHref(pathname);

  // Paths with no surface mapping (platform home, workspace previews, …) stay open.
  if (!surface) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="px-6 py-10 text-sm text-[var(--os-ink-faint)]">
        Checking access…
      </div>
    );
  }

  // Settled failure: request finished (or timed out) without access context.
  // Must not look like an infinite “Checking access…” state.
  if (!access) {
    return (
      <div className="px-6 py-10">
        <EmptyState
          icon={ShieldAlert}
          title="Unable to verify access"
          description={
            error ??
            "Your access context could not be loaded. Retry, or return to Platform Home."
          }
          actionLabel="Retry"
          onAction={() => reload()}
        />
        <div className="mt-4">
          <button
            type="button"
            className="text-sm text-[var(--os-ink-faint)] underline-offset-2 hover:underline"
            onClick={() => router.push("/")}
          >
            Go to Platform Home
          </button>
        </div>
      </div>
    );
  }

  const visibility = resolveAccessVisibility(access);
  if (canSeeHref(visibility, pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="px-6 py-10">
      <EmptyState
        icon={ShieldOff}
        title="Access restricted"
        description="You do not have permission to view this area of the platform."
        actionLabel="Go to Platform Home"
        onAction={() => router.push("/")}
      />
    </div>
  );
}
