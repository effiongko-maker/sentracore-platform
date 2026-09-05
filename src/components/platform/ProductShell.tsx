"use client";

import { usePathname } from "next/navigation";
import { PlatformShellProvider } from "@/hooks/usePlatformShell";
import { PlatformSessionProvider } from "@/hooks/usePlatformSession";
import { OperatingAccessProvider } from "@/hooks/useOperatingAccess";
import { ToastProvider } from "@/components/ui/Toast";
import { OrganisationalCompass } from "./OrganisationalCompass";
import { GlobalCommandBar } from "./GlobalCommandBar";
import { CommandPalette } from "./CommandPalette";
import { ModeCanvas } from "./ModeCanvas";
import { AccessSurfaceGate } from "@/components/security/AccessSurfaceGate";

function isClientRequestPortal(pathname: string | null): boolean {
  return Boolean(pathname?.startsWith("/occupant-requests"));
}

function ProductShellBody({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (isClientRequestPortal(pathname)) {
    return <div className="sr-shell-root">{children}</div>;
  }

  return (
    <div className="os-shell">
      <OrganisationalCompass />
      <div className="os-shell-workspace">
        <GlobalCommandBar />
        <div className="os-shell-canvas">
          <ModeCanvas>
            <AccessSurfaceGate>{children}</AccessSurfaceGate>
          </ModeCanvas>
        </div>
      </div>
      <CommandPalette />
    </div>
  );
}

export function ProductShell({ children }: { children: React.ReactNode }) {
  return (
    <PlatformSessionProvider>
      <OperatingAccessProvider>
        <PlatformShellProvider>
          <ToastProvider>
            <ProductShellBody>{children}</ProductShellBody>
          </ToastProvider>
        </PlatformShellProvider>
      </OperatingAccessProvider>
    </PlatformSessionProvider>
  );
}

/** @deprecated Use ProductShell */
export const AppShell = ProductShell;
