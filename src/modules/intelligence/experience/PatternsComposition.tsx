"use client";

import type { BriefingFinding } from "../view-model/buildBriefingViewModel";

function relatedModules(finding: BriefingFinding): string[] {
  const title = finding.title.toLowerCase();
  if (title.includes("maintenance") || title.includes("defer")) {
    return ["Maintenance", "Incidents", "Facilities"];
  }
  if (title.includes("water") || title.includes("leak")) {
    return ["Incidents", "Maintenance", "Facilities"];
  }
  if (title.includes("risk") || title.includes("critical")) {
    return ["Incidents", "Assets", "Work Orders"];
  }
  return ["Incidents", "Maintenance", "Work Orders"];
}

export function PatternsComposition({
  findings,
  selectedId,
  onSelect,
}: {
  findings: BriefingFinding[];
  selectedId: string | null;
  onSelect: (finding: BriefingFinding) => void;
}) {
  if (findings.length === 0) return null;

  return (
    <div className="ix-pattern-field">
      <header className="ix-pattern-intro">
        <h2 className="ix-pattern-intro-title">
          What keeps coming up across the organisation
        </h2>
        <p className="ix-pattern-intro-copy">
          Repeated behaviours and relationships forming across operational activity.
        </p>
      </header>

      <ul className="ix-pattern-list">
        {findings.map((finding) => {
          const modules = relatedModules(finding);
          return (
            <li key={finding.id}>
              <button
                type="button"
                className={`ix-pattern-item${
                  selectedId === finding.id ? " ix-pattern-item-active" : ""
                }`}
                onClick={() => onSelect(finding)}
              >
                <div className="ix-pattern-relation" aria-hidden>
                  {modules.map((mod, i) => (
                    <span key={`${finding.id}-${mod}`}>
                      {i > 0 ? <span className="ix-pattern-link" /> : null}
                      <span className="ix-pattern-node">{mod}</span>
                    </span>
                  ))}
                </div>
                <p className="ix-pattern-statement">{finding.title}</p>
                <p className="ix-pattern-detail">{finding.summary}</p>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
