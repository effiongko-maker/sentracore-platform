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

export function PatternsExplorationPage({
  data,
}: {
  data: OrganisationIntelligence;
}) {
  const vm = useMemo(() => buildBriefingViewModel(data), [data]);
  const { allPatterns } = useMemo(() => composeBriefingSections(vm), [vm]);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const focal = useMemo(
    () => allPatterns.find((f) => f.id === focusedId) ?? null,
    [allPatterns, focusedId]
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
          <h1 className="ix-ref-headline">What SentaCore is starting to notice</h1>
          <p className="ix-ref-lead">
            Recurring connections across incidents, maintenance requests, work
            orders, facilities, and assets.
          </p>
        </header>

        {allPatterns.length === 0 ? (
          <p className="ix-ref-empty">Nothing recurring enough to surface in this period.</p>
        ) : (
          <ul className="ix-explore-list">
            {allPatterns.map((finding) => {
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
                        {finding.confidence
                          ? `${finding.confidence} confidence`
                          : finding.kind}
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
                    <dl className="ix-explore-metrics">
                      {finding.evidence !== null ? (
                        <div>
                          <dt>Evidence</dt>
                          <dd>{finding.evidence}</dd>
                        </div>
                      ) : null}
                      {finding.basedOn ? (
                        <div>
                          <dt>Based on</dt>
                          <dd>{finding.basedOn}</dd>
                        </div>
                      ) : null}
                      {finding.affectedArea ? (
                        <div>
                          <dt>Area</dt>
                          <dd>{finding.affectedArea}</dd>
                        </div>
                      ) : null}
                    </dl>
                    <p className="ix-explore-related">
                      Review the connected incidents, maintenance requests, and
                      work orders behind this finding.
                    </p>
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
