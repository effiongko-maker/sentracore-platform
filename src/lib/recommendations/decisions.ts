import type { SupabaseClient } from "@supabase/supabase-js";

export const RECOMMENDATION_DECISIONS = [
  "accepted",
  "dismissed",
  "deferred",
] as const;

export type RecommendationDecisionValue =
  (typeof RECOMMENDATION_DECISIONS)[number];

export type RecommendationDecisionRecord = {
  id: string;
  organisationId: string;
  operationalEventId: string;
  recommendationActionRunId: string;
  recommendationId: string;
  decision: RecommendationDecisionValue;
  reason: string | null;
  actorProfileId: string;
  createdAt: string;
};

export type CurrentRecommendationDecision = {
  currentDecision: RecommendationDecisionValue;
  decidedAt: string;
  actorProfileId: string;
  reason: string | null;
  decisionId: string;
};

type DecisionRow = {
  id: string;
  organisation_id: string;
  operational_event_id: string;
  recommendation_action_run_id: string;
  recommendation_id: string;
  decision: RecommendationDecisionValue;
  reason: string | null;
  actor_profile_id: string;
  created_at: string;
};

function mapRow(row: DecisionRow): RecommendationDecisionRecord {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    operationalEventId: row.operational_event_id,
    recommendationActionRunId: row.recommendation_action_run_id,
    recommendationId: row.recommendation_id,
    decision: row.decision,
    reason: row.reason,
    actorProfileId: row.actor_profile_id,
    createdAt: row.created_at,
  };
}

export function isRecommendationDecisionValue(
  value: unknown
): value is RecommendationDecisionValue {
  return (
    typeof value === "string" &&
    (RECOMMENDATION_DECISIONS as readonly string[]).includes(value)
  );
}

/**
 * Extract stable recommendation ids from a generate_incident_recommendations
 * action_runs.result payload (top-level and/or data.recommendations).
 */
export function extractRecommendationIdsFromOutcome(
  result: unknown
): Set<string> {
  const ids = new Set<string>();
  if (!result || typeof result !== "object") return ids;

  const root = result as Record<string, unknown>;
  const lists: unknown[] = [];

  if (Array.isArray(root.recommendations)) {
    lists.push(...root.recommendations);
  }

  const data = root.data;
  if (data && typeof data === "object") {
    const nested = (data as Record<string, unknown>).recommendations;
    if (Array.isArray(nested)) lists.push(...nested);
  }

  for (const item of lists) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const id =
      typeof rec.id === "string"
        ? rec.id.trim()
        : typeof rec.key === "string"
          ? rec.key.trim()
          : "";
    if (id) ids.add(id);
  }

  return ids;
}

/**
 * Current org decision for a recommendation = latest created_at row (Option B).
 */
export async function getCurrentRecommendationDecision(
  supabase: SupabaseClient,
  options: {
    organisationId: string;
    recommendationActionRunId: string;
    recommendationId: string;
  }
): Promise<CurrentRecommendationDecision | null> {
  const { data, error } = await supabase
    .from("recommendation_decisions")
    .select(
      "id, organisation_id, operational_event_id, recommendation_action_run_id, recommendation_id, decision, reason, actor_profile_id, created_at"
    )
    .eq("organisation_id", options.organisationId)
    .eq("recommendation_action_run_id", options.recommendationActionRunId)
    .eq("recommendation_id", options.recommendationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to load current recommendation decision: ${error.message}`
    );
  }

  if (!data) return null;

  const row = data as DecisionRow;
  return {
    currentDecision: row.decision,
    decidedAt: row.created_at,
    actorProfileId: row.actor_profile_id,
    reason: row.reason,
    decisionId: row.id,
  };
}

export async function listRecommendationDecisionHistory(
  supabase: SupabaseClient,
  options: {
    organisationId: string;
    recommendationActionRunId: string;
    recommendationId: string;
  }
): Promise<RecommendationDecisionRecord[]> {
  const { data, error } = await supabase
    .from("recommendation_decisions")
    .select(
      "id, organisation_id, operational_event_id, recommendation_action_run_id, recommendation_id, decision, reason, actor_profile_id, created_at"
    )
    .eq("organisation_id", options.organisationId)
    .eq("recommendation_action_run_id", options.recommendationActionRunId)
    .eq("recommendation_id", options.recommendationId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(
      `Failed to load recommendation decision history: ${error.message}`
    );
  }

  return ((data ?? []) as DecisionRow[]).map(mapRow);
}
