"use client";

import { ArrowRight, Check } from "lucide-react";
import type { BriefingFinding } from "../../view-model/buildBriefingViewModel";
import {
  buildEvidenceBullets,
  displayMetric,
  priorityAccent,
} from "./referenceHelpers";
import { TopologyRadarVisual } from "../visuals/TopologyHeroVisual";

export function ReferencePriorityInsight({
  finding,
  onExplore,
}: {
  finding: BriefingFinding;
  onExplore: (finding: BriefingFinding) => void;
}) {
  const accent = priorityAccent(finding.severity);
  const bullets = buildEvidenceBullets(finding);

  return (
    <section className="ix-ref-card ix-ref-priority" aria-label="Priority insight">
      <div className="ix-ref-priority-grid">
        <div className="ix-ref-priority-copy">
          <p className={`ix-ref-kicker ix-ref-kicker-${accent}`}>Priority insight</p>
          <div className="ix-ref-metric-row">
            <span className={`ix-ref-metric ix-ref-metric-${accent}`}>
              {displayMetric(finding)}
            </span>
            <span className="ix-ref-metric-caption">{finding.title}</span>
          </div>
          <p className="ix-ref-body">{finding.summary}</p>
          <ul className="ix-ref-evidence-list">
            {bullets.map((bullet) => (
              <li key={bullet}>
                <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="ix-ref-text-action"
            onClick={() => onExplore(finding)}
          >
            Explore insight
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <TopologyRadarVisual
          label={
            finding.affectedArea
              ? `${finding.affectedArea}: ${displayMetric(finding)}`
              : undefined
          }
        />
      </div>
    </section>
  );
}
