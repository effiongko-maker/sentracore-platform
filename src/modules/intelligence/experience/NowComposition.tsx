"use client";

import { ArrowRight } from "lucide-react";
import type { BriefingFinding } from "../view-model/buildBriefingViewModel";
import { formatEvidenceFigure } from "../utils/evidenceDisplay";

function signalStrength(
  finding: BriefingFinding
): "Strong" | "Moderate" | "Emerging" {
  if (finding.severity === "critical") return "Strong";
  if (finding.severity === "high") return "Moderate";
  return "Emerging";
}

function displayNumber(finding: BriefingFinding): string {
  if (finding.evidence !== null && finding.evidence > 0) {
    return formatEvidenceFigure(finding.evidence).padStart(2, "0");
  }
  return "—";
}

export function NowComposition({
  focal,
  signals,
  selectedId,
  onSelect,
}: {
  focal: BriefingFinding;
  signals: BriefingFinding[];
  selectedId: string | null;
  onSelect: (finding: BriefingFinding) => void;
}) {
  return (
    <div className="ix-attention-field">
      <section className="ix-attention-primary" aria-label="Primary finding">
        <div className="ix-attention-primary-inner">
          <p className="ix-attention-index" aria-hidden>
            {displayNumber(focal)}
          </p>
          <div className="ix-attention-primary-body">
            <h2 className="ix-attention-title">{focal.title}</h2>
            <p className="ix-attention-summary">{focal.summary}</p>

            <dl className="ix-attention-meta">
              {focal.confidence ? (
                <div>
                  <dt>Confidence</dt>
                  <dd>{focal.confidence}</dd>
                </div>
              ) : null}
              {focal.basedOn ? (
                <div>
                  <dt>Based on</dt>
                  <dd>{focal.basedOn}</dd>
                </div>
              ) : null}
            </dl>

            <button
              type="button"
              className="ix-attention-action"
              onClick={() => onSelect(focal)}
            >
              Look into this finding
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
        <div className="ix-attention-primary-edge" aria-hidden />
      </section>

      {signals.length > 0 ? (
        <section className="ix-attention-signals" aria-label="Supporting activity">
          <header className="ix-attention-signals-head">
            <h3>Supporting activity</h3>
            <p>Ranked by severity and related activity across the organisation</p>
          </header>
          <ul className="ix-attention-signal-list">
            {signals.map((finding, index) => {
              const count =
                finding.evidence !== null
                  ? formatEvidenceFigure(finding.evidence).padStart(2, "0")
                  : String(index + 1).padStart(2, "0");
              return (
                <li key={finding.id}>
                  <button
                    type="button"
                    className={`ix-attention-signal${
                      selectedId === finding.id ? " ix-attention-signal-active" : ""
                    }`}
                    onClick={() => onSelect(finding)}
                  >
                    <span className="ix-attention-signal-index">{count}</span>
                    <span className="ix-attention-signal-dash" aria-hidden>
                      —
                    </span>
                    <span className="ix-attention-signal-copy">
                      <span className="ix-attention-signal-title">
                        {finding.title}
                      </span>
                      <span className="ix-attention-signal-strength">
                        {signalStrength(finding)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <footer className="ix-attention-evidence" aria-label="Underlying evidence">
        <span className="ix-attention-evidence-label">Connected across</span>
        <div className="ix-attention-evidence-modules">
          <span>Incidents</span>
          <span>Maintenance</span>
          <span>Work Orders</span>
          <span>Facilities</span>
        </div>
      </footer>
    </div>
  );
}
