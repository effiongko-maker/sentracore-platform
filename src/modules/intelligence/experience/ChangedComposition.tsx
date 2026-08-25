"use client";

import type { BriefingFinding } from "../view-model/buildBriefingViewModel";

type ChangeTone = "improving" | "worsening" | "neutral";

function changeTone(
  direction: NonNullable<BriefingFinding["change"]>["direction"]
): ChangeTone {
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
  if (!c || c.previous === 0) return null;
  const pct = Math.round((Math.abs(c.delta) / c.previous) * 100);
  if (!Number.isFinite(pct) || pct === 0) return null;
  if (c.direction === "increasing") return `${pct}% increase`;
  if (c.direction === "decreasing") return `${pct}% reduction`;
  return `${pct}% shift`;
}

export function ChangedComposition({
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
    <div className="ix-shift-field">
      <header className="ix-shift-intro">
        <h2 className="ix-shift-intro-title">What has changed across the operation</h2>
        <p className="ix-shift-intro-copy">
          Changes worth noticing across the organisation — not every fluctuation,
          only what SentraCore considers meaningful.
        </p>
      </header>

      <ol className="ix-shift-list">
        {findings.map((finding, index) => {
          const tone = finding.change
            ? changeTone(finding.change.direction)
            : "neutral";
          const movement = formatMovement(finding);

          return (
            <li key={finding.id}>
              <button
                type="button"
                className={`ix-shift-item ix-shift-item-${tone}${
                  selectedId === finding.id ? " ix-shift-item-active" : ""
                }`}
                onClick={() => onSelect(finding)}
              >
                <span className="ix-shift-marker" aria-hidden>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="ix-shift-body">
                  <p className="ix-shift-statement">{finding.title}</p>
                  {movement ? (
                    <p className="ix-shift-movement">{movement}</p>
                  ) : null}
                  <p className="ix-shift-detail">{finding.summary}</p>
                </div>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
