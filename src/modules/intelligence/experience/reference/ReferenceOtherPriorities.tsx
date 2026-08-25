"use client";

import { ChevronRight } from "lucide-react";
import type { BriefingFinding } from "../../view-model/buildBriefingViewModel";
import { displayMetric, priorityAccent } from "./referenceHelpers";
import { Sparkline } from "../visuals/Sparkline";

export function ReferenceOtherPriorities({
  items,
  onSelect,
}: {
  items: BriefingFinding[];
  onSelect: (finding: BriefingFinding) => void;
}) {
  return (
    <section className="ix-ref-card ix-ref-side-panel" aria-label="Other priorities">
      <header className="ix-ref-panel-head">
        <h2>Other priorities</h2>
      </header>

      {items.length === 0 ? (
        <p className="ix-ref-empty">No additional priorities in this period.</p>
      ) : (
        <ul className="ix-ref-priority-list">
          {items.map((item, index) => {
            const accent = priorityAccent(item.severity);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className="ix-ref-priority-item"
                  onClick={() => onSelect(item)}
                >
                  <div className="ix-ref-priority-item-main">
                    <span className={`ix-ref-priority-index ix-ref-priority-index-${accent}`}>
                      {displayMetric(item) !== "—"
                        ? displayMetric(item)
                        : String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="ix-ref-priority-item-copy">
                      <span className="ix-ref-priority-item-title">{item.title}</span>
                      <span className="ix-ref-priority-item-sub">
                        {item.affectedArea ?? item.summary}
                      </span>
                    </div>
                  </div>
                  <Sparkline
                    id={item.id}
                    tone={
                      accent === "critical"
                        ? "critical"
                        : accent === "high"
                          ? "warning"
                          : "normal"
                    }
                  />
                  <ChevronRight className="h-4 w-4 shrink-0 opacity-40" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
