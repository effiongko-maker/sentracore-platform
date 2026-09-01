import { createAdminClient } from "@/utils/supabase/admin";
import {
  isActionOutcome,
  type ActionOutcome,
  type ActionRecommendation,
  type ActionSignal,
  type DecisionReadyRecommendation,
  type RecommendationPriority,
} from "./outcome";
import type { OperationalEventConsumer } from "./types";
import type { IncidentRiskLevel } from "./assessIncidentRisk";

export type {
  DecisionReadyRecommendation,
  RecommendationPriority,
} from "./outcome";

/** Explicit priority mapping from risk assessment level. */
export const RISK_LEVEL_PRIORITY: Record<
  IncidentRiskLevel,
  RecommendationPriority
> = {
  critical: "urgent",
  high: "high",
  moderate: "normal",
  low: "low",
};

/**
 * Signal-sourced recommendation keys may raise priority above the risk baseline.
 * Documented floors only — no fuzzy matching.
 */
export const SIGNAL_RECOMMENDATION_PRIORITY_FLOOR: Record<
  string,
  RecommendationPriority
> = {
  review_facility_incident_pattern: "urgent",
  review_facility_work_pattern: "urgent",
  inspect_repeated_asset: "high",
};

/** Link recommendation keys to supporting signal keys when present. */
export const RECOMMENDATION_SIGNAL_EVIDENCE: Record<string, string[]> = {
  review_facility_incident_pattern: ["incident.facility_frequency_7d"],
  review_facility_work_pattern: ["work.facility_frequency_7d"],
  inspect_repeated_asset: ["incident.repeated_asset"],
};

const PRIORITY_RANK: Record<RecommendationPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

const SIGNAL_ACTION_KEY = "facility.analyze_incident_signals";
const RISK_ACTION_KEY = "facility.assess_incident_risk";

type ActionRunRow = {
  id: string;
  action_key: string;
  status: string;
  result: unknown;
};

type LoadedSource = {
  actionKey: string;
  available: boolean;
  reason?: string;
  actionRunId: string | null;
  outcomeStatus: string | null;
  outcome: ActionOutcome | null;
};

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isIncidentRiskLevel(value: unknown): value is IncidentRiskLevel {
  return (
    value === "low" ||
    value === "moderate" ||
    value === "high" ||
    value === "critical"
  );
}

function maxPriority(
  a: RecommendationPriority,
  b: RecommendationPriority
): RecommendationPriority {
  return PRIORITY_RANK[a] <= PRIORITY_RANK[b] ? a : b;
}

function readRecommendations(outcome: ActionOutcome): ActionRecommendation[] {
  if (!Array.isArray(outcome.recommendations)) return [];
  return outcome.recommendations.filter(
    (r): r is ActionRecommendation =>
      !!r &&
      typeof r === "object" &&
      typeof (r as ActionRecommendation).key === "string" &&
      typeof (r as ActionRecommendation).title === "string"
  );
}

function readSignals(outcome: ActionOutcome): ActionSignal[] {
  if (!Array.isArray(outcome.signals)) return [];
  return outcome.signals.filter(
    (s): s is ActionSignal =>
      !!s &&
      typeof s === "object" &&
      typeof (s as ActionSignal).key === "string" &&
      typeof (s as ActionSignal).severity === "string" &&
      typeof (s as ActionSignal).summary === "string"
  );
}

function compactSignals(signals: ActionSignal[]): ActionSignal[] {
  return signals.map((s) => ({
    key: s.key,
    severity: s.severity,
    summary: s.summary,
    evidence: {
      rule:
        typeof s.evidence?.rule === "string" ? s.evidence.rule : s.key,
    },
  }));
}

async function loadActionRun(options: {
  organisationId: string;
  operationalEventId: string;
  actionKey: string;
}): Promise<ActionRunRow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("action_runs")
    .select("id, action_key, status, result")
    .eq("organisation_id", options.organisationId)
    .eq("operational_event_id", options.operationalEventId)
    .eq("action_key", options.actionKey)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to load action_run ${options.actionKey}: ${error.message}`
    );
  }

  return (data as ActionRunRow | null) ?? null;
}

function resolveSource(
  actionKey: string,
  row: ActionRunRow | null,
  loadError?: string
): LoadedSource {
  if (loadError) {
    return {
      actionKey,
      available: false,
      reason: loadError,
      actionRunId: null,
      outcomeStatus: null,
      outcome: null,
    };
  }
  if (!row) {
    return {
      actionKey,
      available: false,
      reason: "action_run_missing",
      actionRunId: null,
      outcomeStatus: null,
      outcome: null,
    };
  }
  if (row.status !== "succeeded") {
    return {
      actionKey,
      available: false,
      reason: "action_run_unsuccessful",
      actionRunId: row.id,
      outcomeStatus: null,
      outcome: null,
    };
  }
  if (!isActionOutcome(row.result)) {
    return {
      actionKey,
      available: false,
      reason: "invalid_action_outcome",
      actionRunId: row.id,
      outcomeStatus: null,
      outcome: null,
    };
  }

  return {
    actionKey,
    available: true,
    actionRunId: row.id,
    outcomeStatus: row.result.status,
    outcome: row.result,
  };
}

function buildEvidenceForRecommendation(options: {
  rec: ActionRecommendation;
  actionKey: string;
  signals: ActionSignal[];
  riskLevel: IncidentRiskLevel | null;
}): DecisionReadyRecommendation["evidence"] {
  const evidence: DecisionReadyRecommendation["evidence"] = [];

  if (options.actionKey === RISK_ACTION_KEY && options.riskLevel) {
    evidence.push({
      type: "risk_level",
      summary: `Risk assessment level: ${options.riskLevel}`,
      severity: options.riskLevel,
    });
  }

  const linkedSignalKeys =
    RECOMMENDATION_SIGNAL_EVIDENCE[options.rec.key] ?? [];
  for (const signalKey of linkedSignalKeys) {
    const signal = options.signals.find((s) => s.key === signalKey);
    if (signal) {
      evidence.push({
        type: "signal",
        summary: signal.summary,
        severity: signal.severity,
      });
    }
  }

  if (options.rec.reasoning) {
    evidence.push({
      type: "source_reasoning",
      summary: options.rec.reasoning,
    });
  }

  return evidence;
}

function normaliseRecommendation(options: {
  rec: ActionRecommendation;
  actionKey: string;
  actionRunId: string;
  basePriority: RecommendationPriority;
  signals: ActionSignal[];
  riskLevel: IncidentRiskLevel | null;
}): DecisionReadyRecommendation {
  const floor = SIGNAL_RECOMMENDATION_PRIORITY_FLOOR[options.rec.key];
  const priority = floor
    ? maxPriority(options.basePriority, floor)
    : options.basePriority;

  return {
    id: options.rec.key,
    priority,
    title: options.rec.title,
    description: options.rec.description,
    reason:
      options.rec.reasoning ??
      options.rec.description ??
      `Aggregated from ${options.actionKey}.`,
    sources: [
      {
        actionKey: options.actionKey,
        actionRunId: options.actionRunId,
      },
    ],
    evidence: buildEvidenceForRecommendation({
      rec: options.rec,
      actionKey: options.actionKey,
      signals: options.signals,
      riskLevel: options.riskLevel,
    }),
    suggestedAction: options.rec.suggestedAction,
  };
}

/**
 * Deduplicate by stable recommendation id (ActionRecommendation.key).
 * Same id from multiple sources → merge sources + evidence; keep highest priority.
 */
function dedupeAndMerge(
  items: DecisionReadyRecommendation[]
): DecisionReadyRecommendation[] {
  const byId = new Map<string, DecisionReadyRecommendation>();

  for (const item of items) {
    const existing = byId.get(item.id);
    if (!existing) {
      byId.set(item.id, { ...item, sources: [...item.sources], evidence: [...item.evidence] });
      continue;
    }

    const mergedSources = [...existing.sources];
    for (const src of item.sources) {
      if (
        !mergedSources.some(
          (s) =>
            s.actionKey === src.actionKey && s.actionRunId === src.actionRunId
        )
      ) {
        mergedSources.push(src);
      }
    }

    const mergedEvidence = [...existing.evidence];
    for (const ev of item.evidence) {
      if (
        !mergedEvidence.some(
          (e) =>
            e.type === ev.type &&
            e.summary === ev.summary &&
            e.severity === ev.severity
        )
      ) {
        mergedEvidence.push(ev);
      }
    }

    byId.set(item.id, {
      ...existing,
      priority: maxPriority(existing.priority, item.priority),
      title: existing.title,
      description: existing.description ?? item.description,
      reason: existing.reason,
      suggestedAction: existing.suggestedAction ?? item.suggestedAction,
      sources: mergedSources,
      evidence: mergedEvidence,
    });
  }

  return [...byId.values()].sort((a, b) => {
    const byPriority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (byPriority !== 0) return byPriority;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Aggregates prior intelligence into decision-ready recommendations (v1.4).
 * Does not re-query history or recalculate risk.
 */
export const generateIncidentRecommendationsConsumer: OperationalEventConsumer =
  async (ctx) => {
    const { event, organisationId, actionKey } = ctx;
    const eventData = event.data ?? {};
    const incidentId =
      asNonEmptyString(eventData.incidentId) ?? event.entityId ?? null;
    const facilityId = asNonEmptyString(eventData.facilityId);

    let signalRow: ActionRunRow | null = null;
    let riskRow: ActionRunRow | null = null;
    let signalLoadError: string | undefined;
    let riskLoadError: string | undefined;

    try {
      signalRow = await loadActionRun({
        organisationId,
        operationalEventId: event.id,
        actionKey: SIGNAL_ACTION_KEY,
      });
    } catch (err) {
      signalLoadError =
        err instanceof Error ? err.message : "signal analysis load failed";
    }

    try {
      riskRow = await loadActionRun({
        organisationId,
        operationalEventId: event.id,
        actionKey: RISK_ACTION_KEY,
      });
    } catch (err) {
      riskLoadError =
        err instanceof Error ? err.message : "risk assessment load failed";
    }

    const signalSource = resolveSource(
      SIGNAL_ACTION_KEY,
      signalRow,
      signalLoadError
    );
    const riskSource = resolveSource(RISK_ACTION_KEY, riskRow, riskLoadError);

    const unavailable: string[] = [];
    if (!signalSource.available) {
      unavailable.push(
        `${SIGNAL_ACTION_KEY} (${signalSource.reason ?? "unavailable"})`
      );
    }
    if (!riskSource.available) {
      unavailable.push(
        `${RISK_ACTION_KEY} (${riskSource.reason ?? "unavailable"})`
      );
    }

    if (!signalSource.available && !riskSource.available) {
      return {
        status: "partial",
        summary:
          "No recommendations generated because signal analysis and risk assessment were unavailable.",
        data: {
          actionKey,
          incidentId,
          facilityId,
          operationalEventId: event.id,
          organisationId,
          riskLevel: null,
          recommendationCount: 0,
          recommendations: [] as DecisionReadyRecommendation[],
          unavailableSources: unavailable,
          sourceAssessments: {
            signalAnalysis: {
              available: false,
              actionRunId: signalSource.actionRunId,
              reason: signalSource.reason ?? null,
            },
            riskAssessment: {
              available: false,
              actionRunId: riskSource.actionRunId,
              reason: riskSource.reason ?? null,
            },
          },
        },
        recommendations: [],
        signals: [],
      };
    }

    const riskOutcome =
      riskSource.available && riskSource.outcomeStatus === "succeeded"
        ? riskSource.outcome
        : null;

    const riskLevel = isIncidentRiskLevel(riskOutcome?.data?.riskLevel)
      ? riskOutcome.data.riskLevel
      : null;

    const basePriority: RecommendationPriority = riskLevel
      ? RISK_LEVEL_PRIORITY[riskLevel]
      : "normal";

    const signalOutcome = signalSource.available ? signalSource.outcome : null;
    const sourceSignals = [
      ...(signalOutcome ? readSignals(signalOutcome) : []),
      ...(riskOutcome ? readSignals(riskOutcome) : []),
    ];
    // Dedupe signals by key for compact traceability payload
    const signalsByKey = new Map<string, ActionSignal>();
    for (const s of sourceSignals) {
      if (!signalsByKey.has(s.key)) signalsByKey.set(s.key, s);
    }
    const compact = compactSignals([...signalsByKey.values()]);

    const collected: DecisionReadyRecommendation[] = [];

    if (signalSource.available && signalSource.outcome && signalSource.actionRunId) {
      for (const rec of readRecommendations(signalSource.outcome)) {
        collected.push(
          normaliseRecommendation({
            rec,
            actionKey: SIGNAL_ACTION_KEY,
            actionRunId: signalSource.actionRunId,
            basePriority,
            signals: compact,
            riskLevel,
          })
        );
      }
    }

    if (riskSource.available && riskSource.outcome && riskSource.actionRunId) {
      // Prefer succeeded risk outcomes for risk-derived recommendations;
      // still accept partial so we do not silently discard available guidance.
      for (const rec of readRecommendations(riskSource.outcome)) {
        collected.push(
          normaliseRecommendation({
            rec,
            actionKey: RISK_ACTION_KEY,
            actionRunId: riskSource.actionRunId,
            basePriority,
            signals: compact,
            riskLevel,
          })
        );
      }
    }

    const recommendations = dedupeAndMerge(collected);
    const status: ActionOutcome["status"] =
      unavailable.length > 0 ? "partial" : "succeeded";

    const riskLabel = riskLevel ? riskLevel.toUpperCase() : "UNKNOWN";
    const summary =
      unavailable.length > 0
        ? `Generated ${recommendations.length} prioritised recommendation(s) with incomplete intelligence (${unavailable.join("; ")}).`
        : `Generated ${recommendations.length} prioritised recommendations for a ${riskLabel}-risk incident.`;

    // Top-level uses DecisionReadyRecommendation shape (decision-ready).
    // Also mirrored in data.recommendations for queryability.
    return {
      status,
      summary,
      data: {
        actionKey,
        incidentId,
        facilityId,
        operationalEventId: event.id,
        organisationId,
        riskLevel,
        riskScore:
          typeof riskOutcome?.data?.riskScore === "number"
            ? riskOutcome.data.riskScore
            : null,
        recommendationCount: recommendations.length,
        recommendations,
        priorityRules: {
          riskLevelPriority: RISK_LEVEL_PRIORITY,
          signalRecommendationPriorityFloor:
            SIGNAL_RECOMMENDATION_PRIORITY_FLOOR,
          defaultWithoutRisk: "normal",
        },
        deduplication: {
          strategy: "exact_recommendation_key",
          note: "Recommendations with the same ActionRecommendation.key are merged; related but distinct keys are kept.",
        },
        unavailableSources: unavailable,
        sourceAssessments: {
          signalAnalysis: {
            available: signalSource.available,
            actionRunId: signalSource.actionRunId,
            outcomeStatus: signalSource.outcomeStatus,
            reason: signalSource.reason ?? null,
          },
          riskAssessment: {
            available: riskSource.available,
            actionRunId: riskSource.actionRunId,
            outcomeStatus: riskSource.outcomeStatus,
            reason: riskSource.reason ?? null,
          },
        },
      },
      recommendations,
      signals: compact,
    };
  };
