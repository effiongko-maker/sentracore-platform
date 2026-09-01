import { createAdminClient } from "@/utils/supabase/admin";
import {
  actionOutcomeSucceeded,
  isActionOutcome,
  type ActionOutcome,
  type ActionRecommendation,
  type ActionSignal,
  type ActionSignalSeverity,
} from "./outcome";
import type { OperationalEventConsumer } from "./types";

/** Explicit deterministic scoring (Action Engine v1.3). */
export const INCIDENT_RISK_SCORING = {
  signalPoints: {
    critical: 40,
    warning: 20,
    info: 5,
  },
  isEmergency: 30,
  severityCritical: 30,
  severityHigh: 20,
  requiresWorkOrder: 10,
} as const;

export type IncidentRiskLevel = "low" | "moderate" | "high" | "critical";

export type RiskFactor = {
  source: string;
  score: number;
  severity?: ActionSignalSeverity;
  detail?: string;
};

type SignalAnalysisRunRow = {
  id: string;
  action_key: string;
  status: string;
  result: unknown;
};

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Map Work/Maintenance priority to incident-style severity for risk scoring. */
function maintenancePriorityAsSeverity(priority: string | null): string | null {
  if (!priority) return null;
  if (priority === "critical") return "critical";
  if (priority === "high") return "high";
  return null;
}

function riskLevelForScore(score: number): IncidentRiskLevel {
  if (score >= 80) return "critical";
  if (score >= 50) return "high";
  if (score >= 20) return "moderate";
  return "low";
}

function recommendationsForLevel(
  level: IncidentRiskLevel
): ActionRecommendation[] {
  switch (level) {
    case "critical":
      return [
        {
          key: "immediate_management_attention",
          title: "Immediate management attention is recommended.",
          reasoning: "Deterministic CRITICAL risk level (score ≥ 80).",
        },
        {
          key: "escalate_urgent_operational_review",
          title: "Escalate the incident for urgent operational review.",
          reasoning: "Deterministic CRITICAL risk level (score ≥ 80).",
        },
      ];
    case "high":
      return [
        {
          key: "prioritise_investigation",
          title: "Prioritise investigation and corrective action.",
          reasoning: "Deterministic HIGH risk level (score 50–79).",
        },
        {
          key: "review_facility_asset_conditions",
          title: "Review contributing facility and asset conditions.",
          reasoning: "Deterministic HIGH risk level (score 50–79).",
        },
      ];
    case "moderate":
      return [
        {
          key: "monitor_and_complete_corrective_actions",
          title:
            "Monitor the incident and complete recommended corrective actions.",
          reasoning: "Deterministic MODERATE risk level (score 20–49).",
        },
      ];
    case "low":
    default:
      return [
        {
          key: "record_and_monitor_recurrence",
          title: "Record the incident and monitor for recurrence.",
          reasoning: "Deterministic LOW risk level (score 0–19).",
        },
      ];
  }
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

async function loadSignalAnalysisRun(options: {
  organisationId: string;
  operationalEventId: string;
}): Promise<SignalAnalysisRunRow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("action_runs")
    .select("id, action_key, status, result")
    .eq("organisation_id", options.organisationId)
    .eq("operational_event_id", options.operationalEventId)
    .eq("action_key", "facility.analyze_incident_signals")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to load signal analysis action_run: ${error.message}`
    );
  }

  return (data as SignalAnalysisRunRow | null) ?? null;
}

/**
 * Deterministic incident risk assessment (Action Engine v1.3).
 * Builds on facility.analyze_incident_signals output — does not re-query history.
 */
export const assessIncidentRiskConsumer: OperationalEventConsumer = async (
  ctx
) => {
  const { event, organisationId, actionKey } = ctx;
  const assessedAt = new Date().toISOString();
  const eventData = event.data ?? {};

  const incidentId =
    asNonEmptyString(eventData.incidentId) ?? event.entityId ?? null;
  const facilityId = asNonEmptyString(eventData.facilityId);
  const severity =
    asNonEmptyString(eventData.severity) ??
    maintenancePriorityAsSeverity(asNonEmptyString(eventData.priority));
  const isEmergency = asBoolean(eventData.isEmergency);
  const requiresWorkOrder = asBoolean(eventData.requiresWorkOrder);

  let signalRun: SignalAnalysisRunRow | null = null;
  try {
    signalRun = await loadSignalAnalysisRun({
      organisationId,
      operationalEventId: event.id,
    });
  } catch (loadError) {
    const message =
      loadError instanceof Error
        ? loadError.message
        : "Failed to load signal analysis result";

    return {
      status: "partial",
      summary:
        "Risk assessment could not be fully derived because signal analysis was unavailable.",
      data: {
        actionKey,
        insufficientInput: true,
        reason: "signal_analysis_load_failed",
        detail: message,
        riskScore: 0,
        riskLevel: "low" as IncidentRiskLevel,
        factors: [] as RiskFactor[],
        assessment: {
          incidentId,
          facilityId,
          operationalEventId: event.id,
          assessedAt,
          organisationId,
        },
        sourceSignalAnalysis: null,
      },
      recommendations: recommendationsForLevel("low"),
      signals: [],
    };
  }

  if (!signalRun || signalRun.status !== "succeeded") {
    return {
      status: "partial",
      summary:
        "Risk assessment could not be fully derived because signal analysis was unavailable.",
      data: {
        actionKey,
        insufficientInput: true,
        reason: signalRun
          ? "signal_analysis_unsuccessful"
          : "signal_analysis_missing",
        signalAnalysisStatus: signalRun?.status ?? null,
        riskScore: 0,
        riskLevel: "low" as IncidentRiskLevel,
        factors: [] as RiskFactor[],
        assessment: {
          incidentId,
          facilityId,
          operationalEventId: event.id,
          assessedAt,
          organisationId,
        },
        sourceSignalAnalysis: signalRun
          ? {
              actionRunId: signalRun.id,
              actionKey: signalRun.action_key,
              status: signalRun.status,
            }
          : null,
      },
      recommendations: recommendationsForLevel("low"),
      signals: [],
    };
  }

  if (!isActionOutcome(signalRun.result)) {
    return {
      status: "partial",
      summary:
        "Risk assessment could not be fully derived because signal analysis was unavailable.",
      data: {
        actionKey,
        insufficientInput: true,
        reason: "signal_analysis_invalid_outcome",
        riskScore: 0,
        riskLevel: "low" as IncidentRiskLevel,
        factors: [] as RiskFactor[],
        assessment: {
          incidentId,
          facilityId,
          operationalEventId: event.id,
          assessedAt,
          organisationId,
        },
        sourceSignalAnalysis: {
          actionRunId: signalRun.id,
          actionKey: signalRun.action_key,
          status: signalRun.status,
        },
      },
      recommendations: recommendationsForLevel("low"),
      signals: [],
    };
  }

  const signalOutcome = signalRun.result;
  const sourceSignals = readSignals(signalOutcome);
  const factors: RiskFactor[] = [];
  let riskScore = 0;

  for (const signal of sourceSignals) {
    const points =
      INCIDENT_RISK_SCORING.signalPoints[
        signal.severity as keyof typeof INCIDENT_RISK_SCORING.signalPoints
      ] ?? 0;
    if (points <= 0) continue;
    riskScore += points;
    factors.push({
      source: signal.key,
      severity: signal.severity,
      score: points,
      detail: signal.summary,
    });
  }

  if (isEmergency) {
    riskScore += INCIDENT_RISK_SCORING.isEmergency;
    factors.push({
      source: "incident.is_emergency",
      score: INCIDENT_RISK_SCORING.isEmergency,
      detail: "Event payload isEmergency === true",
    });
  }

  if (severity === "critical") {
    riskScore += INCIDENT_RISK_SCORING.severityCritical;
    factors.push({
      source: "incident.severity_critical",
      score: INCIDENT_RISK_SCORING.severityCritical,
      detail: 'Event payload severity === "critical"',
    });
  } else if (severity === "high") {
    riskScore += INCIDENT_RISK_SCORING.severityHigh;
    factors.push({
      source: "incident.severity_high",
      score: INCIDENT_RISK_SCORING.severityHigh,
      detail: 'Event payload severity === "high"',
    });
  }

  if (requiresWorkOrder) {
    riskScore += INCIDENT_RISK_SCORING.requiresWorkOrder;
    factors.push({
      source: "incident.requires_work_order",
      score: INCIDENT_RISK_SCORING.requiresWorkOrder,
      detail: "Event payload requiresWorkOrder === true",
    });
  }

  const riskLevel = riskLevelForScore(riskScore);
  const recommendations = recommendationsForLevel(riskLevel);

  const outcome: ActionOutcome = actionOutcomeSucceeded(
    `Incident assessed as ${riskLevel.toUpperCase()} operational risk.`,
    {
      actionKey,
      riskScore,
      riskLevel,
      factors,
      scoring: INCIDENT_RISK_SCORING,
      assessment: {
        incidentId,
        facilityId,
        operationalEventId: event.id,
        assessedAt,
        organisationId,
        severity,
        isEmergency,
        requiresWorkOrder,
      },
      sourceSignalAnalysis: {
        actionRunId: signalRun.id,
        actionKey: signalRun.action_key,
        status: signalRun.status,
        signalCount: sourceSignals.length,
        summary: signalOutcome.summary,
      },
    },
    {
      recommendations,
      // Preserve source signals for traceability in this action_run.result
      signals: sourceSignals,
    }
  );

  return outcome;
};
