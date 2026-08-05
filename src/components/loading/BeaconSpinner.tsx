"use client";

import { Hexagon } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

export function BeaconSpinner({
  size = "md",
  className,
  label = "Loading",
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
  label?: string;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const dim =
    size === "sm" ? "h-9 w-9" : size === "lg" ? "h-14 w-14" : "h-11 w-11";
  const icon =
    size === "sm" ? "h-3.5 w-3.5" : size === "lg" ? "h-6 w-6" : "h-4 w-4";

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", dim, className)}
      role="status"
      aria-label={label}
    >
      <span
        className={cn(
          "absolute inset-0 rounded-2xl border-2 border-accent/25 border-t-accent",
          !reducedMotion && "animate-[beacon-spin_0.9s_linear_infinite]"
        )}
        aria-hidden
      />
      <span
        className={cn(
          "absolute inset-[3px] rounded-[14px] border border-primary/15",
          !reducedMotion && "animate-[beacon-pulse_1.6s_ease-in-out_infinite]"
        )}
        aria-hidden
      />
      <span className="relative flex h-[70%] w-[70%] items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-soft shadow-sc">
        <Hexagon
          className={cn(icon, "fill-white/15 text-white")}
          aria-hidden
        />
      </span>
      <span className="sr-only">{label}</span>
    </div>
  );
}
