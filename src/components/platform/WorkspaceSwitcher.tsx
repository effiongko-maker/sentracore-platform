"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";
import {
  PLATFORM_WORKSPACES,
  getActiveWorkspace,
  isPlatformHomePath,
  isWorkspacePreviewPath,
  resolveCurrentWorkspace,
  type PlatformWorkspace,
} from "@/lib/platform/workspaces";
import { cn } from "@/lib/utils";

function workspaceHref(workspace: PlatformWorkspace): string {
  if (workspace.status === "active" && workspace.href) return workspace.href;
  return workspace.previewHref ?? "/";
}

/** Option status: only the route-current workspace is labelled Active. */
function optionStatusLabel(
  workspace: PlatformWorkspace,
  isCurrent: boolean
): string {
  if (isCurrent) return "Active";
  if (workspace.status === "active") return "";
  return workspace.statusLabel;
}

export function WorkspaceSwitcher({
  compact = false,
}: {
  compact?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const currentWorkspace = resolveCurrentWorkspace(pathname);
  const fallbackActive = getActiveWorkspace();
  const onPlatformLevel =
    isPlatformHomePath(pathname) || isWorkspacePreviewPath(pathname);

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
    <div className={cn("sc-ws-switcher", compact && "sc-ws-switcher-compact")} ref={rootRef}>
      <button
        type="button"
        className="sc-ws-switcher-trigger"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="sc-ws-switcher-copy">
          <span className="sc-ws-switcher-label">
            {onPlatformLevel
              ? "Platform"
              : (currentWorkspace ?? fallbackActive).label}
          </span>
          <span className="sc-ws-switcher-meta">
            {onPlatformLevel ? "Select workspace" : "Active workspace"}
          </span>
        </span>
        <ChevronDown
          className={cn("sc-ws-switcher-chevron", open && "sc-ws-switcher-chevron-open")}
          aria-hidden
        />
      </button>

      {open ? (
        <div className="sc-ws-switcher-panel" id={listId} role="listbox">
          <p className="sc-ws-switcher-panel-title">Workspaces</p>
          <ul className="sc-ws-switcher-list">
            {PLATFORM_WORKSPACES.map((workspace) => {
              const href = workspaceHref(workspace);
              const isCurrent = currentWorkspace?.id === workspace.id;
              const statusLabel = optionStatusLabel(workspace, isCurrent);

              return (
                <li key={workspace.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isCurrent}
                    className={cn(
                      "sc-ws-switcher-option",
                      isCurrent && "sc-ws-switcher-option-current"
                    )}
                    onClick={() => {
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
          <Link
            href="/"
            className="sc-ws-switcher-platform"
            onClick={() => setOpen(false)}
          >
            SentraCore Platform Home →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
