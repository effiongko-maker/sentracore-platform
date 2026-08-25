"use client";

import { ArrowRight } from "lucide-react";
import type { BriefingFinding, BriefingViewModel } from "../../view-model/buildBriefingViewModel";

export function ReferenceTopInsight({
  finding,
  onExplore,
}: {
  finding: BriefingFinding;
  onExplore: (finding: BriefingFinding) => void;
}) {
  return (
    <aside className="ix-ref-top-insight" aria-label="Top insight">
      <p className="ix-ref-kicker ix-ref-kicker-critical">Top insight</p>
      <p className="ix-ref-top-insight-title">{finding.title}</p>
      <p className="ix-ref-top-insight-copy">{finding.summary}</p>
      <button
        type="button"
        className="ix-ref-text-action"
        onClick={() => onExplore(finding)}
      >
        Explore insight
        <ArrowRight className="h-4 w-4" aria-hidden />
      </button>
    </aside>
  );
}

export function ReferenceHero({
  vm,
}: {
  vm: BriefingViewModel;
}) {
  const { operationalContext: ctx } = vm;

  return (
    <section className="ix-ref-hero" aria-label="Intelligence overview">
      <div className="ix-ref-hero-copy">
        <p className="ix-ref-mark">SentraCore Intelligence</p>
        <h1 className="ix-ref-headline">{vm.statement}</h1>
        <p className="ix-ref-lead">{vm.statementSupport}</p>
      </div>

      <div className="ix-ref-hero-stats">
        <div className="ix-ref-stat">
          <span className="ix-ref-stat-value">{ctx.recentIncidentCount30d}</span>
          <span className="ix-ref-stat-label">Incidents reviewed</span>
        </div>
        <div className="ix-ref-stat">
          <span className="ix-ref-stat-value">{ctx.highOrCriticalRiskCount}</span>
          <span className="ix-ref-stat-label">Higher-risk incidents</span>
        </div>
        <div className="ix-ref-stat">
          <span className="ix-ref-stat-value">{ctx.facilitiesWithRecentActivity}</span>
          <span className="ix-ref-stat-label">Active sites</span>
        </div>
        <div className="ix-ref-live">
          <span className="ix-ref-live-dot" aria-hidden />
          Updated just now · Live intelligence
        </div>
      </div>
    </section>
  );
}
