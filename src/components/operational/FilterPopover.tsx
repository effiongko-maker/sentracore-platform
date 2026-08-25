"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

const PANEL_WIDTH = 340;
const PANEL_GAP = 6;
const VIEWPORT_PAD = 8;

type PanelCoords = {
  top: number;
  left: number;
  width: number;
};

function measurePanelPosition(anchor: HTMLElement): PanelCoords {
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(PANEL_WIDTH, window.innerWidth - VIEWPORT_PAD * 2);
  let left = rect.right - width;
  left = Math.max(
    VIEWPORT_PAD,
    Math.min(left, window.innerWidth - width - VIEWPORT_PAD)
  );

  return {
    top: rect.bottom + PANEL_GAP,
    left,
    width,
  };
}

export function FilterPopover({
  open,
  onClose,
  title = "Filters",
  activeCount,
  canClear,
  onClear,
  onApply,
  children,
  trigger,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  activeCount: number;
  /** When false, Clear is muted/disabled. Defaults to activeCount > 0. */
  canClear?: boolean;
  onClear: () => void;
  onApply: () => void;
  children: React.ReactNode;
  trigger: React.ReactNode;
}) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [coords, setCoords] = useState<PanelCoords | null>(null);
  const [mounted, setMounted] = useState(false);
  const clearEnabled = canClear ?? activeCount > 0;

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
      setCoords(measurePanelPosition(anchorRef.current));
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

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    function onPointer(event: MouseEvent) {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      onClose();
    }

    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open, onClose]);

  const panel =
    open && mounted && coords
      ? createPortal(
          <div
            ref={panelRef}
            className="op-filter-panel"
            role="dialog"
            aria-modal="false"
            aria-labelledby={titleId}
            style={{
              top: coords.top,
              left: coords.left,
              width: coords.width,
            }}
          >
            <p className="op-filter-title" id={titleId}>
              {title}
            </p>
            <div className="op-filter-fields">{children}</div>
            <div className="op-filter-footer">
              <button
                type="button"
                className={cn(
                  "op-filter-clear",
                  !clearEnabled && "op-filter-clear-muted"
                )}
                disabled={!clearEnabled}
                onClick={onClear}
              >
                Clear filters
              </button>
              <button
                type="button"
                className="op-filter-apply"
                onClick={() => {
                  onApply();
                  onClose();
                }}
              >
                Done
              </button>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div className="op-filter-anchor" ref={anchorRef}>
      {trigger}
      {panel}
    </div>
  );
}

export function FilterField({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="op-filter-field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </div>
  );
}

export function FiltersTriggerButton({
  activeCount,
  open,
  onClick,
}: {
  activeCount: number;
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "op-util-btn",
        (open || activeCount > 0) && "op-util-btn-active"
      )}
      onClick={onClick}
      aria-expanded={open}
      aria-haspopup="dialog"
    >
      <SlidersHorizontal />
      {activeCount > 0 ? `Filters · ${activeCount}` : "Filters"}
    </button>
  );
}
