import type { BriefingFinding } from "../view-model/buildBriefingViewModel";
import { formatEvidenceFigure } from "../utils/evidenceDisplay";

function evidenceContext(finding: BriefingFinding): string | null {
  if (finding.evidence === null) return null;
  if (finding.kind === "priority" || finding.kind === "attention") {
    if (finding.severity === "critical") return "critical incidents";
    if (finding.severity === "high") return "high-priority items";
    return "items";
  }
  if (finding.kind === "change") return "recent count";
  return null;
}

export function FocalFinding({
  finding,
  onExplore,
}: {
  finding: BriefingFinding;
  onExplore: () => void;
}) {
  const isCritical = finding.severity === "critical";
  const isHigh = finding.severity === "high";
  const context = evidenceContext(finding);

  return (
    <article
      className={`ix-focal${isCritical ? " ix-focal-critical" : isHigh ? " ix-focal-high" : ""}`}
    >
      <div className="ix-focal-body">
        {finding.evidence !== null ? (
          <div className="ix-focal-evidence-block">
            <p className="ix-focal-evidence" aria-hidden>
              {formatEvidenceFigure(finding.evidence)}
            </p>
            {context ? (
              <p className="ix-focal-evidence-context">{context}</p>
            ) : null}
          </div>
        ) : null}
        <div className="ix-focal-content">
          <h2 className="ix-focal-title">{finding.title}</h2>
          <p className="ix-focal-summary">{finding.summary}</p>
          <div className="ix-focal-action">
            <button type="button" onClick={onExplore}>
              Explore this finding
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
