"use client";

import Link from "next/link";
import type { IntelligenceInsight } from "@/lib/intelligence/insights/types";
import type { ClassifiedFinding } from "../view-model/buildIntelligenceExperience";

function confidenceLabel(value: IntelligenceInsight["confidence"]): string {
  if (value === "High") return "High confidence";
  if (value === "Moderate") return "Moderate confidence";
  return "Emerging";
}

export function PrimaryFinding({
  finding,
  onReviewEvidence,
  onTakeAction,
}: {
  finding: ClassifiedFinding;
  onReviewEvidence: () => void;
  onTakeAction: () => void;
}) {
  const { insight, evidenceSummary } = finding;

  return (
    <article className="ix-exp-primary" aria-labelledby="ix-primary-title">
      <p className="ix-exp-kicker">Priority</p>
      <h2 id="ix-primary-title" className="ix-exp-primary-title">
        {insight.title}
      </h2>
      <p className="ix-exp-primary-obs">{insight.observation}</p>

      <div className="ix-exp-primary-grid">
        <section className="ix-exp-block">
          <h3>What we know</h3>
          <p>{insight.fact}</p>
        </section>
        <section className="ix-exp-block">
          <h3>What we think</h3>
          <p>{insight.inference}</p>
        </section>
        {insight.impact ? (
          <section className="ix-exp-block">
            <h3>Why it matters</h3>
            <p>{insight.impact}</p>
          </section>
        ) : null}
        {insight.recommendation ? (
          <section className="ix-exp-block is-reco">
            <h3>Recommendation</h3>
            <p>{insight.recommendation}</p>
          </section>
        ) : null}
      </div>

      <div className="ix-exp-primary-foot">
        <div className="ix-exp-primary-meta">
          <span
            className={`ix-exp-confidence is-${insight.confidence.toLowerCase()}`}
          >
            {confidenceLabel(insight.confidence)}
          </span>
          <span className="ix-exp-evidence-summary">{evidenceSummary}</span>
        </div>
        <div className="ix-exp-primary-actions">
          <button
            type="button"
            className="ix-exp-btn"
            onClick={onReviewEvidence}
          >
            Review evidence →
          </button>
          <button
            type="button"
            className="ix-exp-btn ix-exp-btn-primary"
            onClick={onTakeAction}
          >
            Take action →
          </button>
        </div>
      </div>
    </article>
  );
}

export function WatchFinding({
  finding,
  onWatch,
}: {
  finding: ClassifiedFinding;
  onWatch: () => void;
}) {
  const { insight, evidenceSummary } = finding;
  return (
    <article className="ix-exp-watch-item">
      <h3>{insight.title}</h3>
      <p>{insight.observation}</p>
      <p className="ix-exp-watch-meta">
        <span
          className={`ix-exp-confidence is-${insight.confidence.toLowerCase()}`}
        >
          {confidenceLabel(insight.confidence)}
        </span>
        <span>{evidenceSummary}</span>
      </p>
      <button type="button" className="ix-exp-text-action" onClick={onWatch}>
        Watch pattern →
      </button>
    </article>
  );
}

export function PositiveFinding({
  finding,
  onOpen,
}: {
  finding: ClassifiedFinding;
  onOpen: () => void;
}) {
  return (
    <article className="ix-exp-positive-item">
      <h3>{finding.insight.title}</h3>
      <p>{finding.insight.observation}</p>
      <button type="button" className="ix-exp-text-action" onClick={onOpen}>
        Review →
      </button>
    </article>
  );
}

export function ResolvedFinding({ finding }: { finding: ClassifiedFinding }) {
  const { insight } = finding;
  return (
    <article className="ix-exp-resolved-item">
      <h3>{insight.title}</h3>
      <p>{insight.fact}</p>
      {insight.outcome?.summary ? (
        <p className="ix-exp-resolved-outcome">
          Outcome: {insight.outcome.summary}
        </p>
      ) : (
        <p className="ix-exp-resolved-outcome">Outcome: Resolved</p>
      )}
    </article>
  );
}

export function FindingInvestigationPanel({
  insight,
  evidenceSummary,
  onClose,
}: {
  insight: IntelligenceInsight;
  evidenceSummary: string;
  onClose: () => void;
}) {
  const related = insight.relatedEntities.filter(
    (e) => e.kind === "facility" || e.kind === "asset"
  );

  return (
    <aside className="ix-exp-panel" aria-label="Investigation">
      <div className="ix-exp-panel-inner">
        <button type="button" className="ix-exp-panel-back" onClick={onClose}>
          ← Intelligence
        </button>

        <p className="ix-exp-kicker">Finding</p>
        <h2 className="ix-exp-panel-title">{insight.title}</h2>
        <p
          className={`ix-exp-confidence is-${insight.confidence.toLowerCase()}`}
        >
          {confidenceLabel(insight.confidence)}
          {insight.confidenceBasis ? ` — ${insight.confidenceBasis}` : ""}
        </p>

        <section className="ix-exp-block">
          <h3>What we know</h3>
          <p>{insight.fact}</p>
        </section>
        <section className="ix-exp-block">
          <h3>What we think</h3>
          <p>{insight.inference}</p>
        </section>
        {insight.impact ? (
          <section className="ix-exp-block">
            <h3>Why it matters</h3>
            <p>{insight.impact}</p>
          </section>
        ) : null}
        {insight.recommendation ? (
          <section className="ix-exp-block is-reco">
            <h3>Recommendation</h3>
            <p>{insight.recommendation}</p>
          </section>
        ) : null}

        <section className="ix-exp-block">
          <h3>Evidence</h3>
          <p className="ix-exp-panel-evidence-sum">{evidenceSummary}</p>
          {insight.evidence.length > 0 ? (
            <ul className="ix-exp-evidence-list">
              {insight.evidence.map((item) => (
                <li key={`${item.label}-${item.value}`}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ix-exp-muted">
              Supporting counts are available in the related operational
              activity.
            </p>
          )}
        </section>

        <section className="ix-exp-block">
          <h3>Related operations</h3>
          <ul className="ix-exp-related-ops">
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
            <ul className="ix-exp-related-entities">
              {related.map((entity) => (
                <li key={`${entity.kind}-${entity.id}`}>
                  {entity.label || entity.id}
                  <span>{entity.kind}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <Link href="/operations" className="ix-exp-text-action">
            Open in Operations →
          </Link>
        </section>
      </div>
    </aside>
  );
}
