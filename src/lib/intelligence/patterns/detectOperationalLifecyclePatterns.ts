import { OperationalEventTypes } from "@/lib/events/taxonomy";
import {
  normalizeOperationalTimelineEvent,
} from "@/lib/operational/timeline/normalizeOperationalTimelineEvent";
import type {
  LifecycleEventRow,
  OperationalTimelineEvent,
} from "@/lib/operational/timeline/types";

export const OPERATIONAL_PATTERN_THRESHOLDS = {
  analysisWindowDays: 30,
  maintenanceToIncidentMaxGapDays: 14,
  patternA: {
    minMaintenanceFacility: 2,
    minIncidentsFacility: 2,
    minPairAsset: 1,
  },
  patternB: {
    minRequestsAsset: 2,
    minRequestsFacility: 3,
  },
  patternC: {
    minIncidents: 4,
    responseRatio: 0.5,
    delayHours: 48,
    recentDays: 7,
  },
  patternD: {
    delayHoursCreatedToStarted: 72,
    minDelayed: 2,
  },
  patternE: {
    recurrenceWindowDays: 14,
    minRecurrencesFacility: 2,
    minRecurrencesAsset: 1,
  },
  patternF: {
    minEvents: 4,
    minEntityTypes: 2,
  },
  patternG: {
    minUnresolved: 3,
  },
  priorityScoreAt: 48,
} as const;

export type OperationalPatternKey =
  | "maintenance_precedes_incident"
  | "repeated_maintenance_without_resolution"
  | "incidents_outpacing_response"
  | "delayed_work_orders"
  | "incidents_after_maintenance"
  | "asset_recurrence"
  | "operational_backlog";

export type OperationalPatternFinding = {
  id: string;
  findingKey: string;
  patternKey: OperationalPatternKey;
  severity: "info" | "warning" | "critical";
  title: string;
  summary: string;
  whatItSaw: string;
  sequence: string[];
  facilityId?: string;
  relatedEventIds: string[];
  evidence: Array<{ type: string; value?: unknown }>;
  score: number;
  scoreBreakdown: Record<string, number>;
  elevateToPriority: boolean;
};

export type LifecyclePatternEvent = LifecycleEventRow;

type ScoredInput = {
  severity: OperationalPatternFinding["severity"];
  recurrence: number;
  facilityCount: number;
  assetCount: number;
  unresolvedDurationHours: number;
  eventFrequency: number;
  crossModule: boolean;
  confidence: "low" | "medium" | "high";
  evidenceEventCount: number;
  moduleCount: number;
};

function hoursBetween(fromIso: string, toIso: string): number {
  return Math.max(0, (Date.parse(toIso) - Date.parse(fromIso)) / 36e5);
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => !!value))];
}

function entityTypesPresent(events: OperationalTimelineEvent[]): number {
  const types = new Set(events.map((event) => event.entityType));
  return types.size;
}

/**
 * Explainable additive score. Each component is capped so a single dimension
 * cannot dominate. Weights are documented in the returned breakdown.
 */
function formatAssetIdForCopy(assetId: string): string {
  const cleaned = assetId.replace(/_/g, " ").replace(/-/g, " ").trim();
  if (/^asset\s+/i.test(cleaned)) {
    return cleaned.replace(/^asset\s+/i, "Asset ");
  }
  return `Asset ${cleaned}`;
}

export function scoreOperationalPattern(input: ScoredInput): {
  score: number;
  breakdown: Record<string, number>;
} {
  const severity =
    input.severity === "critical" ? 30 : input.severity === "warning" ? 18 : 8;
  const recurrence = Math.min(input.recurrence * 4, 20);
  const facilities = Math.min(input.facilityCount * 6, 18);
  const assets = Math.min(input.assetCount * 8, 16);
  const unresolved = Math.min((input.unresolvedDurationHours / 24) * 3, 15);
  const frequency = Math.min(input.eventFrequency, 20);
  const crossModule = input.crossModule ? 12 : 0;
  const confidence =
    input.confidence === "high" ? 12 : input.confidence === "medium" ? 7 : 3;
  const evidence = Math.min(
    input.evidenceEventCount + input.moduleCount * 2,
    16
  );

  const breakdown = {
    severity,
    recurrence,
    facilities,
    assets,
    unresolvedDuration: Math.round(unresolved * 10) / 10,
    eventFrequency: frequency,
    crossModule,
    confidence,
    evidenceStrength: evidence,
  };

  const score = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
  return { score: Math.round(score * 10) / 10, breakdown };
}

function elevateFinding(
  score: number,
  severity: OperationalPatternFinding["severity"],
  crossModule: boolean,
  evidenceEventCount: number
): boolean {
  return (
    score >= OPERATIONAL_PATTERN_THRESHOLDS.priorityScoreAt ||
    severity === "critical" ||
    (crossModule && severity !== "info" && evidenceEventCount >= 6)
  );
}

function toTimeline(events: LifecyclePatternEvent[]): OperationalTimelineEvent[] {
  return events
    .map(normalizeOperationalTimelineEvent)
    .filter((event): event is OperationalTimelineEvent => event != null)
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
}

function ofType(
  events: OperationalTimelineEvent[],
  eventType: string
): OperationalTimelineEvent[] {
  return events.filter((event) => event.eventType === eventType);
}

function hasLaterEvent(
  events: OperationalTimelineEvent[],
  entityId: string,
  eventType: string,
  afterIso: string
): boolean {
  return events.some(
    (event) =>
      event.entityId === entityId &&
      event.eventType === eventType &&
      Date.parse(event.occurredAt) > Date.parse(afterIso)
  );
}

function locationGroups(
  events: OperationalTimelineEvent[]
): Map<string, OperationalTimelineEvent[]> {
  const groups = new Map<string, OperationalTimelineEvent[]>();
  for (const event of events) {
    if (!event.facilityId && !event.assetId) continue;
    const key = event.assetId
      ? `asset:${event.assetId}`
      : `facility:${event.facilityId}`;
    const list = groups.get(key) ?? [];
    list.push(event);
    groups.set(key, list);
  }
  return groups;
}

function evidenceBase(options: {
  patternKey: OperationalPatternKey;
  events: OperationalTimelineEvent[];
  facilities: string[];
  assets: string[];
  windowDays: number;
  whatItSaw: string;
  sequence: string[];
  extra?: Array<{ type: string; value?: unknown }>;
  score: number;
  scoreBreakdown: Record<string, number>;
}): Array<{ type: string; value?: unknown }> {
  const maintenanceEvents = options.events.filter((e) =>
    e.eventType.startsWith("facility.maintenance_")
  );
  const incidentEvents = options.events.filter((e) =>
    e.eventType.startsWith("facility.incident_")
  );
  const workOrderEvents = options.events.filter((e) =>
    e.eventType.startsWith("facility.work_order_")
  );

  return [
    { type: "pattern_key", value: options.patternKey },
    { type: "event_count", value: options.events.length },
    { type: "facility_count", value: options.facilities.length },
    { type: "asset_count", value: options.assets.length },
    { type: "maintenance_event_count", value: maintenanceEvents.length },
    { type: "incident_event_count", value: incidentEvents.length },
    { type: "work_order_event_count", value: workOrderEvents.length },
    { type: "analysis_window_days", value: options.windowDays },
    { type: "what_it_saw", value: options.whatItSaw },
    { type: "sequence", value: options.sequence },
    { type: "event_ids", value: options.events.map((event) => event.id) },
    { type: "entity_ids", value: unique(options.events.map((e) => e.entityId)) },
    { type: "facility_ids", value: options.facilities },
    { type: "asset_ids", value: options.assets },
    { type: "score", value: options.score },
    { type: "score_breakdown", value: options.scoreBreakdown },
    ...(options.extra ?? []),
  ];
}

function finishFinding(input: {
  patternKey: OperationalPatternKey;
  scope: string;
  severity: OperationalPatternFinding["severity"];
  title: string;
  summary: string;
  whatItSaw: string;
  sequence: string[];
  events: OperationalTimelineEvent[];
  windowDays: number;
  recurrence: number;
  unresolvedDurationHours: number;
  confidence: ScoredInput["confidence"];
  extra?: Array<{ type: string; value?: unknown }>;
}): OperationalPatternFinding {
  const facilities = unique(input.events.map((event) => event.facilityId));
  const assets = unique(input.events.map((event) => event.assetId));
  const moduleCount = entityTypesPresent(input.events);
  const crossModule = moduleCount >= 2;
  const scored = scoreOperationalPattern({
    severity: input.severity,
    recurrence: input.recurrence,
    facilityCount: Math.max(facilities.length, 1),
    assetCount: assets.length,
    unresolvedDurationHours: input.unresolvedDurationHours,
    eventFrequency: input.events.length,
    crossModule,
    confidence: input.confidence,
    evidenceEventCount: input.events.length,
    moduleCount,
  });

  const findingKey = `operational:${input.patternKey}:${input.scope}`;
  return {
    id: `pattern:${findingKey}`,
    findingKey,
    patternKey: input.patternKey,
    severity: input.severity,
    title: input.title,
    summary: input.summary,
    whatItSaw: input.whatItSaw,
    sequence: input.sequence,
    facilityId: facilities.length === 1 ? facilities[0] : undefined,
    relatedEventIds: unique(input.events.map((event) => event.id)),
    evidence: evidenceBase({
      patternKey: input.patternKey,
      events: input.events,
      facilities,
      assets,
      windowDays: input.windowDays,
      whatItSaw: input.whatItSaw,
      sequence: input.sequence,
      extra: input.extra,
      score: scored.score,
      scoreBreakdown: scored.breakdown,
    }),
    score: scored.score,
    scoreBreakdown: scored.breakdown,
    elevateToPriority: elevateFinding(
      scored.score,
      input.severity,
      crossModule,
      input.events.length
    ),
  };
}

function detectMaintenancePrecedesIncident(
  events: OperationalTimelineEvent[],
  windowTo: string,
  windowDays: number
): OperationalPatternFinding[] {
  const findings: OperationalPatternFinding[] = [];
  const maxGapMs =
    OPERATIONAL_PATTERN_THRESHOLDS.maintenanceToIncidentMaxGapDays * 24 * 36e5;

  for (const [scope, grouped] of locationGroups(events)) {
    const isAsset = scope.startsWith("asset:");
    const requested = ofType(
      grouped,
      OperationalEventTypes.FACILITY_MAINTENANCE_REQUESTED
    );
    const incidents = ofType(
      grouped,
      OperationalEventTypes.FACILITY_INCIDENT_REPORTED
    );
    if (requested.length === 0 || incidents.length === 0) continue;

    const pairs: OperationalTimelineEvent[] = [];
    let unresolvedHours = 0;

    for (const maintenance of requested) {
      const completedBeforeIncident = (incidentAt: string) =>
        grouped.some(
          (event) =>
            event.entityId === maintenance.entityId &&
            event.eventType ===
              OperationalEventTypes.FACILITY_MAINTENANCE_COMPLETED &&
            Date.parse(event.occurredAt) > Date.parse(maintenance.occurredAt) &&
            Date.parse(event.occurredAt) <= Date.parse(incidentAt)
        );

      const following = incidents.filter((incident) => {
        const gap =
          Date.parse(incident.occurredAt) - Date.parse(maintenance.occurredAt);
        return gap > 0 && gap <= maxGapMs && !completedBeforeIncident(incident.occurredAt);
      });

      if (following.length === 0) continue;
      pairs.push(maintenance, ...following);
      unresolvedHours = Math.max(
        unresolvedHours,
        hoursBetween(maintenance.occurredAt, following[0].occurredAt)
      );
    }

    const related = unique(pairs.map((event) => event.id));
    const relatedEvents = grouped.filter((event) => related.includes(event.id));
    const maintenanceCount = relatedEvents.filter(
      (event) =>
        event.eventType === OperationalEventTypes.FACILITY_MAINTENANCE_REQUESTED
    ).length;
    const incidentCount = relatedEvents.filter(
      (event) =>
        event.eventType === OperationalEventTypes.FACILITY_INCIDENT_REPORTED
    ).length;

    const enough = isAsset
      ? maintenanceCount >= OPERATIONAL_PATTERN_THRESHOLDS.patternA.minPairAsset &&
        incidentCount >= OPERATIONAL_PATTERN_THRESHOLDS.patternA.minPairAsset
      : maintenanceCount >=
          OPERATIONAL_PATTERN_THRESHOLDS.patternA.minMaintenanceFacility &&
        incidentCount >=
          OPERATIONAL_PATTERN_THRESHOLDS.patternA.minIncidentsFacility;

    if (!enough) continue;

    const locationLabel = isAsset ? "this asset" : "this facility";
    const whatItSaw = `${maintenanceCount} maintenance request${
      maintenanceCount === 1 ? "" : "s"
    } were recorded at ${locationLabel} before ${incidentCount} incident${
      incidentCount === 1 ? "" : "s"
    } ${incidentCount === 1 ? "was" : "were"} reported.`;

    findings.push(
      finishFinding({
        patternKey: "maintenance_precedes_incident",
        scope,
        severity:
          incidentCount >= 4 || maintenanceCount >= 4 ? "critical" : "warning",
        title: isAsset
          ? "Open maintenance has been followed by incidents on the same asset"
          : "Open maintenance has been followed by incidents at this facility",
        summary: `Open or delayed maintenance at ${locationLabel} came before ${incidentCount} recent incident${
          incidentCount === 1 ? "" : "s"
        }. These activities appear to be connected, but this does not yet confirm that one caused the other.`,
        whatItSaw,
        sequence: [
          "Maintenance requested",
          "Maintenance remained unresolved",
          "Incident reported at the same location",
        ],
        events: relatedEvents,
        windowDays,
        recurrence: Math.min(maintenanceCount, incidentCount),
        unresolvedDurationHours: unresolvedHours,
        confidence: isAsset ? "high" : "medium",
        extra: [
          { type: "association", value: "preceded" },
          { type: "window_end", value: windowTo },
        ],
      })
    );
  }

  return findings;
}

function detectRepeatedMaintenance(
  events: OperationalTimelineEvent[],
  windowDays: number
): OperationalPatternFinding[] {
  const findings: OperationalPatternFinding[] = [];

  for (const [scope, grouped] of locationGroups(events)) {
    const isAsset = scope.startsWith("asset:");
    const requested = ofType(
      grouped,
      OperationalEventTypes.FACILITY_MAINTENANCE_REQUESTED
    );
    if (requested.length < 2) continue;

    const overlapping = requested.filter(
      (event) =>
        !hasLaterEvent(
          grouped,
          event.entityId,
          OperationalEventTypes.FACILITY_MAINTENANCE_COMPLETED,
          event.occurredAt
        )
    );

    const enough = isAsset
      ? requested.length >= OPERATIONAL_PATTERN_THRESHOLDS.patternB.minRequestsAsset
      : requested.length >=
        OPERATIONAL_PATTERN_THRESHOLDS.patternB.minRequestsFacility;

    if (!enough) continue;
    if (overlapping.length < 2 && requested.length < (isAsset ? 3 : 4)) continue;

    const types = unique(requested.map((event) => event.issueType));
    const categories = unique(requested.map((event) => event.categoryId));
    const first = requested[0];
    const last = requested[requested.length - 1];
    const whatItSaw = `${requested.length} maintenance requests built up on the same ${
      isAsset ? "asset" : "facility"
    }, including ${overlapping.length} that still had no completion recorded by the end of this period.`;

    findings.push(
      finishFinding({
        patternKey: "repeated_maintenance_without_resolution",
        scope,
        severity: overlapping.length >= 3 ? "critical" : "warning",
        title: "Maintenance requests keep stacking up without being closed",
        summary: isAsset
          ? "The same asset keeps attracting maintenance requests that are not being finished."
          : "The same facility keeps attracting maintenance requests that are not being finished.",
        whatItSaw,
        sequence: [
          "Maintenance requested",
          "Earlier request still open",
          "Another maintenance request arrived",
        ],
        events: requested,
        windowDays,
        recurrence: requested.length,
        unresolvedDurationHours: hoursBetween(first.occurredAt, last.occurredAt),
        confidence: isAsset ? "high" : "medium",
        extra: [
          { type: "unresolved_request_count", value: overlapping.length },
          ...(types.length === 1
            ? [{ type: "issue_type", value: types[0] }]
            : []),
          ...(categories.length === 1
            ? [{ type: "category_id", value: categories[0] }]
            : []),
        ],
      })
    );
  }

  return findings;
}

function detectIncidentsOutpacingResponse(
  events: OperationalTimelineEvent[],
  windowFrom: string,
  windowTo: string,
  windowDays: number
): OperationalPatternFinding[] {
  const incidents = ofType(
    events,
    OperationalEventTypes.FACILITY_INCIDENT_REPORTED
  );
  if (incidents.length < OPERATIONAL_PATTERN_THRESHOLDS.patternC.minIncidents) {
    return [];
  }

  const midMs =
    Date.parse(windowTo) -
    OPERATIONAL_PATTERN_THRESHOLDS.patternC.recentDays * 24 * 36e5;
  const recent = incidents.filter((event) => Date.parse(event.occurredAt) >= midMs);
  const previous = incidents.filter((event) => Date.parse(event.occurredAt) < midMs);

  if (recent.length <= previous.length || recent.length < 3) return [];

  const responses = [
    ...ofType(events, OperationalEventTypes.FACILITY_MAINTENANCE_REQUESTED),
    ...ofType(events, OperationalEventTypes.FACILITY_WORK_ORDER_CREATED),
  ].filter((event) => Date.parse(event.occurredAt) >= midMs);

  const ratio =
    recent.length === 0 ? 1 : responses.length / recent.length;
  const delayed = incidents.filter((incident) => {
    const linked = events.filter((event) => {
      const sameIncident =
        event.incidentId === incident.entityId ||
        event.incidentId === incident.incidentId;
      const isResponse =
        event.eventType === OperationalEventTypes.FACILITY_WORK_ORDER_CREATED ||
        event.eventType === OperationalEventTypes.FACILITY_MAINTENANCE_REQUESTED;
      return (
        sameIncident &&
        isResponse &&
        Date.parse(event.occurredAt) >= Date.parse(incident.occurredAt)
      );
    });
    if (linked.length === 0) return true;
    const first = linked[0];
    return (
      hoursBetween(incident.occurredAt, first.occurredAt) >=
      OPERATIONAL_PATTERN_THRESHOLDS.patternC.delayHours
    );
  });

  const delayedShare = delayed.length / incidents.length;
  if (
    ratio > OPERATIONAL_PATTERN_THRESHOLDS.patternC.responseRatio &&
    delayedShare < 0.5
  ) {
    return [];
  }

  const related = unique([
    ...recent.map((event) => event.id),
    ...responses.map((event) => event.id),
    ...delayed.map((event) => event.id),
  ]);
  const relatedEvents = events.filter((event) => related.includes(event.id));
  const whatItSaw = `${recent.length} incidents were reported in the last ${OPERATIONAL_PATTERN_THRESHOLDS.patternC.recentDays} days versus ${previous.length} in the period before that, while ${responses.length} maintenance requests or work orders were created recently.`;

  return [
    finishFinding({
      patternKey: "incidents_outpacing_response",
      scope: "org",
      severity: delayedShare >= 0.6 || ratio <= 0.25 ? "critical" : "warning",
      title: "Issues are growing faster than they’re being addressed",
      summary:
        "Incidents are arriving faster than maintenance and work orders are clearing them. Timing comes from recorded activity, not assumed service targets.",
      whatItSaw,
      sequence: [
        "Incidents reported",
        "Related maintenance or work orders lagged or were not created",
      ],
      events: relatedEvents,
      windowDays,
      recurrence: recent.length - previous.length,
      unresolvedDurationHours:
        delayed[0] && relatedEvents[0]
          ? hoursBetween(delayed[0].occurredAt, windowTo)
          : 0,
      confidence: delayed.length >= 3 ? "high" : "medium",
      extra: [
        { type: "recent_incident_count", value: recent.length },
        { type: "previous_incident_count", value: previous.length },
        { type: "recent_response_count", value: responses.length },
        { type: "response_ratio", value: Math.round(ratio * 100) / 100 },
        { type: "delayed_incident_count", value: delayed.length },
        { type: "window_from", value: windowFrom },
      ],
    }),
  ];
}

function detectDelayedWorkOrders(
  events: OperationalTimelineEvent[],
  windowTo: string,
  windowDays: number
): OperationalPatternFinding[] {
  const created = ofType(
    events,
    OperationalEventTypes.FACILITY_WORK_ORDER_CREATED
  );
  const delayed: OperationalTimelineEvent[] = [];
  let maxGap = 0;
  const linkedOpenIncidents = new Set<string>();

  for (const workOrder of created) {
    const later = events.filter(
      (event) =>
        event.entityId === workOrder.entityId &&
        Date.parse(event.occurredAt) >= Date.parse(workOrder.occurredAt)
    );
    const started = later.find(
      (event) =>
        event.eventType === OperationalEventTypes.FACILITY_WORK_ORDER_STARTED
    );
    const completed = later.find(
      (event) =>
        event.eventType ===
          OperationalEventTypes.FACILITY_WORK_ORDER_COMPLETED ||
        event.eventType === OperationalEventTypes.FACILITY_WORK_ORDER_CANCELLED
    );
    const assigned = later.find(
      (event) =>
        event.eventType === OperationalEventTypes.FACILITY_WORK_ORDER_ASSIGNED
    );

    const startedAt = started?.occurredAt ?? completed?.occurredAt ?? windowTo;
    const gapHours = hoursBetween(workOrder.occurredAt, startedAt);
    const stillOpen = !started && !completed;
    const slowStart =
      gapHours >= OPERATIONAL_PATTERN_THRESHOLDS.patternD.delayHoursCreatedToStarted;
    const slowAssign =
      assigned != null &&
      hoursBetween(workOrder.occurredAt, assigned.occurredAt) >=
        OPERATIONAL_PATTERN_THRESHOLDS.patternD.delayHoursCreatedToStarted;

    if (!(stillOpen && slowStart) && !slowAssign && !(stillOpen && gapHours >= 24 && workOrder.incidentId)) {
      continue;
    }

    delayed.push(workOrder);
    maxGap = Math.max(maxGap, gapHours);

    if (workOrder.incidentId) {
      const resolved = events.some(
        (event) =>
          (event.entityId === workOrder.incidentId ||
            event.incidentId === workOrder.incidentId) &&
          event.eventType === OperationalEventTypes.FACILITY_INCIDENT_RESOLVED
      );
      if (!resolved) linkedOpenIncidents.add(workOrder.incidentId);
    }
  }

  const enough =
    delayed.length >= OPERATIONAL_PATTERN_THRESHOLDS.patternD.minDelayed ||
    (delayed.length >= 1 && linkedOpenIncidents.size >= 1);
  if (!enough) return [];

  const relatedEvents = events.filter(
    (event) =>
      delayed.some((item) => item.entityId === event.entityId) ||
      (event.incidentId != null && linkedOpenIncidents.has(event.incidentId))
  );
  const whatItSaw = `${delayed.length} work order${
    delayed.length === 1 ? "" : "s"
  } stayed unstarted or moved slowly; ${linkedOpenIncidents.size} linked incident${
    linkedOpenIncidents.size === 1 ? "" : "s"
  } still had no resolve recorded.`;

  return [
    finishFinding({
      patternKey: "delayed_work_orders",
      scope: "org",
      severity:
        linkedOpenIncidents.size >= 2 || delayed.length >= 4
          ? "critical"
          : "warning",
      title:
        linkedOpenIncidents.size > 0
          ? "Incidents are still open while linked work orders wait"
          : "Work orders are sitting unstarted after being created",
      summary:
        linkedOpenIncidents.size > 0
          ? "Important work is still open while the linked work orders have not moved."
          : "Work orders have been created but have not started within a reasonable time.",
      whatItSaw,
      sequence: [
        "Work order created",
        "Assignment or start lagged",
        linkedOpenIncidents.size > 0
          ? "Linked incident remained open"
          : "Work order still not started",
      ],
      events: relatedEvents.length > 0 ? relatedEvents : delayed,
      windowDays,
      recurrence: delayed.length,
      unresolvedDurationHours: maxGap,
      confidence: linkedOpenIncidents.size > 0 ? "high" : "medium",
      extra: [
        { type: "delayed_work_order_count", value: delayed.length },
        { type: "linked_open_incident_count", value: linkedOpenIncidents.size },
        { type: "linked_open_incident_ids", value: [...linkedOpenIncidents] },
      ],
    }),
  ];
}

function detectIncidentsAfterMaintenance(
  events: OperationalTimelineEvent[],
  windowDays: number
): OperationalPatternFinding[] {
  const findings: OperationalPatternFinding[] = [];
  const maxGapMs =
    OPERATIONAL_PATTERN_THRESHOLDS.patternE.recurrenceWindowDays * 24 * 36e5;

  for (const [scope, grouped] of locationGroups(events)) {
    const isAsset = scope.startsWith("asset:");
    const completed = ofType(
      grouped,
      OperationalEventTypes.FACILITY_MAINTENANCE_COMPLETED
    );
    const incidents = ofType(
      grouped,
      OperationalEventTypes.FACILITY_INCIDENT_REPORTED
    );
    const pairs: OperationalTimelineEvent[] = [];

    for (const maintenance of completed) {
      const following = incidents.filter((incident) => {
        const gap =
          Date.parse(incident.occurredAt) - Date.parse(maintenance.occurredAt);
        return gap > 0 && gap <= maxGapMs;
      });
      if (following.length === 0) continue;
      pairs.push(maintenance, ...following);
    }

    const related = grouped.filter((event) =>
      unique(pairs.map((item) => item.id)).includes(event.id)
    );
    const maintenanceCount = related.filter(
      (event) =>
        event.eventType === OperationalEventTypes.FACILITY_MAINTENANCE_COMPLETED
    ).length;
    const incidentCount = related.filter(
      (event) =>
        event.eventType === OperationalEventTypes.FACILITY_INCIDENT_REPORTED
    ).length;

    const enough = isAsset
      ? incidentCount >=
          OPERATIONAL_PATTERN_THRESHOLDS.patternE.minRecurrencesAsset &&
        maintenanceCount >= 1
      : incidentCount >=
          OPERATIONAL_PATTERN_THRESHOLDS.patternE.minRecurrencesFacility &&
        maintenanceCount >= 1;
    if (!enough) continue;

    const whatItSaw = `${maintenanceCount} maintenance completion${
      maintenanceCount === 1 ? "" : "s"
    } at this ${isAsset ? "asset" : "facility"} ${
      maintenanceCount === 1 ? "was" : "were"
    } followed by ${incidentCount} incident${
      incidentCount === 1 ? "" : "s"
    } within ${OPERATIONAL_PATTERN_THRESHOLDS.patternE.recurrenceWindowDays} days.`;

    findings.push(
      finishFinding({
        patternKey: "incidents_after_maintenance",
        scope,
        severity: incidentCount >= 3 ? "warning" : "info",
        title: isAsset
          ? "Incidents came back on the same asset after maintenance finished"
          : "Incidents came back at this location after maintenance finished",
        summary:
          "After maintenance was completed, further incidents appeared in the same place. That connection does not by itself mean the work was ineffective.",
        whatItSaw,
        sequence: [
          "Maintenance completed",
          "Incident reported again at the same location",
        ],
        events: related,
        windowDays,
        recurrence: incidentCount,
        unresolvedDurationHours: 0,
        confidence: isAsset ? "medium" : "low",
      })
    );
  }

  return findings;
}

function detectAssetRecurrence(
  events: OperationalTimelineEvent[],
  windowDays: number
): OperationalPatternFinding[] {
  const byAsset = new Map<string, OperationalTimelineEvent[]>();
  for (const event of events) {
    if (!event.assetId) continue;
    const list = byAsset.get(event.assetId) ?? [];
    list.push(event);
    byAsset.set(event.assetId, list);
  }

  const findings: OperationalPatternFinding[] = [];
  for (const [assetId, grouped] of byAsset) {
    const modules = entityTypesPresent(grouped);
    if (
      grouped.length < OPERATIONAL_PATTERN_THRESHOLDS.patternF.minEvents ||
      modules < OPERATIONAL_PATTERN_THRESHOLDS.patternF.minEntityTypes
    ) {
      if (!(modules >= 3 && grouped.length >= 3)) continue;
    }

    const whatItSaw = `Most of this activity is linked to ${formatAssetIdForCopy(assetId)} — ${grouped.length} related activit${
      grouped.length === 1 ? "y" : "ies"
    } across incidents, maintenance, and work orders.`;
    findings.push(
      finishFinding({
        patternKey: "asset_recurrence",
        scope: `asset:${assetId}`,
        severity: modules >= 3 && grouped.length >= 6 ? "critical" : "warning",
        title: "One asset keeps showing up across related work",
        summary:
          "The same asset is appearing across incidents, maintenance requests, and work orders in this period.",
        whatItSaw,
        sequence: unique(
          grouped.map((event) => {
            if (event.eventType.includes("maintenance")) return "Maintenance activity";
            if (event.eventType.includes("work_order")) return "Work order activity";
            return "Incident activity";
          })
        ),
        events: grouped,
        windowDays,
        recurrence: grouped.length,
        unresolvedDurationHours: 0,
        confidence: "high",
        extra: [{ type: "subject", value: assetId }],
      })
    );
  }

  return findings;
}

function detectOperationalBacklog(
  events: OperationalTimelineEvent[],
  windowTo: string,
  windowDays: number
): OperationalPatternFinding[] {
  const openMaintenance = ofType(
    events,
    OperationalEventTypes.FACILITY_MAINTENANCE_REQUESTED
  ).filter(
    (event) =>
      !hasLaterEvent(
        events,
        event.entityId,
        OperationalEventTypes.FACILITY_MAINTENANCE_COMPLETED,
        event.occurredAt
      )
  );
  const openWorkOrders = ofType(
    events,
    OperationalEventTypes.FACILITY_WORK_ORDER_CREATED
  ).filter((event) => {
    const done =
      hasLaterEvent(
        events,
        event.entityId,
        OperationalEventTypes.FACILITY_WORK_ORDER_COMPLETED,
        event.occurredAt
      ) ||
      hasLaterEvent(
        events,
        event.entityId,
        OperationalEventTypes.FACILITY_WORK_ORDER_CANCELLED,
        event.occurredAt
      );
    return !done;
  });

  const linkedOpenIncidents = ofType(
    events,
    OperationalEventTypes.FACILITY_INCIDENT_REPORTED
  ).filter((incident) => {
    const resolved = events.some(
      (event) =>
        (event.entityId === incident.entityId ||
          event.incidentId === incident.entityId) &&
        event.eventType === OperationalEventTypes.FACILITY_INCIDENT_RESOLVED
    );
    if (resolved) return false;
    return openWorkOrders.some(
      (workOrder) =>
        workOrder.incidentId === incident.entityId ||
        (incident.workOrderIds ?? []).includes(workOrder.entityId)
    );
  });

  const unresolved = [...openMaintenance, ...openWorkOrders];
  if (unresolved.length < OPERATIONAL_PATTERN_THRESHOLDS.patternG.minUnresolved) {
    return [];
  }

  const facilities = unique(unresolved.map((event) => event.facilityId));
  const oldest = unresolved[0];
  const related = [...unresolved, ...linkedOpenIncidents];
  const whatItSaw = `${openMaintenance.length} maintenance request${
    openMaintenance.length === 1 ? "" : "s"
  } and ${openWorkOrders.length} work order${
    openWorkOrders.length === 1 ? "" : "s"
  } still have no completion recorded, spanning ${facilities.length} facilit${
    facilities.length === 1 ? "y" : "ies"
  }.`;

  return [
    finishFinding({
      patternKey: "operational_backlog",
      scope: facilities.length === 1 ? `facility:${facilities[0]}` : "org",
      severity:
        unresolved.length >= 8 || facilities.length >= 3 ? "critical" : "warning",
      title:
        facilities.length >= 2
          ? "Open work is building up across multiple facilities"
          : "Open maintenance and work orders are building up",
      summary:
        facilities.length >= 2
          ? `Unfinished maintenance and work orders are building up across ${facilities.length} facilities.`
          : "Unfinished maintenance and work orders are building up in this period.",
      whatItSaw,
      sequence: [
        "Maintenance requested or work order created",
        "No completion recorded yet",
        linkedOpenIncidents.length > 0
          ? "Linked incidents remain open"
          : "Open work still waiting",
      ],
      events: related,
      windowDays,
      recurrence: unresolved.length,
      unresolvedDurationHours: oldest
        ? hoursBetween(oldest.occurredAt, windowTo)
        : 0,
      confidence: "medium",
      extra: [
        { type: "open_maintenance_count", value: openMaintenance.length },
        { type: "open_work_order_count", value: openWorkOrders.length },
        { type: "linked_open_incident_count", value: linkedOpenIncidents.length },
      ],
    }),
  ];
}

/**
 * Detect cross-module operational patterns from lifecycle events.
 * Returns no findings when evidence is below documented thresholds.
 */
export function detectOperationalLifecyclePatterns(input: {
  events: LifecyclePatternEvent[];
  windowFrom: string;
  windowTo: string;
}): OperationalPatternFinding[] {
  const events = toTimeline(input.events);
  if (events.length === 0) return [];

  const windowDays = Math.max(
    1,
    Math.round(
      (Date.parse(input.windowTo) - Date.parse(input.windowFrom)) / 86400000
    )
  );

  const findings = [
    ...detectMaintenancePrecedesIncident(events, input.windowTo, windowDays),
    ...detectRepeatedMaintenance(events, windowDays),
    ...detectIncidentsOutpacingResponse(
      events,
      input.windowFrom,
      input.windowTo,
      windowDays
    ),
    ...detectDelayedWorkOrders(events, input.windowTo, windowDays),
    ...detectIncidentsAfterMaintenance(events, windowDays),
    ...detectAssetRecurrence(events, windowDays),
    ...detectOperationalBacklog(events, input.windowTo, windowDays),
  ];

  findings.sort((a, b) => b.score - a.score);
  return findings;
}
