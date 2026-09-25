"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { useOperatingAccess } from "@/hooks/useOperatingAccess";
import { COSTS_CLAIMS_AREAS, activeCostsClaimsArea, isCostsClaimsPath } from "@/modules/finance/costsClaimsSections";

/**
 * Sidebar sub-navigation for Costs & Claims — the children of the expandable Costs & Claims group (the parent owns
 * the open/collapsed state and opens it on any Costs & Claims route). Each area keeps its own permission gate.
 */
export function CostsClaimsSubnav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const kind = useSearchParams().get("kind");
  const { can } = useOperatingAccess();
  const activeId = isCostsClaimsPath(pathname) ? activeCostsClaimsArea(pathname, kind) : null;
  const areas = COSTS_CLAIMS_AREAS.filter((area) => can(area.capability));
  if (areas.length === 0) return null;
  return (
    <div className="os-compass-intel-subnav os-compass-cc-subnav" role="group" aria-label="Costs & Claims areas">
      {areas.map((area) => {
        const active = area.id === activeId;
        return (
          <Link
            key={area.id}
            href={area.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn("os-compass-intel-link", active && "os-compass-intel-link-active")}
          >
            <span>{area.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
