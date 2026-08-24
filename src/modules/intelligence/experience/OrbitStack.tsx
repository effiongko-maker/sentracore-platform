import type { BriefingFinding } from "../view-model/buildBriefingViewModel";
import { formatEvidenceFigure } from "../utils/evidenceDisplay";

export function OrbitStack({
  findings,
  selectedId,
  onSelect,
  showHeading = findings.length > 1,
}: {
  findings: BriefingFinding[];
  selectedId: string | null;
  onSelect: (finding: BriefingFinding) => void;
  showHeading?: boolean;
}) {
  return (
    <div className="ix-orbit">
      {showHeading ? (
        <p className="ix-orbit-heading">Other priorities</p>
      ) : null}
      {findings.map((finding) => (
        <button
          key={finding.id}
          type="button"
          className={`ix-orbit-item${
            selectedId === finding.id ? " ix-orbit-item-selected" : ""
          }`}
          onClick={() => onSelect(finding)}
        >
          {finding.evidence !== null ? (
            <span className="ix-orbit-evidence" aria-hidden>
              {formatEvidenceFigure(finding.evidence)}
            </span>
          ) : (
            <span className="ix-orbit-evidence ix-orbit-evidence-empty" aria-hidden>
              ·
            </span>
          )}
          <span className="ix-orbit-title">{finding.title}</span>
        </button>
      ))}
    </div>
  );
}
