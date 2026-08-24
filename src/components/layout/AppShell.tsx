"use client";

import { SidebarContext, useSidebarState } from "@/hooks/useSidebar";
import { PlatformSessionProvider } from "@/hooks/usePlatformSession";
import { MainCanvas } from "@/components/layout/MainCanvas";
import { ShellFrame } from "@/components/layout/ShellFrame";
import { Sidebar } from "@/components/navigation/Sidebar";
import { TopBar } from "@/components/navigation/TopBar";
import { ToastProvider } from "@/components/ui/Toast";
import { usePathname } from "next/navigation";
import { getNavContextByPath } from "@/lib/navigation";

function ShellContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isIntelligence = getNavContextByPath(pathname).archetype === "briefing";
  const sidebar = useSidebarState();

  return (
    <ShellFrame sidebarCollapsed={sidebar.collapsed}>
      {!isIntelligence ? (
        <div className="print:hidden">
          <TopBar />
        </div>
      ) : null}
      <MainCanvas>{children}</MainCanvas>
    </ShellFrame>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const sidebar = useSidebarState();

  return (
    <SidebarContext.Provider value={sidebar}>
      <PlatformSessionProvider>
        <ToastProvider>
          <div className="min-h-screen sc-canvas-operational print:bg-white">
            <div className="print:hidden">
              <Sidebar />
            </div>
            <ShellContent>{children}</ShellContent>
          </div>
        </ToastProvider>
      </PlatformSessionProvider>
    </SidebarContext.Provider>
  );
}