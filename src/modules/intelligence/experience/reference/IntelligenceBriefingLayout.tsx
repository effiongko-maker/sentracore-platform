"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type {
  BriefingFinding,
  BriefingViewModel,
} from "../../view-model/buildBriefingViewModel";
import {
  composeBriefingSections,
  type ActivityItem,
} from "./referenceHelpers";
import { ReferenceChangesPreview } from "./ReferenceChangesPreview";
import { ReferenceHero } from "./ReferenceHero";
import { ReferenceOtherPriorities } from "./ReferenceOtherPriorities";
import { ReferencePatternsPreview } from "./ReferencePatternsPreview";
import { ReferencePriorityInsight } from "./ReferencePriorityInsight";
import { ReferenceRecommendationSection } from "./ReferenceRecommendationSection";
import { ReferenceRecentActivity } from "./ReferenceRecentActivity";
import { TopologyHeroVisual } from "../visuals/TopologyHeroVisual";

function BriefingSectionHeading({
  eyebrow,
  title,
  support,
}: {
  eyebrow: string;
  title: string;
  support: string;
}) {
  return (
    <header className="ix-brief-section-head">
      <p className="ix-brief-section-eyebrow">{eyebrow}</p>
      <h2 className="ix-brief-section-title">{title}</h2>
      <p className="ix-brief-section-support">{support}</p>
    </header>
  );
}

function BriefingSectionFoot({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <div className="ix-brief-section-foot">
      <Link href={href} className="ix-ref-text-action">
        {label}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}

export function IntelligenceBriefingLayout({
  vm,
  onExplore,
}: {
  vm: BriefingViewModel;
  onExplore: (finding: BriefingFinding) => void;
}) {
  const {
    primaryPriority,
    otherPriorities,
    changesPreview,
    patternsPreview,
    recentActivity,
  } = composeBriefingSections(vm);

  return (
    <div className="ix-ref-layout ix-brief-layout">
      <div className="ix-ref-hero-wrap">
        <ReferenceHero vm={vm} />
        <div className="ix-ref-hero-visual-area">
          <TopologyHeroVisual />
        </div>
      </div>

      {/* ── NOW ─────────────────────────────────────────────────── */}
      <section
        className="ix-brief-section ix-brief-section-now"
        aria-labelledby="ix-brief-now"
      >
        <BriefingSectionHeading
          eyebrow="Now"
          title="What needs your attention?"
          support="The clearest issues SentraCore wants you to look at first."
        />
        <div className="ix-brief-now-grid">
          <div className="ix-brief-now-primary">
            {primaryPriority ? (
              <ReferencePriorityInsight
                finding={primaryPriority}
                onExplore={onExplore}
              />
            ) : (
              <section className="ix-ref-card ix-ref-empty-state">
                <p className="ix-ref-kicker">Priority insight</p>
                <h3 className="ix-ref-headline ix-ref-headline-sm">
                  Nothing needs immediate attention
                </h3>
                <p className="ix-ref-lead">
                  SentraCore has not found an urgent priority in this period.
                </p>
              </section>
            )}
          </div>
          <div className="ix-brief-now-side">
            <ReferenceOtherPriorities
              items={otherPriorities}
              onSelect={onExplore}
            />
          </div>
        </div>
      </section>

      <hr className="ix-brief-rule" />

      {/* ── WHAT CHANGED ────────────────────────────────────────── */}
      <section
        className="ix-brief-section ix-brief-section-changed"
        aria-labelledby="ix-brief-changed"
      >
        <BriefingSectionHeading
          eyebrow="What changed"
          title="What has changed?"
          support="Meaningful shifts compared with the previous period."
        />
        <div className="ix-brief-editorial-surface">
          <ReferenceChangesPreview
            items={changesPreview}
            emptyLabel="No meaningful changes in the comparison period."
            onSelect={onExplore}
          />
          <BriefingSectionFoot href="/intelligence/changes" label="Explore changes" />
        </div>
      </section>

      <hr className="ix-brief-rule" />

      {/* ── EMERGING PATTERNS ───────────────────────────────────── */}
      <section
        className="ix-brief-section ix-brief-section-patterns"
        aria-labelledby="ix-brief-patterns"
      >
        <BriefingSectionHeading
          eyebrow="Patterns"
          title="What SentaCore is starting to notice"
          support="Recurring connections across incidents, maintenance, and facilities."
        />
        <div className="ix-brief-editorial-surface ix-brief-editorial-surface-patterns">
          <ReferencePatternsPreview
            items={patternsPreview}
            emptyLabel="Nothing recurring enough to surface in this period."
            onSelect={onExplore}
          />
          <BriefingSectionFoot href="/intelligence/patterns" label="Explore patterns" />
        </div>
      </section>

      <hr className="ix-brief-rule" />

      {/* ── RECOMMENDATION HANDLING ─────────────────────────────── */}
      <section
        className="ix-brief-section ix-brief-section-recommendations"
        aria-label="How recommendations are being handled"
      >
        <BriefingSectionHeading
          eyebrow="Recommendations"
          title="How recommendations are being handled"
          support="How the organisation is responding to SentraCore’s suggestions."
        />
        <ReferenceRecommendationSection vm={vm} />
      </section>

      <hr className="ix-brief-rule" />

      {/* ── RECENT ACTIVITY ─────────────────────────────────────── */}
      <section
        className="ix-brief-section ix-brief-section-activity"
        aria-label="Recent activity"
      >
        <BriefingSectionHeading
          eyebrow="Recent activity"
          title="What has been happening?"
          support="Recent incidents, maintenance, and work orders that feed this briefing."
        />
        <ReferenceRecentActivity
          items={recentActivity as ActivityItem[]}
          variant="feed"
        />
      </section>
    </div>
  );
}

/** Re-export for exploration pages. */
export { composeBriefingSections };
