/**
 * Standard Action Engine consumer outcome (v1.1+).
 * Stored as-is in action_runs.result (JSONB) — queryable without over-normalization.
 *
 * Kaiso-ready optional fields (confidence / reasoning / metadata) are shaped for
 * future AI analysis; v1.2 signal detection is deterministic rules only.
 */

export type ActionOutcomeStatus =
  | "succeeded"
  | "failed"
  | "skipped"
  | "partial";

export type ActionSignalSeverity = "info" | "warning" | "critical";

/**
 * Operational / intelligence signal on an ActionOutcome.
 * v1.2 deterministic consumers set key, severity, summary, evidence.
 */
export type ActionSignal = {
  key: string;
  severity: ActionSignalSeverity;
  /** Human-readable explanation of why this signal fired */
  summary: string;
  /** Structured, queryable proof for the rule (counts, ids, windows, matched fields) */
  evidence: Record<string, unknown>;
  label?: string;
  /** 0–1 when a model or rule provides confidence later */
  confidence?: number;
  metadata?: Record<string, unknown>;
};

/** Future recommendation / suggested next step. Optional in v1.1. */
export type ActionRecommendation = {
  key: string;
  title: string;
  description?: string;
  /** Future: platform action name, e.g. work_order.create */
  suggestedAction?: string;
  confidence?: number;
  /** Future Kaiso reasoning metadata (plain text or structured) */
  reasoning?: string;
};

export type RecommendationPriority = "urgent" | "high" | "normal" | "low";

/**
 * Aggregated decision-ready recommendation (Action Engine v1.4).
 * `id` is the stable source ActionRecommendation.key.
 */
export type DecisionReadyRecommendation = {
  id: string;
  priority: RecommendationPriority;
  title: string;
  description?: string;
  reason: string;
  sources: Array<{
    actionKey: string;
    actionRunId: string;
  }>;
  evidence: Array<{
    type: string;
    summary?: string;
    severity?: string;
  }>;
  suggestedAction?: string;
};

export type ActionOutcome = {
  status: ActionOutcomeStatus;
  /** Short human-readable interpretation of what the consumer concluded */
  summary: string;
  /** Structured, queryable payload specific to the consumer */
  data: Record<string, unknown>;
  /** Source or aggregated recommendations (v1.4 decision-ready shape allowed) */
  recommendations?: ActionRecommendation[] | DecisionReadyRecommendation[];
  signals?: ActionSignal[];
};

export function actionOutcomeSucceeded(
  summary: string,
  data: Record<string, unknown> = {},
  extras?: Pick<ActionOutcome, "recommendations" | "signals">
): ActionOutcome {
  return {
    status: "succeeded",
    summary,
    data,
    ...extras,
  };
}

export function actionOutcomeFailed(
  summary: string,
  data: Record<string, unknown> = {}
): ActionOutcome {
  return {
    status: "failed",
    summary,
    data,
  };
}

export function isActionOutcome(value: unknown): value is ActionOutcome {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.status === "string" &&
    typeof v.summary === "string" &&
    typeof v.data === "object" &&
    v.data !== null
  );
}
