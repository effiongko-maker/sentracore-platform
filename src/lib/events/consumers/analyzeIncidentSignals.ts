import { createAdminClient } from "@/utils/supabase/admin";
import { OperationalEventTypes } from "../taxonomy";
import {
  actionOutcomeSucceeded,
  type ActionOutcome,
  type ActionRecommendation,
  type ActionSignal,
  type ActionSignalSeverity,
} from "./outcome";
import type { OperationalEventConsumer } from "./types";

/**
 * Explicit deterministic thresholds (v1.2).
 * Counts are of PRIOR events only (current incident excluded).
 */
export const INCIDENT_SIGNAL_RULES = {
  lookbackDays: 30,
  maintenanceLookbackDays: 14,
  frequency7d: { warningAt: 2, criticalAt: 4 },
  frequency30d: { warningAt: 3, criticalAt: 6 },
} as const;

type HistoryEventRow = {
  id: string;
  entity_id: string | null;
  occurred_at: string;
  event_type: string;
  data: Record<string, unknown> | null;
};

type IncidentPayload = {
  facilityId: string | null;
  incidentId: string | null;
  type: string | null;
  severity: string | null;
  assetId: string | null;
  locationDetail: string | null;
  title: string | null;
};

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readIncidentPayload(
  data: Record<string, unknown>
): IncidentPayload {
  return {
    facilityId: asNonEmptyString(data.facilityId),
    incidentId: asNonEmptyString(data.incidentId),
    type: asNonEmptyString(data.type),
    severity: asNonEmptyString(data.severity),
    assetId: asNonEmptyString(data.assetId),
    locationDetail: asNonEmptyString(data.locationDetail),
    title: asNonEmptyString(data.title),
  };
}

function daysAgoIso(from: Date, days: number): string {
  return new Date(from.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function severityForCount(
  count: number,
  warningAt: number,
  criticalAt: number
): ActionSignalSeverity | null {
  if (count >= criticalAt) return "critical";
  if (count >= warningAt) return "warning";
  return null;
}

function compactRefs(rows: HistoryEventRow[], limit = 10) {
  return rows.slice(0, limit).map((row) => ({
    eventId: row.id,
    entityId: row.entity_id,
    occurredAt: row.occurred_at,
    incidentId: asNonEmptyString(row.data?.incidentId) ?? row.entity_id,
  }));
}

async function loadFacilityHistory(options: {
  organisationId: string;
  facilityId: string;
  eventType: string;
  sinceIso: string;
  excludeEventId: string;
  excludeEntityId: string | null;
}): Promise<HistoryEventRow[]> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("operational_events")
    .select("id, entity_id, occurred_at, event_type, data")
    .eq("organisation_id", options.organisationId)
    .eq("event_type", options.eventType)
    .filter("data->>facilityId", "eq", options.facilityId)
    .gte("occurred_at", options.sinceIso)
    .order("occurred_at", { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(
      `Failed to load operational history: ${error.message}`
    );
  }

  const rows = (data ?? []) as HistoryEventRow[];

  return rows.filter((row) => {
    if (row.id === options.excludeEventId) return false;
    if (
      options.excludeEntityId &&
      row.entity_id != null &&
      row.entity_id === options.excludeEntityId
    ) {
      return false;
    }
    return true;
  });
}

function inWindow(
  rows: HistoryEventRow[],
  sinceMs: number
): HistoryEventRow[] {
  return rows.filter((row) => Date.parse(row.occurred_at) >= sinceMs);
}

/**
 * Deterministic incident signal analysis (Action Engine v1.2).
 * Uses operational_events history only — no Apps Script / domain reads.
 */
export const analyzeIncidentSignalsConsumer: OperationalEventConsumer = async (
  ctx
) => {
  const { event, organisationId, actionKey } = ctx;
  const payload = readIncidentPayload(event.data ?? {});

  if (!payload.facilityId) {
    return actionOutcomeSucceeded(
      "Skipped incident signal analysis: facilityId missing from event payload.",
      {
        actionKey,
        skipped: true,
        reason: "missing_facility_id",
        eventId: event.id,
        entityId: event.entityId,
        organisationId,
        rules: INCIDENT_SIGNAL_RULES,
      },
      { signals: [], recommendations: [] }
    );
  }

  const occurredAt = new Date(event.occurredAt);
  const occurredAtMs = occurredAt.getTime();
  const lookbackSince = daysAgoIso(
    occurredAt,
    INCIDENT_SIGNAL_RULES.lookbackDays
  );
  const maintenanceSince = daysAgoIso(
    occurredAt,
    INCIDENT_SIGNAL_RULES.maintenanceLookbackDays
  );

  const priorIncidents = await loadFacilityHistory({
    organisationId,
    facilityId: payload.facilityId,
    eventType: OperationalEventTypes.FACILITY_INCIDENT_REPORTED,
    sinceIso: lookbackSince,
    excludeEventId: event.id,
    excludeEntityId: event.entityId,
  });

  const recentMaintenance = await loadFacilityHistory({
    organisationId,
    facilityId: payload.facilityId,
    eventType: OperationalEventTypes.FACILITY_MAINTENANCE_REQUESTED,
    sinceIso: maintenanceSince,
    excludeEventId: event.id,
    excludeEntityId: null,
  });

  const since7dMs = occurredAtMs - 7 * 24 * 60 * 60 * 1000;
  const since30dMs = occurredAtMs - 30 * 24 * 60 * 60 * 1000;

  const prior7d = inWindow(priorIncidents, since7dMs);
  const prior30d = inWindow(priorIncidents, since30dMs);

  const signals: ActionSignal[] = [];
  const recommendations: ActionRecommendation[] = [];

  const freq7 = severityForCount(
    prior7d.length,
    INCIDENT_SIGNAL_RULES.frequency7d.warningAt,
    INCIDENT_SIGNAL_RULES.frequency7d.criticalAt
  );
  if (freq7) {
    signals.push({
      key: "incident.facility_frequency_7d",
      severity: freq7,
      summary: `${prior7d.length} prior incident(s) at facility ${payload.facilityId} within 7 days (thresholds: warn≥${INCIDENT_SIGNAL_RULES.frequency7d.warningAt}, critical≥${INCIDENT_SIGNAL_RULES.frequency7d.criticalAt}).`,
      evidence: {
        rule: "incident.facility_frequency_7d",
        organisationId,
        facilityId: payload.facilityId,
        windowDays: 7,
        priorCount: prior7d.length,
        warningAt: INCIDENT_SIGNAL_RULES.frequency7d.warningAt,
        criticalAt: INCIDENT_SIGNAL_RULES.frequency7d.criticalAt,
        currentEventId: event.id,
        currentEntityId: event.entityId,
        priorRefs: compactRefs(prior7d),
      },
    });

    if (freq7 === "critical") {
      recommendations.push({
        key: "review_facility_incident_pattern",
        title: "Review recent incident pattern at this facility",
        description: `Critical 7-day frequency: ${prior7d.length} prior incidents at facility ${payload.facilityId}.`,
        suggestedAction: "facility.review_incidents",
        reasoning: `Deterministic rule incident.facility_frequency_7d fired at critical (≥${INCIDENT_SIGNAL_RULES.frequency7d.criticalAt} prior in 7 days).`,
      });
    }
  }

  const freq30 = severityForCount(
    prior30d.length,
    INCIDENT_SIGNAL_RULES.frequency30d.warningAt,
    INCIDENT_SIGNAL_RULES.frequency30d.criticalAt
  );
  if (freq30) {
    signals.push({
      key: "incident.facility_frequency_30d",
      severity: freq30,
      summary: `${prior30d.length} prior incident(s) at facility ${payload.facilityId} within 30 days (thresholds: warn≥${INCIDENT_SIGNAL_RULES.frequency30d.warningAt}, critical≥${INCIDENT_SIGNAL_RULES.frequency30d.criticalAt}).`,
      evidence: {
        rule: "incident.facility_frequency_30d",
        organisationId,
        facilityId: payload.facilityId,
        windowDays: 30,
        priorCount: prior30d.length,
        warningAt: INCIDENT_SIGNAL_RULES.frequency30d.warningAt,
        criticalAt: INCIDENT_SIGNAL_RULES.frequency30d.criticalAt,
        currentEventId: event.id,
        currentEntityId: event.entityId,
        priorRefs: compactRefs(prior30d),
      },
    });
  }

  if (payload.type) {
    const matches = prior30d.filter(
      (row) => asNonEmptyString(row.data?.type) === payload.type
    );
    if (matches.length >= 1) {
      signals.push({
        key: "incident.repeated_type",
        severity: "warning",
        summary: `Repeated incident type "${payload.type}" at facility ${payload.facilityId}: ${matches.length} prior match(es) in 30 days.`,
        evidence: {
          rule: "incident.repeated_type",
          organisationId,
          facilityId: payload.facilityId,
          field: "type",
          value: payload.type,
          windowDays: 30,
          matchCount: matches.length,
          matchThreshold: 1,
          priorRefs: compactRefs(matches),
        },
      });
    }
  }

  if (payload.severity) {
    const matches = prior30d.filter(
      (row) => asNonEmptyString(row.data?.severity) === payload.severity
    );
    if (matches.length >= 1) {
      signals.push({
        key: "incident.repeated_severity",
        severity: "info",
        summary: `Repeated severity "${payload.severity}" at facility ${payload.facilityId}: ${matches.length} prior match(es) in 30 days.`,
        evidence: {
          rule: "incident.repeated_severity",
          organisationId,
          facilityId: payload.facilityId,
          field: "severity",
          value: payload.severity,
          windowDays: 30,
          matchCount: matches.length,
          matchThreshold: 1,
          priorRefs: compactRefs(matches),
        },
      });
    }
  }

  if (payload.assetId) {
    const matches = prior30d.filter(
      (row) => asNonEmptyString(row.data?.assetId) === payload.assetId
    );
    if (matches.length >= 1) {
      signals.push({
        key: "incident.repeated_asset",
        severity: "warning",
        summary: `Repeated asset ${payload.assetId} in incidents at facility ${payload.facilityId}: ${matches.length} prior match(es) in 30 days.`,
        evidence: {
          rule: "incident.repeated_asset",
          organisationId,
          facilityId: payload.facilityId,
          field: "assetId",
          value: payload.assetId,
          windowDays: 30,
          matchCount: matches.length,
          matchThreshold: 1,
          priorRefs: compactRefs(matches),
        },
      });

      recommendations.push({
        key: "inspect_repeated_asset",
        title: "Inspect asset with repeated incidents",
        description: `Asset ${payload.assetId} appears in ${matches.length} prior incident(s) at this facility within 30 days.`,
        suggestedAction: "asset.inspect",
        reasoning:
          "Deterministic rule incident.repeated_asset fired (≥1 prior same facilityId + assetId in 30 days).",
      });
    }
  }

  if (payload.locationDetail) {
    const matches = prior30d.filter(
      (row) =>
        asNonEmptyString(row.data?.locationDetail) === payload.locationDetail
    );
    if (matches.length >= 1) {
      signals.push({
        key: "incident.repeated_location",
        severity: "warning",
        summary: `Repeated location "${payload.locationDetail}" at facility ${payload.facilityId}: ${matches.length} prior match(es) in 30 days.`,
        evidence: {
          rule: "incident.repeated_location",
          organisationId,
          facilityId: payload.facilityId,
          field: "locationDetail",
          value: payload.locationDetail,
          windowDays: 30,
          matchCount: matches.length,
          matchThreshold: 1,
          priorRefs: compactRefs(matches),
        },
      });
    }
  }

  if (recentMaintenance.length >= 1) {
    signals.push({
      key: "incident.recent_maintenance_at_facility",
      severity: "info",
      summary: `${recentMaintenance.length} maintenance request(s) at facility ${payload.facilityId} within ${INCIDENT_SIGNAL_RULES.maintenanceLookbackDays} days.`,
      evidence: {
        rule: "incident.recent_maintenance_at_facility",
        organisationId,
        facilityId: payload.facilityId,
        windowDays: INCIDENT_SIGNAL_RULES.maintenanceLookbackDays,
        priorCount: recentMaintenance.length,
        matchThreshold: 1,
        priorRefs: recentMaintenance.slice(0, 10).map((row) => ({
          eventId: row.id,
          entityId: row.entity_id,
          occurredAt: row.occurred_at,
          maintenanceId:
            asNonEmptyString(row.data?.maintenanceId) ?? row.entity_id,
        })),
      },
    });
  }

  const outcome: ActionOutcome = actionOutcomeSucceeded(
    signals.length === 0
      ? `No deterministic incident signals for facility ${payload.facilityId}.`
      : `Detected ${signals.length} deterministic signal(s) for facility ${payload.facilityId}.`,
    {
      actionKey,
      analyzed: true,
      eventId: event.id,
      entityId: event.entityId,
      organisationId,
      facilityId: payload.facilityId,
      incidentId: payload.incidentId ?? event.entityId,
      type: payload.type,
      severity: payload.severity,
      assetId: payload.assetId,
      locationDetail: payload.locationDetail,
      history: {
        priorIncidentCount30d: prior30d.length,
        priorIncidentCount7d: prior7d.length,
        recentMaintenanceCount14d: recentMaintenance.length,
        lookbackDays: INCIDENT_SIGNAL_RULES.lookbackDays,
        maintenanceLookbackDays: INCIDENT_SIGNAL_RULES.maintenanceLookbackDays,
      },
      rules: INCIDENT_SIGNAL_RULES,
      signalCount: signals.length,
      recommendationCount: recommendations.length,
    },
    { signals, recommendations }
  );

  return outcome;
};
