import { ActionError } from "@/lib/actions/errors";
import { hasModule } from "@/lib/actions/moduleAccess";
import { getPlatformSession } from "@/lib/auth/session";
import {
  isActionOutcome,
  type ActionOutcome,
  type ActionSignal,
} from "@/lib/events/consumers/outcome";
import { OperationalEventTypes, OPERATIONAL_LIFECYCLE_EVENT_TYPES } from "@/lib/events/taxonomy";
import {
  isRecommendationDecisionValue,
  type RecommendationDecisionValue,
} from "@/lib/recommendations/decisions";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  IntelligencePattern,
  IntelligencePriority,
  IntelligencePrioritySeverity,
  OrganisationIntelligence,
} from "./types";
import { detectOrganisationIntelligenceChanges } from "./detectOrganisationIntelligenceChanges";
import { detectOperationalLifecyclePatterns } from "./patterns/detectOperationalLifecyclePatterns";
import { synthesiseOperationalStories } from "./synthesis/synthesiseOperationalStories";
import type { OperationalStorySummary } from "./types";

const PRIMARY_WINDOW_DAYS = 30;
const RECENT_WINDOW_DAYS = 7;

const SIGNAL_ACTION_KEY = "facility.analyze_incident_signals";
const RISK_ACTION_KEY = "facility.assess_incident_risk";
const PATTERN_ACTION_KEY = "system.analyze_recommendation_response_patterns";

const IN_CHUNK = 100;

type EventRow = {
  id: string;
  organisation_id: string;
  event_type: string;
  entity_type: string | null;
  entity_id: string | null;
  occurred_at: string;
  created_at: string;
  data: Record<string, unknown> | null;
};

type ActionRunRow = {
  id: string;
  organisation_id: string;
  operational_event_id: string;
  action_key: string;
  status: string;
  result: unknown;
  created_at: string;
  completed_at: string | null;
};

type DecisionRow = {
  id: string;
  decision: RecommendationDecisionValue;
  created_at: string;
};

function daysAgoIso(to: Date, days: number): string {
  return new Date(to.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseOutcome(result: unknown): ActionOutcome | null {
  return isActionOutcome(result) ? result : null;
}

function facilityIdFromEvent(event: EventRow): string | null {
  return asNonEmptyString(event.data?.facilityId);
}

function chunkIds(ids: string[]): string[][] {
  if (ids.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    chunks.push(ids.slice(i, i + IN_CHUNK));
  }
  return chunks;
}

async function loadLifecycleEventsInWindow(options: {
  supabase: SupabaseClient;
  organisationId: string;
  fromIso: string;
  toIso: string;
}): Promise<EventRow[]> {
  const { data, error } = await options.supabase
    .from("operational_events")
    .select(
      "id, organisation_id, event_type, entity_type, entity_id, occurred_at, created_at, data"
    )
    .eq("organisation_id", options.organisationId)
    .in("event_type", [...OPERATIONAL_LIFECYCLE_EVENT_TYPES])
    .gte("occurred_at", options.fromIso)
    .lte("occurred_at", options.toIso)
    .order("occurred_at", { ascending: false });

  if (error) {
    throw new ActionError(
      "INTERNAL_ERROR",
      "Failed to load operational lifecycle events.",
      { cause: error }
    );
  }

  return ((data ?? []) as EventRow[]).filter(
    (row) => row.organisation_id === options.organisationId
  );
}

async function loadEventsInWindow(options: {
  supabase: SupabaseClient;
  organisationId: string;
  eventType: string;
  fromIso: string;
  toIso: string;
}): Promise<EventRow[]> {
  const { data, error } = await options.supabase
    .from("operational_events")
    .select(
      "id, organisation_id, event_type, entity_type, entity_id, occurred_at, created_at, data"
    )
    .eq("organisation_id", options.organisationId)
    .eq("event_type", options.eventType)
    .gte("occurred_at", options.fromIso)
    .lte("occurred_at", options.toIso)
    .order("occurred_at", { ascending: false });

  if (error) {
    throw new ActionError(
      "INTERNAL_ERROR",
      "Failed to load organisation operational events.",
      { cause: error }
    );
  }

  return ((data ?? []) as EventRow[]).filter(
    (row) => row.organisation_id === options.organisationId
  );
}

async function loadActionRunsForEvents(options: {
  supabase: SupabaseClient;
  organisationId: string;
  eventIds: string[];
  actionKeys: string[];
}): Promise<ActionRunRow[]> {
  if (options.eventIds.length === 0) return [];

  const rows: ActionRunRow[] = [];
  for (const ids of chunkIds(options.eventIds)) {
    const { data, error } = await options.supabase
      .from("action_runs")
      .select(
        "id, organisation_id, operational_event_id, action_key, status, result, created_at, completed_at"
      )
      .eq("organisation_id", options.organisationId)
      .in("operational_event_id", ids)
      .in("action_key", options.actionKeys)
      .order("created_at", { ascending: false });

    if (error) {
      throw new ActionError(
        "INTERNAL_ERROR",
        "Failed to load organisation action runs.",
        { cause: error }
      );
    }

    for (const row of (data ?? []) as ActionRunRow[]) {
      if (row.organisation_id === options.organisationId) rows.push(row);
    }
  }
  return rows;
}

async function loadDecisionsInWindow(options: {
  supabase: SupabaseClient;
  organisationId: string;
  fromIso: string;
  toIso: string;
}): Promise<DecisionRow[]> {
  const { data, error } = await options.supabase
    .from("recommendation_decisions")
    .select("id, decision, created_at, organisation_id")
    .eq("organisation_id", options.organisationId)
    .gte("created_at", options.fromIso)
    .lte("created_at", options.toIso);

  if (error) {
    throw new ActionError(
      "INTERNAL_ERROR",
      "Failed to load recommendation decisions.",
      { cause: error }
    );
  }

  return ((data ?? []) as Array<DecisionRow & { organisation_id: string }>)
    .filter((row) => row.organisation_id === options.organisationId)
    .filter((row) => isRecommendationDecisionValue(row.decision))
    .map((row) => ({
      id: row.id,
      decision: row.decision,
      created_at: row.created_at,
    }));
}

/** Latest succeeded run per operational_event_id for a given action_key. */
function pickLatestSucceededByEvent(
  runs: ActionRunRow[],
  actionKey: string
): Map<string, ActionRunRow> {
  const map = new Map<string, ActionRunRow>();
  for (const run of runs) {
    if (run.action_key !== actionKey || run.status !== "succeeded") continue;
    const existing = map.get(run.operational_event_id);
    if (
      !existing ||
      Date.parse(run.created_at) > Date.parse(existing.created_at)
    ) {
      map.set(run.operational_event_id, run);
    }
  }
  return map;
}

function readRiskLevel(outcome: ActionOutcome | null): string | null {
  if (!outcome || outcome.status !== "succeeded") return null;
  return asNonEmptyString(outcome.data?.riskLevel);
}

function readSignals(outcome: ActionOutcome | null): ActionSignal[] {
  if (!outcome?.signals?.length) return [];
  return outcome.signals.filter(
    (s): s is ActionSignal =>
      !!s &&
      typeof s === "object" &&
      typeof s.key === "string" &&
      typeof s.summary === "string"
  );
}

function countLabel(n: number, singular: string, plural: string): string {
  return n === 1 ? `1 ${singular}` : `${n} ${plural}`;
}

function normalizeScopeId(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed.toUpperCase() : "ORG";
}

/**
 * Semantic finding keys — type + organisational scope + subject.
 * Never includes event IDs, run IDs, or timestamps.
 *
 *   risk:critical | risk:high
 *   response:{patternKey}
 *   signal:incident.facility_frequency_{7d|30d}
 *   signal:incident.repeated_type:{TYPE}
 *   signal:incident.repeated_severity:{SEVERITY}
 *   signal:incident.repeated_asset:{ASSET}
 *   signal:incident.repeated_location:{LOCATION}
 *   signal:incident.recent_maintenance_at_facility
 */
function riskFindingKey(riskLevel: "critical" | "high"): string {
  return `risk:${riskLevel}`;
}

function responseFindingKey(patternKey: string): string {
  return `response:${patternKey}`;
}

function signalFindingKey(
  signalKey: string,
  evidence: Record<string, unknown>,
  facilityId: string | null
): string {
  const facility = normalizeScopeId(facilityId);
  const subject =
    asNonEmptyString(evidence.value) ??
    asNonEmptyString(evidence.assetId) ??
    asNonEmptyString(evidence.locationDetail);

  switch (signalKey) {
    case "incident.facility_frequency_7d":
    case "incident.facility_frequency_30d":
      // Highest useful aggregation: organisation-wide, not per originating event.
      return `signal:${signalKey}`;
    case "incident.repeated_type":
      return `signal:${signalKey}:${normalizeScopeId(subject)}`;
    case "incident.repeated_severity":
      return `signal:${signalKey}:${normalizeScopeId(subject)}`;
    case "incident.repeated_asset":
      return `signal:${signalKey}:${normalizeScopeId(subject)}`;
    case "incident.repeated_location":
      return `signal:${signalKey}:${normalizeScopeId(subject)}`;
    case "incident.recent_maintenance_at_facility":
      return `signal:${signalKey}`;
    default:
      return `signal:${signalKey}:${facility}`;
  }
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

/** Signal kinds that are already org-scoped in finding keys. */
function isOrgScopedSignalKey(signalKey: string): boolean {
  return (
    signalKey === "incident.facility_frequency_7d" ||
    signalKey === "incident.facility_frequency_30d" ||
    signalKey === "incident.recent_maintenance_at_facility"
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

/**
 * Briefing identity for presentation merge — category, severity, kind, and
 * only subjects the UI can actually distinguish. Hidden IDs collapse to generic.
 */
function briefingSubjectToken(
  signalKey: string,
  rawSubject: string | null
): string {
  if (isOrgScopedSignalKey(signalKey)) return "org";
  const label = humanSubjectLabel(rawSubject);
  return label ? label.toLowerCase().replace(/\s+/g, "_") : "generic";
}

function evidenceNumber(
  evidence: IntelligencePriority["evidence"],
  type: string
): number {
  const value = evidence?.find((e) => e.type === type)?.value;
  return asFiniteNumber(value) ?? 0;
}

function briefingIdentityForPriority(p: PriorityDraft): string {
  if (p.category === "risk") {
    return `briefing:risk:${p.severity}`;
  }
  if (p.category === "recommendation_response") {
    const patternKey = p.evidence?.find((e) => e.type === "pattern_key")?.value;
    return `briefing:response:${String(patternKey ?? p.findingKey)}`;
  }
  if (p.category === "operational_lifecycle") {
    return `briefing:${p.findingKey}`;
  }
  if (p.category === "operational_story") {
    return `briefing:${p.findingKey}`;
  }
  if (p.category === "incident_pattern") {
    const signalKey = String(
      p.evidence?.find((e) => e.type === "signal_key")?.value ??
        parseStoredFindingKey(p.findingKey).signalKey
    );
    const { rawSubject } = parseStoredFindingKey(p.findingKey);
    return `briefing:incident:${signalKey}:${briefingSubjectToken(signalKey, rawSubject)}`;
  }
  return `briefing:${p.findingKey}`;
}

function briefingIdentityForPattern(p: IntelligencePattern): string {
  const findingKey = p.id.replace(/^pattern:/, "");
  if (findingKey.startsWith("response:")) {
    return `briefing:${findingKey}`;
  }
  if (
    p.category === "operational_lifecycle" ||
    p.category === "operational_story" ||
    findingKey.startsWith("operational:") ||
    findingKey.startsWith("story:")
  ) {
    return `briefing:${findingKey}`;
  }
  const { signalKey, rawSubject } = parseStoredFindingKey(findingKey);
  return `briefing:incident:${signalKey}:${briefingSubjectToken(signalKey, rawSubject)}`;
}

function exposableSubjectFromFindingKey(findingKey: string): string | null {
  const { rawSubject } = parseStoredFindingKey(findingKey);
  return humanSubjectLabel(rawSubject);
}

function refreshPriorityCopy(p: PriorityDraft): PriorityDraft {
  const eventCount = p.relatedEventIds?.length ?? 0;
  const facilityCount = evidenceNumber(p.evidence, "facility_count");

  if (p.category === "risk") {
    const level = p.severity === "critical" ? "critical" : "high";
    const copy = riskCopy(level, eventCount, facilityCount);
    return { ...p, title: copy.title, summary: copy.summary };
  }

  if (p.category === "recommendation_response") {
    const patternKey = String(
      p.evidence?.find((e) => e.type === "pattern_key")?.value ?? ""
    );
    const count = Math.max(
      evidenceNumber(p.evidence, "count"),
      eventCount
    );
    const copy = recommendationResponsePriorityCopy(patternKey, p.severity, count);
    return { ...p, title: copy.title, summary: copy.summary };
  }

  if (p.category === "incident_pattern") {
    const signalKey = String(
      p.evidence?.find((e) => e.type === "signal_key")?.value ??
        parseStoredFindingKey(p.findingKey).signalKey
    );
    const subjectLabel = exposableSubjectFromFindingKey(p.findingKey);
    const copy = incidentPatternPriorityCopy(
      signalKey,
      eventCount,
      facilityCount,
      subjectLabel,
      p.severity
    );
    return { ...p, title: copy.title, summary: copy.summary };
  }

  return p;
}

function mergePriorityDrafts(
  keeper: PriorityDraft,
  incoming: PriorityDraft
): PriorityDraft {
  const mergedIds = mergeEventIds(
    keeper.relatedEventIds ?? [],
    incoming.relatedEventIds ?? []
  );
  const severity =
    severityRank(incoming.severity) > severityRank(keeper.severity)
      ? incoming.severity
      : keeper.severity;
  const recencyMs = Math.max(keeper.recencyMs, incoming.recencyMs);
  const facilityCount = Math.max(
    evidenceNumber(keeper.evidence, "facility_count"),
    evidenceNumber(incoming.evidence, "facility_count")
  );
  const evidenceCount = Math.max(
    evidenceNumber(keeper.evidence, "evidence_count"),
    evidenceNumber(incoming.evidence, "evidence_count"),
    evidenceNumber(keeper.evidence, "incident_count"),
    evidenceNumber(incoming.evidence, "incident_count"),
    evidenceNumber(keeper.evidence, "count"),
    evidenceNumber(incoming.evidence, "count")
  );

  const merged: PriorityDraft = {
    ...keeper,
    severity,
    relatedEventIds: mergedIds,
    recencyMs,
    createdAt: new Date(recencyMs).toISOString(),
    rank: Math.max(keeper.rank, incoming.rank),
    evidence: keeper.evidence?.map((e) => {
      if (e.type === "facility_count") return { ...e, value: facilityCount };
      if (e.type === "count") {
        return {
          ...e,
          value: Math.max(
            evidenceNumber(keeper.evidence, "count"),
            evidenceNumber(incoming.evidence, "count")
          ),
        };
      }
      if (
        e.type === "incident_count" ||
        e.type === "event_count"
      ) {
        return { ...e, value: mergedIds.length };
      }
      if (e.type === "evidence_count") {
        return { ...e, value: evidenceCount };
      }
      return e;
    }),
  };

  if (merged.category === "incident_pattern" && evidenceCount > 0) {
    const hasEvidenceCount = merged.evidence?.some(
      (e) => e.type === "evidence_count"
    );
    if (hasEvidenceCount) {
      merged.evidence = merged.evidence?.map((e) =>
        e.type === "evidence_count" ? { ...e, value: evidenceCount } : e
      );
    }
  }

  return refreshPriorityCopy(merged);
}

function consolidatePrioritiesByBriefingIdentity(
  priorities: PriorityDraft[]
): PriorityDraft[] {
  const byIdentity = new Map<string, PriorityDraft>();
  for (const priority of priorities) {
    const identity = briefingIdentityForPriority(priority);
    const existing = byIdentity.get(identity);
    if (!existing) {
      byIdentity.set(identity, {
        ...refreshPriorityCopy(priority),
        id: `priority:${identity.replace(/^briefing:/, "")}`,
        findingKey: identity,
      });
      continue;
    }
    byIdentity.set(identity, mergePriorityDrafts(existing, priority));
  }
  return [...byIdentity.values()];
}

function refreshPatternCopy(p: IntelligencePattern): IntelligencePattern {
  const findingKey = p.id.replace(/^pattern:/, "");
  const eventCount = p.relatedEventIds?.length ?? 0;

  if (
    p.category === "operational_lifecycle" ||
    p.category === "operational_story" ||
    findingKey.startsWith("operational:") ||
    findingKey.startsWith("story:")
  ) {
    return p;
  }

  if (p.category === "recommendation_response") {
    const patternKey = findingKey.replace(/^response:/, "");
    const copy = recommendationResponsePatternCopy(
      patternKey,
      p.severity,
      eventCount
    );
    return { ...p, title: copy.title, summary: copy.summary };
  }

  const { signalKey } = parseStoredFindingKey(findingKey);
  const subjectLabel = exposableSubjectFromFindingKey(findingKey);
  return {
    ...p,
    title: humanIncidentPatternTitle(signalKey, subjectLabel, "observation"),
    summary: humanIncidentPatternSummary(
      signalKey,
      eventCount,
      0,
      subjectLabel,
      "observation"
    ),
  };
}

function mergePatterns(
  keeper: IntelligencePattern,
  incoming: IntelligencePattern
): IntelligencePattern {
  const mergedIds = mergeEventIds(
    keeper.relatedEventIds ?? [],
    incoming.relatedEventIds ?? []
  );
  return refreshPatternCopy({
    ...keeper,
    relatedEventIds: mergedIds,
    severity: keepHighestSeverity(keeper.severity, incoming.severity),
  });
}

function consolidatePatternsByBriefingIdentity(
  patterns: IntelligencePattern[]
): IntelligencePattern[] {
  const byIdentity = new Map<string, IntelligencePattern>();
  for (const pattern of patterns) {
    const identity = briefingIdentityForPattern(pattern);
    const existing = byIdentity.get(identity);
    if (!existing) {
      byIdentity.set(identity, {
        ...refreshPatternCopy(pattern),
        id: `pattern:${identity.replace(/^briefing:/, "")}`,
      });
      continue;
    }
    byIdentity.set(identity, mergePatterns(existing, pattern));
  }
  return [...byIdentity.values()];
}

function isGenericFrequencyKey(signalKey: string): boolean {
  return (
    signalKey === "incident.facility_frequency_7d" ||
    signalKey === "incident.facility_frequency_30d"
  );
}

function allEventsCovered(eventIds: string[], covered: Set<string>): boolean {
  return eventIds.length > 0 && eventIds.every((id) => covered.has(id));
}

function mergeEventIds(into: string[], extra: string[]): string[] {
  return [...new Set([...into, ...extra])];
}

function severityRank(
  severity: "info" | "warning" | "critical" | "high" | "normal"
): number {
  switch (severity) {
    case "critical":
      return 4;
    case "high":
      return 3;
    case "warning":
      return 2;
    case "normal":
      return 1;
    default:
      return 0;
  }
}

function keepHighestSeverity<T extends string>(current: T, next: T): T {
  return severityRank(next as "info") >= severityRank(current as "info")
    ? next
    : current;
}

function timesRecently(count: number): string {
  if (count <= 1) return "This has happened recently.";
  return `This has happened ${count} times recently.`;
}

function recommendationResponsePriorityCopy(
  patternKey: string,
  severity: IntelligencePrioritySeverity,
  count: number
): { title: string; summary: string } {
  switch (patternKey) {
    case "recommendation.repeated_critical_dismissal":
      return {
        title: "Important recommendations are being ignored",
        summary:
          count <= 1
            ? "Some important recommendations have been dismissed more than once recently."
            : `Important recommendations have been dismissed ${count} times recently.`,
      };
    case "recommendation.repeated_critical_deferral":
      return {
        title: "Important recommendations keep being put off",
        summary:
          count <= 1
            ? "Some important recommendations have been deferred more than once recently."
            : `Important recommendations have been deferred ${count} times recently.`,
      };
    default:
      return {
        title:
          severity === "critical"
            ? "Recommendations are being handled the same way repeatedly"
            : "Recommendations are being handled the same way repeatedly",
        summary: timesRecently(count),
      };
  }
}

function recommendationResponsePatternCopy(
  patternKey: string,
  _severity: ActionSignal["severity"],
  count: number
): { title: string; summary: string } {
  switch (patternKey) {
    case "recommendation.repeated_critical_dismissal":
      return {
        title: "Important recommendations are being ignored",
        summary:
          count <= 1
            ? "Some important recommendations have been dismissed more than once recently."
            : `Important recommendations have been dismissed ${count} times recently.`,
      };
    case "recommendation.repeated_critical_deferral":
      return {
        title: "Important recommendations keep being put off",
        summary:
          count <= 1
            ? "Some important recommendations have been deferred more than once recently."
            : `Important recommendations have been deferred ${count} times recently.`,
      };
    case "recommendation.repeated_dismissal":
      return {
        title: "Recommendations are being dismissed repeatedly",
        summary:
          count <= 1
            ? "Recommendations have been dismissed more than once recently."
            : `Recommendations have been dismissed ${count} times recently.`,
      };
    case "recommendation.repeated_recommendation_acceptance":
      return {
        title: "Similar recommendations are being accepted",
        summary:
          count > 1
            ? `Similar recommendations have been accepted ${count} times recently.`
            : "Similar recommendations have been accepted more than once recently.",
      };
    default:
      return {
        title: "Recommendations are being handled the same way repeatedly",
        summary:
          count <= 1
            ? "This has happened recently."
            : `This has happened ${count} times recently.`,
      };
  }
}

function humanResponsePattern(
  key: string,
  severity: ActionSignal["severity"],
  relatedEventIds: string[],
  evidenceCount?: number
): IntelligencePattern {
  const count = evidenceCount ?? relatedEventIds.length;
  const copy = recommendationResponsePatternCopy(key, severity, count);

  return {
    id: `pattern:${responseFindingKey(key)}`,
    category: "recommendation_response",
    severity,
    title: copy.title,
    summary: copy.summary,
    relatedEventIds: relatedEventIds.length ? relatedEventIds : undefined,
  };
}

function incidentPatternPriorityCopy(
  signalKey: string,
  eventCount: number,
  facilityCount: number,
  subjectLabel: string | null,
  severity: IntelligencePrioritySeverity
): { title: string; summary: string } {
  const isWeak =
    severity === "normal" && eventCount <= 1 && !subjectLabel;

  if (isWeak) {
    return {
      title: "Something may be worth watching",
      summary: "A pattern was noticed, but the evidence is still limited.",
    };
  }

  return {
    title: humanIncidentPatternTitle(signalKey, subjectLabel, "attention"),
    summary: humanIncidentPatternSummary(
      signalKey,
      eventCount,
      facilityCount,
      subjectLabel,
      "attention"
    ),
  };
}

function humanIncidentPatternTitle(
  key: string,
  subjectLabel: string | null,
  tone: "attention" | "observation" = "observation"
): string {
  switch (key) {
    case "incident.facility_frequency_7d":
      return "Incidents have increased recently";
    case "incident.facility_frequency_30d":
      return "Incidents keep occurring";
    case "incident.repeated_type":
      if (tone === "attention" && !subjectLabel) {
        return "Similar incidents are recurring";
      }
      return subjectLabel
        ? "Similar incidents are recurring"
        : "The same type of incident keeps occurring";
    case "incident.repeated_severity":
      return "Incidents of similar seriousness keep occurring";
    case "incident.repeated_asset":
      return subjectLabel
        ? "The same asset keeps appearing in incidents"
        : "The same asset keeps appearing in incidents";
    case "incident.repeated_location":
      return subjectLabel
        ? "Incidents keep occurring in the same place"
        : "Incidents keep occurring in the same place";
    case "incident.recent_maintenance_at_facility":
      return "Maintenance work and incidents are showing up together";
    default:
      return tone === "attention"
        ? "Something may be worth watching"
        : "Something keeps recurring";
  }
}

function humanIncidentPatternSummary(
  key: string,
  eventCount: number,
  facilityCount: number,
  subjectLabel: string | null,
  tone: "attention" | "observation" = "observation"
): string {
  const atOneLocation =
    facilityCount === 1
      ? "at one location"
      : facilityCount > 1
        ? "at more than one location"
        : null;

  switch (key) {
    case "incident.facility_frequency_7d":
      if (eventCount === 1) {
        return atOneLocation === "at one location"
          ? "Incident reports have increased at one location recently."
          : "Incident reports have increased recently.";
      }
      return atOneLocation
        ? `${countLabel(eventCount, "incident", "incidents")} have been reported ${atOneLocation} in the past week.`
        : `${countLabel(eventCount, "incident", "incidents")} have been reported in the past week.`;
    case "incident.facility_frequency_30d":
      if (eventCount === 1) {
        return atOneLocation === "at one location"
          ? "Incidents have been reported at one location over the past month."
          : "Incidents have been reported over the past month.";
      }
      return atOneLocation
        ? `${countLabel(eventCount, "incident", "incidents")} have been reported ${atOneLocation} over the past month.`
        : `${countLabel(eventCount, "incident", "incidents")} have been reported over the past month.`;
    case "incident.repeated_type":
      if (subjectLabel) {
        return `Similar ${subjectLabel} incidents have appeared repeatedly recently.`;
      }
      return tone === "attention"
        ? "Similar incident types have appeared repeatedly recently."
        : "The same kind of incident has been reported more than once recently.";
    case "incident.repeated_severity":
      return subjectLabel
        ? `${subjectLabel}-severity incidents have appeared repeatedly recently.`
        : "Incidents of similar seriousness have been reported more than once recently.";
    case "incident.repeated_asset":
      return eventCount === 1
        ? "The same asset has been involved in more than one incident recently."
        : `The same asset has been involved in ${countLabel(eventCount, "incident", "incidents")} recently.`;
    case "incident.repeated_location":
      return subjectLabel
        ? `Reports keep coming in from “${subjectLabel}”.`
        : "Incidents have been reported at the same location recently.";
    case "incident.recent_maintenance_at_facility":
      return atOneLocation === "at one location"
        ? "Maintenance work and incident reports have appeared together at one location recently."
        : atOneLocation === "at more than one location"
          ? "Maintenance work and incident reports have appeared together at more than one location recently."
          : "Maintenance work and incident reports have been appearing together recently.";
    default:
      return "This has been showing up more than once recently.";
  }
}

function riskCopy(
  riskLevel: "critical" | "high",
  count: number,
  facilityCount: number
): { title: string; summary: string } {
  if (riskLevel === "critical") {
    const title =
      count === 1
        ? "A critical incident needs attention"
        : "Critical incidents need attention";
    let summary: string;
    if (count === 1) {
      summary =
        facilityCount <= 1
          ? "A critical incident has been reported recently at one location."
          : "A critical incident has been reported recently.";
    } else if (facilityCount <= 1) {
      summary = `${count} critical incidents have been reported recently at one location.`;
    } else {
      summary = `${count} critical incidents have been reported at more than one location recently.`;
    }
    return { title, summary };
  }

  const title =
    count === 1
      ? "A recent incident needs closer attention"
      : "Several recent incidents need closer attention";
  let summary: string;
  if (count === 1) {
    summary =
      facilityCount <= 1
        ? "A higher-risk incident has been flagged recently at one location."
        : "A higher-risk incident has been flagged recently.";
  } else if (facilityCount <= 1) {
    summary = `${count} incidents have been flagged as higher risk recently at one location.`;
  } else {
    summary = `${count} incidents have been flagged as higher risk recently.`;
  }
  return { title, summary };
}

type PriorityDraft = IntelligencePriority & {
  findingKey: string;
  rank: number;
  recencyMs: number;
};

function rankPriority(p: PriorityDraft): number {
  return p.rank;
}

function toPublicPriority(draft: PriorityDraft): IntelligencePriority {
  return {
    id: draft.id,
    severity: draft.severity,
    category: draft.category,
    title: draft.title,
    summary: draft.summary,
    ...(draft.facilityId ? { facilityId: draft.facilityId } : {}),
    relatedEventIds: draft.relatedEventIds,
    evidence: draft.evidence,
    createdAt: draft.createdAt,
  };
}

/**
 * Pure assembler — aggregating existing Action Engine outcomes.
 * Groups by semantic finding key, merges evidence, then ranks.
 * Exported for deterministic verification without Next cookies.
 */
export function assembleOrganisationIntelligence(input: {
  windowFrom: string;
  windowTo: string;
  facilityManagementEnabled: boolean;
  incidentEvents: EventRow[];
  lifecycleEvents?: EventRow[];
  signalRunsByEventId: Map<string, ActionRunRow>;
  riskRunsByEventId: Map<string, ActionRunRow>;
  patternRuns: ActionRunRow[];
  decisions: DecisionRow[];
}): OrganisationIntelligence {
  const {
    windowFrom,
    windowTo,
    facilityManagementEnabled,
    incidentEvents,
    lifecycleEvents = [],
    signalRunsByEventId,
    riskRunsByEventId,
    patternRuns,
    decisions,
  } = input;

  if (!facilityManagementEnabled) {
    return emptyOrganisationIntelligence(windowFrom, windowTo, {
      state: "unavailable",
      supported: false,
      notes: [
        "Facility Management is not enabled for this organisation.",
      ],
    });
  }

  const recentCutoffMs =
    Date.parse(windowTo) - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  const notes: string[] = [];
  let missingCoreRuns = 0;
  let partialOutcomes = 0;

  type RiskBucket = {
    riskLevel: "critical" | "high";
    eventIds: string[];
    facilityIds: Set<string>;
    latestMs: number;
  };

  const riskBuckets = new Map<string, RiskBucket>();

  type SignalBucket = {
    findingKey: string;
    signalKey: string;
    severity: ActionSignal["severity"];
    eventIds: string[];
    facilityIds: Set<string>;
    latestMs: number;
    evidenceCount: number;
    subjectLabel: string | null;
  };

  const signalBuckets = new Map<string, SignalBucket>();

  let highOrCriticalRiskCount = 0;
  let criticalRiskCount = 0;
  const facilities = new Set<string>();

  for (const event of incidentEvents) {
    const facilityId = facilityIdFromEvent(event);
    if (facilityId) facilities.add(facilityId);

    const riskRun = riskRunsByEventId.get(event.id);
    const signalRun = signalRunsByEventId.get(event.id);

    if (!riskRun || !signalRun) {
      missingCoreRuns += 1;
    }

    const riskOutcome = riskRun ? parseOutcome(riskRun.result) : null;
    if (riskOutcome?.status === "partial") partialOutcomes += 1;

    const riskLevel = readRiskLevel(riskOutcome);
    if (riskLevel === "critical" || riskLevel === "high") {
      highOrCriticalRiskCount += 1;
      if (riskLevel === "critical") criticalRiskCount += 1;

      const findingKey = riskFindingKey(riskLevel);
      const existing = riskBuckets.get(findingKey);
      const occurredMs = timestampMs(event.occurred_at);
      if (!existing) {
        riskBuckets.set(findingKey, {
          riskLevel,
          eventIds: [event.id],
          facilityIds: new Set(facilityId ? [facilityId] : []),
          latestMs: occurredMs,
        });
      } else {
        existing.eventIds = mergeEventIds(existing.eventIds, [event.id]);
        if (facilityId) existing.facilityIds.add(facilityId);
        existing.latestMs = Math.max(existing.latestMs, occurredMs);
      }
    }

    const signalOutcome = signalRun ? parseOutcome(signalRun.result) : null;
    if (signalOutcome?.status === "partial") partialOutcomes += 1;

    for (const signal of readSignals(signalOutcome)) {
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
      const existing = signalBuckets.get(findingKey);
      const occurredMs = timestampMs(event.occurred_at);
      const evidenceCount =
        asFiniteNumber(evidence.priorCount) ??
        asFiniteNumber(evidence.matchCount) ??
        asFiniteNumber(evidence.count) ??
        1;
      const subjectLabel = humanSubjectLabel(
        asNonEmptyString(evidence.value) ??
          asNonEmptyString(evidence.assetId) ??
          asNonEmptyString(evidence.locationDetail)
      );

      if (!existing) {
        signalBuckets.set(findingKey, {
          findingKey,
          signalKey: signal.key,
          severity: signal.severity,
          eventIds: [event.id],
          facilityIds: new Set(evidenceFacility ? [evidenceFacility] : []),
          latestMs: occurredMs,
          evidenceCount,
          subjectLabel,
        });
      } else {
        existing.eventIds = mergeEventIds(existing.eventIds, [event.id]);
        if (evidenceFacility) existing.facilityIds.add(evidenceFacility);
        existing.latestMs = Math.max(existing.latestMs, occurredMs);
        existing.evidenceCount = Math.max(existing.evidenceCount, evidenceCount);
        existing.severity = keepHighestSeverity(
          existing.severity,
          signal.severity
        );
        if (!existing.subjectLabel && subjectLabel) {
          existing.subjectLabel = subjectLabel;
        }
      }
    }
  }

  type ResponseBucket = {
    patternKey: string;
    severity: ActionSignal["severity"];
    eventIds: string[];
    latestMs: number;
    evidenceCount: number;
  };

  const responsePatternMap = new Map<string, ResponseBucket>();

  for (const run of patternRuns) {
    if (run.status !== "succeeded") continue;
    const outcome = parseOutcome(run.result);
    if (!outcome || outcome.status === "failed") continue;
    if (outcome.status === "partial") partialOutcomes += 1;

    for (const signal of readSignals(outcome)) {
      if (!signal.key.startsWith("recommendation.repeated_")) continue;
      const findingKey = responseFindingKey(signal.key);
      const completedMs = timestampMs(run.completed_at ?? run.created_at);
      const evidenceCount = asFiniteNumber(signal.evidence?.count) ?? 1;
      const existing = responsePatternMap.get(findingKey);
      if (!existing) {
        responsePatternMap.set(findingKey, {
          patternKey: signal.key,
          severity: signal.severity,
          eventIds: [run.operational_event_id],
          latestMs: completedMs,
          evidenceCount,
        });
      } else {
        existing.eventIds = mergeEventIds(existing.eventIds, [
          run.operational_event_id,
        ]);
        existing.latestMs = Math.max(existing.latestMs, completedMs);
        existing.evidenceCount = Math.max(existing.evidenceCount, evidenceCount);
        existing.severity = keepHighestSeverity(
          existing.severity,
          signal.severity
        );
      }
    }
  }

  const priorities: PriorityDraft[] = [];
  const patterns: IntelligencePattern[] = [];

  const riskCoveredEventIds = new Set<string>();
  for (const bucket of riskBuckets.values()) {
    for (const id of bucket.eventIds) riskCoveredEventIds.add(id);
  }

  for (const [findingKey, bucket] of riskBuckets) {
    const count = bucket.eventIds.length;
    const facilityCount = bucket.facilityIds.size;
    const copy = riskCopy(bucket.riskLevel, count, facilityCount);
    const isCritical = bucket.riskLevel === "critical";
    const singleFacility =
      facilityCount === 1 ? [...bucket.facilityIds][0] : undefined;

    priorities.push({
      id: `priority:${findingKey}`,
      findingKey,
      severity: isCritical ? "critical" : "high",
      category: "risk",
      title: copy.title,
      summary: copy.summary,
      facilityId: singleFacility,
      relatedEventIds: bucket.eventIds,
      evidence: [
        { type: "risk_level", value: bucket.riskLevel },
        { type: "incident_count", value: count },
        { type: "facility_count", value: facilityCount },
      ],
      createdAt: new Date(bucket.latestMs).toISOString(),
      rank: isCritical ? 100 : 80,
      recencyMs: bucket.latestMs,
    });
  }

  const healthResponsePatterns: IntelligencePattern[] = [];

  for (const [findingKey, entry] of responsePatternMap) {
    const pattern = humanResponsePattern(
      entry.patternKey,
      entry.severity,
      entry.eventIds,
      entry.evidenceCount
    );
    healthResponsePatterns.push(pattern);

    if (
      entry.patternKey === "recommendation.repeated_critical_dismissal" ||
      entry.patternKey === "recommendation.repeated_critical_deferral"
    ) {
      const severity: IntelligencePrioritySeverity =
        entry.severity === "critical" ? "critical" : "high";
      priorities.push({
        id: `priority:${findingKey}`,
        findingKey,
        severity,
        category: "recommendation_response",
        title: pattern.title,
        summary: pattern.summary,
        relatedEventIds: pattern.relatedEventIds,
        evidence: [
          { type: "pattern_key", value: entry.patternKey },
          { type: "count", value: entry.evidenceCount },
        ],
        createdAt: new Date(entry.latestMs).toISOString(),
        rank:
          entry.patternKey === "recommendation.repeated_critical_dismissal"
            ? 90
            : 70,
        recencyMs: entry.latestMs,
      });
    } else {
      patterns.push(pattern);
    }
  }

  for (const bucket of signalBuckets.values()) {
    const uniqueEvents = bucket.eventIds;
    const facilityCount = bucket.facilityIds.size;

    // Generic volume signals are already explained by an aggregated risk finding.
    if (
      isGenericFrequencyKey(bucket.signalKey) &&
      allEventsCovered(uniqueEvents, riskCoveredEventIds)
    ) {
      continue;
    }

    const singleFacility =
      facilityCount === 1 ? [...bucket.facilityIds][0] : undefined;
    const pattern: IntelligencePattern = {
      id: `pattern:${bucket.findingKey}`,
      category: "incident_pattern",
      severity: bucket.severity,
      title: humanIncidentPatternTitle(
        bucket.signalKey,
        bucket.subjectLabel,
        "observation"
      ),
      summary: humanIncidentPatternSummary(
        bucket.signalKey,
        uniqueEvents.length,
        facilityCount,
        bucket.subjectLabel,
        "observation"
      ),
      facilityId: singleFacility,
      relatedEventIds: uniqueEvents,
    };

    const elevate =
      !isGenericFrequencyKey(bucket.signalKey) &&
      bucket.signalKey !== "incident.recent_maintenance_at_facility" &&
      (bucket.severity === "critical" || bucket.severity === "warning") &&
      (uniqueEvents.length >= 2 || bucket.severity === "critical");

    if (elevate) {
      priorities.push({
        id: `priority:${bucket.findingKey}`,
        findingKey: bucket.findingKey,
        severity: bucket.severity === "critical" ? "critical" : "normal",
        category: "incident_pattern",
        title: pattern.title,
        summary: pattern.summary,
        facilityId: pattern.facilityId,
        relatedEventIds: pattern.relatedEventIds,
        evidence: [
          { type: "signal_key", value: bucket.signalKey },
          { type: "event_count", value: uniqueEvents.length },
          { type: "facility_count", value: facilityCount },
          { type: "evidence_count", value: bucket.evidenceCount },
        ],
        createdAt: new Date(bucket.latestMs).toISOString(),
        rank: 50,
        recencyMs: bucket.latestMs,
      });
    } else {
      patterns.push(pattern);
    }
  }

  const operationalFindings = detectOperationalLifecyclePatterns({
    events: lifecycleEvents,
    windowFrom,
    windowTo,
  });

  const synthesis = synthesiseOperationalStories({
    findings: operationalFindings,
    events: lifecycleEvents,
    windowFrom,
    windowTo,
  });

  const eventTimeById = new Map<string, number>();
  for (const event of lifecycleEvents) {
    eventTimeById.set(event.id, timestampMs(event.occurred_at));
  }

  const storySummaries: OperationalStorySummary[] = synthesis.stories.map(
    (story) => ({
      id: story.id,
      title: story.title,
      summary: story.summary,
      status: story.status,
      severity: story.severity,
      score: story.score,
      confidence: story.confidence,
      facilityId:
        story.facilityIds.length === 1 ? story.facilityIds[0] : undefined,
      assetIds: story.assetIds,
      findingIds: story.evidence.findingIds,
      relatedEventIds: story.evidence.eventIds,
      incidentIds: story.incidentIds,
      maintenanceIds: story.maintenanceIds,
      workOrderIds: story.workOrderIds,
      sequence: story.sequence.map((step) => ({
        occurredAt: step.occurredAt,
        label: step.label,
        eventType: step.eventType,
        eventId: step.eventId,
        entityId: step.entityId,
      })),
      whyItMatters: story.whyItMatters,
      whatToInvestigate: story.whatToInvestigate,
      whatItSaw: story.whatItSaw,
    })
  );

  for (const story of synthesis.stories) {
    const latestMs = timestampMs(story.lastObservedAt);
    const prioritySeverity: IntelligencePrioritySeverity =
      story.severity === "critical"
        ? "critical"
        : story.severity === "high"
          ? "high"
          : "normal";

    const storyEvidence: Array<{ type: string; value?: unknown }> = [
      { type: "story_id", value: story.id },
      { type: "story_status", value: story.status },
      { type: "sequence_kind", value: story.sequenceKind },
      { type: "event_count", value: story.evidence.eventCount },
      { type: "finding_count", value: story.evidence.findingCount },
      { type: "facility_count", value: story.facilityIds.length },
      { type: "asset_count", value: story.assetIds.length },
      { type: "facility_ids", value: story.facilityIds },
      { type: "asset_ids", value: story.assetIds },
      { type: "incident_ids", value: story.incidentIds },
      { type: "maintenance_ids", value: story.maintenanceIds },
      { type: "work_order_ids", value: story.workOrderIds },
      { type: "event_ids", value: story.evidence.eventIds },
      { type: "entity_ids", value: story.evidence.entityIds },
      { type: "finding_ids", value: story.evidence.findingIds },
      { type: "finding_keys", value: story.evidence.findingKeys },
      { type: "what_it_saw", value: story.whatItSaw },
      {
        type: "sequence",
        value: story.sequence.map(
          (step) => `${step.occurredAt.slice(0, 10)} — ${step.label}${
            step.entityId ? ` (${step.entityId})` : ""
          }`
        ),
      },
      { type: "why_it_matters", value: story.whyItMatters },
      { type: "what_to_investigate", value: story.whatToInvestigate },
      { type: "score", value: story.score },
      { type: "score_breakdown", value: story.evidence.scoreBreakdown },
      { type: "confidence", value: story.confidence },
      ...(story.assetIds[0]
        ? [{ type: "subject", value: story.assetIds[0] }]
        : []),
    ];

    if (story.elevateToPriority) {
      priorities.push({
        id: `priority:${story.id}`,
        findingKey: story.id,
        severity: prioritySeverity,
        category: "operational_story",
        title: story.title,
        summary: story.summary,
        facilityId:
          story.facilityIds.length === 1 ? story.facilityIds[0] : undefined,
        relatedEventIds: story.evidence.eventIds,
        evidence: storyEvidence,
        createdAt: new Date(latestMs).toISOString(),
        rank: story.rank,
        recencyMs: latestMs,
      });
    } else {
      patterns.push({
        id: `pattern:${story.id}`,
        category: "operational_story",
        severity:
          story.severity === "critical"
            ? "critical"
            : story.severity === "high" || story.severity === "medium"
              ? "warning"
              : "info",
        title: story.title,
        summary: story.summary,
        facilityId:
          story.facilityIds.length === 1 ? story.facilityIds[0] : undefined,
        relatedEventIds: story.evidence.eventIds,
        evidence: storyEvidence,
        whatItSaw: story.whatItSaw,
        sequence: story.sequence.map(
          (step) => `${step.occurredAt.slice(0, 10)} — ${step.label}`
        ),
        score: story.score,
      });
    }
  }

  // Standalone findings only — absorbed findings remain as story evidence.
  for (const finding of synthesis.standaloneFindings) {
    const relatedTimes = finding.relatedEventIds
      .map((id) => eventTimeById.get(id))
      .filter((value): value is number => value != null && Number.isFinite(value));
    const latestMs =
      relatedTimes.length > 0
        ? Math.max(...relatedTimes)
        : timestampMs(windowTo);
    const pattern: IntelligencePattern = {
      id: finding.id,
      category: "operational_lifecycle",
      severity: finding.severity,
      title: finding.title,
      summary: finding.summary,
      facilityId: finding.facilityId,
      relatedEventIds: finding.relatedEventIds,
      evidence: finding.evidence,
      whatItSaw: finding.whatItSaw,
      sequence: finding.sequence,
      score: finding.score,
    };

    if (finding.elevateToPriority) {
      const prioritySeverity: IntelligencePrioritySeverity =
        finding.severity === "critical"
          ? "critical"
          : finding.severity === "warning"
            ? "high"
            : "normal";
      priorities.push({
        id: `priority:${finding.findingKey}`,
        findingKey: finding.findingKey,
        severity: prioritySeverity,
        category: "operational_lifecycle",
        title: finding.title,
        summary: finding.summary,
        facilityId: finding.facilityId,
        relatedEventIds: finding.relatedEventIds,
        evidence: finding.evidence,
        createdAt: new Date(latestMs).toISOString(),
        rank: Math.min(92, 35 + Math.round(finding.score / 2)),
        recencyMs: latestMs,
      });
    } else {
      patterns.push(pattern);
    }
  }

  const dedupedPriorityMap = new Map<string, PriorityDraft>();
  for (const priority of priorities) {
    const existing = dedupedPriorityMap.get(priority.findingKey);
    if (!existing) {
      dedupedPriorityMap.set(priority.findingKey, priority);
      continue;
    }

    const mergedIds = mergeEventIds(
      existing.relatedEventIds ?? [],
      priority.relatedEventIds ?? []
    );
    const nextWins =
      severityRank(priority.severity) > severityRank(existing.severity) ||
      (severityRank(priority.severity) === severityRank(existing.severity) &&
        (priority.relatedEventIds?.length ?? 0) >
          (existing.relatedEventIds?.length ?? 0)) ||
      (severityRank(priority.severity) === severityRank(existing.severity) &&
        (priority.relatedEventIds?.length ?? 0) ===
          (existing.relatedEventIds?.length ?? 0) &&
        priority.recencyMs > existing.recencyMs);

    const keeper = nextWins ? priority : existing;
    keeper.relatedEventIds = mergedIds;
    keeper.recencyMs = Math.max(existing.recencyMs, priority.recencyMs);
    keeper.createdAt = new Date(keeper.recencyMs).toISOString();
    if (keeper.category === "risk") {
      const level = keeper.severity === "critical" ? "critical" : "high";
      const copy = riskCopy(
        level,
        mergedIds.length,
        keeper.evidence?.find((e) => e.type === "facility_count")?.value as
          | number
          | undefined ?? 0
      );
      keeper.title = copy.title;
      keeper.summary = copy.summary;
    }
    dedupedPriorityMap.set(priority.findingKey, keeper);
  }

  const uniquePriorities = consolidatePrioritiesByBriefingIdentity([
    ...dedupedPriorityMap.values(),
  ]);

  uniquePriorities.sort((a, b) => {
    if (rankPriority(b) !== rankPriority(a)) {
      return rankPriority(b) - rankPriority(a);
    }
    const aCount = a.relatedEventIds?.length ?? 0;
    const bCount = b.relatedEventIds?.length ?? 0;
    if (bCount !== aCount) return bCount - aCount;
    return b.recencyMs - a.recencyMs;
  });

  const priorityBriefingKeys = new Set(
    uniquePriorities.map((p) => p.findingKey)
  );

  const patternDedupe = new Map<string, IntelligencePattern>();
  for (const pattern of patterns) {
    const briefingKey = briefingIdentityForPattern(pattern);
    if (priorityBriefingKeys.has(briefingKey)) continue;
    const existing = patternDedupe.get(briefingKey);
    if (!existing) {
      patternDedupe.set(briefingKey, pattern);
      continue;
    }
    patternDedupe.set(briefingKey, mergePatterns(existing, pattern));
  }

  const finalPatterns = consolidatePatternsByBriefingIdentity([
    ...patternDedupe.values(),
  ]);
  finalPatterns.sort((a, b) => {
    const sev = { critical: 3, warning: 2, info: 1 } as const;
    const d = sev[b.severity] - sev[a.severity];
    if (d !== 0) return d;
    return (b.relatedEventIds?.length ?? 0) - (a.relatedEventIds?.length ?? 0);
  });

  let accepted = 0;
  let dismissed = 0;
  let deferred = 0;
  for (const decision of decisions) {
    if (decision.decision === "accepted") accepted += 1;
    else if (decision.decision === "dismissed") dismissed += 1;
    else if (decision.decision === "deferred") deferred += 1;
  }

  const responsePatternsForHealth = consolidatePatternsByBriefingIdentity(
    healthResponsePatterns.filter(
      (pattern) => !priorityBriefingKeys.has(briefingIdentityForPattern(pattern))
    )
  );

  const recentIncidentCount7d = incidentEvents.filter(
    (e) => Date.parse(e.occurred_at) >= recentCutoffMs
  ).length;

  let state: OrganisationIntelligence["status"]["state"] = "ready";
  if (incidentEvents.length > 0 && missingCoreRuns === incidentEvents.length) {
    state = "processing";
    notes.push(
      "Recent incidents exist but event-level intelligence has not completed yet."
    );
  } else if (missingCoreRuns > 0 || partialOutcomes > 0) {
    state = "partial";
    if (missingCoreRuns > 0) {
      notes.push(
        "Some incident events are missing completed signal or risk analysis."
      );
    }
    if (partialOutcomes > 0) {
      notes.push(
        "Some ActionOutcomes are partial; available findings are included."
      );
    }
  }

  const cleanedPriorities: IntelligencePriority[] =
    uniquePriorities.map(toPublicPriority);

  const { comparisonWindow, changes } = detectOrganisationIntelligenceChanges({
    windowTo,
    incidentEvents,
    signalRunsByEventId,
    riskRunsByEventId,
    decisions,
  });

  return {
    window: {
      from: windowFrom,
      to: windowTo,
      primaryDays: PRIMARY_WINDOW_DAYS,
      recentDays: RECENT_WINDOW_DAYS,
    },
    priorities: cleanedPriorities,
    patterns: finalPatterns,
    changes,
    comparisonWindow,
    recommendationHealth: {
      totalDecisions: decisions.length,
      accepted,
      dismissed,
      deferred,
      responsePatterns: responsePatternsForHealth,
    },
    operationalContext: {
      recentIncidentCount30d: incidentEvents.length,
      recentIncidentCount7d,
      highOrCriticalRiskCount,
      criticalRiskCount,
      facilitiesWithRecentActivity: facilities.size,
      maintenanceRequestedCount30d: lifecycleEvents.filter(
        (event) =>
          event.event_type === OperationalEventTypes.FACILITY_MAINTENANCE_REQUESTED
      ).length,
      workOrdersCreatedCount30d: lifecycleEvents.filter(
        (event) =>
          event.event_type === OperationalEventTypes.FACILITY_WORK_ORDER_CREATED
      ).length,
      workOrdersCompletedCount30d: lifecycleEvents.filter(
        (event) =>
          event.event_type === OperationalEventTypes.FACILITY_WORK_ORDER_COMPLETED
      ).length,
      lifecycleEventCount30d: lifecycleEvents.length,
    },
    stories: storySummaries,
    status: {
      state,
      supported: true,
      notes,
    },
  };
}

function emptyOrganisationIntelligence(
  from: string,
  to: string,
  status: OrganisationIntelligence["status"]
): OrganisationIntelligence {
  const { comparisonWindow, changes } = detectOrganisationIntelligenceChanges({
    windowTo: to,
    incidentEvents: [],
    signalRunsByEventId: new Map(),
    riskRunsByEventId: new Map(),
    decisions: [],
  });

  return {
    window: {
      from,
      to,
      primaryDays: PRIMARY_WINDOW_DAYS,
      recentDays: RECENT_WINDOW_DAYS,
    },
    priorities: [],
    patterns: [],
    changes,
    comparisonWindow,
    recommendationHealth: {
      totalDecisions: 0,
      accepted: 0,
      dismissed: 0,
      deferred: 0,
      responsePatterns: [],
    },
    operationalContext: {
      recentIncidentCount30d: 0,
      recentIncidentCount7d: 0,
      highOrCriticalRiskCount: 0,
      criticalRiskCount: 0,
      facilitiesWithRecentActivity: 0,
      maintenanceRequestedCount30d: 0,
      workOrdersCreatedCount30d: 0,
      workOrdersCompletedCount30d: 0,
      lifecycleEventCount30d: 0,
    },
    stories: [],
    status,
  };
}

/**
 * Testable loader: organisation-scoped aggregation of existing intelligence.
 * Does not call getEventIntelligence per event (avoids N+1).
 */
export async function loadOrganisationIntelligence(options: {
  supabase: SupabaseClient;
  organisationId: string;
  facilityManagementEnabled: boolean;
  now?: Date;
}): Promise<OrganisationIntelligence> {
  const now = options.now ?? new Date();
  const toIso = now.toISOString();
  const fromIso = daysAgoIso(now, PRIMARY_WINDOW_DAYS);

  if (!options.facilityManagementEnabled) {
    return emptyOrganisationIntelligence(fromIso, toIso, {
      state: "unavailable",
      supported: false,
      notes: [
        "Facility Management is not enabled for this organisation.",
      ],
    });
  }

  const incidentEvents = await loadEventsInWindow({
    supabase: options.supabase,
    organisationId: options.organisationId,
    eventType: OperationalEventTypes.FACILITY_INCIDENT_REPORTED,
    fromIso,
    toIso,
  });

  const lifecycleEvents = await loadLifecycleEventsInWindow({
    supabase: options.supabase,
    organisationId: options.organisationId,
    fromIso,
    toIso,
  });

  const decisionEvents = await loadEventsInWindow({
    supabase: options.supabase,
    organisationId: options.organisationId,
    eventType: OperationalEventTypes.SYSTEM_RECOMMENDATION_DECIDED,
    fromIso,
    toIso,
  });

  const incidentIds = incidentEvents.map((e) => e.id);
  const decisionEventIds = decisionEvents.map((e) => e.id);

  const [incidentRuns, patternRuns, decisions] = await Promise.all([
    loadActionRunsForEvents({
      supabase: options.supabase,
      organisationId: options.organisationId,
      eventIds: incidentIds,
      actionKeys: [SIGNAL_ACTION_KEY, RISK_ACTION_KEY],
    }),
    loadActionRunsForEvents({
      supabase: options.supabase,
      organisationId: options.organisationId,
      eventIds: decisionEventIds,
      actionKeys: [PATTERN_ACTION_KEY],
    }),
    loadDecisionsInWindow({
      supabase: options.supabase,
      organisationId: options.organisationId,
      fromIso,
      toIso,
    }),
  ]);

  return assembleOrganisationIntelligence({
    windowFrom: fromIso,
    windowTo: toIso,
    facilityManagementEnabled: true,
    incidentEvents,
    lifecycleEvents,
    signalRunsByEventId: pickLatestSucceededByEvent(
      incidentRuns,
      SIGNAL_ACTION_KEY
    ),
    riskRunsByEventId: pickLatestSucceededByEvent(incidentRuns, RISK_ACTION_KEY),
    patternRuns: patternRuns.filter(
      (r) => r.action_key === PATTERN_ACTION_KEY
    ),
    decisions,
  });
}

/**
 * Authenticated Organisation Intelligence entry point.
 * organisationId comes from the session — never from the client.
 */
export async function getOrganisationIntelligence(): Promise<OrganisationIntelligence> {
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

  return loadOrganisationIntelligence({
    supabase,
    organisationId: session.organisation.id,
    facilityManagementEnabled: hasModule(
      session.enabledModules,
      "facility_management"
    ),
  });
}
