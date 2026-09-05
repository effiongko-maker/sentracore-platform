"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Eye, MoreHorizontal, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Maintenance } from "@/modules/maintenance/types";

const MENU_WIDTH = 160;
const MENU_EST_HEIGHT = 140;
const VIEWPORT_PAD = 8;

type Coords = { top: number; left: number; width: number };

function measure(anchor: HTMLElement): Coords {
  const rect = anchor.getBoundingClientRect();
  const width = MENU_WIDTH;
  let left = rect.right - width;
  left = Math.max(
    VIEWPORT_PAD,
    Math.min(left, window.innerWidth - width - VIEWPORT_PAD)
  );
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;
  const openAbove = spaceBelow < MENU_EST_HEIGHT && spaceAbove > spaceBelow;
  const top = openAbove
    ? Math.max(VIEWPORT_PAD, rect.top - MENU_EST_HEIGHT)
    : rect.bottom + 4;
  return { top, left, width };
}

interface WorkRowActionsProps {
  work: Maintenance;
  onView: (work: Maintenance) => void;
  onTreat: (work: Maintenance) => void;
  onCancel: (work: Maintenance) => void;
  /** When false, hide Treat / Cancel (view-only actors). */
  canMutate?: boolean;
}

export function WorkRowActions({
  work,
  onView,
  onTreat,
  onCancel,
  canMutate = true,
}: WorkRowActionsProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const canCancel = work.status !== "cancelled" && work.status !== "completed";

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [work.id]);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setCoords(null);
      return;
    }
    setCoords(measure(anchorRef.current));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      const t = event.target as Node;
      if (menuRef.current?.contains(t) || anchorRef.current?.contains(t)) {
        return;
      }
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = work.title || work.id;

  const menu =
    open && mounted && coords
      ? createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={`Actions for ${label}`}
            className="fixed z-[80] w-40 overflow-hidden rounded-xl border border-border bg-card py-1 shadow-sc-lg"
            style={{
              top: coords.top,
              left: coords.left,
              width: coords.width,
            }}
          >
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-slate-50"
              onClick={() => {
                setOpen(false);
                onView(work);
              }}
            >
              <Eye className="h-3.5 w-3.5 text-muted" />
              View
            </button>
            {canMutate ? (
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-slate-50"
                onClick={() => {
                  setOpen(false);
                  onTreat(work);
                }}
              >
                <Play className="h-3.5 w-3.5 text-muted" />
                Treat
              </button>
            ) : null}
            {canMutate ? (
              <button
                type="button"
                role="menuitem"
                disabled={!canCancel}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                onClick={() => {
                  setOpen(false);
                  onCancel(work);
                }}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                Cancel
              </button>
            ) : null}
          </div>,
          document.body
        )
      : null;

  return (
    <div className="relative flex justify-end" ref={anchorRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted outline-none transition-colors duration-150 hover:bg-slate-100 hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent/30",
          open && "bg-slate-100 text-foreground"
        )}
        aria-label={`Actions for ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {menu}
    </div>
  );
}
