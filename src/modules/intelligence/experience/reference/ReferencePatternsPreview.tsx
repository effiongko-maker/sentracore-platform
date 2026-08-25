"use client";

import { ChevronRight } from "lucide-react";
import type { BriefingFinding } from "../../view-model/buildBriefingViewModel";
import { displayMetric, priorityAccent } from "./referenceHelpers";
import { Sparkline } from "../visuals/Sparkline";

function relatedModules(finding: BriefingFinding): string[] {
  const title = finding.title.toLowerCase();
  if (title.includes("maintenance")) {
    return ["Maintenance", "Incidents", "Facilities"];
  }
  if (title.includes("asset")) {
    return ["Assets", "Incidents", "Work Orders"];
  }
  if (title.includes("work order") || title.includes("delayed")) {
    return ["Work Orders", "Incidents", "Maintenance"];
  }
  if (title.includes("backlog")) {
    return ["Maintenance", "Work Orders", "Facilities"];
  }
  return ["Incidents", "Maintenance", "Work Orders"];
}

export function ReferencePatternsPreview({
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
    <ul className="ix-ref-pattern-list">
      {items.map((finding, index) => {
        const accent = priorityAccent(finding.severity);
        const modules = relatedModules(finding);
        const indexLabel =
          displayMetric(finding) !== "—"
            ? displayMetric(finding)
            : String(index + 1).padStart(2, "0");

        return (
          <li key={finding.id}>
            <button
              type="button"
              className="ix-ref-pattern-item"
              onClick={() => onSelect(finding)}
            >
              <span
                className={`ix-ref-pattern-index ix-ref-priority-index-${accent}`}
              >
                {indexLabel}
              </span>
              <span className="ix-ref-pattern-copy">
                <span className="ix-ref-pattern-modules" aria-hidden>
                  {modules.map((mod, moduleIndex) => (
                    <span key={`${finding.id}-${mod}`}>
                      {moduleIndex > 0 ? (
                        <span className="ix-ref-pattern-module-link" />
                      ) : null}
                      <span className="ix-ref-pattern-module-node">{mod}</span>
                    </span>
                  ))}
                </span>
                <span className="ix-ref-pattern-title">{finding.title}</span>
                <span className="ix-ref-pattern-summary">{finding.summary}</span>
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
              <ChevronRight className="h-4 w-4 shrink-0 ix-ref-pattern-chevron" aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
