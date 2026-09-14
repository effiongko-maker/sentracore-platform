"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ModeFrame } from "@/components/platform";
import { productModeFromPath } from "@/lib/platform/modes";

/**
 * ECC workspace frame — page content only.
 * Primary ECC navigation lives in OrganisationalCompass.
 * Canvas mode follows the route (cognitive for Overview / Reporting / Intelligence).
 */
export function EccWorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const mode = productModeFromPath(pathname);

  return (
    <ModeFrame mode={mode === "cognitive" ? "cognitive" : "command"} className="ecc-workspace">
      {children}
    </ModeFrame>
  );
}
