"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const PANEL_MIN_WIDTH = 200;
const PANEL_GAP = 8;
const VIEWPORT_PAD = 8;

type PanelCoords = {
  top: number;
  left: number;
  width: number;
};

function measurePanelPosition(anchor: HTMLElement): PanelCoords {
  const rect = anchor.getBoundingClientRect();
  const width = Math.max(PANEL_MIN_WIDTH, rect.width);
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

export function SortMenu({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange?: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<PanelCoords | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selected =
    options.find((option) => option.value === value) ?? options[0];

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
      if (event.key === "Escape") setOpen(false);
    }

    function onPointer(event: MouseEvent) {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }

    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  const panel =
    open && mounted && coords
      ? createPortal(
          <div
            ref={panelRef}
            id={listId}
            className="op-sort-panel"
            role="listbox"
            aria-label="Sort assets"
            style={{
              top: coords.top,
              left: coords.left,
              width: coords.width,
            }}
          >
            {options.map((option) => {
              const isActive = option.value === (selected?.value ?? value);
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  className={cn(
                    "op-sort-option",
                    isActive && "op-sort-option-active"
                  )}
                  onClick={() => {
                    onChange?.(option.value);
                    setOpen(false);
                  }}
                >
                  <span>{option.label}</span>
                  {isActive ? (
                    <Check className="op-sort-option-check" aria-hidden />
                  ) : null}
                </button>
              );
            })}
          </div>,
          document.body
        )
      : null;

  return (
    <div className="op-sort-anchor" ref={anchorRef}>
      <button
        type="button"
        className={cn("op-util-btn op-sort-trigger", open && "op-util-btn-active")}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="op-sort-trigger-label">Sort</span>
        <span className="op-sort-trigger-value">{selected?.label ?? "Newest"}</span>
        <ChevronDown aria-hidden />
      </button>
      {panel}
    </div>
  );
}
