import type { BriefingFinding } from "../view-model/buildBriefingViewModel";
import { FocalFinding } from "./FocalFinding";

function directionArrow(
  direction: NonNullable<BriefingFinding["change"]>["direction"]
) {
  switch (direction) {
    case "increasing":
      return "↑";
    case "emerging":
      return "●";
    case "decreasing":
      return "↓";
    default:
      return "—";
  }
}

function directionLabel(
  direction: NonNullable<BriefingFinding["change"]>["direction"]
) {
  switch (direction) {
    case "increasing":
      return "Increasing";
    case "emerging":
      return "Emerging";
    case "decreasing":
      return "Reduced";
    default:
      return "Stable";
  }
}

export function ChangeComposition({
  focal,
  orbit,
  selectedId,
  onSelect,
}: {
  focal: BriefingFinding;
  orbit: BriefingFinding[];
  selectedId: string | null;
  onSelect: (finding: BriefingFinding) => void;
}) {
  return (
    <div className="ix-composition-change">
      <FocalFinding finding={focal} onExplore={() => onSelect(focal)} />

      {orbit.length > 0 ? (
        <div className="ix-movement-field" role="list">
          {orbit.map((finding) => {
            const c = finding.change;
            return (
              <button
                key={finding.id}
                type="button"
                role="listitem"
                className={`ix-movement-row${
                  selectedId === finding.id ? " ix-movement-row-selected" : ""
                }`}
                onClick={() => onSelect(finding)}
              >
                <div className="ix-movement-vector">
                  <span
                    className={`ix-movement-arrow${
                      c?.direction === "increasing"
                        ? " ix-movement-arrow-up"
                        : c?.direction === "emerging"
                          ? " ix-movement-arrow-emerge"
                          : ""
                    }`}
                    aria-hidden
                  >
                    {c ? directionArrow(c.direction) : "—"}
                  </span>
                  <span className="ix-movement-direction">
                    {c ? directionLabel(c.direction) : ""}
                  </span>
                  {c ? (
                    <span className="ix-movement-counts">
                      <span>{c.recent}</span>
                      <span aria-hidden> ← </span>
                      <span>{c.previous}</span>
                    </span>
                  ) : null}
                </div>
                <div>
                  <p className="ix-movement-title">{finding.title}</p>
                  <p className="ix-signal-summary">{finding.summary}</p>
                </div>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
