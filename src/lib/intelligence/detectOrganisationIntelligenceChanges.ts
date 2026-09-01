import type {
  IntelligenceChange,
  IntelligenceChangeCategory,
  IntelligenceChangeComparisonWindow,
  IntelligenceChangeDirection,
  IntelligenceChangeIntensity,
  IntelligencePrioritySeverity,
} from "./types";

/** V1 comparison: recent 7 days vs the 7 days immediately before. */
export const COMPARISON_RECENT_DAYS = 7;
export const COMPARISON_BASELINE_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const MIN_ABSOLUTE_INCREASE = 2;
const MIN_RELATIVE_INCREASE = 0.5;
const MIN_BASELINE_FOR_RELATIVE = 2;
const MIN_BASELINE_FOR_DECREASE = 3;

type EventRow = {
  id: string;
  occurred_at: string;
  data: Record<string, unknown> | null;
};

type ActionRunRow = {
  operational_event_id: string;
  action_key: string;
  status: string;
  result: unknown;
};

type DecisionRow = {
  id: string;
  decision: "accepted" | "dismissed" | "deferred";
  created_at: string;
};

type PeriodSlice = "recent" | "baseline";

type PeriodCounts = {
  incidentsInPeriod: number;
  incidentsWithCoreRuns: number;
  totalIncidents: number;
  criticalIncidents: number;
  highRiskIncidents: number;
  signalPatterns: Map<string, SignalPatternCount>;
  decisions: {
    accepted: number;
    dismissed: number;
    deferred: number;
  };
};

type SignalPatternCount = {
  briefingIdentity: string;
  signalKey: string;
  subjectLabel: string | null;
  eventIds: string[];
};

type ComparisonInput = {
  windowTo: string;
  /** Canonical Work root events. */
  workEvents?: EventRow[];
  /** Legacy historical Incident root events. */
  incidentEvents: EventRow[];
  signalRunsByEventId: Map<string, ActionRunRow>;
  riskRunsByEventId: Map<string, ActionRunRow>;
  decisions: DecisionRow[];
};

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function timestampMs(iso: string): number {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

function humanSubjectLabel(value: string | null): string | null {
  if (!value) return null;
  if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value)) return null;
  if (/^(FAC|AST|INC|EVT)-/i.test(value)) return null;
  return value.replace(/_/g, " ");
}

function isOrgScopedSignalKey(signalKey: string): boolean {
  return (
    signalKey === "incident.facility_frequency_7d" ||
    signalKey === "incident.facility_frequency_30d" ||
    signalKey === "incident.recent_maintenance_at_facility" ||
    signalKey === "work.facility_frequency_7d" ||
    signalKey === "work.facility_frequency_30d"
  );
}

function parseStoredFindingKey(findingKey: string): {
  signalKey: string;
  rawSubject: string | null;
} {
  if (!findingKey.startsWith("signal:")) {
    return { signalKey: findingKey, rawSubject: null };
  }
  const rest = findingKey.slice("signal:".length);
  const colonIdx = rest.indexOf(":");
  if (colonIdx === -1) {
    return { signalKey: rest, rawSubject: null };
  }
  return {
    signalKey: rest.slice(0, colonIdx),
    rawSubject: rest.slice(colonIdx + 1) || null,
  };
}

function signalFindingKey(
  signalKey: string,
  evidence: Record<string, unknown>,
  facilityId: string | null
): string {
  const facility = facilityId?.trim().toUpperCase() || "ORG";
  const subject =
    asNonEmptyString(evidence.value) ??
    asNonEmptyString(evidence.assetId) ??
    asNonEmptyString(evidence.locationDetail);

  switch (signalKey) {
    case "incident.facility_frequency_7d":
    case "incident.facility_frequency_30d":
      return `signal:${signalKey}`;
    case "incident.repeated_type":
    case "incident.repeated_severity":
    case "incident.repeated_asset":
      return `signal:${signalKey}:${subject?.toUpperCase() ?? "ORG"}`;
    case "incident.repeated_location":
      return `signal:${signalKey}:${subject?.toUpperCase() ?? "ORG"}`;
    case "incident.recent_maintenance_at_facility":
      return `signal:${signalKey}`;
    case "work.facility_frequency_7d":
    case "work.facility_frequency_30d":
      return `signal:${signalKey}`;
    default:
      return `signal:${signalKey}:${facility}`;
  }
}

function briefingSubjectToken(
  signalKey: string,
  rawSubject: string | null
): string {
  if (isOrgScopedSignalKey(signalKey)) return "org";
  const label = humanSubjectLabel(rawSubject);
  return label ? label.toLowerCase().replace(/\s+/g, "_") : "generic";
}

function briefingIdentityFromSignal(
  signalKey: string,
  findingKey: string
): string {
  const { rawSubject } = parseStoredFindingKey(findingKey);
  return `briefing:incident:${signalKey}:${briefingSubjectToken(signalKey, rawSubject)}`;
}

function isComparablePeriod(
  incidentsInPeriod: number,
  incidentsWithCoreRuns: number
): boolean {
  return incidentsInPeriod === 0 || incidentsWithCoreRuns === incidentsInPeriod;
}

function comparisonWindowBounds(windowTo: string): {
  recentStartMs: number;
  recentEndMs: number;
  baselineStartMs: number;
  baselineEndMs: number;
  recentFrom: string;
  recentTo: string;
  baselineFrom: string;
  baselineTo: string;
} {
  const recentEndMs = timestampMs(windowTo);
  const recentStartMs =
    recentEndMs - COMPARISON_RECENT_DAYS * MS_PER_DAY;
  const baselineEndMs = recentStartMs;
  const baselineStartMs =
    baselineEndMs - COMPARISON_BASELINE_DAYS * MS_PER_DAY;

  return {
    recentStartMs,
    recentEndMs,
    baselineStartMs,
    baselineEndMs,
    recentFrom: new Date(recentStartMs).toISOString(),
    recentTo: new Date(recentEndMs).toISOString(),
    baselineFrom: new Date(baselineStartMs).toISOString(),
    baselineTo: new Date(baselineEndMs).toISOString(),
  };
}

function eventInSlice(
  occurredAt: string,
  slice: PeriodSlice,
  bounds: ReturnType<typeof comparisonWindowBounds>
): boolean {
  const ms = timestampMs(occurredAt);
  if (slice === "recent") {
    return ms >= bounds.recentStartMs && ms <= bounds.recentEndMs;
  }
  return ms >= bounds.baselineStartMs && ms < bounds.baselineEndMs;
}

function decisionInSlice(
  createdAt: string,
  slice: PeriodSlice,
  bounds: ReturnType<typeof comparisonWindowBounds>
): boolean {
  return eventInSlice(createdAt, slice, bounds);
}

function readRiskLevel(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const root = result as Record<string, unknown>;
  if (root.status !== "succeeded") return null;
  const data = root.data;
  if (!data || typeof data !== "object") return null;
  return asNonEmptyString((data as Record<string, unknown>).riskLevel);
}

function readSignals(result: unknown): Array<{
  key: string;
  severity: string;
  evidence: Record<string, unknown>;
}> {
  if (!result || typeof result !== "object") return [];
  const signals = (result as Record<string, unknown>).signals;
  if (!Array.isArray(signals)) return [];
  return signals.filter(
    (s): s is { key: string; severity: string; evidence: Record<string, unknown> } =>
      !!s &&
      typeof s === "object" &&
      typeof (s as { key?: unknown }).key === "string"
  );
}

function facilityIdFromEvent(event: EventRow): string | null {
  return asNonEmptyString(event.data?.facilityId);
}

const COMPARABLE_SIGNAL_KEYS = new Set([
  "incident.repeated_type",
  "incident.repeated_severity",
  "incident.repeated_asset",
  "incident.repeated_location",
  "incident.recent_maintenance_at_facility",
  "work.facility_frequency_7d",
  "work.facility_frequency_30d",
]);

function collectPeriodCounts(
  input: ComparisonInput,
  slice: PeriodSlice,
  bounds: ReturnType<typeof comparisonWindowBounds>
): PeriodCounts {
  const signalPatterns = new Map<string, SignalPatternCount>();
  let incidentsInPeriod = 0;
  let incidentsWithCoreRuns = 0;
  let totalIncidents = 0;
  let criticalIncidents = 0;
  let highRiskIncidents = 0;

  for (const event of [
    ...(input.workEvents ?? []),
    ...input.incidentEvents,
  ]) {
    if (!eventInSlice(event.occurred_at, slice, bounds)) continue;

    incidentsInPeriod += 1;
    const riskRun = input.riskRunsByEventId.get(event.id);
    const signalRun = input.signalRunsByEventId.get(event.id);
    const hasCoreRuns =
      riskRun?.status === "succeeded" && signalRun?.status === "succeeded";

    if (hasCoreRuns) {
      incidentsWithCoreRuns += 1;
      totalIncidents += 1;

      const riskLevel = readRiskLevel(riskRun.result);
      if (riskLevel === "critical") criticalIncidents += 1;
      if (riskLevel === "high") highRiskIncidents += 1;

      const facilityId = facilityIdFromEvent(event);
      for (const signal of readSignals(signalRun.result)) {
        if (!COMPARABLE_SIGNAL_KEYS.has(signal.key)) continue;
        if (
          signal.severity !== "warning" &&
          signal.severity !== "critical" &&
          signal.key !== "incident.recent_maintenance_at_facility"
        ) {
          continue;
        }

        const evidence = signal.evidence ?? {};
        const evidenceFacility =
          asNonEmptyString(evidence.facilityId) ?? facilityId;
        const findingKey = signalFindingKey(
          signal.key,
          evidence,
          evidenceFacility
        );
        const briefingIdentity = briefingIdentityFromSignal(
          signal.key,
          findingKey
        );
        const subjectLabel = humanSubjectLabel(
          asNonEmptyString(evidence.value) ??
            asNonEmptyString(evidence.assetId) ??
            asNonEmptyString(evidence.locationDetail)
        );

        const existing = signalPatterns.get(briefingIdentity);
        if (!existing) {
          signalPatterns.set(briefingIdentity, {
            briefingIdentity,
            signalKey: signal.key,
            subjectLabel,
            eventIds: [event.id],
          });
        } else if (!existing.eventIds.includes(event.id)) {
          existing.eventIds.push(event.id);
          if (!existing.subjectLabel && subjectLabel) {
            existing.subjectLabel = subjectLabel;
          }
        }
      }
    }
  }

  const decisions = { accepted: 0, dismissed: 0, deferred: 0 };
  for (const decision of input.decisions) {
    if (!decisionInSlice(decision.created_at, slice, bounds)) continue;
    if (decision.decision === "accepted") decisions.accepted += 1;
    else if (decision.decision === "dismissed") decisions.dismissed += 1;
    else if (decision.decision === "deferred") decisions.deferred += 1;
  }

  return {
    incidentsInPeriod,
    incidentsWithCoreRuns,
    totalIncidents,
    criticalIncidents,
    highRiskIncidents,
    signalPatterns,
    decisions,
  };
}

type ChangeAssessment = {
  direction: IntelligenceChangeDirection;
  intensity: IntelligenceChangeIntensity;
  surface: boolean;
};

function assessIncrease(
  previous: number,
  recent: number,
  opts?: { severityEmergence?: boolean }
): ChangeAssessment {
  if (recent <= previous) {
    return { direction: "stable", intensity: "small", surface: false };
  }

  const difference = recent - previous;

  if (previous === 0 && recent > 0) {
    if (opts?.severityEmergence && recent >= 1) {
      return {
        direction: "emerging",
        intensity: recent >= 3 ? "significant" : "meaningful",
        surface: true,
      };
    }
    if (difference >= MIN_ABSOLUTE_INCREASE) {
      return {
        direction: "emerging",
        intensity: difference >= 4 ? "significant" : "meaningful",
        surface: true,
      };
    }
    return { direction: "stable", intensity: "small", surface: false };
  }

  if (difference >= MIN_ABSOLUTE_INCREASE) {
    return {
      direction: "increasing",
      intensity: difference >= 4 ? "significant" : "meaningful",
      surface: true,
    };
  }

  if (
    previous >= MIN_BASELINE_FOR_RELATIVE &&
    difference / previous >= MIN_RELATIVE_INCREASE
  ) {
    return {
      direction: "increasing",
      intensity: "meaningful",
      surface: true,
    };
  }

  return { direction: "stable", intensity: "small", surface: false };
}

function assessDecrease(previous: number, recent: number): ChangeAssessment {
  if (recent >= previous || previous < MIN_BASELINE_FOR_DECREASE) {
    return { direction: "stable", intensity: "small", surface: false };
  }

  const difference = previous - recent;
  if (
    difference >= MIN_ABSOLUTE_INCREASE &&
    recent / previous <= 1 - MIN_RELATIVE_INCREASE
  ) {
    return {
      direction: "decreasing",
      intensity: difference >= 4 ? "significant" : "meaningful",
      surface: true,
    };
  }

  return { direction: "stable", intensity: "small", surface: false };
}

function weekComparisonPhrase(recent: number, previous: number): string {
  if (previous === 0) {
    return `${recent} recently, after none in the previous week.`;
  }
  return `${recent} recently, compared with ${previous} in the previous week.`;
}

function changeCopy(input: {
  category: IntelligenceChangeCategory;
  direction: IntelligenceChangeDirection;
  metricLabel: string;
  recent: number;
  previous: number;
  subjectLabel?: string | null;
}): { title: string; summary: string } {
  const { category, direction, metricLabel, recent, previous, subjectLabel } =
    input;
  const comparison = weekComparisonPhrase(recent, previous);

  if (category === "incident_volume") {
    if (direction === "emerging") {
      return {
        title: "Incident activity has started showing up recently",
        summary: `${recent} incidents were reported recently, after none in the previous week.`,
      };
    }
    if (direction === "increasing") {
      return {
        title: "Incident activity is increasing",
        summary: `${recent} incidents were reported recently, compared with ${previous} in the previous week.`,
      };
    }
    return {
      title: "Incident activity has reduced",
      summary: `Fewer incidents were reported this week than in the previous week.`,
    };
  }

  if (category === "incident_risk") {
    const riskLabel = metricLabel;
    if (direction === "emerging") {
      return {
        title: `${riskLabel} have started showing up`,
        summary: `${recent} ${riskLabel.toLowerCase()} were reported recently, after none in the previous week.`,
      };
    }
    if (direction === "increasing") {
      return {
        title: `${riskLabel} have increased recently`,
        summary: `${recent} ${riskLabel.toLowerCase()} were reported recently, compared with ${previous} in the previous week.`,
      };
    }
    return {
      title: `${riskLabel} activity has reduced`,
      summary: `Fewer ${riskLabel.toLowerCase()} were reported this week than in the previous week.`,
    };
  }

  if (category === "incident_pattern") {
    if (subjectLabel) {
      if (direction === "emerging") {
        return {
          title: "This issue has started showing up recently",
          summary: `Similar ${subjectLabel} incidents occurred ${comparison.replace(".", "")}.`,
        };
      }
      if (direction === "increasing") {
        return {
          title: "This issue is showing up more often",
          summary: `Similar ${subjectLabel} incidents occurred ${comparison.replace(".", "")}.`,
        };
      }
    }

    if (direction === "emerging") {
      return {
        title: "A recurring issue has started showing up",
        summary: `Similar incidents occurred ${comparison.replace(".", "")}.`,
      };
    }
    if (direction === "increasing") {
      return {
        title: "This issue is showing up more often",
        summary: `Similar incidents occurred ${comparison.replace(".", "")}.`,
      };
    }
    return {
      title: "A recurring issue has eased",
      summary: `This issue appeared less often this week than in the previous week.`,
    };
  }

  const behaviour = metricLabel;
  if (direction === "emerging") {
    return {
      title: `${behaviour} has started to appear`,
      summary: `${recent} ${behaviour.toLowerCase()} recently, after none in the previous week.`,
    };
  }
  if (direction === "increasing") {
    return {
      title: `${behaviour} is happening more often`,
      summary: `${behaviour} increased compared with the previous week.`,
    };
  }
  return {
    title: `${behaviour} has reduced recently`,
    summary: `Fewer ${behaviour.toLowerCase()} compared with the previous week.`,
  };
}

function buildChange(input: {
  key: string;
  briefingIdentity: string;
  category: IntelligenceChangeCategory;
  direction: IntelligenceChangeDirection;
  intensity: IntelligenceChangeIntensity;
  severity?: IntelligencePrioritySeverity;
  recentCount: number;
  previousCount: number;
  title: string;
  summary: string;
  comparisonStatus: "complete" | "partial";
}): IntelligenceChange {
  return {
    id: `change:${input.key}`,
    key: input.key,
    briefingIdentity: input.briefingIdentity,
    direction: input.direction,
    intensity: input.intensity,
    category: input.category,
    severity: input.severity,
    recentCount: input.recentCount,
    previousCount: input.previousCount,
    difference: input.recentCount - input.previousCount,
    title: input.title,
    summary: input.summary,
    comparisonStatus: input.comparisonStatus,
  };
}

function patternMetricLabel(signalKey: string): string {
  switch (signalKey) {
    case "incident.repeated_type":
      return "Repeated incident type";
    case "incident.repeated_asset":
      return "Repeated asset involvement";
    case "incident.repeated_location":
      return "Repeated location involvement";
    case "incident.recent_maintenance_at_facility":
      return "Maintenance alongside incidents";
    default:
      return "Recurring incident pattern";
  }
}

function decisionMetricLabel(kind: "accepted" | "dismissed" | "deferred"): string {
  switch (kind) {
    case "accepted":
      return "Recommendation acceptances";
    case "dismissed":
      return "Recommendation dismissals";
    case "deferred":
      return "Recommendation deferrals";
  }
}

/**
 * Intelligence → What Changed (period-over-period).
 * Compare recent 7d vs prior 7d and surface meaningful volume/risk/pattern shifts.
 * Not a chronological activity feed — Dashboard owns Recent Activity.
 * Pure read-model — no consumers, no persistence.
 */
export function detectOrganisationIntelligenceChanges(
  input: ComparisonInput
): {
  comparisonWindow: IntelligenceChangeComparisonWindow;
  changes: IntelligenceChange[];
} {
  const bounds = comparisonWindowBounds(input.windowTo);
  const recent = collectPeriodCounts(input, "recent", bounds);
  const baseline = collectPeriodCounts(input, "baseline", bounds);

  const recentComparable = isComparablePeriod(
    recent.incidentsInPeriod,
    recent.incidentsWithCoreRuns
  );
  const baselineComparable = isComparablePeriod(
    baseline.incidentsInPeriod,
    baseline.incidentsWithCoreRuns
  );

  const comparisonWindow: IntelligenceChangeComparisonWindow = {
    recentFrom: bounds.recentFrom,
    recentTo: bounds.recentTo,
    baselineFrom: bounds.baselineFrom,
    baselineTo: bounds.baselineTo,
    recentDays: COMPARISON_RECENT_DAYS,
    baselineDays: COMPARISON_BASELINE_DAYS,
    recentAnalysisComplete: recentComparable,
    baselineAnalysisComplete: baselineComparable,
  };

  if (!recentComparable) {
    return { comparisonWindow, changes: [] };
  }

  const baselineIncidentDataReliable =
    baselineComparable || baseline.incidentsInPeriod === 0;

  const changes: IntelligenceChange[] = [];
  const comparisonStatus: "complete" | "partial" =
    baselineComparable ? "complete" : "partial";

  function maybePushChange(
    key: string,
    briefingIdentity: string,
    category: IntelligenceChangeCategory,
    previous: number,
    recentCount: number,
    assessment: ChangeAssessment,
    copyInput: Parameters<typeof changeCopy>[0],
    severity?: IntelligencePrioritySeverity
  ) {
    if (!assessment.surface) return;

    const isIncidentCategory =
      category === "incident_volume" ||
      category === "incident_risk" ||
      category === "incident_pattern";

    if (isIncidentCategory && !baselineIncidentDataReliable) return;
    if (isIncidentCategory && !baselineComparable && previous > 0) return;

    if (category === "incident_volume" || category === "incident_risk" || category === "incident_pattern") {
      if (assessment.direction === "decreasing" && !baselineComparable) return;
    }

    const copy = changeCopy({
      ...copyInput,
      direction: assessment.direction,
      recent: recentCount,
      previous,
    });

    changes.push(
      buildChange({
        key,
        briefingIdentity,
        category,
        direction: assessment.direction,
        intensity: assessment.intensity,
        severity,
        recentCount,
        previousCount: previous,
        title: copy.title,
        summary: copy.summary,
        comparisonStatus,
      })
    );
  }

  const totalPrevious = baseline.totalIncidents;
  const totalRecent = recent.totalIncidents;
  maybePushChange(
    "change:incident_volume:total",
    "briefing:change:incident_volume:total",
    "incident_volume",
    totalPrevious,
    totalRecent,
    assessIncrease(totalPrevious, totalRecent),
    { category: "incident_volume", direction: "increasing", metricLabel: "Incidents", recent: totalRecent, previous: totalPrevious }
  );
  if (baselineComparable) {
    const dec = assessDecrease(totalPrevious, totalRecent);
    if (dec.surface) {
      maybePushChange(
        "change:incident_volume:total:decrease",
        "briefing:change:incident_volume:total:decrease",
        "incident_volume",
        totalPrevious,
        totalRecent,
        dec,
        { category: "incident_volume", direction: "decreasing", metricLabel: "Incidents", recent: totalRecent, previous: totalPrevious }
      );
    }
  }

  const criticalPrevious = baseline.criticalIncidents;
  const criticalRecent = recent.criticalIncidents;
  maybePushChange(
    "change:incident_risk:critical",
    "briefing:change:incident_risk:critical",
    "incident_risk",
    criticalPrevious,
    criticalRecent,
    assessIncrease(criticalPrevious, criticalRecent, { severityEmergence: true }),
    {
      category: "incident_risk",
      direction: "increasing",
      metricLabel: "Critical incidents",
      recent: criticalRecent,
      previous: criticalPrevious,
    },
    "critical"
  );
  if (baselineComparable) {
    const dec = assessDecrease(criticalPrevious, criticalRecent);
    if (dec.surface) {
      maybePushChange(
        "change:incident_risk:critical:decrease",
        "briefing:change:incident_risk:critical:decrease",
        "incident_risk",
        criticalPrevious,
        criticalRecent,
        dec,
        {
          category: "incident_risk",
          direction: "decreasing",
          metricLabel: "Critical incidents",
          recent: criticalRecent,
          previous: criticalPrevious,
        },
        "critical"
      );
    }
  }

  const highPrevious = baseline.highRiskIncidents;
  const highRecent = recent.highRiskIncidents;
  maybePushChange(
    "change:incident_risk:high",
    "briefing:change:incident_risk:high",
    "incident_risk",
    highPrevious,
    highRecent,
    assessIncrease(highPrevious, highRecent, {
      severityEmergence: highRecent >= 2,
    }),
    {
      category: "incident_risk",
      direction: "increasing",
      metricLabel: "High-risk incidents",
      recent: highRecent,
      previous: highPrevious,
    },
    "high"
  );

  const allPatternKeys = new Set<string>([
    ...baseline.signalPatterns.keys(),
    ...recent.signalPatterns.keys(),
  ]);

  for (const briefingIdentity of allPatternKeys) {
    const previous = baseline.signalPatterns.get(briefingIdentity)?.eventIds.length ?? 0;
    const recentCount = recent.signalPatterns.get(briefingIdentity)?.eventIds.length ?? 0;
    const meta =
      recent.signalPatterns.get(briefingIdentity) ??
      baseline.signalPatterns.get(briefingIdentity);
    if (!meta) continue;

    if (meta.subjectLabel === null && briefingIdentity.endsWith(":generic")) {
      if (previous === 0 && recentCount > 0 && recentCount < MIN_ABSOLUTE_INCREASE) {
        continue;
      }
    }

    maybePushChange(
      `change:incident_pattern:${briefingIdentity.replace(/^briefing:/, "")}`,
      briefingIdentity,
      "incident_pattern",
      previous,
      recentCount,
      assessIncrease(previous, recentCount),
      {
        category: "incident_pattern",
        direction: "increasing",
        metricLabel: patternMetricLabel(meta.signalKey),
        recent: recentCount,
        previous,
        subjectLabel: meta.subjectLabel,
      }
    );
  }

  const decisionKinds = ["accepted", "dismissed", "deferred"] as const;
  for (const kind of decisionKinds) {
    const previous = baseline.decisions[kind];
    const recentCount = recent.decisions[kind];
    maybePushChange(
      `change:recommendation_behaviour:${kind}`,
      `briefing:change:recommendation_behaviour:${kind}`,
      "recommendation_behaviour",
      previous,
      recentCount,
      assessIncrease(previous, recentCount),
      {
        category: "recommendation_behaviour",
        direction: "increasing",
        metricLabel: decisionMetricLabel(kind),
        recent: recentCount,
        previous,
      }
    );
  }

  changes.sort((a, b) => {
    const intensityRank: Record<IntelligenceChangeIntensity, number> = {
      significant: 3,
      meaningful: 2,
      small: 1,
    };
    const dirRank: Record<IntelligenceChangeDirection, number> = {
      emerging: 4,
      increasing: 3,
      decreasing: 2,
      stable: 1,
    };
    const d = dirRank[b.direction] - dirRank[a.direction];
    if (d !== 0) return d;
    return intensityRank[b.intensity] - intensityRank[a.intensity];
  });

  return { comparisonWindow, changes };
}
