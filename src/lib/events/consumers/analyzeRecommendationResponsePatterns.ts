import { createAdminClient } from "@/utils/supabase/admin";
import {
  isRecommendationDecisionValue,
  type RecommendationDecisionValue,
} from "@/lib/recommendations/decisions";
import {
  isActionOutcome,
  type ActionOutcome,
  type ActionSignal,
} from "./outcome";
import type { OperationalEventConsumer } from "./types";

const GENERATE_ACTION_KEY = "facility.generate_incident_recommendations";
const RISK_ACTION_KEY = "facility.assess_incident_risk";
const WINDOW_DAYS = 30;

const THRESHOLDS = {
  repeatedCriticalDismissal: 2,
  repeatedCriticalDeferral: 2,
  repeatedRecommendationAcceptance: 3,
  repeatedDismissal: 4,
} as const;

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

type EventRow = {
  id: string;
  organisation_id: string;
  data: Record<string, unknown> | null;
};

type ActionRunRow = {
  id: string;
  operational_event_id: string;
  status: string;
  result: unknown;
};

type EnrichedDecision = {
  id: string;
  decision: RecommendationDecisionValue;
  recommendationId: string;
  recommendationActionRunId: string;
  operationalEventId: string;
  actorProfileId: string;
  reason: string | null;
  createdAt: string;
  facilityId: string | null;
  riskLevel: string | null;
  riskResolved: boolean;
};

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readRiskLevel(result: unknown): string | null {
  if (!isActionOutcome(result)) return null;
  if (result.status !== "succeeded") return null;
  const level = result.data?.riskLevel;
  return typeof level === "string" && level.trim() ? level.trim() : null;
}

function daysAgoIso(from: Date, days: number): string {
  return new Date(from.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Exact no-op dedupe fingerprint.
 * Soft idempotency already blocks most duplicates via decideRecommendation;
 * this collapses identical service-role / edge-case duplicate rows.
 * Distinct decisions (accepted → deferred) remain separate.
 */
function dedupeFingerprint(row: DecisionRow): string {
  return [
    row.recommendation_action_run_id,
    row.recommendation_id,
    row.decision,
    row.actor_profile_id,
    row.reason ?? "",
  ].join("|");
}

function dedupeExactNoOps(rows: DecisionRow[]): DecisionRow[] {
  const byFingerprint = new Map<string, DecisionRow>();
  const sorted = [...rows].sort(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)
  );
  for (const row of sorted) {
    const key = dedupeFingerprint(row);
    if (!byFingerprint.has(key)) {
      byFingerprint.set(key, row);
    }
  }
  return [...byFingerprint.values()];
}

function recommendationExistsInOutcome(
  result: unknown,
  recommendationId: string
): boolean {
  if (!result || typeof result !== "object") return false;
  const root = result as Record<string, unknown>;
  const lists: unknown[] = [];
  if (Array.isArray(root.recommendations)) lists.push(...root.recommendations);
  if (root.data && typeof root.data === "object") {
    const nested = (root.data as Record<string, unknown>).recommendations;
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
    if (id === recommendationId) return true;
  }
  return false;
}

/**
 * Deterministic organisational recommendation-response patterns (v1.7).
 * Observes repeated decisions — does not judge humans or recalculate intelligence.
 */
export const analyzeRecommendationResponsePatternsConsumer: OperationalEventConsumer =
  async (ctx) => {
    const { event, organisationId, actionKey } = ctx;
    const admin = createAdminClient();
    const analysedAt = new Date(event.occurredAt || event.createdAt || Date.now());
    const windowFrom = daysAgoIso(analysedAt, WINDOW_DAYS);
    const windowTo = analysedAt.toISOString();

    const decisionId =
      asNonEmptyString(event.entityId) ??
      asNonEmptyString(event.data?.recommendationDecisionId);

    if (!decisionId) {
      return {
        status: "failed",
        summary:
          "Recommendation response pattern analysis failed: decision id missing from event.",
        data: { actionKey, eventId: event.id, reason: "missing_decision_id" },
        signals: [],
      };
    }

    const { data: decisionRow, error: decisionError } = await admin
      .from("recommendation_decisions")
      .select(
        "id, organisation_id, operational_event_id, recommendation_action_run_id, recommendation_id, decision, reason, actor_profile_id, created_at"
      )
      .eq("id", decisionId)
      .maybeSingle();

    if (decisionError || !decisionRow) {
      return {
        status: "failed",
        summary:
          "Recommendation response pattern analysis failed: recommendation decision was not found.",
        data: {
          actionKey,
          recommendationDecisionId: decisionId,
          reason: "decision_not_found",
        },
        signals: [],
      };
    }

    const currentDecision = decisionRow as DecisionRow;

    if (currentDecision.organisation_id !== organisationId) {
      return {
        status: "failed",
        summary:
          "Recommendation response pattern analysis failed: organisation boundary mismatch.",
        data: {
          actionKey,
          recommendationDecisionId: currentDecision.id,
          reason: "organisation_mismatch",
        },
        signals: [],
      };
    }

    if (!isRecommendationDecisionValue(currentDecision.decision)) {
      return {
        status: "failed",
        summary:
          "Recommendation response pattern analysis failed: invalid decision value.",
        data: {
          actionKey,
          recommendationDecisionId: currentDecision.id,
          reason: "invalid_decision_value",
        },
        signals: [],
      };
    }

    const { data: recRun, error: recRunError } = await admin
      .from("action_runs")
      .select(
        "id, organisation_id, operational_event_id, action_key, status, result"
      )
      .eq("id", currentDecision.recommendation_action_run_id)
      .maybeSingle();

    if (recRunError || !recRun) {
      return {
        status: "failed",
        summary:
          "Recommendation response pattern analysis failed: recommendation action run was not found.",
        data: {
          actionKey,
          recommendationDecisionId: currentDecision.id,
          reason: "recommendation_run_missing",
        },
        signals: [],
      };
    }

    if (
      String(recRun.organisation_id) !== organisationId ||
      String(recRun.operational_event_id) !==
        currentDecision.operational_event_id ||
      String(recRun.action_key) !== GENERATE_ACTION_KEY
    ) {
      return {
        status: "failed",
        summary:
          "Recommendation response pattern analysis failed: recommendation action run is invalid for this decision.",
        data: {
          actionKey,
          recommendationDecisionId: currentDecision.id,
          reason: "recommendation_run_invalid",
        },
        signals: [],
      };
    }

    if (
      !recommendationExistsInOutcome(
        recRun.result,
        currentDecision.recommendation_id
      )
    ) {
      return {
        status: "failed",
        summary:
          "Recommendation response pattern analysis failed: recommendation_id was not found in the recommendation action outcome.",
        data: {
          actionKey,
          recommendationDecisionId: currentDecision.id,
          recommendationId: currentDecision.recommendation_id,
          reason: "recommendation_not_in_outcome",
        },
        signals: [],
      };
    }

    const { data: originEvent, error: originError } = await admin
      .from("operational_events")
      .select("id, organisation_id, data")
      .eq("id", currentDecision.operational_event_id)
      .maybeSingle();

    if (originError || !originEvent) {
      return {
        status: "failed",
        summary:
          "Recommendation response pattern analysis failed: originating operational event was not found.",
        data: {
          actionKey,
          recommendationDecisionId: currentDecision.id,
          reason: "origin_event_missing",
        },
        signals: [],
      };
    }

    if (String(originEvent.organisation_id) !== organisationId) {
      return {
        status: "failed",
        summary:
          "Recommendation response pattern analysis failed: originating event organisation mismatch.",
        data: {
          actionKey,
          recommendationDecisionId: currentDecision.id,
          reason: "origin_event_org_mismatch",
        },
        signals: [],
      };
    }

    const scopeFacilityId = asNonEmptyString(
      (originEvent as EventRow).data?.facilityId
    );
    const scopeType: "facility" | "organisation" = scopeFacilityId
      ? "facility"
      : "organisation";

    // 1) Org-scoped decision history in window (includes current by created_at).
    const { data: historyRows, error: historyError } = await admin
      .from("recommendation_decisions")
      .select(
        "id, organisation_id, operational_event_id, recommendation_action_run_id, recommendation_id, decision, reason, actor_profile_id, created_at"
      )
      .eq("organisation_id", organisationId)
      .gte("created_at", windowFrom)
      .lte("created_at", windowTo)
      .order("created_at", { ascending: true })
      .limit(500);

    if (historyError) {
      return {
        status: "failed",
        summary:
          "Recommendation response pattern analysis failed: could not load decision history.",
        data: {
          actionKey,
          recommendationDecisionId: currentDecision.id,
          reason: "history_load_failed",
          detail: historyError.message,
        },
        signals: [],
      };
    }

    let history = (historyRows ?? []) as DecisionRow[];

    // Ensure the current decision is included even if timestamp edge-cases exclude it.
    if (!history.some((row) => row.id === currentDecision.id)) {
      history = [...history, currentDecision];
    }

    history = dedupeExactNoOps(history);

    const eventIds = [
      ...new Set(history.map((row) => row.operational_event_id)),
    ];

    // 2) Batch originating events for facility context.
    const facilityByEventId = new Map<string, string | null>();
    if (eventIds.length > 0) {
      const { data: events, error: eventsError } = await admin
        .from("operational_events")
        .select("id, organisation_id, data")
        .eq("organisation_id", organisationId)
        .in("id", eventIds);

      if (eventsError) {
        return {
          status: "failed",
          summary:
            "Recommendation response pattern analysis failed: could not load originating events.",
          data: {
            actionKey,
            recommendationDecisionId: currentDecision.id,
            reason: "events_load_failed",
            detail: eventsError.message,
          },
          signals: [],
        };
      }

      for (const ev of (events ?? []) as EventRow[]) {
        facilityByEventId.set(
          ev.id,
          asNonEmptyString(ev.data?.facilityId)
        );
      }
    }

    // 3) Batch risk assessments for originating events.
    const riskByEventId = new Map<string, string | null>();
    if (eventIds.length > 0) {
      const { data: riskRuns, error: riskError } = await admin
        .from("action_runs")
        .select("id, operational_event_id, status, result, created_at")
        .eq("organisation_id", organisationId)
        .eq("action_key", RISK_ACTION_KEY)
        .eq("status", "succeeded")
        .in("operational_event_id", eventIds)
        .order("created_at", { ascending: false });

      if (riskError) {
        console.error(
          "[system.analyze_recommendation_response_patterns] risk batch failed",
          { error: riskError.message }
        );
      } else {
        for (const run of (riskRuns ?? []) as ActionRunRow[]) {
          if (riskByEventId.has(run.operational_event_id)) continue;
          riskByEventId.set(
            run.operational_event_id,
            readRiskLevel(run.result)
          );
        }
      }
    }

    const enriched: EnrichedDecision[] = history.map((row) => {
      const facilityId =
        facilityByEventId.get(row.operational_event_id) ?? null;
      const hasRiskEntry = riskByEventId.has(row.operational_event_id);
      const riskLevel = hasRiskEntry
        ? riskByEventId.get(row.operational_event_id) ?? null
        : null;
      return {
        id: row.id,
        decision: row.decision,
        recommendationId: row.recommendation_id,
        recommendationActionRunId: row.recommendation_action_run_id,
        operationalEventId: row.operational_event_id,
        actorProfileId: row.actor_profile_id,
        reason: row.reason,
        createdAt: row.created_at,
        facilityId,
        riskLevel,
        riskResolved: hasRiskEntry && riskLevel != null,
      };
    });

    const inScope = enriched.filter((row) => {
      if (scopeType === "organisation") return true;
      return row.facilityId != null && row.facilityId === scopeFacilityId;
    });

    const criticalDismissals = inScope.filter(
      (row) => row.decision === "dismissed" && row.riskLevel === "critical"
    );
    const criticalDeferrals = inScope.filter(
      (row) => row.decision === "deferred" && row.riskLevel === "critical"
    );
    const dismissals = inScope.filter((row) => row.decision === "dismissed");
    const sameRecommendationAcceptances = enriched.filter(
      (row) =>
        row.decision === "accepted" &&
        row.recommendationId === currentDecision.recommendation_id
    );

    const unresolvedForRiskRules = inScope.filter(
      (row) =>
        (row.decision === "dismissed" || row.decision === "deferred") &&
        !row.riskResolved
    );

    const signals: ActionSignal[] = [];

    if (
      criticalDismissals.length >= THRESHOLDS.repeatedCriticalDismissal
    ) {
      signals.push({
        key: "recommendation.repeated_critical_dismissal",
        severity: "critical",
        summary:
          "Multiple recommendations generated under critical risk assessments have been dismissed within the last 30 days.",
        evidence: {
          count: criticalDismissals.length,
          threshold: THRESHOLDS.repeatedCriticalDismissal,
          windowDays: WINDOW_DAYS,
          scope: scopeType,
          facilityId: scopeFacilityId,
          riskLevel: "critical",
          decision: "dismissed",
          sourceDecisionIds: criticalDismissals.map((d) => d.id).slice(0, 20),
        },
      });
    }

    if (criticalDeferrals.length >= THRESHOLDS.repeatedCriticalDeferral) {
      signals.push({
        key: "recommendation.repeated_critical_deferral",
        severity: "warning",
        summary:
          "Multiple recommendations generated under critical risk assessments have been deferred within the last 30 days.",
        evidence: {
          count: criticalDeferrals.length,
          threshold: THRESHOLDS.repeatedCriticalDeferral,
          windowDays: WINDOW_DAYS,
          scope: scopeType,
          facilityId: scopeFacilityId,
          riskLevel: "critical",
          decision: "deferred",
          sourceDecisionIds: criticalDeferrals.map((d) => d.id).slice(0, 20),
        },
      });
    }

    if (
      sameRecommendationAcceptances.length >=
      THRESHOLDS.repeatedRecommendationAcceptance
    ) {
      signals.push({
        key: "recommendation.repeated_recommendation_acceptance",
        severity: "info",
        summary:
          "The same recommendation identifier has been accepted multiple times within the last 30 days.",
        evidence: {
          count: sameRecommendationAcceptances.length,
          threshold: THRESHOLDS.repeatedRecommendationAcceptance,
          windowDays: WINDOW_DAYS,
          scope: "organisation",
          facilityId: scopeFacilityId,
          recommendationId: currentDecision.recommendation_id,
          decision: "accepted",
          sourceDecisionIds: sameRecommendationAcceptances
            .map((d) => d.id)
            .slice(0, 20),
        },
      });
    }

    if (dismissals.length >= THRESHOLDS.repeatedDismissal) {
      signals.push({
        key: "recommendation.repeated_dismissal",
        severity: "warning",
        summary:
          "Multiple recommendation decisions have been recorded as dismissed within the last 30 days.",
        evidence: {
          count: dismissals.length,
          threshold: THRESHOLDS.repeatedDismissal,
          windowDays: WINDOW_DAYS,
          scope: scopeType,
          facilityId: scopeFacilityId,
          decision: "dismissed",
          sourceDecisionIds: dismissals.map((d) => d.id).slice(0, 20),
        },
      });
    }

    const riskDependentMateriallyAffected =
      unresolvedForRiskRules.length > 0;

    const status: ActionOutcome["status"] = riskDependentMateriallyAffected
      ? "partial"
      : "succeeded";

    const summary =
      signals.length === 0
        ? "No deterministic recommendation response pattern currently meets the configured threshold."
        : `Detected ${signals.length} deterministic recommendation response pattern signal(s) over ${WINDOW_DAYS} days (${scopeType} scope).`;

    const outcome: ActionOutcome = {
      status,
      summary,
      data: {
        actionKey,
        recommendationDecisionId: currentDecision.id,
        recommendationId: currentDecision.recommendation_id,
        decision: currentDecision.decision,
        reason: currentDecision.reason,
        scope: {
          type: scopeType,
          facilityId: scopeFacilityId,
        },
        window: {
          days: WINDOW_DAYS,
          from: windowFrom,
          to: windowTo,
        },
        thresholds: THRESHOLDS,
        counts: {
          criticalDismissals: criticalDismissals.length,
          criticalDeferrals: criticalDeferrals.length,
          sameRecommendationAcceptances: sameRecommendationAcceptances.length,
          dismissals: dismissals.length,
        },
        historyAnalysed: inScope.length,
        historyAnalysedOrganisation: enriched.length,
        unresolvedRiskDecisionCount: unresolvedForRiskRules.length,
        currentDecisionIncluded: enriched.some(
          (row) => row.id === currentDecision.id
        ),
        sourceRecommendationActionRunId: currentDecision.recommendation_action_run_id,
        sourceOperationalEventId: currentDecision.operational_event_id,
        decisionEventId: event.id,
        dedupe: {
          strategy:
            "exact_fingerprint(recommendation_action_run_id,recommendation_id,decision,actor_profile_id,reason)",
          note: "Keeps earliest identical no-op; state changes remain distinct.",
        },
      },
      signals,
    };

    return outcome;
  };
