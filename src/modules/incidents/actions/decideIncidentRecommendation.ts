"use server";

import {
  decideRecommendation,
  type DecideRecommendationInput,
  type DecideRecommendationResult,
} from "@/lib/actions/decideRecommendation";
import type { ActionResult } from "@/lib/actions/result";

/**
 * UI-facing bridge for recommendation decisions.
 * Delegates to decideRecommendation — no duplicated validation or persistence.
 *
 * Client must send only:
 * operationalEventId, recommendationActionRunId, recommendationId, decision, reason?
 */
export async function decideIncidentRecommendation(
  input: DecideRecommendationInput
): Promise<ActionResult<DecideRecommendationResult>> {
  return decideRecommendation(input);
}
