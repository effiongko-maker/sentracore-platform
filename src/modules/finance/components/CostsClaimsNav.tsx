"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  COSTS_CLAIMS_AREAS,
  COSTS_CLAIMS_HOME,
  COSTS_CLAIMS_LABEL,
  activeCostsClaimsArea,
} from "../costsClaimsSections";

/**
 * Compact context line for every Costs & Claims surface: "Costs & Claims › <area>". Area switching lives in the
 * sidebar sub-navigation (same definition); this line keeps the user oriented even when a page is opened directly
 * from a deep link (e.g. a Payment Approval from Needs Attention). `recordKind` lets a record page (e.g. a contract
 * instalment) name its own area when the URL alone cannot.
 */
export function CostsClaimsNav({ recordKind }: { recordKind?: string | null } = {}) {
  const pathname = usePathname();
  const kind = useSearchParams().get("kind");
  const areaId = activeCostsClaimsArea(pathname, kind, recordKind);
  const area = COSTS_CLAIMS_AREAS.find((a) => a.id === areaId) ?? null;
  const onAreaHome = area ? pathname === area.href.split("?")[0] && (area.href.includes("?") ? kind != null : !kind || kind === "all" || kind === "payment_request") : false;

  return (
    <nav aria-label="Costs & Claims" className="fm-cc-context">
      {area ? (
        <Link href={COSTS_CLAIMS_HOME} className="fm-cc-context-parent">
          {COSTS_CLAIMS_LABEL}
        </Link>
      ) : (
        <span className="fm-cc-context-current" aria-current="page">
          {COSTS_CLAIMS_LABEL}
        </span>
      )}
      {area ? (
        <>
          <ChevronRight className="fm-cc-context-sep" aria-hidden />
          {onAreaHome ? (
            <span className="fm-cc-context-current" aria-current="page">
              {area.label}
            </span>
          ) : (
            <Link href={area.href} className="fm-cc-context-current">
              {area.label}
            </Link>
          )}
        </>
      ) : null}
    </nav>
  );
}
