import type { ReactNode } from "react";
import type { IntelligenceChange } from "@/lib/intelligence";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, CircleDot } from "lucide-react";

const DIRECTION_LABEL: Record<
  IntelligenceChange["direction"],
  string | null
> = {
  increasing: "Increasing",
  emerging: "Emerging",
  decreasing: "Reduced",
  stable: null,
};

function changeTreatment(change: IntelligenceChange): {
  labelClass: string;
  icon: ReactNode;
} {
  if (change.direction === "decreasing") {
    return {
      labelClass: "text-slate-500",
      icon: (
        <ArrowDown
          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400"
          aria-hidden
        />
      ),
    };
  }

  if (change.direction === "emerging") {
    const prominent =
      change.severity === "critical" || change.intensity === "significant";
    return {
      labelClass: prominent ? "text-amber-800" : "text-amber-700/90",
      icon: (
        <CircleDot
          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600/80"
          aria-hidden
        />
      ),
    };
  }

  const noticeable =
    change.severity === "critical" ||
    change.intensity === "significant";

  return {
    labelClass: noticeable ? "text-amber-800" : "text-muted",
    icon: (
      <ArrowUp
        className={cn(
          "mt-0.5 h-3.5 w-3.5 shrink-0",
          noticeable ? "text-amber-700/90" : "text-muted"
        )}
        aria-hidden
      />
    ),
  };
}

export function IntelligenceChangeItem({
  change,
}: {
  change: IntelligenceChange;
}) {
  const directionLabel = DIRECTION_LABEL[change.direction];
  const treatment = changeTreatment(change);

  return (
    <li className="py-2.5 first:pt-0">
      <div className="flex gap-2">
        {treatment.icon}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            {directionLabel ? (
              <span
                className={cn(
                  "shrink-0 text-[11px] font-medium tracking-wide",
                  treatment.labelClass
                )}
              >
                {directionLabel}
              </span>
            ) : null}
            <p className="sc-text-item-title">{change.title}</p>
          </div>
          <p className="sc-text-supporting mt-0.5">{change.summary}</p>
        </div>
      </div>
    </li>
  );
}
