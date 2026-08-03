"use client";

import { motion } from "framer-motion";
import { PanelLeftClose, PanelLeftOpen, Hexagon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/hooks/useSidebar";

export function Sidebar() {
  const pathname = usePathname();
  const { collapsed, mobileOpen, closeMobile, toggleCollapsed } = useSidebar();

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-primary/35 backdrop-blur-[1px] transition-opacity duration-200 lg:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={closeMobile}
        aria-hidden={!mobileOpen}
      />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-white/10 bg-primary text-white transition-[width,transform] duration-200 ease-out",
          collapsed
            ? "w-[var(--sc-sidebar-collapsed)]"
            : "w-[var(--sc-sidebar-width)]",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
        aria-label="Primary navigation"
      >
        {/* Brand + persistent toggle — always visible in both states */}
        <div
          className={cn(
            "flex shrink-0 items-center border-b border-white/10",
            collapsed
              ? "min-h-[var(--sc-header-height)] flex-col justify-center gap-2 px-2 py-3"
              : "h-[var(--sc-header-height)] gap-2 px-3"
          )}
        >
          <Link
            href="/"
            onClick={closeMobile}
            className={cn(
              "group flex min-w-0 items-center rounded-xl outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-white/30",
              collapsed ? "justify-center" : "flex-1 gap-2.5 px-1 py-1"
            )}
            aria-label="SentraCore home"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent shadow-sc transition-transform duration-200 group-hover:scale-[1.03]">
              <Hexagon className="h-4 w-4 fill-white/10" aria-hidden />
            </span>
            {!collapsed ? (
              <div className="min-w-0 leading-tight">
                <p className="truncate text-sm font-semibold tracking-tight">
                  SentraCore
                  <span className="align-super text-[9px] font-medium text-white/45">
                    ™
                  </span>
                </p>
                <p className="truncate text-[11px] text-white/45">
                  Operations Management
                </p>
              </div>
            ) : null}
          </Link>

          <button
            type="button"
            onClick={toggleCollapsed}
            className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/55 outline-none transition-colors duration-200 hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/30 lg:inline-flex"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            aria-controls="sidebar-nav"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" aria-hidden />
            ) : (
              <PanelLeftClose className="h-4 w-4" aria-hidden />
            )}
          </button>
        </div>

        {/* Navigation */}
        <nav
          id="sidebar-nav"
          className={cn(
            "flex-1 space-y-0.5 overflow-y-auto py-3",
            collapsed ? "px-2" : "px-3"
          )}
        >
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeMobile}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex items-center rounded-xl text-sm font-medium outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-white/25",
                  collapsed
                    ? "h-11 justify-center px-0"
                    : "h-10 gap-3 px-3",
                  active
                    ? "bg-white/[0.12] text-white"
                    : "text-white/65 hover:bg-white/[0.06] hover:text-white"
                )}
              >
                {active ? (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-accent"
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    aria-hidden
                  />
                ) : null}

                <Icon
                  className={cn(
                    "h-[18px] w-[18px] shrink-0 transition-colors duration-200",
                    active
                      ? "text-white"
                      : "text-white/55 group-hover:text-white"
                  )}
                  aria-hidden
                />

                <span
                  className={cn(
                    "truncate transition-opacity duration-200",
                    collapsed ? "sr-only" : "opacity-100"
                  )}
                >
                  {item.label}
                </span>

                {/* Collapsed hover tooltip */}
                {collapsed ? (
                  <span
                    role="tooltip"
                    className="pointer-events-none absolute left-full z-[60] ml-3 whitespace-nowrap rounded-lg bg-primary-soft px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-sc-lg ring-1 ring-white/10 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
                  >
                    {item.label}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        {/* Product branding */}
        <div
          className={cn(
            "shrink-0 border-t border-white/10",
            collapsed ? "px-2 py-3" : "px-3 py-3"
          )}
        >
          {collapsed ? (
            <div
              className="group relative mx-auto flex h-9 w-9 items-center justify-center rounded-lg text-[10px] font-semibold tracking-wide text-white/50 transition-colors duration-200 hover:bg-white/[0.06] hover:text-white/80"
              title="SentraCore™ · Powered by Beacon Africa Limited"
            >
              SC
              <span
                role="tooltip"
                className="pointer-events-none absolute bottom-0 left-full z-[60] ml-3 w-48 rounded-lg bg-primary-soft px-3 py-2.5 text-left shadow-sc-lg ring-1 ring-white/10 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
              >
                <span className="block text-xs font-semibold text-white">
                  SentraCore™
                </span>
                <span className="mt-0.5 block text-[11px] text-white/55">
                  Operations Management Platform
                </span>
                <span className="mt-2 block border-t border-white/10 pt-2 text-[10px] text-white/35">
                  Powered by Beacon Africa Limited
                </span>
              </span>
            </div>
          ) : (
            <div className="rounded-xl px-3 py-3 ring-1 ring-white/[0.06]">
              <p className="text-[13px] font-semibold tracking-tight text-white/90">
                SentraCore™
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-white/45">
                Operations Management Platform
              </p>
              <div className="mt-3 border-t border-white/10 pt-2.5">
                <p className="text-[10px] leading-snug text-white/30">
                  Powered by Beacon Africa Limited
                </p>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
