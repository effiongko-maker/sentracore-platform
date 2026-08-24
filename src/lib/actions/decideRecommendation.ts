"use server";

import {
  ActionError,
  emitActionEvent,
  executeAction,
  type ActionResult,
} from "@/lib/actions";
import {
  extractRecommendationIdsFromOutcome,
  getCurrentRecommendationDecision,
  isRecommendationDecisionValue,
  type RecommendationDecisionRecord,
  type RecommendationDecisionValue,
} from "@/lib/recommendations/decisions";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

export type DecideRecommendationInput = {
  operationalEventId: string;
  recommendationActionRunId: string;
  recommendationId: string;
  decision: RecommendationDecisionValue;
  reason?: string;
};

export type DecideRecommendationResult = {
  decision: RecommendationDecisionRecord;
  current: {
    currentDecision: RecommendationDecisionValue;
    decidedAt: string;
    actorProfileId: string;
    reason: string | null;
    decisionId: string;
  };
  reusedExisting: boolean;
  eventId: string | null;
};

const GENERATE_ACTION_KEY = "facility.generate_incident_recommendations";

/**
 * Authorisation (v1.5):
 * Any authenticated user with an active profile, active organisation, and
 * facility_management enabled may record a decision for their organisation.
 * organisation_id / actor are never taken from the client.
 */
export async function decideRecommendation(
  input: DecideRecommendationInput
): Promise<ActionResult<DecideRecommendationResult>> {
  return executeAction({
    name: "system.decide_recommendation",
    module: "facility_management",
    input,
    handler: async (context, rawInput) => {
      const operationalEventId = rawInput.operationalEventId?.trim() ?? "";
      const recommendationActionRunId =
        rawInput.recommendationActionRunId?.trim() ?? "";
      const recommendationId = rawInput.recommendationId?.trim() ?? "";
      const decision = rawInput.decision;
      const reasonRaw = rawInput.reason?.trim() ?? "";
      const reason = reasonRaw.length > 0 ? reasonRaw : null;

      if (!operationalEventId) {
        throw new ActionError(
          "VALIDATION_ERROR",
          "operationalEventId is required."
        );
      }
      if (!recommendationActionRunId) {
        throw new ActionError(
          "VALIDATION_ERROR",
          "recommendationActionRunId is required."
        );
      }
      if (!recommendationId) {
        throw new ActionError(
          "VALIDATION_ERROR",
          "recommendationId is required."
        );
      }
      if (!isRecommendationDecisionValue(decision)) {
        throw new ActionError(
          "VALIDATION_ERROR",
          "decision must be accepted, dismissed, or deferred."
        );
      }

      const cookieStore = await cookies();
      const supabase = createClient(cookieStore);

      const { data: run, error: runError } = await supabase
        .from("action_runs")
        .select(
          "id, organisation_id, operational_event_id, action_key, status, result"
        )
        .eq("id", recommendationActionRunId)
        .maybeSingle();

      if (runError || !run) {
        throw new ActionError(
          "VALIDATION_ERROR",
          "Recommendation action run was not found."
        );
      }

      if (String(run.organisation_id) !== context.organisation.id) {
        throw new ActionError(
          "FORBIDDEN",
          "Recommendation action run is outside your organisation."
        );
      }

      if (String(run.operational_event_id) !== operationalEventId) {
        throw new ActionError(
          "VALIDATION_ERROR",
          "recommendationActionRunId does not belong to the given operational event."
        );
      }

      if (String(run.action_key) !== GENERATE_ACTION_KEY) {
        throw new ActionError(
          "VALIDATION_ERROR",
          "Action run is not a recommendation aggregation run."
        );
      }

      if (String(run.status) !== "succeeded") {
        throw new ActionError(
          "VALIDATION_ERROR",
          "Recommendation action run did not succeed."
        );
      }

      const recommendationIds = extractRecommendationIdsFromOutcome(run.result);
      if (!recommendationIds.has(recommendationId)) {
        throw new ActionError(
          "VALIDATION_ERROR",
          "recommendationId was not found in the recommendation action outcome."
        );
      }

      // Soft idempotency: identical current decision by same actor → reuse.
      const existing = await getCurrentRecommendationDecision(supabase, {
        organisationId: context.organisation.id,
        recommendationActionRunId,
        recommendationId,
      });

      if (
        existing &&
        existing.currentDecision === decision &&
        existing.actorProfileId === context.userId &&
        (existing.reason ?? null) === reason
      ) {
        return {
          decision: {
            id: existing.decisionId,
            organisationId: context.organisation.id,
            operationalEventId,
            recommendationActionRunId,
            recommendationId,
            decision: existing.currentDecision,
            reason: existing.reason,
            actorProfileId: existing.actorProfileId,
            createdAt: existing.decidedAt,
          },
          current: existing,
          reusedExisting: true,
          eventId: null,
        };
      }

      const { data: inserted, error: insertError } = await supabase
        .from("recommendation_decisions")
        .insert({
          organisation_id: context.organisation.id,
          operational_event_id: operationalEventId,
          recommendation_action_run_id: recommendationActionRunId,
          recommendation_id: recommendationId,
          decision,
          reason,
          actor_profile_id: context.userId,
        })
        .select(
          "id, organisation_id, operational_event_id, recommendation_action_run_id, recommendation_id, decision, reason, actor_profile_id, created_at"
        )
        .single();

      if (insertError || !inserted) {
        console.error("[system.decide_recommendation] insert failed", {
          message: insertError?.message,
          code: insertError?.code,
        });
        throw new ActionError(
          "INTERNAL_ERROR",
          "Failed to persist recommendation decision."
        );
      }

      const decisionRecord: RecommendationDecisionRecord = {
        id: String(inserted.id),
        organisationId: String(inserted.organisation_id),
        operationalEventId: String(inserted.operational_event_id),
        recommendationActionRunId: String(
          inserted.recommendation_action_run_id
        ),
        recommendationId: String(inserted.recommendation_id),
        decision: inserted.decision as RecommendationDecisionValue,
        reason: inserted.reason ? String(inserted.reason) : null,
        actorProfileId: String(inserted.actor_profile_id),
        createdAt: String(inserted.created_at),
      };

      let eventId: string | null = null;
      try {
        const event = await emitActionEvent(context, {
          eventType: "system.recommendation_decided",
          entityType: "recommendation_decision",
          entityId: decisionRecord.id,
          data: {
            recommendationDecisionId: decisionRecord.id,
            recommendationId: decisionRecord.recommendationId,
            decision: decisionRecord.decision,
            reason: decisionRecord.reason,
            recommendationActionRunId:
              decisionRecord.recommendationActionRunId,
            originatingOperationalEventId: operationalEventId,
          },
        });
        eventId = event.id;
      } catch (eventError) {
        console.error(
          "[system.decide_recommendation] operational event failed",
          {
            decisionId: decisionRecord.id,
            error:
              eventError instanceof Error
                ? eventError.message
                : "unknown event error",
          }
        );
      }

      const current = await getCurrentRecommendationDecision(supabase, {
        organisationId: context.organisation.id,
        recommendationActionRunId,
        recommendationId,
      });

      if (!current) {
        throw new ActionError(
          "INTERNAL_ERROR",
          "Decision was saved but current state could not be loaded."
        );
      }

      return {
        decision: decisionRecord,
        current,
        reusedExisting: false,
        eventId,
      };
    },
  });
}
