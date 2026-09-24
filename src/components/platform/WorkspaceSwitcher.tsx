"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";
import {
  COMMAND_CENTRE_HOME,
  PLATFORM_HOME,
  PLATFORM_WORKSPACES,
  getActiveWorkspace,
  isCommandCentrePath,
  isPlatformHomePath,
  listEnterableWorkspaces,
  resolveCurrentWorkspace,
  resolveWorkspaceDirectoryState,
  type PlatformWorkspace,
} from "@/lib/platform/workspaces";
import { cn } from "@/lib/utils";
import { usePlatformSession } from "@/hooks/usePlatformSession";

/** Option status: only the route-current workspace is labelled Active. */
function optionStatusLabel(
  workspace: PlatformWorkspace,
  isCurrent: boolean,
  directoryLabel?: string
): string {
  if (isCurrent) return "Active";
  if (directoryLabel) return directoryLabel;
  if (workspace.status === "active") return "";
  return workspace.statusLabel;
}

/**
 * Cross-environment switcher — the only place to change operating environment.
 * Sidebar shows in-environment actions only (never a duplicate workspace list).
 */
export function WorkspaceSwitcher({
  compact = false,
}: {
  compact?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { enabledModules, isSuperAdmin, workspaceAccess, loading: sessionLoading } =
    usePlatformSession();
  const accessOptions = {
    enabledModules,
    sessionLoading,
    isSuperAdmin,
    workspaceAccess,
  };
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const currentWorkspace = resolveCurrentWorkspace(pathname);
  const enterable = listEnterableWorkspaces(accessOptions);
  const fallbackActive =
    enterable[0] ??
    (getActiveWorkspace().href ? getActiveWorkspace() : null);
  const onHome = isPlatformHomePath(pathname);
  const onCommandCentre = isCommandCentrePath(pathname);
  const canUseCommandCentre = Boolean(workspaceAccess?.commandCentre);
  const commandCentreLoading = sessionLoading || workspaceAccess == null;
  const triggerLabel = onCommandCentre
    ? COMMAND_CENTRE_HOME.label
    : onHome
      ? "Platform"
      : (currentWorkspace ?? fallbackActive)?.label ?? "Home";

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onPointer(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  return (
    <div
      className={cn("sc-ws-switcher", compact && "sc-ws-switcher-compact")}
      ref={rootRef}
    >
      <button
        type="button"
        className="sc-ws-switcher-trigger"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`Workspace: ${triggerLabel}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="sc-ws-switcher-copy">
          <span className="sc-ws-switcher-meta">Workspace</span>
          <span className="sc-ws-switcher-label">{triggerLabel}</span>
        </span>
        <ChevronDown
          className={cn(
            "sc-ws-switcher-chevron",
            open && "sc-ws-switcher-chevron-open"
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <div className="sc-ws-switcher-panel" id={listId} role="listbox">
          <p className="sc-ws-switcher-panel-title">Switch workspace</p>
          <ul className="sc-ws-switcher-list">
            {/* Executive Office is listed only for users whose IAM grants it (workspaceAccess.commandCentre). */}
            {onCommandCentre || canUseCommandCentre ? (
            <li>
              <button
                type="button"
                role="option"
                aria-selected={onCommandCentre}
                aria-disabled={
                  !onCommandCentre &&
                  (commandCentreLoading || !canUseCommandCentre)
                }
                disabled={
                  !onCommandCentre &&
                  (commandCentreLoading || !canUseCommandCentre)
                }
                className={cn(
                  "sc-ws-switcher-option",
                  onCommandCentre && "sc-ws-switcher-option-current",
                  !onCommandCentre &&
                    (commandCentreLoading || !canUseCommandCentre) &&
                    "sc-ws-switcher-option-disabled"
                )}
                onClick={() => {
                  if (commandCentreLoading || !canUseCommandCentre) return;
                  setOpen(false);
                  router.push(COMMAND_CENTRE_HOME.href);
                }}
              >
                <span className="sc-ws-switcher-option-main">
                  <span className="sc-ws-switcher-option-title">
                    {onCommandCentre ? (
                      <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    ) : null}
                    {COMMAND_CENTRE_HOME.label}
                  </span>
                  <span className="sc-ws-switcher-option-status">
                    {onCommandCentre
                      ? "Active"
                      : commandCentreLoading
                        ? "Checking access…"
                        : canUseCommandCentre
                          ? "Organisation overview"
                          : "No access"}
                  </span>
                </span>
              </button>
            </li>
            ) : null}

            <li>
              <button
                type="button"
                role="option"
                aria-selected={onHome}
                className={cn(
                  "sc-ws-switcher-option",
                  onHome && "sc-ws-switcher-option-current"
                )}
                onClick={() => {
                  setOpen(false);
                  router.push(PLATFORM_HOME.href);
                }}
              >
                <span className="sc-ws-switcher-option-main">
                  <span className="sc-ws-switcher-option-title">
                    {onHome ? (
                      <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    ) : null}
                    {onHome ? "Platform" : "Home"}
                  </span>
                  <span className="sc-ws-switcher-option-status">
                    {onHome ? "Active" : "Platform-wide home"}
                  </span>
                </span>
              </button>
            </li>

            {PLATFORM_WORKSPACES.map((workspace) => {
              const state = resolveWorkspaceDirectoryState(
                workspace,
                accessOptions
              );
              const href = state.kind === "enter" ? state.href : null;
              const isCurrent =
                !onCommandCentre &&
                !onHome &&
                currentWorkspace?.id === workspace.id;
              const statusLabel = optionStatusLabel(
                workspace,
                isCurrent,
                state.kind === "enter"
                  ? undefined
                  : state.kind === "loading"
                    ? "Checking access…"
                    : state.label
              );
              const disabled = !href;

              return (
                <li key={workspace.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isCurrent}
                    aria-disabled={disabled}
                    disabled={disabled}
                    className={cn(
                      "sc-ws-switcher-option",
                      isCurrent && "sc-ws-switcher-option-current",
                      disabled && "sc-ws-switcher-option-disabled"
                    )}
                    onClick={() => {
                      if (!href) return;
                      setOpen(false);
                      router.push(href);
                    }}
                  >
                    <span className="sc-ws-switcher-option-main">
                      <span className="sc-ws-switcher-option-title">
                        {isCurrent ? (
                          <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        ) : null}
                        {workspace.label}
                      </span>
                      {statusLabel ? (
                        <span className="sc-ws-switcher-option-status">
                          {statusLabel}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
