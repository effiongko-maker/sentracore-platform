"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { filterNavGroups, NAV_GROUPS } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/hooks/useSidebar";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import { useOperatingAccess } from "@/hooks/useOperatingAccess";
import { getNavContextByPath } from "@/lib/navigation";
import { resolveAccessVisibility } from "@/lib/access";
import { SentraCoreLogo } from "@/components/brand";

export function Sidebar() {
  const pathname = usePathname();
  const { collapsed, mobileOpen, closeMobile, toggleCollapsed } = useSidebar();
  const { enabledModules } = usePlatformSession();
  const { access, loading: accessLoading } = useOperatingAccess();
  const visibility =
    !accessLoading && access ? resolveAccessVisibility(access) : null;
  const navGroups = filterNavGroups(NAV_GROUPS, enabledModules, visibility);
  const isIntelligence = getNavContextByPath(pathname).archetype === "briefing";

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 transition-opacity duration-200 lg:hidden",
          isIntelligence ? "bg-[#060d14]/60" : "bg-primary/35",
          "backdrop-blur-[2px]",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={closeMobile}
        aria-hidden={!mobileOpen}
      />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col text-white transition-[width,transform] duration-200 ease-out",
          isIntelligence
            ? "sc-sidebar-intelligence border-r border-[var(--sc-env-sidebar-border)] bg-[#0a1520]"
            : "border-r border-white/10 bg-[var(--sc-env-sidebar)]",
          collapsed
            ? "w-[var(--sc-sidebar-collapsed)]"
            : isIntelligence
              ? "w-[var(--sc-sidebar-width-intelligence)]"
              : "w-[var(--sc-sidebar-width)]",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
        aria-label="Primary navigation"
      >
        <div
          className={cn(
            "flex shrink-0 items-center border-b",
            isIntelligence ? "border-white/[0.04]" : "border-white/10",
            collapsed
              ? "min-h-[var(--sc-header-height)] flex-col justify-center gap-2 px-2 py-3"
              : "h-[var(--sc-header-height)] gap-2 px-3"
          )}
        >
          <Link
            href="/"
            onClick={closeMobile}
            className={cn(
              "group flex min-w-0 items-center rounded-lg outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-white/20",
              collapsed ? "justify-center" : "flex-1 gap-2 px-1 py-1"
            )}
            aria-label="SentraCore home"
          >
            <span className="sc-sidebar-brand-mark" aria-hidden>
              <SentraCoreLogo size={collapsed ? 28 : 32} alt="" />
            </span>
            {!collapsed ? (
              <div className="min-w-0 leading-tight">
                <p className="truncate text-xs font-semibold tracking-tight text-white/90">
                  SentraCore
                </p>
                {!isIntelligence ? (
                  <p className="truncate text-[9px] font-medium uppercase tracking-[0.14em] text-white/35">
                    Operations
                  </p>
                ) : null}
              </div>
            ) : null}
          </Link>

          <button
            type="button"
            onClick={toggleCollapsed}
            className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/40 outline-none transition-colors hover:bg-white/[0.06] hover:text-white/80 focus-visible:ring-2 focus-visible:ring-white/20 lg:inline-flex"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            aria-controls="sidebar-nav"
          >
            {collapsed ? (
              <PanelLeftOpen className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <PanelLeftClose className="h-3.5 w-3.5" aria-hidden />
            )}
          </button>
        </div>

        <nav
          id="sidebar-nav"
          className={cn("flex-1 overflow-y-auto py-3", collapsed ? "px-1.5" : "px-2")}
        >
          {navGroups.map((group, groupIndex) => (
            <div key={group.id}>
              {groupIndex > 0 && !collapsed ? (
                <div
                  className={cn(
                    "my-2 h-px",
                    isIntelligence ? "bg-white/[0.04]" : "bg-white/[0.06]"
                  )}
                  aria-hidden
                />
              ) : null}

              {!collapsed && group.id !== "home" ? (
                <p
                  className={cn(
                    "sc-nav-label mb-1.5 px-2",
                    isIntelligence
                      ? "text-[9px] tracking-[0.16em] text-white/22"
                      : "text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35"
                  )}
                  aria-hidden
                >
                  {group.label}
                </p>
              ) : null}

              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active =
                    item.href === "/" || item.href === "/operations"
                      ? pathname === item.href
                      : pathname.startsWith(item.href);
                  const isIntelItem = item.href === "/intelligence";

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={closeMobile}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "sc-nav-link group relative flex items-center rounded-md font-medium outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-white/20",
                          collapsed
                            ? "h-10 justify-center px-0"
                            : "h-8 gap-2 px-2 text-[13px]",
                          active
                            ? cn(
                                "sc-nav-link-active",
                                isIntelItem && "sc-nav-link-intelligence"
                              )
                            : isIntelligence
                              ? "text-white/40 hover:bg-white/[0.03] hover:text-white/75"
                              : "text-white/55 hover:bg-white/[0.05] hover:text-white/90"
                        )}
                      >
                        <Icon
                          className={cn(
                            "shrink-0",
                            collapsed ? "h-[17px] w-[17px]" : "h-4 w-4",
                            active ? "text-white" : "text-white/45 group-hover:text-white/80"
                          )}
                          aria-hidden
                        />
                        <span className={cn("truncate", collapsed ? "sr-only" : "")}>
                          {item.label}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
