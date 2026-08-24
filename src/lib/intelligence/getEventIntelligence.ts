import { ActionError } from "@/lib/actions/errors";
import { hasModule } from "@/lib/actions/moduleAccess";
import { getPlatformSession } from "@/lib/auth/session";
import {
  isActionOutcome,
  type ActionOutcome,
  type ActionSignal,
  type DecisionReadyRecommendation,
} from "@/lib/events/consumers/outcome";
import { OperationalEventTypes } from "@/lib/events/taxonomy";
import {
  isRecommendationDecisionValue,
  type RecommendationDecisionValue,
} from "@/lib/recommendations/decisions";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ConsumerRunState,
  EventIntelligence,
  IntelligenceDecisionRecordView,
  IntelligenceFeedbackView,
  IntelligenceRecommendationResponseView,
  IntelligenceRecommendationView,
  IntelligenceResponsePatternView,
  IntelligenceRiskView,
  IntelligenceSignalView,
} from "./types";

const CORE_ACTION_KEYS = {
  acknowledge: "system.acknowledge_event",
  signalAnalysis: "facility.analyze_incident_signals",
  riskAssessment: "facility.assess_incident_risk",
  recommendationGeneration: "facility.generate_incident_recommendations",
} as const;

const FEEDBACK_ACTION_KEY = "system.assess_recommendation_feedback";
const PATTERN_ACTION_KEY = "system.analyze_recommendation_response_patterns";

const SUPPORTED_EVENT_TYPES = new Set<string>([
  OperationalEventTypes.FACILITY_INCIDENT_REPORTED,
]);

type EventRow = {
  id: string;
  organisation_id: string;
  department_id: string | null;
  module_id: string;
  event_type: string;
  entity_type: string | null;
  entity_id: string | null;
  actor_profile_id: string | null;
  occurred_at: string;
  created_at: string;
  data: Record<string, unknown> | null;
  source: string;
};

type ActionRunRow = {
  id: string;
  organisation_id: string;
  operational_event_id: string;
  action_key: string;
  status: string;
  result: unknown;
  error: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
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

/**
 * Authoritative run for an event + action_key:
 * latest created_at among status=succeeded.
 * Duplicates are possible (no unique constraint).
 */
function pickLatestSucceeded(
  runs: ActionRunRow[],
  actionKey: string
): ActionRunRow | null {
  const matches = runs
    .filter((r) => r.action_key === actionKey && r.status === "succeeded")
    .sort(
      (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)
    );
  return matches[0] ?? null;
}

function pickLatestAny(
  runs: ActionRunRow[],
  actionKey: string
): ActionRunRow | null {
  const matches = runs
    .filter((r) => r.action_key === actionKey)
    .sort(
      (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)
    );
  return matches[0] ?? null;
}

function parseOutcome(result: unknown): ActionOutcome | null {
  return isActionOutcome(result) ? result : null;
}

function consumerStateFromRun(run: ActionRunRow | null): ConsumerRunState {
  if (!run) return "missing";
  if (run.status !== "succeeded") return "failed";
  const outcome = parseOutcome(run.result);
  if (!outcome) return "succeeded";
  if (outcome.status === "partial") return "partial";
  if (outcome.status === "failed") return "failed";
  return "succeeded";
}

function normalizeSignals(
  outcome: ActionOutcome | null,
  actionRunId: string
): IntelligenceSignalView[] {
  if (!outcome?.signals?.length) return [];
  return outcome.signals
    .filter(
      (s): s is ActionSignal =>
        !!s &&
        typeof s === "object" &&
        typeof s.key === "string" &&
        typeof s.summary === "string"
    )
    .map((s) => ({
      key: s.key,
      severity: String(s.severity ?? "info"),
      summary: s.summary,
      evidence:
        s.evidence && typeof s.evidence === "object"
          ? (s.evidence as Record<string, unknown>)
          : {},
      sourceActionRunId: actionRunId,
    }));
}

function normalizeRecommendations(
  outcome: ActionOutcome | null
): IntelligenceRecommendationView[] {
  if (!outcome) return [];
  const lists: unknown[] = [];
  if (Array.isArray(outcome.recommendations)) {
    lists.push(...outcome.recommendations);
  }
  if (Array.isArray(outcome.data?.recommendations)) {
    lists.push(...(outcome.data.recommendations as unknown[]));
  }

  const byId = new Map<string, IntelligenceRecommendationView>();
  for (const item of lists) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const id =
      typeof rec.id === "string"
        ? rec.id.trim()
        : typeof rec.key === "string"
          ? rec.key.trim()
          : "";
    if (!id || byId.has(id)) continue;
    byId.set(id, {
      id,
      title: typeof rec.title === "string" ? rec.title : id,
      description:
        typeof rec.description === "string" ? rec.description : undefined,
      suggestedAction:
        typeof rec.suggestedAction === "string"
          ? rec.suggestedAction
          : undefined,
      reason:
        typeof rec.reason === "string"
          ? rec.reason
          : typeof rec.reasoning === "string"
            ? rec.reasoning
            : "",
      priority: rec.priority as DecisionReadyRecommendation["priority"] | undefined,
      evidence: Array.isArray(rec.evidence) ? rec.evidence : [],
      sources: Array.isArray(rec.sources) ? rec.sources : [],
    });
  }
  return [...byId.values()];
}

function normalizeRisk(run: ActionRunRow | null): IntelligenceRiskView | null {
  if (!run) return null;
  const outcome = parseOutcome(run.result);
  const data = outcome?.data ?? {};
  return {
    riskScore: typeof data.riskScore === "number" ? data.riskScore : null,
    riskLevel: typeof data.riskLevel === "string" ? data.riskLevel : null,
    summary: outcome?.summary ?? null,
    outcomeStatus: outcome?.status ?? null,
    factors: Array.isArray(data.factors) ? data.factors : [],
    assessment:
      data.assessment && typeof data.assessment === "object"
        ? (data.assessment as Record<string, unknown>)
        : null,
    recommendations: Array.isArray(outcome?.recommendations)
      ? outcome!.recommendations
      : [],
    sourceActionRunId: run.id,
  };
}

function toDecisionView(row: DecisionRow): IntelligenceDecisionRecordView {
  return {
    decisionId: row.id,
    decision: row.decision,
    reason: row.reason,
    actorProfileId: row.actor_profile_id,
    decidedAt: row.created_at,
  };
}

function computeStatus(options: {
  supported: boolean;
  eventType: string;
  consumers: EventIntelligence["status"]["consumers"];
}): EventIntelligence["status"] {
  const notes: string[] = [];
  if (!options.supported) {
    return {
      state: "unavailable",
      supported: false,
      eventType: options.eventType,
      consumers: {
        acknowledge: "unsupported",
        signalAnalysis: "unsupported",
        riskAssessment: "unsupported",
        recommendationGeneration: "unsupported",
      },
      notes: ["Event type is not supported by the Intelligence Read Model v1.8."],
    };
  }

  const core = [
    options.consumers.acknowledge,
    options.consumers.signalAnalysis,
    options.consumers.riskAssessment,
    options.consumers.recommendationGeneration,
  ];

  if (core.some((s) => s === "missing" || s === "failed")) {
    notes.push("One or more core intelligence action runs are missing or not successful.");
    return {
      state: "processing",
      supported: true,
      eventType: options.eventType,
      consumers: options.consumers,
      notes,
    };
  }

  if (core.some((s) => s === "partial")) {
    notes.push("Core intelligence is available but one or more ActionOutcomes are partial.");
    return {
      state: "partial",
      supported: true,
      eventType: options.eventType,
      consumers: options.consumers,
      notes,
    };
  }

  return {
    state: "ready",
    supported: true,
    eventType: options.eventType,
    consumers: options.consumers,
    notes,
  };
}

/**
 * Assemble intelligence for an already-authorized event (testable without cookies).
 */
export async function loadEventIntelligence(options: {
  supabase: SupabaseClient;
  organisationId: string;
  eventId: string;
  facilityManagementEnabled: boolean;
}): Promise<EventIntelligence> {
  const { supabase, organisationId, eventId, facilityManagementEnabled } =
    options;

  const { data: eventRow, error: eventError } = await supabase
    .from("operational_events")
    .select(
      "id, organisation_id, department_id, module_id, event_type, entity_type, entity_id, actor_profile_id, occurred_at, created_at, data, source"
    )
    .eq("id", eventId)
    .maybeSingle();

  // RLS + explicit org check: missing and cross-tenant look the same to the caller.
  if (eventError || !eventRow) {
    throw new ActionError(
      "FORBIDDEN",
      "Operational event was not found."
    );
  }

  const event = eventRow as EventRow;
  if (event.organisation_id !== organisationId) {
    throw new ActionError(
      "FORBIDDEN",
      "Operational event was not found."
    );
  }

  const supported = SUPPORTED_EVENT_TYPES.has(event.event_type);

  if (supported && !facilityManagementEnabled) {
    throw new ActionError("MODULE_NOT_ENABLED");
  }

  // 1) Event-specific action runs (single query).
  const { data: eventRunsRaw, error: eventRunsError } = await supabase
    .from("action_runs")
    .select(
      "id, organisation_id, operational_event_id, action_key, status, result, error, started_at, completed_at, created_at"
    )
    .eq("organisation_id", organisationId)
    .eq("operational_event_id", event.id)
    .order("created_at", { ascending: false });

  if (eventRunsError) {
    throw new ActionError("INTERNAL_ERROR", "Failed to load action runs.", {
      cause: eventRunsError,
    });
  }

  const eventRuns = (eventRunsRaw ?? []) as ActionRunRow[];

  const acknowledgeRun = pickLatestSucceeded(
    eventRuns,
    CORE_ACTION_KEYS.acknowledge
  );
  const signalRun = pickLatestSucceeded(
    eventRuns,
    CORE_ACTION_KEYS.signalAnalysis
  );
  const riskRun = pickLatestSucceeded(
    eventRuns,
    CORE_ACTION_KEYS.riskAssessment
  );
  const recommendationRun = pickLatestSucceeded(
    eventRuns,
    CORE_ACTION_KEYS.recommendationGeneration
  );

  const consumers = {
    acknowledge: supported
      ? consumerStateFromRun(
          acknowledgeRun ??
            pickLatestAny(eventRuns, CORE_ACTION_KEYS.acknowledge)
        )
      : ("unsupported" as ConsumerRunState),
    signalAnalysis: supported
      ? consumerStateFromRun(
          signalRun ??
            pickLatestAny(eventRuns, CORE_ACTION_KEYS.signalAnalysis)
        )
      : ("unsupported" as ConsumerRunState),
    riskAssessment: supported
      ? consumerStateFromRun(
          riskRun ?? pickLatestAny(eventRuns, CORE_ACTION_KEYS.riskAssessment)
        )
      : ("unsupported" as ConsumerRunState),
    recommendationGeneration: supported
      ? consumerStateFromRun(
          recommendationRun ??
            pickLatestAny(
              eventRuns,
              CORE_ACTION_KEYS.recommendationGeneration
            )
        )
      : ("unsupported" as ConsumerRunState),
  };

  const signalOutcome = signalRun ? parseOutcome(signalRun.result) : null;
  const recommendationOutcome = recommendationRun
    ? parseOutcome(recommendationRun.result)
    : null;

  const signals = signalRun
    ? normalizeSignals(signalOutcome, signalRun.id)
    : [];
  const risk = normalizeRisk(riskRun);
  const recommendations = normalizeRecommendations(recommendationOutcome);

  // 2) Decisions for this originating event.
  const { data: decisionRowsRaw, error: decisionsError } = await supabase
    .from("recommendation_decisions")
    .select(
      "id, organisation_id, operational_event_id, recommendation_action_run_id, recommendation_id, decision, reason, actor_profile_id, created_at"
    )
    .eq("organisation_id", organisationId)
    .eq("operational_event_id", event.id)
    .order("created_at", { ascending: true });

  if (decisionsError) {
    throw new ActionError(
      "INTERNAL_ERROR",
      "Failed to load recommendation decisions.",
      { cause: decisionsError }
    );
  }

  const decisionRows = ((decisionRowsRaw ?? []) as DecisionRow[]).filter(
    (row) => isRecommendationDecisionValue(row.decision)
  );

  const allDecisions = decisionRows.map(toDecisionView);

  // 3) Decision events + feedback/pattern runs (batched).
  const decisionIds = decisionRows.map((d) => d.id);
  let decisionEvents: EventRow[] = [];
  let secondaryRuns: ActionRunRow[] = [];

  if (decisionIds.length > 0) {
    const { data: decisionEventsRaw, error: decisionEventsError } =
      await supabase
        .from("operational_events")
        .select(
          "id, organisation_id, department_id, module_id, event_type, entity_type, entity_id, actor_profile_id, occurred_at, created_at, data, source"
        )
        .eq("organisation_id", organisationId)
        .eq("event_type", OperationalEventTypes.SYSTEM_RECOMMENDATION_DECIDED)
        .eq("entity_type", "recommendation_decision")
        .in("entity_id", decisionIds);

    if (decisionEventsError) {
      throw new ActionError(
        "INTERNAL_ERROR",
        "Failed to load recommendation decision events.",
        { cause: decisionEventsError }
      );
    }

    decisionEvents = (decisionEventsRaw ?? []) as EventRow[];
    const decisionEventIds = decisionEvents.map((e) => e.id);

    if (decisionEventIds.length > 0) {
      const { data: secondaryRunsRaw, error: secondaryError } = await supabase
        .from("action_runs")
        .select(
          "id, organisation_id, operational_event_id, action_key, status, result, error, started_at, completed_at, created_at"
        )
        .eq("organisation_id", organisationId)
        .in("operational_event_id", decisionEventIds)
        .in("action_key", [FEEDBACK_ACTION_KEY, PATTERN_ACTION_KEY])
        .order("created_at", { ascending: false });

      if (secondaryError) {
        throw new ActionError(
          "INTERNAL_ERROR",
          "Failed to load decision intelligence action runs.",
          { cause: secondaryError }
        );
      }

      secondaryRuns = (secondaryRunsRaw ?? []) as ActionRunRow[];
    }
  }

  const feedbackByDecisionId = new Map<string, IntelligenceFeedbackView[]>();
  const patterns: IntelligenceResponsePatternView[] = [];

  for (const run of secondaryRuns) {
    if (run.status !== "succeeded") continue;
    const outcome = parseOutcome(run.result);
    const decisionEvent = decisionEvents.find(
      (e) => e.id === run.operational_event_id
    );
    if (!decisionEvent?.entity_id) continue;
    const decisionId = decisionEvent.entity_id;

    if (run.action_key === FEEDBACK_ACTION_KEY) {
      const view: IntelligenceFeedbackView = {
        decisionId,
        decisionEventId: decisionEvent.id,
        actionRunId: run.id,
        outcomeStatus: outcome?.status ?? null,
        summary: outcome?.summary ?? null,
        signals: Array.isArray(outcome?.signals)
          ? (outcome!.signals as ActionSignal[])
          : [],
        data: (outcome?.data as Record<string, unknown>) ?? {},
        completedAt: run.completed_at,
      };
      const list = feedbackByDecisionId.get(decisionId) ?? [];
      list.push(view);
      feedbackByDecisionId.set(decisionId, list);
    }

    if (run.action_key === PATTERN_ACTION_KEY) {
      patterns.push({
        decisionId,
        decisionEventId: decisionEvent.id,
        actionRunId: run.id,
        outcomeStatus: outcome?.status ?? null,
        summary: outcome?.summary ?? null,
        signals: Array.isArray(outcome?.signals)
          ? (outcome!.signals as ActionSignal[])
          : [],
        data: (outcome?.data as Record<string, unknown>) ?? {},
        completedAt: run.completed_at,
        scopeNote: "organisational_context",
      });
    }
  }

  // Sort feedback oldest→newest per decision; patterns newest first already from query.
  for (const [id, list] of feedbackByDecisionId) {
    list.sort((a, b) =>
      String(a.completedAt ?? "").localeCompare(String(b.completedAt ?? ""))
    );
    feedbackByDecisionId.set(id, list);
  }
  patterns.sort((a, b) =>
    String(b.completedAt ?? "").localeCompare(String(a.completedAt ?? ""))
  );

  // Group decisions by recommendation_id (Option B current = latest created_at).
  const historyByRecommendationId = new Map<string, DecisionRow[]>();
  for (const row of decisionRows) {
    const list = historyByRecommendationId.get(row.recommendation_id) ?? [];
    list.push(row);
    historyByRecommendationId.set(row.recommendation_id, list);
  }

  const recommendationResponses: IntelligenceRecommendationResponseView[] =
    recommendations.map((recommendation) => {
      const historyRows =
        historyByRecommendationId.get(recommendation.id) ?? [];
      const history = historyRows.map(toDecisionView);
      const currentRow =
        historyRows.length > 0 ? historyRows[historyRows.length - 1]! : null;
      const currentDecision = currentRow ? toDecisionView(currentRow) : null;
      const feedback = currentRow
        ? [
            ...(feedbackByDecisionId.get(currentRow.id) ?? []),
            // Include feedback for historical decisions on this recommendation.
            ...historyRows
              .slice(0, -1)
              .flatMap((row) => feedbackByDecisionId.get(row.id) ?? []),
          ].sort((a, b) =>
            String(a.completedAt ?? "").localeCompare(String(b.completedAt ?? ""))
          )
        : historyRows.flatMap(
            (row) => feedbackByDecisionId.get(row.id) ?? []
          );

      // Dedupe feedback by actionRunId
      const seen = new Set<string>();
      const uniqueFeedback = feedback.filter((f) => {
        if (seen.has(f.actionRunId)) return false;
        seen.add(f.actionRunId);
        return true;
      });

      return {
        recommendation,
        currentDecision,
        decisionHistory: history,
        feedback: uniqueFeedback,
      };
    });

  // Include decisions for recommendation ids not present in latest generate outcome.
  for (const [recommendationId, historyRows] of historyByRecommendationId) {
    if (recommendations.some((r) => r.id === recommendationId)) continue;
    recommendationResponses.push({
      recommendation: {
        id: recommendationId,
        title: recommendationId,
        reason: "",
        evidence: [],
        sources: [],
      },
      currentDecision: toDecisionView(historyRows[historyRows.length - 1]!),
      decisionHistory: historyRows.map(toDecisionView),
      feedback: historyRows.flatMap(
        (row) => feedbackByDecisionId.get(row.id) ?? []
      ),
    });
  }

  const status = computeStatus({
    supported,
    eventType: event.event_type,
    consumers,
  });

  // If unsupported, still return the event with empty intelligence sections.
  if (!supported) {
    return {
      event: {
        id: event.id,
        eventType: event.event_type,
        entityType: event.entity_type,
        entityId: event.entity_id,
        organisationId: event.organisation_id,
        departmentId: event.department_id,
        moduleId: event.module_id,
        actorProfileId: event.actor_profile_id,
        occurredAt: event.occurred_at,
        createdAt: event.created_at,
        data: event.data ?? {},
        source: event.source,
      },
      intelligence: {
        eventSpecific: {
          signals: [],
          risk: null,
          recommendations: [],
          recommendationActionRunId: null,
        },
        humanResponse: {
          recommendations: [],
          decisions: [],
        },
        organisationalContext: {
          responsePatterns: [],
        },
      },
      status,
    };
  }

  return {
    event: {
      id: event.id,
      eventType: event.event_type,
      entityType: event.entity_type,
      entityId: event.entity_id,
      organisationId: event.organisation_id,
      departmentId: event.department_id,
      moduleId: event.module_id,
      actorProfileId: event.actor_profile_id,
      occurredAt: event.occurred_at,
      createdAt: event.created_at,
      data: event.data ?? {},
      source: event.source,
    },
    intelligence: {
      eventSpecific: {
        signals,
        risk,
        recommendations,
        recommendationActionRunId: recommendationRun?.id ?? null,
      },
      humanResponse: {
        recommendations: recommendationResponses,
        decisions: allDecisions,
      },
      organisationalContext: {
        responsePatterns: patterns,
      },
    },
    status,
  };
}

/**
 * Authenticated Intelligence Read Model entry point.
 * organisationId is derived from the session — never from the client.
 */
export async function getEventIntelligence(
  eventId: string
): Promise<EventIntelligence> {
  const trimmed = eventId?.trim() ?? "";
  if (!trimmed) {
    throw new ActionError("VALIDATION_ERROR", "eventId is required.");
  }

  const session = await getPlatformSession();
  if (!session) {
    throw new ActionError("UNAUTHENTICATED");
  }
  if (!session.profile) {
    throw new ActionError("PROFILE_NOT_FOUND");
  }
  if (
    session.profile.status === "suspended" ||
    session.profile.status === "inactive"
  ) {
    throw new ActionError("FORBIDDEN");
  }
  if (!session.organisation) {
    throw new ActionError("ORGANISATION_NOT_FOUND");
  }
  if (session.organisation.status !== "active") {
    throw new ActionError("ORGANISATION_INACTIVE");
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  return loadEventIntelligence({
    supabase,
    organisationId: session.organisation.id,
    eventId: trimmed,
    facilityManagementEnabled: hasModule(
      session.enabledModules,
      "facility_management"
    ),
  });
}
