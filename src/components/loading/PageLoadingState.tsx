"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { BeaconSpinner } from "./BeaconSpinner";
import { RotatingStatusMessage } from "./RotatingStatusMessage";
import { OPERATIONAL_LOADING_MESSAGES } from "./messages";

export type PageLoadingTone = "light" | "dark";

/**
 * Branded page loader:
 *   SENTRACORE
 *   Preparing your … overview…
 * + layout-matched skeleton beneath.
 */
export function PageLoadingState({
  skeleton,
  status,
  messages = OPERATIONAL_LOADING_MESSAGES,
  isExiting = false,
  title = "Loading",
  tone = "light",
  className,
}: {
  skeleton: ReactNode;
  /** Primary fixed status line. Defaults to the first message. */
  status?: string;
  messages?: readonly string[];
  isExiting?: boolean;
  title?: string;
  tone?: PageLoadingTone;
  className?: string;
}) {
  const primary = status ?? messages[0] ?? "Preparing…";
  const rotateMessages =
    status != null
      ? messages.filter((message) => message !== status)
      : messages.slice(1);

  return (
    <div
      className={cn(
        "space-y-6 transition-opacity duration-300 ease-out",
        isExiting ? "opacity-0" : "opacity-100",
        tone === "dark" &&
          "min-h-[70vh] rounded-sc bg-[#0b1220] p-5 sm:p-7 [background-image:radial-gradient(circle_at_78%_12%,rgba(59,130,246,0.12),transparent_34%),radial-gradient(circle_at_18%_0%,rgba(239,68,68,0.08),transparent_28%)]",
        className
      )}
      aria-busy="true"
      aria-live="polite"
    >
      <div
        className={cn(
          "flex items-center gap-4 rounded-sc border px-4 py-3.5 shadow-sc",
          tone === "dark"
            ? "border-white/10 bg-[#111b2e]"
            : "border-border/80 bg-card"
        )}
      >
        <BeaconSpinner label={title} />
        <div className="min-w-0">
          <p
            className={cn(
              "text-[11px] font-semibold uppercase tracking-[0.18em]",
              tone === "dark"
                ? "text-[rgba(96,165,250,0.85)]"
                : "text-muted"
            )}
          >
            SentraCore
          </p>
          <p
            className={cn(
              "mt-1 text-sm font-medium",
              tone === "dark"
                ? "text-white/90"
                : "text-slate-700"
            )}
          >
            {primary}
          </p>
          {rotateMessages.length > 0 ? (
            <RotatingStatusMessage
              messages={rotateMessages}
              className={cn(
                "mt-1 text-xs font-normal",
                tone === "dark" ? "text-white/45" : "text-slate-500"
              )}
            />
          ) : null}
        </div>
      </div>

      <div aria-hidden="true">{skeleton}</div>
    </div>
  );
}
