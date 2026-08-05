"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

export function ContentFade({
  children,
  className,
  show = true,
}: {
  children: ReactNode;
  className?: string;
  show?: boolean;
}) {
  const reducedMotion = usePrefersReducedMotion();

  return (
    <div
      className={cn(
        show ? "opacity-100" : "opacity-0",
        !reducedMotion && "animate-[content-fade-in_0.35s_ease-out]",
        className
      )}
    >
      {children}
    </div>
  );
}
