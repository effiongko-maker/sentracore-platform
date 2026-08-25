"use client";

import { ChevronRight } from "lucide-react";
import type { BriefingFinding } from "../../view-model/buildBriefingViewModel";
import { priorityAccent } from "./referenceHelpers";
import { Sparkline } from "../visuals/Sparkline";

function changeTone(
  direction: NonNullable<BriefingFinding["change"]>["direction"]
): "improving" | "worsening" | "neutral" {
  switch (direction) {
    case "decreasing":
      return "improving";
    case "increasing":
      return "worsening";
    default:
      return "neutral";
  }
}

function formatMovement(finding: BriefingFinding): string | null {
  const c = finding.change;
  if (!c) return null;
  if (c.previous === 0 && c.recent > 0) return "New activity";
  if (c.previous === 0) return null;
  const pct = Math.round((Math.abs(c.delta) / c.previous) * 100);
  if (!Number.isFinite(pct) || pct === 0) {
    return c.direction === "emerging" ? "New" : null;
  }
  if (c.direction === "increasing") return `${pct}% increase`;
  if (c.direction === "decreasing") return `${pct}% reduction`;
  return `${pct}% shift`;
}

export function ReferenceChangesPreview({
  items,
  emptyLabel,
  onSelect,
}: {
  items: BriefingFinding[];
  emptyLabel: string;
  onSelect: (finding: BriefingFinding) => void;
}) {
  if (items.length === 0) {
    return <p className="ix-ref-section-empty">{emptyLabel}</p>;
  }

  return (
    <ol className="ix-ref-change-list">
      {items.map((finding, index) => {
        const accent = priorityAccent(finding.severity);
        const tone = finding.change
          ? changeTone(finding.change.direction)
          : "neutral";
        const movement = formatMovement(finding);

        return (
          <li key={finding.id}>
            <button
              type="button"
              className={`ix-ref-change-item ix-ref-change-item-${tone}`}
              onClick={() => onSelect(finding)}
            >
              <span
                className={`ix-ref-change-index ix-ref-priority-index-${accent}`}
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="ix-ref-change-copy">
                <span className="ix-ref-change-title">{finding.title}</span>
                {movement ? (
                  <span className="ix-ref-change-movement">{movement}</span>
                ) : null}
                <span className="ix-ref-change-summary">{finding.summary}</span>
              </span>
              <Sparkline
                id={finding.id}
                tone={
                  accent === "critical"
                    ? "critical"
                    : accent === "high"
                      ? "warning"
                      : "normal"
                }
              />
              <ChevronRight className="h-4 w-4 shrink-0 ix-ref-change-chevron" aria-hidden />
            </button>
          </li>
        );
      })}
    </ol>
  );
}
