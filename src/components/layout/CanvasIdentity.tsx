"use client";

import { usePathname } from "next/navigation";
import {
  isAdminConsolePath,
  isCommandCentrePath,
  isOperationsPath,
  isPlatformHomePath,
  isWorkspacePreviewPath,
} from "@/lib/platform/workspaces";

/**
 * Quiet identity line for the main canvas — complements the sidebar OEM mark.
 */
export function CanvasIdentity() {
  const pathname = usePathname();
  const onPlatform =
    isPlatformHomePath(pathname) || isWorkspacePreviewPath(pathname);
  const inFacilityManagement = isOperationsPath(pathname);
  const inCommandCentre = isCommandCentrePath(pathname);

  const line = isAdminConsolePath(pathname)
    ? "SentraCore™ · Admin Console"
    : inCommandCentre
    ? "SentraCore™ · Executive Office"
    : onPlatform
      ? "SentraCore™ · Enterprise Operating Platform"
      : inFacilityManagement
        ? "SentraCore™ · Facility Management Platform"
        : "SentraCore™ · Enterprise Operating Platform";

  return (
    <footer className="os-canvas-identity print:hidden">
      <p className="os-canvas-identity-line">{line}</p>
      <p className="os-canvas-identity-powered">
        Powered by <span>Beacon Africa</span>
      </p>
    </footer>
  );
}
