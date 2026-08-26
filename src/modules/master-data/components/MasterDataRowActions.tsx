"use client";

import { Ban, Eye, MoreHorizontal, Pencil } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

const MENU_WIDTH = 160;
const MENU_GAP = 4;
const VIEWPORT_PAD = 8;
/** Approximate menu height for View / Edit / Deactivate. */
const MENU_EST_HEIGHT = 132;

type MenuCoords = {
  top: number;
  left: number;
  width: number;
};

function measureMenuPosition(anchor: HTMLElement): MenuCoords {
  const rect = anchor.getBoundingClientRect();
  const width = MENU_WIDTH;
  let left = rect.right - width;
  left = Math.max(
    VIEWPORT_PAD,
    Math.min(left, window.innerWidth - width - VIEWPORT_PAD)
  );

  const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_PAD;
  const spaceAbove = rect.top - VIEWPORT_PAD;
  const openAbove =
    spaceBelow < MENU_EST_HEIGHT && spaceAbove > spaceBelow;

  const top = openAbove
    ? Math.max(VIEWPORT_PAD, rect.top - MENU_GAP - MENU_EST_HEIGHT)
    : rect.bottom + MENU_GAP;

  return { top, left, width };
}

export function MasterDataRowActions({
  onView,
  onEdit,
  onDeactivate,
  canDeactivate,
  label,
}: {
  onView: () => void;
  onEdit: () => void;
  onDeactivate: () => void;
  canDeactivate: boolean;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<MenuCoords | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setCoords(null);
      return;
    }

    function updatePosition() {
      if (!anchorRef.current) return;
      setCoords(measureMenuPosition(anchorRef.current));
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

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
                onView();
              }}
            >
              <Eye className="h-3.5 w-3.5 text-muted" />
              View
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-slate-50"
              onClick={() => {
                setOpen(false);
                onEdit();
              }}
            >
              <Pencil className="h-3.5 w-3.5 text-muted" />
              Edit
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={!canDeactivate}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
              onClick={() => {
                setOpen(false);
                onDeactivate();
              }}
            >
              <Ban className="h-3.5 w-3.5" />
              Deactivate
            </button>
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
