"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import {
  INTELLIGENCE_LOADING_MESSAGES,
  INTELLIGENCE_LOADING_STATUS,
  IntelligenceSkeleton,
  PageLoadingState,
} from "@/components/loading";
import { ModeFrame } from "@/components/platform";
import type { OrganisationIntelligence } from "@/lib/intelligence";
import {
  InsightActionPanel,
  InsightActivityFeed,
  InsightHero,
  InsightInvestigationPanel,
  InsightOtherPriorities,
  InsightPriorityCard,
  InsightRecommendationHealth,
} from "../components/InsightBriefingViews";
import {
  buildIntelligenceExperience,
  type ClassifiedFinding,
} from "../view-model/buildIntelligenceExperience";
import { mapOrganisationInsights } from "../view-model/mapOrganisationInsights";

type PanelMode = "evidence" | "action" | null;

function relativeLabel(index: number): string {
  const labels = ["Just now", "Earlier", "This window", "Recent", "Prior"];
  return labels[index] ?? "Recent";
}

function activityTone(
  priority: ClassifiedFinding["priority"]
): "critical" | "warning" | "info" | "neutral" {
  if (priority === "attention") return "critical";
  if (priority === "emerging") return "warning";
  if (priority === "positive") return "info";
  return "neutral";
}

function actionHash(insightId: string): string {
  return `#action/${encodeURIComponent(insightId)}`;
}

function insightHash(insightId: string): string {
  return `#insight/${encodeURIComponent(insightId)}`;
}

function parseActionHash(hash: string): string | null {
  if (!hash.startsWith("#action/")) return null;
  try {
    return decodeURIComponent(hash.slice("#action/".length)) || null;
  } catch {
    return null;
  }
}

/**
 * Intelligence briefing — approved dark reference composition
 * over the Insight / Kaiso reasoning model.
 */
export function IntelligenceExperience({
  data,
}: {
  data: OrganisationIntelligence;
}) {
  const bundle = useMemo(() => mapOrganisationInsights(data), [data]);
  const vm = useMemo(() => buildIntelligenceExperience(bundle), [bundle]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>(null);
  const actionFocusRef = useRef<HTMLDivElement | null>(null);
  const insightAnchorRef = useRef<HTMLDivElement | null>(null);
  const skipHashSync = useRef(false);

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return vm.all.find((row) => row.insight.id === selectedId) ?? null;
  }, [selectedId, vm.all]);

  const otherPriorities = useMemo(() => {
    const primaryId = vm.primary?.insight.id;
    return [
      ...vm.worthWatching,
      ...vm.observations,
      ...vm.positive,
    ]
      .filter((row) => row.insight.id !== primaryId)
      .slice(0, 4);
  }, [vm]);

  const activityItems = useMemo(() => {
    const source = [
      ...(vm.primary ? [vm.primary] : []),
      ...vm.worthWatching,
      ...vm.recentlyResolved,
    ].slice(0, 5);
    return source.map((row, index) => ({
      id: row.insight.id,
      label: row.insight.title,
      time: relativeLabel(index),
      tone: activityTone(row.priority),
    }));
  }, [vm]);

  const recoNote = useMemo(() => {
    const health = bundle.recommendationHealth;
    if (health.totalDecisions < 3) return undefined;
    const dismissedShare = health.dismissed / health.totalDecisions;
    if (dismissedShare >= 0.4) {
      return "Dismissed recommendations are elevated in this window. Review whether guidance still matches live operational pressure.";
    }
    if (health.accepted / health.totalDecisions >= 0.5) {
      return "Acceptance is relatively strong — recommendation quality appears aligned with operator judgement.";
    }
    return undefined;
  }, [bundle.recommendationHealth]);

  function openEvidence(finding: ClassifiedFinding) {
    setSelectedId(finding.insight.id);
    setPanelMode("evidence");
  }

  function openAction(finding: ClassifiedFinding) {
    setSelectedId(finding.insight.id);
    setPanelMode("action");
    const next = actionHash(finding.insight.id);
    if (window.location.hash !== next) {
      skipHashSync.current = true;
      window.history.pushState({ ixAction: finding.insight.id }, "", next);
    }
  }

  function backToInsight() {
    const id = selectedId;
    setPanelMode(null);
    if (id) {
      const next = insightHash(id);
      skipHashSync.current = true;
      window.history.pushState({ ixInsight: id }, "", next);
      requestAnimationFrame(() => {
        insightAnchorRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    } else {
      skipHashSync.current = true;
      window.history.pushState({}, "", window.location.pathname);
    }
  }

  function closePanel() {
    setPanelMode(null);
    setSelectedId(null);
  }

  useEffect(() => {
    const applyHash = () => {
      if (skipHashSync.current) {
        skipHashSync.current = false;
        return;
      }
      const actionId = parseActionHash(window.location.hash);
      if (actionId) {
        const exists = vm.all.some((row) => row.insight.id === actionId);
        if (exists) {
          setSelectedId(actionId);
          setPanelMode("action");
          return;
        }
      }
      setPanelMode((mode) => (mode === "action" ? null : mode));
    };

    applyHash();
    window.addEventListener("hashchange", applyHash);
    window.addEventListener("popstate", applyHash);
    return () => {
      window.removeEventListener("hashchange", applyHash);
      window.removeEventListener("popstate", applyHash);
    };
  }, [vm.all]);

  useEffect(() => {
    if (panelMode !== "action") return;
    requestAnimationFrame(() => {
      actionFocusRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      actionFocusRef.current?.focus({ preventScroll: true });
    });
  }, [panelMode, selectedId]);

  if (bundle.status.processing) {
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

  if (panelMode === "action" && selected) {
    return (
      <ModeFrame mode="cognitive">
        <div
          ref={actionFocusRef}
          className="ix-ref-page ix-ref-action-mode"
          tabIndex={-1}
        >
          <InsightActionPanel finding={selected} onClose={backToInsight} />
        </div>
      </ModeFrame>
    );
  }

  return (
    <ModeFrame mode="cognitive">
      <div className={`ix-ref-page${panelMode === "evidence" ? " has-panel" : ""}`}>
        <div className="ix-ref-layout ix-brief-layout">
          <InsightHero
            primary={vm.primary}
            ctx={data.operationalContext}
            windowDays={vm.windowDays}
          />

          <section
            className="ix-brief-section ix-brief-section-now"
            aria-labelledby="ix-brief-now"
          >
            <header className="ix-brief-section-head">
              <p className="ix-brief-section-eyebrow">Now</p>
              <h2 id="ix-brief-now" className="ix-brief-section-title">
                What needs your attention?
              </h2>
              <p className="ix-brief-section-support">
                The clearest issues SentraCore wants you to look at first.
              </p>
            </header>

            <div className="ix-brief-now-grid">
              <div className="ix-brief-now-primary" ref={insightAnchorRef}>
                {vm.primary ? (
                  <InsightPriorityCard
                    finding={vm.primary}
                    onReviewEvidence={() => openEvidence(vm.primary!)}
                    onTakeAction={() => openAction(vm.primary!)}
                  />
                ) : (
                  <section className="ix-ref-card ix-ref-empty-state">
                    <p className="ix-ref-kicker">Priority insight</p>
                    <h3 className="ix-ref-headline ix-ref-headline-sm">
                      Nothing needs immediate attention
                    </h3>
                    <p className="ix-ref-lead">
                      SentraCore has not found an urgent priority in this
                      period.
                    </p>
                  </section>
                )}
              </div>
              <div className="ix-brief-now-side">
                <InsightOtherPriorities
                  items={otherPriorities}
                  onSelect={openEvidence}
                />
              </div>
            </div>
          </section>

          {(vm.positive.length > 0 || vm.recentlyResolved.length > 0) && (
            <>
              <hr className="ix-brief-rule" />
              <section className="ix-brief-section" aria-label="Improving">
                <header className="ix-brief-section-head">
                  <p className="ix-brief-section-eyebrow">Improving</p>
                  <h2 className="ix-brief-section-title">
                    What&apos;s getting better
                  </h2>
                  <p className="ix-brief-section-support">
                    Grounded positive signals and resolved outcomes only.
                  </p>
                </header>
                <InsightOtherPriorities
                  items={[...vm.positive, ...vm.recentlyResolved].slice(0, 4)}
                  onSelect={openEvidence}
                />
              </section>
            </>
          )}

          <hr className="ix-brief-rule" />

          <section
            className="ix-brief-section ix-brief-section-recommendations"
            aria-label="How recommendations are being handled"
          >
            <header className="ix-brief-section-head">
              <p className="ix-brief-section-eyebrow">Recommendations</p>
              <h2 className="ix-brief-section-title">
                How recommendations are being handled
              </h2>
              <p className="ix-brief-section-support">
                How the organisation is responding to what Intelligence has
                recommended.
              </p>
            </header>
            <InsightRecommendationHealth
              health={bundle.recommendationHealth}
              note={recoNote}
            />
          </section>

          <hr className="ix-brief-rule" />

          <section
            className="ix-brief-section ix-brief-section-activity"
            aria-label="Recent activity"
          >
            <header className="ix-brief-section-head">
              <p className="ix-brief-section-eyebrow">Context</p>
              <h2 className="ix-brief-section-title">
                Supporting operational context
              </h2>
              <p className="ix-brief-section-support">
                Recent findings that feed this briefing — context, not the
                briefing itself.
              </p>
            </header>
            <InsightActivityFeed items={activityItems} />
          </section>

          <p className="ix-ref-explore-links">
            <Link href="/intelligence/changes" className="ix-ref-text-action">
              Explore changes ({vm.exploration.changeCount})
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link href="/intelligence/patterns" className="ix-ref-text-action">
              Explore patterns ({vm.exploration.patternCount})
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </p>
        </div>

        {selected && panelMode === "evidence" ? (
          <InsightInvestigationPanel
            finding={selected}
            onClose={closePanel}
          />
        ) : null}
      </div>
    </ModeFrame>
  );
}
