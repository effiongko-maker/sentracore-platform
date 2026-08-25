"use client";

import { PlatformShellProvider } from "@/hooks/usePlatformShell";
import { PlatformSessionProvider } from "@/hooks/usePlatformSession";
import { ToastProvider } from "@/components/ui/Toast";
import { usePlatformShell } from "@/hooks/usePlatformShell";
import { OrganisationalCompass } from "./OrganisationalCompass";
import { GlobalCommandBar } from "./GlobalCommandBar";
import { CommandPalette } from "./CommandPalette";
import { ModeCanvas } from "./ModeCanvas";
import { isIntelligenceRoute } from "@/lib/platform/modes";
import { usePathname } from "next/navigation";

function ProductShellBody({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isCognitive = isIntelligenceRoute(pathname);

  return (
    <div className="os-shell">
      <OrganisationalCompass />
      <div className="os-shell-workspace">
        {!isCognitive ? <GlobalCommandBar /> : null}
        <div className="os-shell-canvas">
          <ModeCanvas>{children}</ModeCanvas>
        </div>
      </div>
      <CommandPalette />
    </div>
  );
}

export function ProductShell({ children }: { children: React.ReactNode }) {
  return (
    <PlatformSessionProvider>
      <PlatformShellProvider>
        <ToastProvider>
          <ProductShellBody>{children}</ProductShellBody>
        </ToastProvider>
      </PlatformShellProvider>
    </PlatformSessionProvider>
  );
}

/** @deprecated Use ProductShell */
export const AppShell = ProductShell;
