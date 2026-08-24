"use client";

import { Badge } from "@/components/ui/Badge";
import type {
  IntelligenceRecommendationResponseView,
  IntelligenceRecommendationView,
  IntelligenceRiskView,
  IntelligenceSignalView,
} from "@/lib/intelligence";
import type { RecommendationDecisionValue } from "@/lib/recommendations/decisions";
import type { StatusVariant } from "@/types";
import {
  humanizeRecommendationCopy,
  synthesizeIncidentIntelligence,
} from "./humanizeIntelligence";
import { RecommendationDecisionActions } from "./RecommendationDecisionActions";

function priorityVariant(priority: string | undefined): StatusVariant {
  switch ((priority ?? "").toLowerCase()) {
    case "urgent":
      return "danger";
    case "high":
      return "warning";
    case "normal":
      return "info";
    case "low":
      return "neutral";
    default:
      return "default";
  }
}

function priorityLabel(priority: string): string {
  switch (priority.toLowerCase()) {
    case "urgent":
      return "Urgent priority";
    case "high":
      return "High priority";
    case "normal":
      return "Normal priority";
    case "low":
      return "Low priority";
    default:
      return priority;
  }
}

function decisionLabel(decision: RecommendationDecisionValue): string {
  switch (decision) {
    case "accepted":
      return "Accepted";
    case "dismissed":
      return "Recommendation dismissed";
    case "deferred":
      return "Action deferred";
  }
}

function decisionVariant(
  decision: RecommendationDecisionValue
): StatusVariant {
  switch (decision) {
    case "accepted":
      return "success";
    case "dismissed":
      return "neutral";
    case "deferred":
      return "info";
  }
}

function isGenericRiskRecommendation(
  recommendation: IntelligenceRecommendationView
): boolean {
  const title = recommendation.title ?? "";
  const reason = recommendation.reason ?? "";
  return (
    /prioritise_investigation/i.test(reason) ||
    /review_facility_asset_conditions/i.test(reason) ||
    /review_facility_incident_pattern/i.test(reason) ||
    /prioritise investigation and corrective action/i.test(title) ||
    /review contributing facility and asset conditions/i.test(title) ||
    /review recent incident pattern/i.test(title)
  );
}

function mergeRecommendations(
  eventSpecific: IntelligenceRecommendationView[],
  humanResponse: IntelligenceRecommendationResponseView[],
  priorityAction: string | null
): IntelligenceRecommendationResponseView[] {
  const base =
    humanResponse.length > 0
      ? humanResponse
      : eventSpecific.map((recommendation) => ({
          recommendation,
          currentDecision: null,
          decisionHistory: [],
          feedback: [],
        }));

  if (!priorityAction) return base;

  // Collapse overlapping generic risk recommendations into one synthesised action.
  const generics = base.filter((item) =>
    isGenericRiskRecommendation(item.recommendation)
  );
  const specifics = base.filter(
    (item) => !isGenericRiskRecommendation(item.recommendation)
  );

  if (generics.length === 0) return base;

  return [
    {
      ...generics[0],
      recommendation: {
        ...generics[0].recommendation,
        title: "Priority action",
        description: priorityAction,
      },
    },
    ...specifics,
  ];
}

export function IntelligenceRecommendationList({
  recommendations,
  humanResponse,
  risk,
  signals,
  operationalEventId,
  recommendationActionRunId,
  onDecisionRecorded,
}: {
  recommendations: IntelligenceRecommendationView[];
  humanResponse: IntelligenceRecommendationResponseView[];
  risk: IntelligenceRiskView | null;
  signals: IntelligenceSignalView[];
  /** Opaque — never displayed. */
  operationalEventId: string;
  /** Opaque — never displayed. Null when recommendations cannot be decided yet. */
  recommendationActionRunId: string | null;
  onDecisionRecorded: () => void | Promise<void>;
}) {
  const { priorityAction } = synthesizeIncidentIntelligence({ risk, signals });
  const items = mergeRecommendations(
    recommendations,
    humanResponse,
    priorityAction
  );

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">
        Recommended actions
      </h3>

      {items.length === 0 ? (
        priorityAction ? (
          <div className="space-y-1.5 rounded-sc border border-border/60 px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
              Priority action
            </p>
            <p className="text-sm leading-relaxed text-foreground">
              {priorityAction}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted">
            No recommendations have been generated.
          </p>
        )
      ) : (
        <ul className="space-y-4">
          {items.map(({ recommendation, currentDecision, feedback }, index) => {
            const latestFeedbackSummary = feedback
              .map((entry) => entry.summary)
              .find((summary) => typeof summary === "string" && summary.trim());
            const canDecide =
              currentDecision === null &&
              Boolean(recommendationActionRunId) &&
              Boolean(operationalEventId);

            const copy = humanizeRecommendationCopy({
              recommendation,
              priorityAction: index === 0 ? priorityAction : null,
            });
            const isPriorityAction = /priority action/i.test(copy.title);

            return (
              <li
                key={recommendation.id}
                className="space-y-2 rounded-sc border border-border/60 px-3 py-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  {recommendation.priority ? (
                    <Badge
                      variant={priorityVariant(recommendation.priority)}
                      className="normal-case"
                    >
                      {priorityLabel(recommendation.priority)}
                    </Badge>
                  ) : null}
                  {currentDecision ? (
                    <Badge
                      variant={decisionVariant(currentDecision.decision)}
                      className="normal-case"
                    >
                      {decisionLabel(currentDecision.decision)}
                    </Badge>
                  ) : null}
                </div>

                {isPriorityAction ? (
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                    Priority action
                  </p>
                ) : null}

                {isPriorityAction && copy.description ? (
                  <p className="text-sm leading-relaxed text-foreground">
                    {copy.description}
                  </p>
                ) : (
                  <>
                    <p className="text-sm font-medium text-foreground">
                      {copy.title}
                    </p>
                    {copy.description ? (
                      <p className="text-sm leading-relaxed text-muted">
                        {copy.description}
                      </p>
                    ) : null}
                  </>
                )}

                {recommendation.suggestedAction &&
                !/^[a-z0-9_]+\.[a-z0-9_]+$/i.test(
                  recommendation.suggestedAction.trim()
                ) &&
                recommendation.suggestedAction.trim() !== copy.description ? (
                  <p className="text-sm text-muted">
                    {recommendation.suggestedAction}
                  </p>
                ) : null}

                {currentDecision?.reason?.trim() ? (
                  <p className="text-xs leading-relaxed text-muted">
                    Reason: {currentDecision.reason.trim()}
                  </p>
                ) : null}

                {latestFeedbackSummary ? (
                  <p className="text-xs leading-relaxed text-muted">
                    {latestFeedbackSummary.trim()}
                  </p>
                ) : null}

                {canDecide && recommendationActionRunId ? (
                  <RecommendationDecisionActions
                    operationalEventId={operationalEventId}
                    recommendationActionRunId={recommendationActionRunId}
                    recommendationId={recommendation.id}
                    onDecided={onDecisionRecorded}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
