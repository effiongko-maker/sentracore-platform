"use client";

import type { ReactNode } from "react";
import { ModeFrame } from "@/components/platform";

/**
 * ECC workspace frame — page content only.
 * Primary ECC navigation lives in OrganisationalCompass.
 */
export function EccWorkspaceShell({ children }: { children: ReactNode }) {
  return (
    <ModeFrame mode="command" className="ecc-workspace">
      {children}
    </ModeFrame>
  );
}
