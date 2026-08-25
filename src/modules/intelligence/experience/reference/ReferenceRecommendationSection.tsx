"use client";

import { ArrowRight, Sparkles } from "lucide-react";
import type { BriefingViewModel } from "../../view-model/buildBriefingViewModel";
import { Sparkline } from "../visuals/Sparkline";

export function ReferenceRecommendationSection({
  vm,
}: {
  vm: BriefingViewModel;
}) {
  const { recommendationHealth: health } = vm;
  const pattern = health.responsePatterns[0];

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
          <p className="ix-ref-triage-meta">+25% vs last 30 days</p>
        </article>
        <article className="ix-ref-triage-card ix-ref-triage-deferred">
          <Sparkline id="deferred" tone="deferred" />
          <p className="ix-ref-triage-value">
            {String(health.deferred).padStart(2, "0")}
          </p>
          <p className="ix-ref-triage-label">Deferred</p>
          <p className="ix-ref-triage-meta">+15% vs last 30 days</p>
        </article>
        <article className="ix-ref-triage-card ix-ref-triage-dismissed">
          <Sparkline id="dismissed" tone="dismissed" />
          <p className="ix-ref-triage-value">
            {String(health.dismissed).padStart(2, "0")}
          </p>
          <p className="ix-ref-triage-label">Dismissed</p>
          <p className="ix-ref-triage-meta">+30% vs last 30 days</p>
        </article>
      </div>

      {pattern ? (
        <div className="ix-ref-note-banner">
          <Sparkles className="h-4 w-4 shrink-0 text-[#fb923c]" aria-hidden />
          <p>{pattern.summary || pattern.title}</p>
          <button type="button" className="ix-ref-note-action">
            Explore reasons
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ) : null}
    </section>
  );
}
