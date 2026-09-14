"use client";

import { usePathname } from "next/navigation";
import { PlatformShellProvider } from "@/hooks/usePlatformShell";
import {
  PlatformSessionProvider,
  type PlatformSessionChrome,
} from "@/hooks/usePlatformSession";
import { OperatingAccessProvider } from "@/hooks/useOperatingAccess";
import type { OperatingAccess } from "@/lib/access";
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

export function ProductShell({
  children,
  initialSessionChrome,
  initialOperatingAccess,
}: {
  children: React.ReactNode;
  initialSessionChrome?: PlatformSessionChrome | null;
  initialOperatingAccess?: OperatingAccess | null;
}) {
  return (
    <PlatformSessionProvider initialSessionChrome={initialSessionChrome}>
      <OperatingAccessProvider initialAccess={initialOperatingAccess}>
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
