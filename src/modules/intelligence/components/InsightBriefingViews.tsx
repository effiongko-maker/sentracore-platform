"use client";

import Link from "next/link";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import type { IntelligenceInsight } from "@/lib/intelligence/insights/types";
import type { OrganisationOperationalContext } from "@/lib/intelligence";
import type { ClassifiedFinding } from "../view-model/buildIntelligenceExperience";
import {
  buildActionableItems,
  displayInsightMetric,
  groupActionableItems,
  heroStatement,
  insightAccent,
  recordActionLabel,
  type ActionableItem,
} from "../view-model/insightBriefingHelpers";
import { TopologyHeroVisual, TopologyRadarVisual } from "../experience/visuals/TopologyHeroVisual";
import { Sparkline } from "../experience/visuals/Sparkline";

function confidenceLabel(value: IntelligenceInsight["confidence"]): string {
  if (value === "High") return "High confidence";
  if (value === "Moderate") return "Moderate confidence";
  return "Emerging";
}

function kindLabel(kind: ActionableItem["kind"]): string {
  switch (kind) {
    case "request":
      return "Request";
    case "maintenance":
      return "Maintenance";
    case "incident":
      return "Incident";
    case "work_order":
      return "Work order";
    case "asset":
      return "Asset";
  }
}

export function InsightHero({
  primary,
  ctx,
  windowDays,
}: {
  primary: ClassifiedFinding | null;
  ctx: OrganisationOperationalContext;
  windowDays: number;
}) {
  const { headline, support } = heroStatement(primary);
  const lead =
    primary?.priority === "attention"
      ? `SentraCore has analysed the last ${windowDays} days of activity and identified what matters most right now.`
      : support;

  return (
    <div className="ix-ref-hero-wrap">
      <section className="ix-ref-hero" aria-label="Intelligence overview">
        <div className="ix-ref-hero-copy">
          <p className="ix-ref-mark">SentraCore Intelligence</p>
          <h1 className="ix-ref-headline">{headline}</h1>
          <p className="ix-ref-lead">{lead}</p>
        </div>
        <div className="ix-ref-hero-stats">
          <div className="ix-ref-stat">
            <span className="ix-ref-stat-value">
              {ctx.recentIncidentCount30d}
            </span>
            <span className="ix-ref-stat-label">Incidents analysed</span>
          </div>
          <div className="ix-ref-stat">
            <span className="ix-ref-stat-value">
              {ctx.highOrCriticalRiskCount}
            </span>
            <span className="ix-ref-stat-label">Elevated-risk events</span>
          </div>
          <div className="ix-ref-stat">
            <span className="ix-ref-stat-value">
              {ctx.facilitiesWithRecentActivity}
            </span>
            <span className="ix-ref-stat-label">Active sites</span>
          </div>
          <div className="ix-ref-live">
            <span className="ix-ref-live-dot" aria-hidden />
            Updated just now · Live intelligence
          </div>
        </div>
      </section>
      <div className="ix-ref-hero-visual-area">
        <TopologyHeroVisual />
        {primary ? (
          <aside className="ix-ref-top-insight" aria-label="Top insight">
            <p className="ix-ref-kicker ix-ref-kicker-critical">Top insight</p>
            <p className="ix-ref-top-insight-title">{primary.insight.title}</p>
            <p className="ix-ref-top-insight-copy">
              {primary.insight.observation}
            </p>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

export function InsightPriorityCard({
  finding,
  onReviewEvidence,
  onTakeAction,
}: {
  finding: ClassifiedFinding;
  onReviewEvidence: () => void;
  onTakeAction: () => void;
}) {
  const { insight, evidenceSummary } = finding;
  const accent = insightAccent(finding);
  const facility = insight.relatedEntities.find((e) => e.kind === "facility");
  const evidenceBullets = insight.evidence
    .filter((e) => !/id/i.test(e.label))
    .slice(0, 4)
    .map((e) => `${e.label}: ${e.value}`);

  return (
    <section className="ix-ref-card ix-ref-priority" aria-label="Priority insight">
      <div className="ix-ref-priority-grid">
        <div className="ix-ref-priority-copy">
          <p className={`ix-ref-kicker ix-ref-kicker-${accent}`}>
            Priority insight
          </p>
          <div className="ix-ref-metric-row">
            <span className={`ix-ref-metric ix-ref-metric-${accent}`}>
              {displayInsightMetric(finding)}
            </span>
            <span className="ix-ref-metric-caption">{insight.title}</span>
          </div>
          <p className="ix-ref-body">{insight.observation}</p>

          <div className="ix-ref-reasoning">
            <section className="ix-ref-reason-block">
              <h3>What we know</h3>
              <p>{insight.fact}</p>
            </section>
            <section className="ix-ref-reason-block">
              <h3>What we think</h3>
              <p>{insight.inference}</p>
            </section>
            {insight.impact ? (
              <section className="ix-ref-reason-block">
                <h3>Why it matters</h3>
                <p>{insight.impact}</p>
              </section>
            ) : null}
            {insight.recommendation ? (
              <section className="ix-ref-reason-block is-reco">
                <h3>Recommendation</h3>
                <p>{insight.recommendation}</p>
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
              className={`ix-ref-confidence is-${insight.confidence.toLowerCase()}`}
            >
              {confidenceLabel(insight.confidence)}
            </span>
            <span>{evidenceSummary}</span>
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
          label={
            facility
              ? `${facility.label || facility.id}: ${displayInsightMetric(finding)}`
              : undefined
          }
        />
      </div>
    </section>
  );
}

export function InsightOtherPriorities({
  items,
  onSelect,
}: {
  items: ClassifiedFinding[];
  onSelect: (finding: ClassifiedFinding) => void;
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
            const accent = insightAccent(item);
            return (
              <li key={item.insight.id}>
                <button
                  type="button"
                  className="ix-ref-priority-item"
                  onClick={() => onSelect(item)}
                >
                  <div className="ix-ref-priority-item-main">
                    <span
                      className={`ix-ref-priority-index ix-ref-priority-index-${accent}`}
                    >
                      {displayInsightMetric(item) !== "—"
                        ? displayInsightMetric(item)
                        : String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="ix-ref-priority-item-copy">
                      <span className="ix-ref-priority-item-title">
                        {item.insight.title}
                      </span>
                      <span className="ix-ref-priority-item-sub">
                        {item.insight.observation}
                      </span>
                    </div>
                  </div>
                  <Sparkline
                    id={item.insight.id}
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

export function InsightRecommendationHealth({
  health,
  note,
}: {
  health: {
    totalDecisions: number;
    accepted: number;
    dismissed: number;
    deferred: number;
  };
  note?: string;
}) {
  if (health.totalDecisions <= 0) {
    return (
      <section className="ix-ref-card ix-ref-recommendations">
        <p className="ix-ref-empty">
          No recommendation responses recorded in this window.
        </p>
      </section>
    );
  }

  return (
    <section
      className="ix-ref-card ix-ref-recommendations"
      aria-label="How recommendations are being handled"
    >
      <div className="ix-ref-triage-grid">
        <article className="ix-ref-triage-card ix-ref-triage-accepted">
          <Sparkline id="accepted" tone="accepted" />
          <p className="ix-ref-triage-value">
            {String(health.accepted).padStart(2, "0")}
          </p>
          <p className="ix-ref-triage-label">Accepted</p>
          <p className="ix-ref-triage-meta">
            of {health.totalDecisions} decisions
          </p>
        </article>
        <article className="ix-ref-triage-card ix-ref-triage-deferred">
          <Sparkline id="deferred" tone="deferred" />
          <p className="ix-ref-triage-value">
            {String(health.deferred).padStart(2, "0")}
          </p>
          <p className="ix-ref-triage-label">Deferred</p>
          <p className="ix-ref-triage-meta">
            of {health.totalDecisions} decisions
          </p>
        </article>
        <article className="ix-ref-triage-card ix-ref-triage-dismissed">
          <Sparkline id="dismissed" tone="dismissed" />
          <p className="ix-ref-triage-value">
            {String(health.dismissed).padStart(2, "0")}
          </p>
          <p className="ix-ref-triage-label">Dismissed</p>
          <p className="ix-ref-triage-meta">
            of {health.totalDecisions} decisions
          </p>
        </article>
      </div>
      {note ? (
        <div className="ix-ref-note-banner">
          <Sparkles className="h-4 w-4 shrink-0 text-[#fb923c]" aria-hidden />
          <p>{note}</p>
        </div>
      ) : null}
    </section>
  );
}

export function InsightActivityFeed({
  items,
}: {
  items: Array<{ id: string; label: string; time: string; tone: string }>;
}) {
  return (
    <section className="ix-ref-activity-feed" aria-label="Recent activity">
      {items.length === 0 ? (
        <p className="ix-ref-empty">No recent supporting activity recorded.</p>
      ) : (
        <ul className="ix-ref-activity-list">
          {items.map((item) => (
            <li key={item.id} className="ix-ref-activity-item">
              <span
                className={`ix-ref-activity-dot ix-ref-activity-dot-${item.tone}`}
              />
              <div className="ix-ref-activity-copy">
                <p>{item.label}</p>
                <span>{item.time}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function InsightInvestigationPanel({
  finding,
  onClose,
}: {
  finding: ClassifiedFinding;
  onClose: () => void;
}) {
  const { insight, evidenceSummary } = finding;
  const related = insight.relatedEntities.filter(
    (e) => e.kind === "facility" || e.kind === "asset"
  );
  const investigation = insight.suggestedActions.filter(
    (a) => a.kind === "investigate"
  );

  return (
    <aside className="ix-ref-detail-panel" aria-label="Investigation">
      <div className="ix-ref-detail-inner">
        <button type="button" className="ix-ref-detail-back" onClick={onClose}>
          ← Intelligence
        </button>
        <p className="ix-ref-kicker">Finding</p>
        <h2 className="ix-ref-detail-title">{insight.title}</h2>
        <p
          className={`ix-ref-confidence is-${insight.confidence.toLowerCase()}`}
        >
          {confidenceLabel(insight.confidence)}
          {insight.confidenceBasis ? ` — ${insight.confidenceBasis}` : ""}
        </p>

        <section className="ix-ref-reason-block">
          <h3>What we know</h3>
          <p>{insight.fact}</p>
        </section>
        <section className="ix-ref-reason-block">
          <h3>What we think</h3>
          <p>{insight.inference}</p>
        </section>
        {insight.impact ? (
          <section className="ix-ref-reason-block">
            <h3>Why it matters</h3>
            <p>{insight.impact}</p>
          </section>
        ) : null}
        {insight.recommendation ? (
          <section className="ix-ref-reason-block is-reco">
            <h3>Recommendation</h3>
            <p>{insight.recommendation}</p>
          </section>
        ) : null}

        {investigation.length > 0 ? (
          <section className="ix-ref-reason-block">
            <h3>Things to investigate</h3>
            <ul className="ix-ref-investigate-list">
              {investigation.map((item) => (
                <li key={item.label}>{item.label}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="ix-ref-reason-block">
          <h3>Evidence</h3>
          <p className="ix-ref-detail-muted">{evidenceSummary}</p>
          {insight.evidence.length > 0 ? (
            <ul className="ix-ref-evidence-list">
              {insight.evidence.map((item) => (
                <li key={`${item.label}-${item.value}`}>
                  <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>
                    <strong>{item.label}</strong>: {item.value}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="ix-ref-reason-block">
          <h3>Related operations</h3>
          <ul className="ix-ref-ops-list">
            <li>
              <Link href="/requests">Requests</Link>
            </li>
            <li>
              <Link href="/maintenance">Maintenance</Link>
            </li>
            <li>
              <Link href="/incidents">Incidents</Link>
            </li>
            <li>
              <Link href="/work-orders">Work Orders</Link>
            </li>
            <li>
              <Link href="/assets">Assets</Link>
            </li>
          </ul>
          {related.length > 0 ? (
            <ul className="ix-ref-entity-list">
              {related.map((entity) => (
                <li key={`${entity.kind}-${entity.id}`}>
                  {entity.label || entity.id}
                  <span>{entity.kind}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <Link href="/operations" className="ix-ref-text-action">
            Open in Operations
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </section>
      </div>
    </aside>
  );
}

export function InsightActionPanel({
  finding,
  onClose,
}: {
  finding: ClassifiedFinding;
  onClose: () => void;
}) {
  const items = buildActionableItems(finding.insight);
  const grouped = groupActionableItems(items);

  return (
    <section
      className="ix-ref-action-focus"
      aria-label="Actions from this insight"
    >
      <div className="ix-ref-action-focus-inner">
        <button
          type="button"
          className="ix-ref-detail-back"
          onClick={onClose}
        >
          ← Back to insight
        </button>

        <p className="ix-ref-kicker">Actions from this insight</p>
        <h2 className="ix-ref-detail-title">{finding.insight.title}</h2>
        <p className="ix-ref-detail-muted">
          These are the operational records behind this finding. Open a specific
          record to continue in the existing workflow.
        </p>

        {grouped.length === 0 ? (
          <p className="ix-ref-detail-muted">
            No specific operational records are linked to this insight yet.
            Review the evidence, then open Operations when you are ready to act.
          </p>
        ) : (
          grouped.map((group) => (
            <section key={group.kind} className="ix-ref-action-group">
              <h3>{group.label}</h3>
              <ul>
                {group.rows.map((row) => (
                  <li key={`${row.kind}-${row.id}`}>
                    <div>
                      <p className="ix-ref-action-id">{row.label}</p>
                      <p className="ix-ref-action-meta">
                        {[kindLabel(row.kind), row.context]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <Link
                      href={row.href}
                      className="ix-ref-btn ix-ref-btn-primary"
                    >
                      {recordActionLabel(row.kind)}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </section>
  );
}
