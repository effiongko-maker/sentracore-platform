"use client";

import { useCallback, useMemo, useState } from "react";
import {
  INTELLIGENCE_LOADING_MESSAGES,
  INTELLIGENCE_LOADING_STATUS,
  IntelligenceSkeleton,
  PageLoadingState,
} from "@/components/loading";
import type { OrganisationIntelligence } from "@/lib/intelligence";
import {
  buildBriefingViewModel,
  type BriefingFinding,
} from "../view-model/buildBriefingViewModel";
import { BriefingDetailPanel } from "./BriefingDetailPanel";
import { ExploreComposition } from "./ExploreComposition";
import { IntelligenceBriefingLayout } from "./reference/IntelligenceBriefingLayout";

/**
 * /intelligence — continuous Intelligence Briefing.
 * No mode switching. Recommendations and activity live here once.
 */
export function IntelligenceExperience({
  data,
}: {
  data: OrganisationIntelligence;
}) {
  const vm = useMemo(() => buildBriefingViewModel(data), [data]);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [exploreOpen, setExploreOpen] = useState(false);

  const focal = useMemo(() => {
    if (!focusedId) return null;
    const all = [
      ...vm.attentionFindings,
      ...vm.changeFindings,
      ...vm.patternFindings,
    ];
    return all.find((finding) => finding.id === focusedId) ?? null;
  }, [focusedId, vm]);

  const selectFinding = useCallback((finding: BriefingFinding) => {
    setFocusedId(finding.id);
    setDetailOpen(true);
  }, []);

  if (vm.processing) {
    return (
      <PageLoadingState
        tone="dark"
        status={INTELLIGENCE_LOADING_STATUS}
        messages={INTELLIGENCE_LOADING_MESSAGES}
        skeleton={<IntelligenceSkeleton />}
        title="Loading Intelligence"
      />
    );
  }

  return (
    <div className="ix-ref-page">
      <IntelligenceBriefingLayout vm={vm} onExplore={selectFinding} />

      <div className="ix-ref-explore-entry">
        <button
          type="button"
          className="ix-ref-explore-button"
          onClick={() => setExploreOpen(true)}
        >
          Ask about the organisation
        </button>
      </div>

      {exploreOpen ? (
        <div className="ix-ref-explore-overlay">
          <div className="ix-ref-explore-panel">
            <ExploreComposition vm={vm} />
            <button
              type="button"
              className="ix-ref-explore-close"
              onClick={() => setExploreOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}

      {detailOpen && focal ? (
        <BriefingDetailPanel
          finding={focal}
          onClose={() => {
            setDetailOpen(false);
            setFocusedId(null);
          }}
        />
      ) : null}
    </div>
  );
}
