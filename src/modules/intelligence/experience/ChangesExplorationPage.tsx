"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { OrganisationIntelligence } from "@/lib/intelligence";
import {
  buildBriefingViewModel,
  type BriefingFinding,
} from "../view-model/buildBriefingViewModel";
import { composeBriefingSections, priorityAccent } from "./reference/referenceHelpers";
import { BriefingDetailPanel } from "./BriefingDetailPanel";
import { Sparkline } from "./visuals/Sparkline";

export function ChangesExplorationPage({
  data,
}: {
  data: OrganisationIntelligence;
}) {
  const vm = useMemo(() => buildBriefingViewModel(data), [data]);
  const { allChanges } = useMemo(() => composeBriefingSections(vm), [vm]);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const focal = useMemo(
    () => allChanges.find((f) => f.id === focusedId) ?? null,
    [allChanges, focusedId]
  );

  const selectFinding = useCallback((finding: BriefingFinding) => {
    setFocusedId(finding.id);
  }, []);

  return (
    <div className="ix-ref-page">
      <div className="ix-explore-workspace">
        <Link href="/intelligence" className="ix-explore-back">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to Intelligence briefing
        </Link>

        <header className="ix-explore-header">
          <p className="ix-ref-mark">Investigation</p>
          <h1 className="ix-ref-headline">What changed</h1>
          <p className="ix-ref-lead">
            Full view of shifts over the last {vm.windowDays} days compared with
            the previous period — direction, scale, and related evidence.
          </p>
        </header>

        {allChanges.length === 0 ? (
          <p className="ix-ref-empty">No meaningful changes in this period.</p>
        ) : (
          <ul className="ix-explore-list">
            {allChanges.map((finding) => {
              const accent = priorityAccent(finding.severity);
              return (
                <li key={finding.id}>
                  <button
                    type="button"
                    className={`ix-explore-card${
                      focusedId === finding.id ? " ix-explore-card-active" : ""
                    }`}
                    onClick={() => selectFinding(finding)}
                  >
                    <div className="ix-explore-card-top">
                      <span className={`ix-ref-kicker ix-ref-kicker-${accent}`}>
                        {finding.change?.direction ?? finding.kind}
                      </span>
                      <Sparkline
                        id={finding.id}
                        tone={
                          accent === "critical"
                            ? "critical"
                            : accent === "high"
                              ? "warning"
                              : "normal"
                        }
                      />
                    </div>
                    <h2 className="ix-explore-card-title">{finding.title}</h2>
                    <p className="ix-explore-card-summary">{finding.summary}</p>
                    {finding.change ? (
                      <dl className="ix-explore-metrics">
                        <div>
                          <dt>Recent</dt>
                          <dd>{finding.change.recent}</dd>
                        </div>
                        <div>
                          <dt>Previous</dt>
                          <dd>{finding.change.previous}</dd>
                        </div>
                        <div>
                          <dt>Delta</dt>
                          <dd>{finding.change.delta}</dd>
                        </div>
                        <div>
                          <dt>Intensity</dt>
                          <dd>{finding.change.intensity}</dd>
                        </div>
                      </dl>
                    ) : null}
                    {finding.affectedArea ? (
                      <p className="ix-explore-related">
                        Related area: {finding.affectedArea}
                      </p>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {focal ? (
        <BriefingDetailPanel
          finding={focal}
          onClose={() => setFocusedId(null)}
        />
      ) : null}
    </div>
  );
}
