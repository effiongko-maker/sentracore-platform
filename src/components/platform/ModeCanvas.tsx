"use client";

import type { ProductMode } from "@/lib/platform/modes";
import { cn } from "@/lib/utils";
import { usePlatformShell } from "@/hooks/usePlatformShell";
import { CanvasIdentity } from "@/components/layout/CanvasIdentity";

const CANVAS_CLASS: Record<ProductMode, string> = {
  platform: "os-canvas-platform",
  command: "os-canvas-command",
  understand: "os-canvas-understand",
  organise: "os-canvas-organise",
  act: "os-canvas-act",
  execute: "os-canvas-execute",
  learn: "os-canvas-learn",
  cognitive: "os-canvas-intelligence",
};

export function ModeCanvas({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { productMode } = usePlatformShell();

  return (
    <main className={cn(CANVAS_CLASS[productMode], "os-canvas-main", className)}>
      <div className="os-canvas-inner">
        <div className="os-canvas-body">{children}</div>
        {productMode !== "cognitive" ? <CanvasIdentity /> : null}
      </div>
    </main>
  );
}
