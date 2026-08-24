"use client";

import { useEffect, useId, useRef } from "react";
import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

export function FilterPopover({
  open,
  onClose,
  title = "Filters",
  activeCount,
  onClear,
  onApply,
  children,
  trigger,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  activeCount: number;
  onClear: () => void;
  onApply: () => void;
  children: React.ReactNode;
  trigger: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    function onPointer(event: MouseEvent) {
      const target = event.target as Node;
      if (panelRef.current && !panelRef.current.contains(target)) {
        onClose();
      }
    }

    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open, onClose]);

  return (
    <div className="op-filter-anchor" ref={panelRef}>
      {trigger}
      {open ? (
        <div
          className="op-filter-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
        >
          <p className="op-filter-title" id={titleId}>
            {title}
            {activeCount > 0 ? ` · ${activeCount}` : ""}
          </p>
          <div className="op-filter-fields">{children}</div>
          <div className="op-filter-footer">
            <button type="button" className="op-filter-clear" onClick={onClear}>
              Clear all
            </button>
            <button
              type="button"
              className="op-filter-apply"
              onClick={() => {
                onApply();
                onClose();
              }}
            >
              Apply filters
            </button>
          </div>
        </div>
      ) : null}
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
