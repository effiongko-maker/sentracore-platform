"use client";

import { usePathname } from "next/navigation";
import {
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
  const inOperations = isOperationsPath(pathname);

  const line = onPlatform
    ? "SentraCore · Operating System"
    : inOperations
      ? "SentraCore · Operations Management Platform"
      : "SentraCore · Operating System";

  return (
    <footer className="os-canvas-identity print:hidden">
      <p className="os-canvas-identity-line">{line}</p>
      <p className="os-canvas-identity-powered">
        Powered by <span>Beacon Africa</span>
      </p>
    </footer>
  );
}
