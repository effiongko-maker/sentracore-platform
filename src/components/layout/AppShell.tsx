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
        <div className="min-h-screen bg-background print:bg-white">
          <div className="print:hidden">
            <Sidebar />
          </div>
          <div
            className={cn(
              "flex min-h-screen flex-col transition-[padding] duration-200 ease-out print:pl-0",
              sidebar.collapsed
                ? "lg:pl-[var(--sc-sidebar-collapsed)]"
                : "lg:pl-[var(--sc-sidebar-width)]"
            )}
          >
            <div className="print:hidden">
              <TopBar />
            </div>
            <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 print:px-0 print:py-0">
              <div className="mx-auto w-full max-w-[1400px] print:max-w-none">
                {children}
              </div>
            </main>
            <footer className="print:hidden border-t border-border/70 px-4 py-4 sm:px-6 lg:px-8">
              <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted">Powered by Beacon Africa Limited</p>
                <p className="text-[11px] text-slate-400">
                  SentraCore™ is a trademark of Beacon Africa Limited.
                </p>
              </div>
            </footer>
          </div>
        </div>
      </ToastProvider>
    </SidebarContext.Provider>
  );
}
