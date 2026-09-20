"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import {
  INTELLIGENCE_LOADING_MESSAGES,
  INTELLIGENCE_LOADING_STATUS,
  IntelligenceSkeleton,
  PageLoadingState,
} from "@/components/loading";
import { ModeFrame } from "@/components/platform";
import { InsightActivityFeed } from "@/modules/intelligence/components/InsightBriefingViews";
import { TopologyHeroVisual, TopologyRadarVisual } from "@/modules/intelligence/experience/visuals/TopologyHeroVisual";
import { Sparkline } from "@/modules/intelligence/experience/visuals/Sparkline";
import { EccOperationsService } from "../services/EccOperationsService";
import { DEFAULT_ECC_CENTRE } from "../types";
import type { EccDailyOpsRecord, EccIssue, EccRequest } from "../types";
import { deriveEccIntelligence } from "../intelligence/deriveEccIntelligence";
import type {
  EccIntelligenceInsight,
  EccIntelligenceSnapshot,
} from "../intelligence/types";

type PanelMode = "evidence" | "action" | null;

function toDateInputValue(isoOrDate: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoOrDate)) return isoOrDate;
  try {
    return new Date(isoOrDate).toISOString().slice(0, 10);
  } catch {
    return isoOrDate.slice(0, 10);
  }
}

function defaultMonthRange(asOfDay: string): { from: string; to: string } {
  return { from: `${asOfDay.slice(0, 8)}01`, to: asOfDay };
}

function accentFor(
  insight: EccIntelligenceInsight
): "critical" | "high" | "normal" {
  if (insight.severity === "attention") return "critical";
  if (insight.severity === "watch") return "high";
  return "normal";
}

function metricToken(insight: EccIntelligenceInsight): string {
  if (insight.kind === "insufficient_data") return "—";
  const count = insight.evidence.length;
  if (count > 0) return String(Math.min(count, 99)).padStart(2, "0");
  if (insight.severity === "attention") return "01";
  return "—";
}

function heroStatement(primary: EccIntelligenceInsight | null): {
  headline: string;
  support: string;
} {
  if (!primary) {
    return {
      headline: "Nothing needs immediate attention",
      support:
        "SentraCore™ has reviewed ECC Daily Ops, Issues, and Requests and found no urgent priority in this period.",
    };
  }
  if (primary.severity === "attention") {
    return {
      headline: "The ECC operation needs attention",
      support:
        "SentraCore™ has analysed recent ECC activity and identified what matters most right now.",
    };
  }
  if (primary.severity === "watch") {
    return {
      headline: "Early signals are forming",
      support:
        "SentraCore™ has detected emerging ECC patterns that may need closer watching.",
    };
  }
  return {
    headline: "Here's what SentraCore™ has learned",
    support:
      "SentraCore™ has reviewed recent ECC operational activity and summarised the clearest findings.",
  };
}

/**
 * Insights are derived from a period of records — they are not timestamped
 * events. The label therefore states the analysed period, never an invented
 * recency derived from list position.
 */
function insightTimeLabel(periodLabel: string): string {
  return periodLabel ? `Period: ${periodLabel}` : "Selected period";
}

function activityTone(
  severity: EccIntelligenceInsight["severity"]
): "critical" | "warning" | "info" | "neutral" {
  if (severity === "attention") return "critical";
  if (severity === "watch") return "warning";
  return "info";
}

function EccPriorityCard({
  insight,
  onReviewEvidence,
  onTakeAction,
}: {
  insight: EccIntelligenceInsight;
  onReviewEvidence: () => void;
  onTakeAction: () => void;
}) {
  const accent = accentFor(insight);
  const evidenceBullets = insight.evidence.slice(0, 4);

  return (
    <section className="ix-ref-card ix-ref-priority" aria-label="Priority insight">
      <div className="ix-ref-priority-grid">
        <div className="ix-ref-priority-copy">
          <p className={`ix-ref-kicker ix-ref-kicker-${accent}`}>
            Priority insight
          </p>
          <div className="ix-ref-metric-row">
            <span className={`ix-ref-metric ix-ref-metric-${accent}`}>
              {metricToken(insight)}
            </span>
            <span className="ix-ref-metric-caption">{insight.title}</span>
          </div>
          <p className="ix-ref-body">{insight.observation}</p>

          <div className="ix-ref-reasoning">
            <section className="ix-ref-reason-block">
              <h3>What we know</h3>
              <p>{insight.observation}</p>
            </section>
            {insight.interpretation && insight.kind !== "recommendation" ? (
              <section className="ix-ref-reason-block">
                <h3>What we think</h3>
                <p>{insight.interpretation}</p>
              </section>
            ) : null}
            {insight.kind === "recommendation" && insight.interpretation ? (
              <section className="ix-ref-reason-block is-reco">
                <h3>Recommendation</h3>
                <p>{insight.interpretation}</p>
              </section>
            ) : null}
          </div>

          {evidenceBullets.length > 0 ? (
            <ul className="ix-ref-evidence-list">
              {evidenceBullets.map((bullet) => (
                <li key={bullet}>
                  <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="ix-ref-priority-meta">
            <span
              className={`ix-ref-confidence is-${
                insight.kind === "insufficient_data"
                  ? "emerging"
                  : insight.severity === "attention"
                    ? "high"
                    : insight.severity === "watch"
                      ? "moderate"
                      : "emerging"
              }`}
            >
              {insight.kind === "insufficient_data"
                ? "Insufficient historical data"
                : insight.severity === "attention"
                  ? "High confidence"
                  : insight.severity === "watch"
                    ? "Moderate confidence"
                    : "Emerging"}
            </span>
            <span>
              {insight.evidence.length > 0
                ? `${insight.evidence.length} evidence item${
                    insight.evidence.length === 1 ? "" : "s"
                  }`
                : "Observation from ECC registers"}
            </span>
          </div>

          <div className="ix-ref-priority-actions">
            <button
              type="button"
              className="ix-ref-btn"
              onClick={onReviewEvidence}
            >
              Review evidence →
            </button>
            <button
              type="button"
              className="ix-ref-btn ix-ref-btn-primary"
              onClick={onTakeAction}
            >
              Take action →
            </button>
          </div>
        </div>
        <TopologyRadarVisual
          label={`${insight.title}: ${metricToken(insight)}`}
        />
      </div>
    </section>
  );
}

function EccOtherPriorities({
  items,
  onSelect,
}: {
  items: EccIntelligenceInsight[];
  onSelect: (insight: EccIntelligenceInsight) => void;
}) {
  return (
    <section
      className="ix-ref-card ix-ref-side-panel"
      aria-label="Other priorities"
    >
      <header className="ix-ref-panel-head">
        <h2>Other priorities</h2>
      </header>
      {items.length === 0 ? (
        <p className="ix-ref-empty">No additional priorities in this period.</p>
      ) : (
        <ul className="ix-ref-priority-list">
          {items.map((item, index) => {
            const accent = accentFor(item);
            const metric = metricToken(item);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className="ix-ref-priority-item"
                  onClick={() => onSelect(item)}
                >
                  <div className="ix-ref-priority-item-main">
                    <span
                      className={`ix-ref-priority-index ix-ref-priority-index-${accent}`}
                    >
                      {metric !== "—"
                        ? metric
                        : String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="ix-ref-priority-item-copy">
                      <span className="ix-ref-priority-item-title">
                        {item.title}
                      </span>
                      <span className="ix-ref-priority-item-sub">
                        {item.observation}
                      </span>
                    </div>
                  </div>
                  <Sparkline
                    id={item.id}
                    tone={
                      accent === "critical"
                        ? "critical"
                        : accent === "high"
                          ? "warning"
                          : "normal"
                    }
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function EccRecommendationSection({
  items,
}: {
  items: EccIntelligenceInsight[];
}) {
  if (items.length === 0) {
    return (
      <section className="ix-ref-card ix-ref-recommendations">
        <p className="ix-ref-empty">
          No recommendations derived from ECC registers in this window.
        </p>
      </section>
    );
  }

  return (
    <section
      className="ix-ref-card ix-ref-recommendations"
      aria-label="Suggested operational follow-up"
    >
      <ul className="ix-ref-priority-list">
        {items.map((item, index) => {
          const accent = accentFor(item);
          return (
            <li key={item.id}>
              <div className="ix-ref-priority-item">
                <div className="ix-ref-priority-item-main">
                  <span
                    className={`ix-ref-priority-index ix-ref-priority-index-${accent}`}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="ix-ref-priority-item-copy">
                    <span className="ix-ref-priority-item-title">
                      {item.title}
                    </span>
                    <span className="ix-ref-priority-item-sub">
                      {item.observation}
                    </span>
                    {item.interpretation ? (
                      <span className="ix-ref-priority-item-sub">
                        Suggested reading: {item.interpretation}
                      </span>
                    ) : null}
                  </div>
                </div>
                {item.href ? (
                  <Link href={item.href} className="ix-ref-text-action">
                    Open register
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function EccEvidencePanel({
  insight,
  onClose,
}: {
  insight: EccIntelligenceInsight;
  onClose: () => void;
}) {
  return (
    <aside className="ix-ref-detail-panel" aria-label="Evidence review">
      <div className="ix-ref-detail-inner">
        <button type="button" className="ix-ref-detail-back" onClick={onClose}>
          ← Back to briefing
        </button>
        <p className="ix-ref-kicker">Evidence review</p>
        <h2 className="ix-ref-detail-title">{insight.title}</h2>
        <p className="ix-ref-detail-muted">
          Grounded in ECC Daily Ops, Issues, and Requests only.
        </p>

        <section className="ix-ref-reason-block">
          <h3>Evidence</h3>
          {insight.evidence.length > 0 ? (
            <ul className="ix-ref-evidence-list">
              {insight.evidence.map((item) => (
                <li key={item}>
                  <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ix-ref-detail-muted">
              No detailed evidence items were attached to this finding. The
              observation above is what Intelligence has for review.
            </p>
          )}
        </section>

        <section className="ix-ref-reason-block">
          <h3>What we know</h3>
          <p>{insight.observation}</p>
        </section>
        {insight.interpretation ? (
          <section className="ix-ref-reason-block">
            <h3>What we think</h3>
            <p>{insight.interpretation}</p>
          </section>
        ) : null}

        <section className="ix-ref-reason-block">
          <h3>Open related registers</h3>
          <ul className="ix-ref-ops-list">
            <li>
              <Link href="/ecc-operations/daily-ops">Daily operations</Link>
            </li>
            <li>
              <Link href="/ecc-operations/issues">Issues</Link>
            </li>
            <li>
              <Link href="/ecc-operations/requests">Requests</Link>
            </li>
          </ul>
          {insight.href ? (
            <Link href={insight.href} className="ix-ref-text-action">
              Open related register
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          ) : null}
        </section>
      </div>
    </aside>
  );
}

function EccActionPanel({
  insight,
  onClose,
}: {
  insight: EccIntelligenceInsight;
  onClose: () => void;
}) {
  return (
    <section
      className="ix-ref-action-focus"
      aria-label="Actions from this insight"
    >
      <div className="ix-ref-action-focus-inner">
        <button type="button" className="ix-ref-detail-back" onClick={onClose}>
          ← Back to insight
        </button>

        <p className="ix-ref-kicker">Actions from this insight</p>
        <h2 className="ix-ref-detail-title">{insight.title}</h2>
        <p className="ix-ref-detail-muted">
          Continue in the ECC register that produced this finding.
        </p>

        <section className="ix-ref-action-group">
          <h3>ECC registers</h3>
          <ul>
            {insight.href ? (
              <li>
                <div>
                  <p className="ix-ref-action-id">Related register</p>
                  <p className="ix-ref-action-meta">{insight.title}</p>
                </div>
                <Link
                  href={insight.href}
                  className="ix-ref-btn ix-ref-btn-primary"
                >
                  Open
                </Link>
              </li>
            ) : null}
            <li>
              <div>
                <p className="ix-ref-action-id">Daily operations</p>
                <p className="ix-ref-action-meta">Operational submissions</p>
              </div>
              <Link
                href="/ecc-operations/daily-ops"
                className="ix-ref-btn ix-ref-btn-primary"
              >
                Open
              </Link>
            </li>
            <li>
              <div>
                <p className="ix-ref-action-id">Issues</p>
                <p className="ix-ref-action-meta">Issue register</p>
              </div>
              <Link
                href="/ecc-operations/issues"
                className="ix-ref-btn ix-ref-btn-primary"
              >
                Open
              </Link>
            </li>
            <li>
              <div>
                <p className="ix-ref-action-id">Requests</p>
                <p className="ix-ref-action-meta">Request register</p>
              </div>
              <Link
                href="/ecc-operations/requests"
                className="ix-ref-btn ix-ref-btn-primary"
              >
                Open
              </Link>
            </li>
          </ul>
        </section>
      </div>
    </section>
  );
}

export function EccIntelligencePage() {
  const [dailyOps, setDailyOps] = useState<EccDailyOpsRecord[]>([]);
  const [issues, setIssues] = useState<EccIssue[]>([]);
  const [requests, setRequests] = useState<EccRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>(null);
  const actionFocusRef = useRef<HTMLDivElement | null>(null);
  const evidenceFocusRef = useRef<HTMLDivElement | null>(null);
  const insightAnchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      EccOperationsService.listDailyOps(),
      EccOperationsService.listIssues(),
      EccOperationsService.listRequests(),
    ])
      .then(([ops, issueList, requestList]) => {
        if (cancelled) return;
        setDailyOps(ops);
        setIssues(issueList);
        setRequests(requestList);
        const asOfDay = toDateInputValue(new Date().toISOString());
        const dates = ops.map((row) => row.reportingDate).sort();
        if (dates.length === 0) {
          const range = defaultMonthRange(asOfDay);
          setRangeFrom(range.from);
          setRangeTo(range.to);
        } else {
          const latest = dates[dates.length - 1]!;
          const range = defaultMonthRange(latest);
          setRangeFrom(dates[0]! < range.from ? dates[0]! : range.from);
          setRangeTo(latest);
        }
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load intelligence inputs."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const intelligence: EccIntelligenceSnapshot | null = useMemo(() => {
    if (!rangeFrom || !rangeTo) return null;
    return deriveEccIntelligence({
      centre: DEFAULT_ECC_CENTRE,
      dailyOps,
      issues,
      requests,
      rangeFrom,
      rangeTo,
    });
  }, [dailyOps, issues, requests, rangeFrom, rangeTo]);

  const allInsights = useMemo(() => {
    if (!intelligence) return [] as EccIntelligenceInsight[];
    const map = new Map<string, EccIntelligenceInsight>();
    for (const item of [
      ...intelligence.attention,
      ...intelligence.keyInsights,
      ...intelligence.trends,
      ...intelligence.managementInsights,
      ...intelligence.recommendations,
    ]) {
      map.set(item.id, item);
    }
    return Array.from(map.values());
  }, [intelligence]);

  const primary = useMemo(() => {
    if (!intelligence) return null;
    return (
      intelligence.attention[0] ??
      intelligence.keyInsights[0] ??
      intelligence.managementInsights[0] ??
      null
    );
  }, [intelligence]);

  const otherPriorities = useMemo(() => {
    if (!intelligence || !primary) {
      return intelligence?.attention.slice(0, 4) ?? [];
    }
    return [
      ...intelligence.attention,
      ...intelligence.keyInsights,
      ...intelligence.trends,
    ]
      .filter((item) => item.id !== primary.id)
      .slice(0, 4);
  }, [intelligence, primary]);

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return allInsights.find((row) => row.id === selectedId) ?? null;
  }, [allInsights, selectedId]);

  const activityItems = useMemo(() => {
    if (!intelligence) return [];
    const source = [
      ...(primary ? [primary] : []),
      ...otherPriorities,
      ...intelligence.managementInsights,
    ].slice(0, 5);
    return source.map((row) => ({
      id: row.id,
      label: row.title,
      time: insightTimeLabel(intelligence.periodLabel),
      tone: activityTone(row.severity),
    }));
  }, [intelligence, otherPriorities, primary]);

  function openEvidence(insight: EccIntelligenceInsight) {
    setSelectedId(insight.id);
    setPanelMode("evidence");
  }

  function openAction(insight: EccIntelligenceInsight) {
    setSelectedId(insight.id);
    setPanelMode("action");
  }

  function backToInsight() {
    setPanelMode(null);
    requestAnimationFrame(() => {
      insightAnchorRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  function closePanel() {
    setPanelMode(null);
    setSelectedId(null);
  }

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

  useEffect(() => {
    if (panelMode !== "evidence") return;
    requestAnimationFrame(() => {
      evidenceFocusRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      evidenceFocusRef.current?.focus({ preventScroll: true });
    });
  }, [panelMode, selectedId]);

  if (loading) {
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

  if (error && !intelligence) {
    return (
      <ModeFrame mode="cognitive">
        <div className="ix-ref-page" style={{ padding: "3rem 1.5rem" }}>
          <p className="ix-ref-mark">SentraCore™ Intelligence</p>
          <h1 className="ix-ref-headline ix-ref-headline-sm">
            Not available right now
          </h1>
          <p className="ix-ref-lead">{error}</p>
        </div>
      </ModeFrame>
    );
  }

  if (!intelligence) {
    return (
      <ModeFrame mode="cognitive">
        <div className="ix-ref-page">
          <p className="ix-ref-lead">Select a reporting period to analyse.</p>
        </div>
      </ModeFrame>
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
          <EccActionPanel insight={selected} onClose={backToInsight} />
        </div>
      </ModeFrame>
    );
  }

  const { headline, support } = heroStatement(primary);
  const lead =
    primary?.severity === "attention"
      ? `SentraCore™ has analysed ECC Daily Ops, Issues, and Requests for ${intelligence.periodLabel} and identified what matters most right now.`
      : support;
  const submissionCmp = intelligence.comparisons.find(
    (row) => row.id === "daily-ops-submissions"
  );
  const issuesCmp = intelligence.comparisons.find(
    (row) => row.id === "issues-created"
  );
  const requestsCmp = intelligence.comparisons.find(
    (row) => row.id === "requests-created"
  );

  return (
    <ModeFrame mode="cognitive">
      <div
        className={`ix-ref-page${panelMode === "evidence" ? " has-panel" : ""}`}
      >
        <div className="ix-ref-layout ix-brief-layout">
          <div className="ix-ref-hero-wrap">
            <section className="ix-ref-hero" aria-label="Intelligence overview">
              <div className="ix-ref-hero-copy">
                <p className="ix-ref-mark">SentraCore™ Intelligence</p>
                <h1 className="ix-ref-headline">{headline}</h1>
                <p className="ix-ref-lead">{lead}</p>
                <div
                  className="ecc-rpt-range-controls"
                  style={{ marginTop: "1rem" }}
                >
                  <label className="sr-only" htmlFor="ecc-intel-from">
                    From
                  </label>
                  <input
                    id="ecc-intel-from"
                    type="date"
                    value={rangeFrom}
                    onChange={(e) => setRangeFrom(e.target.value)}
                  />
                  <span aria-hidden>–</span>
                  <label className="sr-only" htmlFor="ecc-intel-to">
                    To
                  </label>
                  <input
                    id="ecc-intel-to"
                    type="date"
                    value={rangeTo}
                    onChange={(e) => setRangeTo(e.target.value)}
                  />
                </div>
              </div>
              <div className="ix-ref-hero-stats">
                <div className="ix-ref-stat">
                  <span className="ix-ref-stat-value">
                    {submissionCmp?.current ?? 0}
                  </span>
                  <span className="ix-ref-stat-label">Daily Ops analysed</span>
                </div>
                <div className="ix-ref-stat">
                  <span className="ix-ref-stat-value">
                    {issuesCmp?.current ?? 0}
                  </span>
                  <span className="ix-ref-stat-label">Issues in period</span>
                </div>
                <div className="ix-ref-stat">
                  <span className="ix-ref-stat-value">
                    {requestsCmp?.current ?? 0}
                  </span>
                  <span className="ix-ref-stat-label">Requests in period</span>
                </div>
                <div className="ix-ref-live">
                  <span className="ix-ref-live-dot" aria-hidden />
                  {intelligence.centreName} · vs{" "}
                  {intelligence.previousPeriodLabel}
                </div>
              </div>
            </section>
            <div className="ix-ref-hero-visual-area">
              <TopologyHeroVisual />
              {primary ? (
                <aside className="ix-ref-top-insight" aria-label="Top insight">
                  <p className="ix-ref-kicker ix-ref-kicker-critical">
                    Top insight
                  </p>
                  <p className="ix-ref-top-insight-title">{primary.title}</p>
                  <p className="ix-ref-top-insight-copy">
                    {primary.observation}
                  </p>
                </aside>
              ) : null}
            </div>
          </div>

          <section
            className="ix-brief-section ix-brief-section-now"
            aria-labelledby="ecc-ix-brief-now"
          >
            <header className="ix-brief-section-head">
              <p className="ix-brief-section-eyebrow">Now</p>
              <h2 id="ecc-ix-brief-now" className="ix-brief-section-title">
                What needs your attention?
              </h2>
              <p className="ix-brief-section-support">
                The clearest issues SentraCore™ wants you to look at first.
              </p>
            </header>

            <div className="ix-brief-now-grid">
              <div className="ix-brief-now-primary" ref={insightAnchorRef}>
                {primary ? (
                  <EccPriorityCard
                    insight={primary}
                    onReviewEvidence={() => openEvidence(primary)}
                    onTakeAction={() => openAction(primary)}
                  />
                ) : (
                  <section className="ix-ref-card ix-ref-empty-state">
                    <p className="ix-ref-kicker">Priority insight</p>
                    <h3 className="ix-ref-headline ix-ref-headline-sm">
                      Nothing needs immediate attention
                    </h3>
                    <p className="ix-ref-lead">
                      SentraCore™ has not found an urgent priority in this
                      period.
                    </p>
                  </section>
                )}
              </div>
              <div className="ix-brief-now-side">
                <EccOtherPriorities
                  items={otherPriorities}
                  onSelect={openEvidence}
                />
              </div>
            </div>
          </section>

          <hr className="ix-brief-rule" />

          <section
            className="ix-brief-section ix-brief-section-recommendations"
            aria-label="Suggested operational follow-up"
          >
            <header className="ix-brief-section-head">
              <p className="ix-brief-section-eyebrow">Recommendations</p>
              <h2 className="ix-brief-section-title">
                Suggested operational follow-up
              </h2>
              <p className="ix-brief-section-support">
                Clearly labelled recommendations from ECC registers — suggested
                reading, not facts.
              </p>
            </header>
            <EccRecommendationSection items={intelligence.recommendations} />
          </section>

          <hr className="ix-brief-rule" />

          <section
            className="ix-brief-section ix-brief-section-activity"
            aria-label="Supporting operational context"
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
            {intelligence.dataNotes.length > 0 ? (
              <ul className="ix-ref-evidence-list" style={{ marginTop: "1rem" }}>
                {intelligence.dataNotes.map((note) => (
                  <li key={note}>
                    <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <p className="ix-ref-explore-links">
            <Link
              href="/ecc-operations/reporting"
              className="ix-ref-text-action"
            >
              Open Reporting
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/ecc-operations/daily-ops"
              className="ix-ref-text-action"
            >
              Open Daily operations
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </p>
        </div>

        {selected && panelMode === "evidence" ? (
          <div ref={evidenceFocusRef} tabIndex={-1}>
            <EccEvidencePanel insight={selected} onClose={closePanel} />
          </div>
        ) : null}
      </div>
    </ModeFrame>
  );
}
