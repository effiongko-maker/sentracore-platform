"use client";

import { AlertTriangle, Eye, MoreHorizontal, Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { Incident } from "../types";

interface IncidentRowActionsProps {
  incident: Incident;
  onView: (incident: Incident) => void;
  onEdit: (incident: Incident) => void;
  onDeactivate: (incident: Incident) => void;
}

export function IncidentRowActions({
  incident,
  onView,
  onEdit,
  onDeactivate,
}: IncidentRowActionsProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const canDeactivate =
    incident.status !== "cancelled" && incident.status !== "closed";

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
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

  return (
    <div className="relative flex justify-end" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted outline-none transition-colors duration-150 hover:bg-slate-100 hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent/30",
          open && "bg-slate-100 text-foreground"
        )}
        aria-label={`Actions for ${incident.title}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 w-40 overflow-hidden rounded-xl border border-border bg-card py-1 shadow-sc-lg"
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-slate-50"
            onClick={() => {
              setOpen(false);
              onView(incident);
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
              onEdit(incident);
            }}
          >
            <Pencil className="h-3.5 w-3.5 text-muted" />
            Treat
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!canDeactivate}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
            onClick={() => {
              setOpen(false);
              onDeactivate(incident);
            }}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Cancel
          </button>
        </div>
      ) : null}
    </div>
  );
}
