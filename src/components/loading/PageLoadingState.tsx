"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { BeaconSpinner } from "./BeaconSpinner";
import { RotatingStatusMessage } from "./RotatingStatusMessage";
import { OPERATIONAL_LOADING_MESSAGES } from "./messages";

export function PageLoadingState({
  skeleton,
  messages = OPERATIONAL_LOADING_MESSAGES,
  isExiting = false,
  title = "Loading",
  className,
}: {
  skeleton: ReactNode;
  messages?: readonly string[];
  isExiting?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "space-y-6 transition-opacity duration-300 ease-out",
        isExiting ? "opacity-0" : "opacity-100",
        className
      )}
      aria-busy="true"
      aria-live="polite"
    >
      <div className="flex items-center gap-4 rounded-sc border border-border/80 bg-card px-4 py-3.5 shadow-sc">
        <BeaconSpinner label={title} />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            SentraCore
          </p>
          <RotatingStatusMessage messages={messages} className="mt-1" />
        </div>
      </div>

      <div aria-hidden="true">{skeleton}</div>
    </div>
  );
}
