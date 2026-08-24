"use client";

import { X } from "lucide-react";

export type ActiveFilterChip = {
  id: string;
  label: string;
  onRemove: () => void;
};

export function ActiveFilters({
  chips,
  onClearAll,
}: {
  chips: ActiveFilterChip[];
  onClearAll: () => void;
}) {
  if (!chips.length) return null;

  return (
    <div className="op-active-filters" aria-label="Active filters">
      {chips.map((chip) => (
        <span key={chip.id} className="op-chip">
          {chip.label}
          <button
            type="button"
            className="op-chip-remove"
            onClick={chip.onRemove}
            aria-label={`Remove filter ${chip.label}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <button type="button" className="op-chip-clear" onClick={onClearAll}>
        Clear all
      </button>
    </div>
  );
}
