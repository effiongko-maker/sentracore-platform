"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileText,
  MoreHorizontal,
  Pencil,
  Phone,
  Send,
} from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { getApprovalLifecycleActions } from "../lifecycle";
import type { Approval } from "../types";

const MENU_WIDTH = 200;
const MENU_GAP = 4;
const VIEWPORT_PAD = 8;
const MENU_EST_HEIGHT = 280;

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
  const openAbove = spaceBelow < MENU_EST_HEIGHT && spaceAbove > spaceBelow;

  const top = openAbove
    ? Math.max(VIEWPORT_PAD, rect.top - MENU_GAP - MENU_EST_HEIGHT)
    : rect.bottom + MENU_GAP;

  return { top, left, width };
}

interface ApprovalRowActionsProps {
  approval: Approval;
  onView: (approval: Approval) => void;
  onEdit: (approval: Approval) => void;
  onPackage: (approval: Approval) => void;
  onSubmit: (approval: Approval) => void;
  onFollowUp: (approval: Approval) => void;
  onDecision: (approval: Approval) => void;
  onDeactivate: (approval: Approval) => void;
  /** When false, hide lifecycle mutations (view + print package remain). */
  canManage?: boolean;
}

export function ApprovalRowActions({
  approval,
  onView,
  onEdit,
  onPackage,
  onSubmit,
  onFollowUp,
  onDecision,
  onDeactivate,
  canManage = true,
}: ApprovalRowActionsProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<MenuCoords | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const actions = getApprovalLifecycleActions(
    approval.status,
    approval.submittedAt
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [approval.id]);

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

  const label = approval.title || approval.id;

  const menu =
    open && mounted && coords
      ? createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={`Actions for ${label}`}
            className="fixed z-[80] w-50 overflow-hidden rounded-xl border border-border bg-card py-1 shadow-sc-lg"
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
                onView(approval);
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
                onPackage(approval);
              }}
            >
              <FileText className="h-3.5 w-3.5 text-muted" />
              Print package
            </button>
            {canManage && actions.canSubmit ? (
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-slate-50"
                onClick={() => {
                  setOpen(false);
                  onSubmit(approval);
                }}
              >
                <Send className="h-3.5 w-3.5 text-muted" />
                Mark as submitted
              </button>
            ) : null}
            {canManage && actions.canFollowUp ? (
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-slate-50"
                onClick={() => {
                  setOpen(false);
                  onFollowUp(approval);
                }}
              >
                <Phone className="h-3.5 w-3.5 text-muted" />
                Record follow-up
              </button>
            ) : null}
            {canManage && actions.canRecordDecision ? (
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-slate-50"
                onClick={() => {
                  setOpen(false);
                  onDecision(approval);
                }}
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-muted" />
                Record decision
              </button>
            ) : null}
            {canManage && actions.canEdit ? (
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-slate-50"
                onClick={() => {
                  setOpen(false);
                  onEdit(approval);
                }}
              >
                <Pencil className="h-3.5 w-3.5 text-muted" />
                {actions.canEditSubmission ? "Edit submission details" : "Edit"}
              </button>
            ) : null}
            {canManage ? (
              <button
                type="button"
                role="menuitem"
                disabled={!actions.canCancel}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                onClick={() => {
                  setOpen(false);
                  onDeactivate(approval);
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
          "inline-flex h-8 w-8 items-center rounded-lg text-muted outline-none transition-colors duration-150 hover:bg-slate-100 hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent/30",
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
