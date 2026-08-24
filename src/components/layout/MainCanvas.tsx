"use client";

import { usePathname } from "next/navigation";
import { getNavContextByPath } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function MainCanvas({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const pathname = usePathname();
  const { archetype } = getNavContextByPath(pathname);
  const isIntelligence = archetype === "briefing";

  if (isIntelligence) {
    return (
      <main className={cn("sc-main-intelligence flex-1", className)}>
        <div className="sc-main-intelligence-inner">{children}</div>
      </main>
    );
  }

  return (
    <main
      className={cn(
        "sc-canvas-operational flex-1 px-4 py-6 sm:px-6 lg:px-8 print:px-0 print:py-0",
        className
      )}
    >
      <div className="mx-auto w-full max-w-[1400px] print:max-w-none">
        {children}
      </div>
    </main>
  );
}
