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
  isOperationsPath,
  isPlatformHomePath,
  isWorkspacePreviewPath,
  PLATFORM_HOME,
} from "@/lib/platform/workspaces";
import { cn } from "@/lib/utils";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import { useOperatingAccess } from "@/hooks/useOperatingAccess";
import { usePlatformShell } from "@/hooks/usePlatformShell";
import {
  resolveAccessVisibility,
  canSeeSurface,
} from "@/lib/access";
import { AppFooter } from "@/components/layout/AppFooter";
import { SentraCoreLogo } from "@/components/brand";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

/** Platform chrome only — FM destinations (People, Master Data) live in OPERATING_LAYERS. */
const PLATFORM_NAV = [
  {
    label: "Platform Home",
    href: PLATFORM_HOME.href,
    icon: Home,
    match: (pathname: string) => isPlatformHomePath(pathname),
  },
] as const;

export function OrganisationalCompass() {
  const pathname = usePathname();
  const { enabledModules } = usePlatformSession();
  const { access, loading: accessLoading } = useOperatingAccess();
  const { mobileNavOpen, closeMobileNav } = usePlatformShell();
  const visibility =
    !accessLoading && access ? resolveAccessVisibility(access) : null;
  const layers = filterOperatingLayers(
    OPERATING_LAYERS,
    enabledModules,
    visibility
  );
  const showCommandHome =
    !visibility ||
    canSeeSurface(visibility, "home") ||
    canSeeSurface(visibility, "operations");
  const activeLayer = resolveLayerByPath(pathname);
  const inOperations = isOperationsPath(pathname);
  const atPlatformLevel =
    isPlatformHomePath(pathname) || isWorkspacePreviewPath(pathname);
  const isOpsHome =
    pathname === COMMAND_HOME.href ||
    pathname.startsWith(`${COMMAND_HOME.href}/`);
  const isPlatformHome = isPlatformHomePath(pathname);

  const platformLinks = PLATFORM_NAV;
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
            {showCommandHome ? (
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
            ) : null}

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
                  {layer.id !== "understand" ? (
                    <p className="os-compass-group-label">{layer.label}</p>
                  ) : null}
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
            <p className="os-compass-group-label">Platform</p>
            <div className="os-compass-modules">
              {platformLinks.map((item) => {
                const Icon = item.icon;
                const active = item.match(pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={closeMobileNav}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "os-compass-module",
                      active && "os-compass-module-active"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
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
