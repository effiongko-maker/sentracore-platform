"use client";

import type { BriefingFinding } from "../view-model/buildBriefingViewModel";
import { formatEvidenceFigure } from "../utils/evidenceDisplay";

function severityClass(
  severity: BriefingFinding["severity"]
): string {
  if (severity === "critical") return "ix-priority-signal-critical";
  if (severity === "high") return "ix-priority-signal-high";
  return "";
}

function signalStrength(finding: BriefingFinding): string {
  if (finding.severity === "critical") return "Strong";
  if (finding.severity === "high") return "Moderate";
  return "Emerging";
}

export function PrioritySignalCluster({
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
    <section className="ix-priority-cluster" aria-label="Supporting priorities">
      <header className="ix-priority-cluster-head">
        <h3 className="ix-priority-cluster-title">Also requiring attention</h3>
        <p className="ix-priority-cluster-sub">
          Additional signals ranked by severity and evidence
        </p>
      </header>

      <ul className="ix-priority-signals">
        {findings.map((finding, index) => (
          <li key={finding.id}>
            <button
              type="button"
              className={`ix-priority-signal ${severityClass(finding.severity)}${
                selectedId === finding.id ? " ix-priority-signal-selected" : ""
              }`}
              onClick={() => onSelect(finding)}
            >
              <div className="ix-priority-signal-index" aria-hidden>
                <span className="ix-priority-signal-index-num">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="ix-priority-signal-strength">
                  {signalStrength(finding)}
                </span>
              </div>

              <div className="ix-priority-signal-body">
                <p className="ix-priority-signal-title">{finding.title}</p>
                <p className="ix-priority-signal-summary">{finding.summary}</p>
              </div>

              {finding.evidence !== null ? (
                <span className="ix-priority-signal-count" aria-label="Evidence count">
                  {formatEvidenceFigure(finding.evidence)}
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
