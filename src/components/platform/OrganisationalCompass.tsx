"use client";

import { Home } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  COMMAND_HOME,
  filterOperatingLayers,
  OPERATING_LAYERS,
  resolveLayerByPath,
} from "@/lib/platform/layers";
import {
  getActiveWorkspace,
  isOperationsPath,
  isPlatformHomePath,
  isWorkspacePreviewPath,
  PLATFORM_HOME,
} from "@/lib/platform/workspaces";
import { cn } from "@/lib/utils";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import { usePlatformShell } from "@/hooks/usePlatformShell";
import { AppFooter } from "@/components/layout/AppFooter";
import { SentraCoreLogo } from "@/components/brand";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

export function OrganisationalCompass() {
  const pathname = usePathname();
  const { enabledModules } = usePlatformSession();
  const { mobileNavOpen, closeMobileNav } = usePlatformShell();
  const layers = filterOperatingLayers(OPERATING_LAYERS, enabledModules);
  const activeLayer = resolveLayerByPath(pathname);
  const inOperations = isOperationsPath(pathname);
  const atPlatformLevel =
    isPlatformHomePath(pathname) || isWorkspacePreviewPath(pathname);
  const isOpsHome =
    pathname === COMMAND_HOME.href ||
    pathname.startsWith(`${COMMAND_HOME.href}/`);
  const isPlatformHome = isPlatformHomePath(pathname);
  const activeWorkspace = getActiveWorkspace();

  return (
    <>
      {mobileNavOpen ? (
        <div
          className="os-compass-backdrop lg:hidden"
          onClick={closeMobileNav}
          aria-hidden
        />
      ) : null}

      <nav
        className={cn(
          "os-compass print:hidden",
          mobileNavOpen && "os-compass-open"
        )}
        aria-label="Navigation"
      >
        <div className="os-compass-brand-block">
          <Link
            href={PLATFORM_HOME.href}
            onClick={closeMobileNav}
            className={cn(
              "os-compass-brand",
              isPlatformHome && "os-compass-brand-active"
            )}
            aria-current={isPlatformHome ? "page" : undefined}
          >
            <span className="os-compass-mark" aria-hidden>
              <SentraCoreLogo size={32} alt="" />
            </span>
            <div className="min-w-0">
              <p className="os-compass-brand-name truncate">SentraCore</p>
              <p className="os-compass-brand-sub truncate">
                Enterprise Operating Platform
              </p>
            </div>
          </Link>

          <WorkspaceSwitcher />
        </div>

        {inOperations ? (
          <div className="os-compass-scroll">
            <p className="os-compass-workspace-caption">Facility Management</p>
            <Link
              href={COMMAND_HOME.href}
              onClick={closeMobileNav}
              className={cn(
                "os-compass-home",
                isOpsHome && "os-compass-home-active"
              )}
              aria-current={isOpsHome ? "page" : undefined}
            >
              <Home className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
              <span>{COMMAND_HOME.label}</span>
            </Link>

            {layers.map((layer) => {
              const isGroupActive = activeLayer === layer.id;

              return (
                <div
                  key={layer.id}
                  className={cn(
                    "os-compass-group",
                    isGroupActive && "os-compass-group-active"
                  )}
                >
                  <p className="os-compass-group-label">{layer.label}</p>
                  <div className="os-compass-modules">
                    {layer.modules.map((mod) => {
                      const Icon = mod.icon;
                      const active =
                        !mod.comingSoon &&
                        mod.href !== "/" &&
                        pathname.startsWith(mod.href);

                      if (mod.comingSoon) {
                        return (
                          <span
                            key={mod.label}
                            className="os-compass-module os-compass-module-soon"
                          >
                            <Icon className="h-4 w-4 shrink-0 opacity-50" />
                            <span>{mod.label}</span>
                          </span>
                        );
                      }

                      return (
                        <Link
                          key={mod.href}
                          href={mod.href}
                          onClick={closeMobileNav}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "os-compass-module",
                            active && "os-compass-module-active"
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0" aria-hidden />
                          <span>{mod.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : atPlatformLevel ? (
          <div className="os-compass-scroll">
            <div className="os-compass-platform-active">
              <p className="os-compass-platform-active-name">
                {activeWorkspace.label}
              </p>
              <p className="os-compass-platform-active-meta">Active workspace</p>
            </div>

            <Link
              href={PLATFORM_HOME.href}
              onClick={closeMobileNav}
              className={cn(
                "os-compass-home",
                isPlatformHome && "os-compass-home-active"
              )}
              aria-current={isPlatformHome ? "page" : undefined}
            >
              <Home className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
              <span>{PLATFORM_HOME.label}</span>
            </Link>
          </div>
        ) : (
          <div className="os-compass-scroll">
            <Link
              href={PLATFORM_HOME.href}
              onClick={closeMobileNav}
              className="os-compass-home"
            >
              <Home className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
              <span>{PLATFORM_HOME.label}</span>
            </Link>
          </div>
        )}

        <AppFooter />
      </nav>
    </>
  );
}
