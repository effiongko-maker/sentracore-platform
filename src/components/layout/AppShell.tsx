"use client";

import { SidebarContext, useSidebarState } from "@/hooks/useSidebar";
import { Sidebar } from "@/components/navigation/Sidebar";
import { TopBar } from "@/components/navigation/TopBar";
import { ToastProvider } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const sidebar = useSidebarState();

  return (
    <SidebarContext.Provider value={sidebar}>
      <ToastProvider>
        <div className="min-h-screen bg-background">
          <Sidebar />
          <div
            className={cn(
              "flex min-h-screen flex-col transition-[padding] duration-200 ease-out",
              sidebar.collapsed
                ? "lg:pl-[var(--sc-sidebar-collapsed)]"
                : "lg:pl-[var(--sc-sidebar-width)]"
            )}
          >
            <TopBar />
            <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
              <div className="mx-auto w-full max-w-[1400px]">{children}</div>
            </main>
            <footer className="border-t border-border/70 px-4 py-4 sm:px-6 lg:px-8">
              <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted">Powered by Beacon Africa</p>
                <p className="text-[11px] text-slate-400">
                  SentraCore™ is a trademark of Beacon Africa Technologies Ltd.
                </p>
              </div>
            </footer>
          </div>
        </div>
      </ToastProvider>
    </SidebarContext.Provider>
  );
}
