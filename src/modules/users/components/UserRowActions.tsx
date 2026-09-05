"use client";

import { Eye, MoreHorizontal, Pencil, UserX } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import type { User } from "../types";

const MENU_WIDTH = 160;
const MENU_GAP = 4;
const VIEWPORT_PAD = 8;
const MENU_EST_HEIGHT = 132;

type MenuCoords = {
  top: number;
  left: number;
  width: number;
};

function measureMenuPosition(anchor: HTMLElement, menuHeight: number): MenuCoords {
  const rect = anchor.getBoundingClientRect();
  const width = MENU_WIDTH;
  let left = rect.right - width;
  left = Math.max(
    VIEWPORT_PAD,
    Math.min(left, window.innerWidth - width - VIEWPORT_PAD)
  );

  const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_PAD;
  const spaceAbove = rect.top - VIEWPORT_PAD;
  const height = menuHeight || MENU_EST_HEIGHT;
  const openAbove = spaceBelow < height && spaceAbove > spaceBelow;

  const top = openAbove
    ? Math.max(VIEWPORT_PAD, rect.top - MENU_GAP - height)
    : rect.bottom + MENU_GAP;

  return { top, left, width };
}

interface UserRowActionsProps {
  user: User;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onView: (user: User) => void;
  onEdit: (user: User) => void;
  onDeactivate: (user: User) => void;
  canManage?: boolean;
}

export function UserRowActions({
  user,
  open,
  onOpenChange,
  onView,
  onEdit,
  onDeactivate,
  canManage = true,
}: UserRowActionsProps) {
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<MenuCoords | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const canDeactivate = user.status !== "inactive";

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
      const height = menuRef.current?.offsetHeight || MENU_EST_HEIGHT;
      setCoords(measureMenuPosition(anchorRef.current, height));
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
      onOpenChange(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onOpenChange]);

  const menu =
    open && mounted && coords
      ? createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={`Actions for ${user.name}`}
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
                onOpenChange(false);
                onView(user);
              }}
            >
              <Eye className="h-3.5 w-3.5 text-muted" />
              View
            </button>
            {canManage ? (
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-slate-50"
                onClick={() => {
                  onOpenChange(false);
                  onEdit(user);
                }}
              >
                <Pencil className="h-3.5 w-3.5 text-muted" />
                Edit
              </button>
            ) : null}
            {canManage ? (
              <button
                type="button"
                role="menuitem"
                disabled={!canDeactivate}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                onClick={() => {
                  onOpenChange(false);
                  onDeactivate(user);
                }}
              >
                <UserX className="h-3.5 w-3.5" />
                Deactivate
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
        onClick={() => onOpenChange(!open)}
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted outline-none transition-colors duration-150 hover:bg-slate-100 hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent/30",
          open && "bg-slate-100 text-foreground"
        )}
        aria-label={`Actions for ${user.name}`}
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
