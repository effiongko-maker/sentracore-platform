"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";
import {
  PLATFORM_WORKSPACES,
  getActiveWorkspace,
  type PlatformWorkspace,
} from "@/lib/platform/workspaces";
import { cn } from "@/lib/utils";

function workspaceHref(workspace: PlatformWorkspace): string {
  if (workspace.status === "active" && workspace.href) return workspace.href;
  return workspace.previewHref ?? "/";
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
  const active = getActiveWorkspace();

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
          <span className="sc-ws-switcher-label">{active.label}</span>
          <span className="sc-ws-switcher-meta">Active workspace</span>
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
              const isActiveWorkspace = workspace.status === "active";
              const isCurrent =
                isActiveWorkspace &&
                (pathname === workspace.href ||
                  pathname.startsWith(`${workspace.href}/`) ||
                  (workspace.id === "operations" &&
                    pathname !== "/" &&
                    !pathname.startsWith("/workspaces")));

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
                        {isActiveWorkspace ? (
                          <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        ) : null}
                        {workspace.label}
                      </span>
                      <span className="sc-ws-switcher-option-status">
                        {workspace.statusLabel}
                      </span>
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
