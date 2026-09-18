"use client";

import { ChevronDown, Hexagon, Home } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  COMMAND_HOME,
  filterOperatingLayers,
  OPERATING_LAYERS,
  moduleMatchesPath,
  resolveLayerByPath,
} from "@/lib/platform/layers";
import {
  isEccOperationsPath,
  isOperationsPath,
  isPlatformFinancePath,
  isPlatformHomePath,
  isCommandCentrePath,
  PLATFORM_HOME,
  COMMAND_CENTRE_HOME,
} from "@/lib/platform/workspaces";
import { hasModule } from "@/lib/actions/moduleAccess";
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
import {
  ECC_NAV_GROUPS,
  isEccNavItemActive,
} from "@/modules/ecc-operations/nav";
import {
  PLATFORM_FINANCE_NAV_ITEMS,
  isPlatformFinanceNavItemActive,
  isPlatformFinanceNavSectionActive,
  type PlatformFinanceNavItem,
  type PlatformFinanceNavLeaf,
} from "@/modules/platform-finance/nav";

/**
 * Sidebar = actions within the current operating environment.
 * Cross-workspace switching lives only in WorkspaceSwitcher — do not
 * duplicate workspace directory lists here.
 */
export function OrganisationalCompass() {
  const pathname = usePathname();
  const {
    enabledModules,
    workspaceAccess,
    loading: sessionLoading,
  } = usePlatformSession();
  const {
    access,
    loading: accessLoading,
    error: accessError,
    reload: reloadAccess,
  } = useOperatingAccess();
  const { mobileNavOpen, closeMobileNav } = usePlatformShell();

  // While access is resolving, do not treat visibility as "no surfaces".
  const visibility =
    !accessLoading && access ? resolveAccessVisibility(access) : null;
  const layers = filterOperatingLayers(
    OPERATING_LAYERS,
    enabledModules,
    visibility
  );
  const showCommandHome =
    accessLoading ||
    !visibility ||
    canSeeSurface(visibility, "home") ||
    canSeeSurface(visibility, "operations");
  const activeLayer = resolveLayerByPath(pathname);
  const inOperations = isOperationsPath(pathname);
  const inEccOperations = isEccOperationsPath(pathname);
  const inPlatformFinance = isPlatformFinancePath(pathname);
  const inCommandCentre = isCommandCentrePath(pathname);
  const canUseEcc = Boolean(workspaceAccess?.eccOperations);
  const canUsePlatformFinance = Boolean(workspaceAccess?.platformFinance);
  const canUseCommandCentre = Boolean(workspaceAccess?.commandCentre);
  const isOpsHome =
    pathname === COMMAND_HOME.href ||
    pathname.startsWith(`${COMMAND_HOME.href}/`);
  const isPlatformHome = isPlatformHomePath(pathname);
  const showPlatformDirectory = isPlatformHome || inCommandCentre;
  const navLoading = sessionLoading || (inOperations && accessLoading);

  /** Finance groups default open; collapse toggles persist until path forces open. */
  const [financeCollapsed, setFinanceCollapsed] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    if (!inPlatformFinance) return;
    setFinanceCollapsed((prev) => {
      let next = prev;
      for (const item of PLATFORM_FINANCE_NAV_ITEMS) {
        if (
          item.children?.length &&
          isPlatformFinanceNavSectionActive(item, pathname) &&
          prev[item.label]
        ) {
          if (next === prev) next = { ...prev };
          next[item.label] = false;
        }
      }
      return next;
    });
  }, [inPlatformFinance, pathname]);

  function isFinanceGroupOpen(item: PlatformFinanceNavItem): boolean {
    if (!item.children?.length) return false;
    return !financeCollapsed[item.label];
  }

  function toggleFinanceGroup(label: string) {
    setFinanceCollapsed((prev) => ({
      ...prev,
      [label]: !prev[label],
    }));
  }

  function renderFinanceLeaf(
    item: PlatformFinanceNavLeaf,
    opts?: { nested?: boolean }
  ) {
    const Icon = item.icon;
    const active = isPlatformFinanceNavItemActive(item, pathname);
    const className = cn(
      opts?.nested ? "os-compass-intel-link" : "os-compass-module",
      active &&
        (opts?.nested
          ? "os-compass-intel-link-active"
          : "os-compass-module-active")
    );

    if (item.comingSoon || !item.href) {
      return (
        <span
          key={item.label}
          className={cn(
            className,
            !opts?.nested && "os-compass-module-soon",
            opts?.nested && "os-compass-module-soon"
          )}
          title="Not available yet"
        >
          <Icon className="h-4 w-4 shrink-0" aria-hidden />
          <span>{item.label}</span>
        </span>
      );
    }

    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={closeMobileNav}
        aria-current={active ? "page" : undefined}
        className={className}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        <span>{item.label}</span>
      </Link>
    );
  }

  function renderFinanceItem(item: PlatformFinanceNavItem) {
    const children = item.children;
    if (!children?.length) {
      return renderFinanceLeaf(item);
    }

    const Icon = item.icon;
    const sectionActive = isPlatformFinanceNavSectionActive(item, pathname);
    const open = isFinanceGroupOpen(item);
    const childActive = children.some((child) =>
      isPlatformFinanceNavItemActive(child, pathname)
    );
    const parentActive =
      isPlatformFinanceNavItemActive(item, pathname) && !childActive;
    const parentSoon = Boolean(item.comingSoon || !item.href);

    return (
      <div
        key={item.label}
        className={cn(
          "os-compass-finance-section",
          sectionActive && "os-compass-finance-section-active"
        )}
      >
        <div className="os-compass-finance-parent">
          {parentSoon ? (
            <span className="os-compass-module os-compass-finance-parent-label">
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              <span>{item.label}</span>
            </span>
          ) : (
            <Link
              href={item.href!}
              onClick={closeMobileNav}
              aria-current={parentActive ? "page" : undefined}
              className={cn(
                "os-compass-module os-compass-finance-parent-label",
                parentActive && "os-compass-module-active"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              <span>{item.label}</span>
            </Link>
          )}
          <button
            type="button"
            className="os-compass-finance-toggle"
            aria-expanded={open}
            aria-label={`${open ? "Collapse" : "Expand"} ${item.label}`}
            onClick={() => toggleFinanceGroup(item.label)}
          >
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                open && "rotate-180"
              )}
              aria-hidden
            />
          </button>
        </div>
        {open ? (
          <div className="os-compass-intel-subnav" role="group">
            {children.map((child) => renderFinanceLeaf(child, { nested: true }))}
          </div>
        ) : null}
      </div>
    );
  }

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
              <p className="os-compass-brand-name truncate">SentraCore™</p>
            </div>
          </Link>

          <WorkspaceSwitcher />
        </div>

        {inOperations ? (
          <div className="os-compass-scroll">
            <p className="os-compass-workspace-caption">Facility Management</p>
            {navLoading ? (
              <p className="os-compass-nav-status" role="status">
                Loading navigation…
              </p>
            ) : null}
            {!navLoading && accessError && !access ? (
              <div className="os-compass-nav-status">
                <p>Unable to verify access.</p>
                <button
                  type="button"
                  className="os-compass-nav-retry"
                  onClick={() => reloadAccess()}
                >
                  Retry
                </button>
              </div>
            ) : null}
            {!navLoading && showCommandHome ? (
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

            {!navLoading
              ? layers.map((layer) => {
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
                          const active = moduleMatchesPath(mod, pathname);

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
                })
              : null}
          </div>
        ) : inEccOperations && canUseEcc ? (
          <div className="os-compass-scroll">
            <p className="os-compass-workspace-caption">ECC Operations</p>
            {sessionLoading ? (
              <p className="os-compass-nav-status" role="status">
                Loading navigation…
              </p>
            ) : (
              ECC_NAV_GROUPS.map((group) => {
                const isGroupActive = group.items.some((item) =>
                  isEccNavItemActive(item, pathname)
                );
                return (
                  <div
                    key={group.id}
                    className={cn(
                      "os-compass-group",
                      isGroupActive && "os-compass-group-active"
                    )}
                  >
                    <p className="os-compass-group-label">{group.label}</p>
                    <div className="os-compass-modules">
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        const active = isEccNavItemActive(item, pathname);
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
                );
              })
            )}
          </div>
        ) : inEccOperations && !sessionLoading && !canUseEcc ? (
          <div className="os-compass-scroll">
            <p className="os-compass-workspace-caption">ECC Operations</p>
            <p className="os-compass-nav-status">No access to this workspace.</p>
            <Link
              href={PLATFORM_HOME.href}
              onClick={closeMobileNav}
              className="os-compass-module"
            >
              <Home className="h-4 w-4 shrink-0" aria-hidden />
              <span>Platform Home</span>
            </Link>
          </div>
        ) : inPlatformFinance && canUsePlatformFinance ? (
          <div className="os-compass-scroll">
            <p className="os-compass-workspace-caption">Finance</p>
            {sessionLoading ? (
              <p className="os-compass-nav-status" role="status">
                Loading navigation…
              </p>
            ) : (
              <div className="os-compass-group os-compass-group-active">
                <div className="os-compass-modules">
                  {PLATFORM_FINANCE_NAV_ITEMS.map((item) =>
                    renderFinanceItem(item)
                  )}
                </div>
              </div>
            )}
          </div>
        ) : inPlatformFinance && !sessionLoading && !canUsePlatformFinance ? (
          <div className="os-compass-scroll">
            <p className="os-compass-workspace-caption">Finance</p>
            <p className="os-compass-nav-status">No access to this workspace.</p>
            <Link
              href={PLATFORM_HOME.href}
              onClick={closeMobileNav}
              className="os-compass-module"
            >
              <Home className="h-4 w-4 shrink-0" aria-hidden />
              <span>Platform Home</span>
            </Link>
          </div>
        ) : showPlatformDirectory ? (
          <div className="os-compass-scroll">
            {sessionLoading ? (
              <p className="os-compass-nav-status" role="status">
                Loading navigation…
              </p>
            ) : (
              <>
                <div className="os-compass-command-block">
                  <p className="os-compass-workspace-caption">Command Centre</p>
                  {sessionLoading || workspaceAccess == null ? (
                    <p className="os-compass-nav-status" role="status">
                      Checking access…
                    </p>
                  ) : canUseCommandCentre ? (
                    <>
                      <Link
                        href={COMMAND_CENTRE_HOME.href}
                        onClick={closeMobileNav}
                        aria-current={inCommandCentre ? "page" : undefined}
                        className={cn(
                          "os-compass-command-centre",
                          inCommandCentre && "os-compass-command-centre-active"
                        )}
                      >
                        <Hexagon
                          className="h-4 w-4 shrink-0 opacity-80"
                          aria-hidden
                        />
                        <span className="os-compass-command-centre-label">
                          {COMMAND_CENTRE_HOME.label}
                        </span>
                      </Link>
                      <p className="os-compass-command-centre-hint">
                        Your organisation
                      </p>
                    </>
                  ) : (
                    <p className="os-compass-nav-status">No access</p>
                  )}
                </div>

                <div className="os-compass-group">
                  <p className="os-compass-group-label">Platform</p>
                  <div className="os-compass-modules">
                    <Link
                      href={PLATFORM_HOME.href}
                      onClick={closeMobileNav}
                      aria-current={isPlatformHome ? "page" : undefined}
                      className={cn(
                        "os-compass-module",
                        isPlatformHome && "os-compass-module-active"
                      )}
                    >
                      <Home className="h-4 w-4 shrink-0" aria-hidden />
                      <span>{PLATFORM_HOME.label}</span>
                    </Link>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="os-compass-scroll">
            <p className="os-compass-workspace-caption">Platform</p>
            {sessionLoading ? (
              <p className="os-compass-nav-status" role="status">
                Loading navigation…
              </p>
            ) : (
              <div className="os-compass-modules">
                <Link
                  href={PLATFORM_HOME.href}
                  onClick={closeMobileNav}
                  className="os-compass-module"
                >
                  <Home className="h-4 w-4 shrink-0" aria-hidden />
                  <span>{PLATFORM_HOME.label}</span>
                </Link>
                <p className="os-compass-nav-status">
                  Use the workspace switcher to change operating environment.
                </p>
              </div>
            )}
          </div>
        )}

        <AppFooter />
      </nav>
    </>
  );
}
