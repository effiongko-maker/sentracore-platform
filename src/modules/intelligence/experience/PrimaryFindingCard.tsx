"use client";

import { ArrowRight } from "lucide-react";
import type { BriefingFinding } from "../view-model/buildBriefingViewModel";

function signalLabel(finding: BriefingFinding): string {
  if (finding.severity === "critical") return "Critical signal";
  if (finding.severity === "high") return "Elevated signal";
  return "Priority signal";
}

export function PrimaryFindingCard({
  finding,
  onInvestigate,
}: {
  finding: BriefingFinding;
  onInvestigate: () => void;
}) {
  const isCritical = finding.severity === "critical";
  const isHigh = finding.severity === "high";

  return (
    <article
      className={`ix-primary-finding${
        isCritical
          ? " ix-primary-finding-critical"
          : isHigh
            ? " ix-primary-finding-high"
            : ""
      }`}
    >
      <div className="ix-primary-finding-grid-bg" aria-hidden />
      <div className="ix-primary-finding-glow" aria-hidden />

      <div className="ix-primary-finding-inner">
        <div className="ix-primary-finding-marker">
          {finding.evidence !== null ? (
            <span className="ix-primary-finding-number" aria-hidden>
              {finding.evidence}
            </span>
          ) : (
            <span className="ix-primary-finding-dot" aria-hidden />
          )}
        </div>

        <div className="ix-primary-finding-body">
          <p className="ix-primary-finding-kicker">{signalLabel(finding)}</p>
          <h2 className="ix-primary-finding-title">{finding.title}</h2>
          <p className="ix-primary-finding-summary">{finding.summary}</p>

          <dl className="ix-primary-finding-meta">
            {finding.confidence ? (
              <div className="ix-primary-finding-meta-item">
                <dt>Confidence</dt>
                <dd>{finding.confidence}</dd>
              </div>
            ) : null}
            {finding.affectedArea ? (
              <div className="ix-primary-finding-meta-item">
                <dt>Affected area</dt>
                <dd>{finding.affectedArea}</dd>
              </div>
            ) : null}
            {finding.basedOn ? (
              <div className="ix-primary-finding-meta-item">
                <dt>Based on</dt>
                <dd>{finding.basedOn}</dd>
              </div>
            ) : null}
          </dl>

          <button
            type="button"
            className="ix-primary-finding-action"
            onClick={onInvestigate}
          >
            Look into this finding
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </article>
  );
}
