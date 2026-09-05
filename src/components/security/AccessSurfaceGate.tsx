"use client";

import { usePathname, useRouter } from "next/navigation";
import { ShieldOff } from "lucide-react";
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
  const { access, loading } = useOperatingAccess();
  const surface = surfaceForHref(pathname);

  // Paths with no surface mapping (platform home, workspace previews, …) stay open.
  if (!surface) {
    return <>{children}</>;
  }

  if (loading || !access) {
    return (
      <div className="px-6 py-10 text-sm text-[var(--os-ink-faint)]">
        Checking access…
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
