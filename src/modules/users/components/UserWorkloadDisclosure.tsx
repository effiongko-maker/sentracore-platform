"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn, formatDate } from "@/lib/utils";
import { OperationalWorkloadService } from "@/services/operational/OperationalWorkloadService";
import { displayWorkOrderTitle, labelize } from "@/modules/work-orders/utils";
import type { WorkOrder } from "@/modules/work-orders/types";
import { formatWorkload } from "../utils";
import type { User } from "../types";

const PANEL_WIDTH = 340;
const PANEL_GAP = 6;
const VIEWPORT_PAD = 8;
const PANEL_EST_HEIGHT = 220;

type PanelCoords = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

function measurePanelPosition(
  anchor: HTMLElement,
  panelHeight: number
): PanelCoords {
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(PANEL_WIDTH, window.innerWidth - VIEWPORT_PAD * 2);
  let left = rect.left;
  left = Math.max(
    VIEWPORT_PAD,
    Math.min(left, window.innerWidth - width - VIEWPORT_PAD)
  );

  const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_PAD;
  const spaceAbove = rect.top - VIEWPORT_PAD;
  const openAbove = spaceBelow < panelHeight && spaceAbove > spaceBelow;

  const top = openAbove
    ? Math.max(VIEWPORT_PAD, rect.top - PANEL_GAP - panelHeight)
    : rect.bottom + PANEL_GAP;
  const maxHeight = openAbove
    ? Math.max(120, rect.top - VIEWPORT_PAD - PANEL_GAP)
    : Math.max(120, spaceBelow);

  return { top, left, width, maxHeight };
}

function dueLine(workOrder: WorkOrder) {
  const due = workOrder.dueAt || workOrder.slaDueAt;
  if (!due) return null;
  return `Due ${formatDate(due)}`;
}

export function UserWorkloadDisclosure({
  user,
  open,
  onOpenChange,
  onViewWorkOrder,
}: {
  user: User;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onViewWorkOrder: (workOrder: WorkOrder) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<PanelCoords | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const count = user.activeWorkOrders;
  const snapshotIds = user.workloadWorkOrderIds;
  const snapshotKey = (snapshotIds ?? []).join(",");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setWorkOrders([]);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    if (count === 0) {
      setWorkOrders([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    void OperationalWorkloadService.listUserWorkloadDetails(
      user.id,
      snapshotIds ?? []
    )
      .then((details) => {
        if (cancelled) return;
        setWorkOrders(details.workOrders);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load workload details."
        );
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, user.id, snapshotKey, snapshotIds, count]);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setCoords(null);
      return;
    }

    function updatePosition() {
      if (!anchorRef.current) return;
      const height = panelRef.current?.offsetHeight ?? PANEL_EST_HEIGHT;
      setCoords(measurePanelPosition(anchorRef.current, height));
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, loading, workOrders.length, error]);

  useEffect(() => {
    if (!open || !panelRef.current) return;
    const panel = panelRef.current;
    const observer = new ResizeObserver(() => {
      if (!anchorRef.current) return;
      setCoords(
        measurePanelPosition(anchorRef.current, panel.offsetHeight || PANEL_EST_HEIGHT)
      );
    });
    observer.observe(panel);
    return () => observer.disconnect();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
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

  const panel =
    open && mounted && coords
      ? createPortal(
          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-label={`Current workload for ${user.name}`}
            className="fixed z-[80] overflow-hidden rounded-xl border border-border bg-card shadow-sc-lg"
            style={{
              top: coords.top,
              left: coords.left,
              width: coords.width,
              maxHeight: coords.maxHeight,
            }}
          >
            <div className="border-b border-border/70 px-3.5 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                Current Workload
              </p>
              <p className="mt-0.5 text-sm font-medium text-foreground">
                {formatWorkload(count)}
              </p>
            </div>
            <div className="max-h-[min(20rem,calc(100%-3rem))] overflow-y-auto">
              {loading ? (
                <p className="px-3.5 py-4 text-sm text-muted">Loading…</p>
              ) : error ? (
                <p className="px-3.5 py-4 text-sm text-danger">{error}</p>
              ) : workOrders.length === 0 ? (
                <p className="px-3.5 py-4 text-sm text-muted">
                  No active work orders currently assigned to {user.name}.
                </p>
              ) : (
                <ul className="divide-y divide-border/70">
                  {workOrders.map((workOrder) => {
                    const due = dueLine(workOrder);
                    return (
                      <li key={workOrder.id} className="px-3.5 py-3">
                        <p className="font-mono text-[11px] tracking-wide text-muted">
                          {workOrder.id}
                        </p>
                        <p className="mt-0.5 text-sm font-medium text-foreground">
                          {displayWorkOrderTitle(workOrder)}
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          {labelize(workOrder.status)}
                          {" · "}
                          {labelize(workOrder.priority)} Priority
                        </p>
                        {due ? (
                          <p className="mt-0.5 text-xs text-muted">{due}</p>
                        ) : null}
                        <button
                          type="button"
                          className="mt-2 text-xs font-medium text-accent hover:underline"
                          onClick={() => {
                            onOpenChange(false);
                            onViewWorkOrder(workOrder);
                          }}
                        >
                          View Work Order
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => onOpenChange(!open)}
        className={cn(
          "group inline-flex max-w-full items-center gap-1 rounded-sm text-left text-sm text-foreground outline-none",
          "cursor-pointer decoration-border underline-offset-4",
          "hover:underline focus-visible:ring-2 focus-visible:ring-accent/30",
          open && "underline"
        )}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`${formatWorkload(count)} for ${user.name}. Show contributing work orders.`}
      >
        <span className="whitespace-nowrap">{formatWorkload(count)}</span>
        <ChevronDown
          className={cn(
            "h-3 w-3 shrink-0 text-muted opacity-0 transition-all duration-150 group-hover:opacity-70 group-focus-visible:opacity-70",
            open && "rotate-180 opacity-70"
          )}
          aria-hidden
        />
      </button>
      {panel}
    </>
  );
}
