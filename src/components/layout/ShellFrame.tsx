"use client";

import { usePathname } from "next/navigation";
import { getNavContextByPath } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function ShellFrame({
  children,
  sidebarCollapsed,
}: {
  children: React.ReactNode;
  sidebarCollapsed: boolean;
}) {
  const pathname = usePathname();
  const isIntelligence = getNavContextByPath(pathname).archetype === "briefing";

  return (
    <div
      className={cn(
        "flex min-h-screen flex-col transition-[padding] duration-200 ease-out print:pl-0",
        isIntelligence ? "sc-shell-intelligence" : "sc-canvas-operational",
        sidebarCollapsed
          ? "lg:pl-[var(--sc-sidebar-collapsed)]"
          : isIntelligence
            ? "lg:pl-[var(--sc-sidebar-width-intelligence)]"
            : "lg:pl-[var(--sc-sidebar-width)]"
      )}
    >
      {children}
    </div>
  );
}
