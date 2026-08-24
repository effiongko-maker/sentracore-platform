/**
 * Presentation-only synthesis of incident intelligence.
 * Interprets engine signals into analyst-style findings — does not invent facts.
 */

import type {
  IntelligenceRecommendationView,
  IntelligenceRiskView,
  IntelligenceSignalView,
} from "@/lib/intelligence";
import { labelForSignalKey } from "./signalLabels";

const FACILITY_ID_RE = /\bFAC-[A-Z0-9-]+\b/gi;
const ASSET_ID_RE = /\bAST-[A-Z0-9-]+\b/gi;
const THRESHOLD_RE = /\(?\s*thresholds?:\s*[^)]+\)?/gi;
const INCIDENT_S_RE = /incident\(s\)/gi;
const MATCH_S_RE = /match\(es\)/gi;
const REQUEST_S_RE = /request\(s\)/gi;
const SIGNAL_S_RE = /signal\(s\)/gi;

/** Incident fields the user already sees on the record — not intelligence. */
const METADATA_SIGNAL_KEYS = new Set([
  "incident.severity_high",
  "incident.severity_critical",
  "incident.is_emergency",
  "incident.requires_work_order",
]);

const FREQUENCY_KEYS = [
  "incident.facility_frequency_7d",
  "incident.facility_frequency_30d",
] as const;

export type IntelligenceFindingCategory =
  | "RECURRING PATTERN"
  | "RELATED OPERATIONAL SIGNAL"
  | "ESCALATION RISK"
  | "SIMILAR INCIDENTS"
  | "PENDING ACTION";

export type SynthesizedFinding = {
  category: IntelligenceFindingCategory;
  body: string;
  sourceKeys: string[];
};

export type SynthesizedIncidentIntelligence = {
  findings: SynthesizedFinding[];
  priorityAction: string | null;
  riskConclusion: string | null;
};

function stripIds(text: string): string {
  return text
    .replace(FACILITY_ID_RE, "this facility")
    .replace(ASSET_ID_RE, "this asset")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function cleanupEnginePhrasing(text: string): string {
  return stripIds(text)
    .replace(THRESHOLD_RE, "")
    .replace(INCIDENT_S_RE, "incidents")
    .replace(MATCH_S_RE, "matches")
    .replace(REQUEST_S_RE, "requests")
    .replace(SIGNAL_S_RE, "signals")
    .replace(/\bat facility this facility\b/gi, "at this facility")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,])/g, "$1")
    .trim();
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function windowPhrase(days: number | null): string {
  if (days === 7) return "the past week";
  if (days === 14) return "the past two weeks";
  if (days === 30) return "the past month";
  if (days != null && days > 0) return `the past ${days} days`;
  return "recently";
}

function ordinal(n: number): string {
  const abs = Math.abs(n);
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (abs % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

function countWord(n: number): string {
  const words = [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
  ];
  return words[n] ?? String(n);
}

function evidenceCount(evidence: Record<string, unknown>): number | null {
  return (
    asFiniteNumber(evidence.priorCount) ??
    asFiniteNumber(evidence.matchCount) ??
    asFiniteNumber(evidence.count)
  );
}

function evidenceWindowDays(
  evidence: Record<string, unknown>
): number | null {
  return (
    asFiniteNumber(evidence.windowDays) ?? asFiniteNumber(evidence.window)
  );
}

function signalMap(
  signals: IntelligenceSignalView[]
): Map<string, IntelligenceSignalView> {
  const map = new Map<string, IntelligenceSignalView>();
  for (const signal of signals) {
    if (!map.has(signal.key)) map.set(signal.key, signal);
  }
  return map;
}

function buildRecurringPattern(
  byKey: Map<string, IntelligenceSignalView>
): SynthesizedFinding | null {
  const freq7 = byKey.get("incident.facility_frequency_7d");
  const freq30 = byKey.get("incident.facility_frequency_30d");
  if (!freq7 && !freq30) return null;

  const evidence7 = (freq7?.evidence ?? {}) as Record<string, unknown>;
  const evidence30 = (freq30?.evidence ?? {}) as Record<string, unknown>;
  const prior7 = freq7 ? evidenceCount(evidence7) : null;
  const prior30 = freq30 ? evidenceCount(evidence30) : null;

  const sourceKeys = FREQUENCY_KEYS.filter((key) => byKey.has(key));

  // Prefer the tighter window when both fire — never emit both as separate findings.
  if (freq7 && prior7 != null && prior7 >= 1) {
    const total = prior7 + 1;
    let body =
      total === 2
        ? "This is the second related incident reported at this facility within the past week."
        : `This is the ${ordinal(total)} related incident reported at this facility within the past week.`;

    if (
      prior30 != null &&
      prior30 > prior7 &&
      freq30
    ) {
      body = `Repeated incidents have been reported at this facility recently, including ${prior7 + 1} in the past week.`;
    }

    return {
      category: "RECURRING PATTERN",
      body,
      sourceKeys: [...sourceKeys],
    };
  }

  if (freq30 && prior30 != null && prior30 >= 1) {
    const total = prior30 + 1;
    const body =
      total === 2
        ? "This is the second related incident reported at this facility within the past month."
        : `This is the ${ordinal(total)} related incident reported at this facility within the past month.`;
    return {
      category: "RECURRING PATTERN",
      body,
      sourceKeys: [...sourceKeys],
    };
  }

  return {
    category: "RECURRING PATTERN",
    body: "Repeated incidents have been reported at this facility recently.",
    sourceKeys: [...sourceKeys],
  };
}

function buildMaintenanceFinding(
  signal: IntelligenceSignalView
): SynthesizedFinding {
  const evidence = (signal.evidence ?? {}) as Record<string, unknown>;
  const prior = evidenceCount(evidence);
  const window = windowPhrase(evidenceWindowDays(evidence));

  let body: string;
  if (prior === 1) {
    body = `A maintenance issue was also reported at this facility in ${window}, suggesting the incident may require broader investigation.`;
  } else if (prior != null && prior > 1) {
    body = `${countWord(prior)} maintenance issues were also reported at this facility in ${window}, suggesting the incident may require broader investigation.`;
  } else {
    body =
      "A maintenance issue was also reported at this facility recently, suggesting the incident may require broader investigation.";
  }

  return {
    category: "RELATED OPERATIONAL SIGNAL",
    body,
    sourceKeys: [signal.key],
  };
}

function buildSimilarTypeFinding(
  signal: IntelligenceSignalView
): SynthesizedFinding {
  const evidence = (signal.evidence ?? {}) as Record<string, unknown>;
  const prior = evidenceCount(evidence);
  const window = windowPhrase(evidenceWindowDays(evidence));
  const typeValue = asNonEmptyString(evidence.value);
  const typeLabel = typeValue ? typeValue.replace(/_/g, " ") : "this type";

  let body: string;
  if (prior === 1) {
    body = `A similar ${typeLabel} incident was reported at this facility in ${window}.`;
  } else if (prior != null && prior > 1) {
    body = `${countWord(prior)} similar ${typeLabel} incidents were reported at this facility in ${window}.`;
  } else {
    body = `Similar ${typeLabel} incidents have been reported at this facility recently.`;
  }

  return {
    category: "SIMILAR INCIDENTS",
    body,
    sourceKeys: [signal.key],
  };
}

function buildAssetFinding(signal: IntelligenceSignalView): SynthesizedFinding {
  const evidence = (signal.evidence ?? {}) as Record<string, unknown>;
  const prior = evidenceCount(evidence);
  const window = windowPhrase(evidenceWindowDays(evidence));

  let body: string;
  if (prior === 1) {
    body = `The same asset was involved in another incident at this facility in ${window}.`;
  } else if (prior != null && prior > 1) {
    body = `The same asset was involved in ${countWord(prior)} other incidents at this facility in ${window}.`;
  } else {
    body =
      "The same asset has been involved in recent incidents at this facility.";
  }

  return {
    category: "SIMILAR INCIDENTS",
    body,
    sourceKeys: [signal.key],
  };
}

function buildLocationFinding(
  signal: IntelligenceSignalView
): SynthesizedFinding {
  const evidence = (signal.evidence ?? {}) as Record<string, unknown>;
  const prior = evidenceCount(evidence);
  const window = windowPhrase(evidenceWindowDays(evidence));
  const typeValue = asNonEmptyString(evidence.value);
  const field = asNonEmptyString(evidence.field);
  const location = typeValue && field === "locationDetail" ? typeValue : null;

  let body: string;
  if (location) {
    if (prior === 1) {
      body = `Another incident was reported at “${location}” in ${window}.`;
    } else if (prior != null && prior > 1) {
      body = `${countWord(prior)} other incidents were reported at “${location}” in ${window}.`;
    } else {
      body = `Incidents have been reported at “${location}” recently.`;
    }
  } else {
    body = "Incidents have been reported at the same location recently.";
  }

  return {
    category: "SIMILAR INCIDENTS",
    body,
    sourceKeys: [signal.key],
  };
}

function buildGenericFinding(
  signal: IntelligenceSignalView
): SynthesizedFinding | null {
  if (METADATA_SIGNAL_KEYS.has(signal.key)) return null;

  const summary = signal.summary?.trim();
  if (!summary) return null;

  const cleaned = cleanupEnginePhrasing(summary);
  if (!cleaned) return null;

  // Avoid re-surfacing severity metadata phrasing from free-text summaries.
  if (
    /reported as (high|critical) severity/i.test(cleaned) ||
    /marked as an emergency/i.test(cleaned)
  ) {
    return null;
  }

  return {
    category: "RELATED OPERATIONAL SIGNAL",
    body: cleaned,
    sourceKeys: [signal.key],
  };
}

function buildPriorityAction(
  findings: SynthesizedFinding[],
  byKey: Map<string, IntelligenceSignalView>
): string | null {
  const hasRecurring = findings.some((f) => f.category === "RECURRING PATTERN");
  const hasMaintenance = byKey.has("incident.recent_maintenance_at_facility");
  const hasSimilar = findings.some((f) => f.category === "SIMILAR INCIDENTS");

  if (hasRecurring && hasMaintenance) {
    return "Investigate the recurring incidents at this facility and assess whether the recent maintenance issue is contributing to the pattern.";
  }
  if (hasRecurring) {
    return "Investigate the recurring incidents at this facility and identify what is driving the pattern.";
  }
  if (hasMaintenance && hasSimilar) {
    return "Investigate this incident alongside the related activity and recent maintenance at this facility.";
  }
  if (hasMaintenance) {
    return "Review the recent maintenance activity at this facility in relation to this incident.";
  }
  if (hasSimilar) {
    return "Compare this incident with the similar recent cases and determine whether a shared cause exists.";
  }
  if (findings.length > 0) {
    return "Review the operational signals identified for this incident and take proportionate corrective action.";
  }
  return null;
}

export function humanizeRiskConclusion(risk: IntelligenceRiskView): string {
  const level = (risk.riskLevel ?? "").toLowerCase();
  if (level === "critical") {
    return "SentraCore Intelligence assesses this as a critical-risk incident.";
  }
  if (level === "high") {
    return "SentraCore Intelligence assesses this as a high-risk incident.";
  }
  if (level === "moderate" || level === "medium") {
    return "SentraCore Intelligence assesses this as a moderate-risk incident.";
  }
  if (level === "low") {
    return "SentraCore Intelligence assesses this as a low-risk incident.";
  }

  if (risk.summary?.trim()) {
    return cleanupEnginePhrasing(risk.summary).replace(
      /^Incident assessed as\s+/i,
      "SentraCore Intelligence assesses this as "
    );
  }

  return "SentraCore Intelligence has assessed the operational risk for this incident.";
}

/**
 * Synthesise overlapping engine signals into a short analyst-style briefing.
 */
export function synthesizeIncidentIntelligence(options: {
  risk: IntelligenceRiskView | null;
  signals: IntelligenceSignalView[];
}): SynthesizedIncidentIntelligence {
  const { risk, signals } = options;
  const byKey = signalMap(signals);
  const findings: SynthesizedFinding[] = [];
  const usedKeys = new Set<string>();

  const recurring = buildRecurringPattern(byKey);
  if (recurring) {
    findings.push(recurring);
    for (const key of recurring.sourceKeys) usedKeys.add(key);
  }

  const maintenance = byKey.get("incident.recent_maintenance_at_facility");
  if (maintenance) {
    findings.push(buildMaintenanceFinding(maintenance));
    usedKeys.add(maintenance.key);
  }

  const similarType = byKey.get("incident.repeated_type");
  if (similarType && !usedKeys.has(similarType.key)) {
    // Skip weak type echo when frequency already covers the same facility pattern
    // unless the type signal adds a named type.
    const typeValue = asNonEmptyString(
      (similarType.evidence as Record<string, unknown> | undefined)?.value
    );
    if (typeValue || !recurring) {
      findings.push(buildSimilarTypeFinding(similarType));
      usedKeys.add(similarType.key);
    } else {
      usedKeys.add(similarType.key);
    }
  }

  const asset = byKey.get("incident.repeated_asset");
  if (asset && !usedKeys.has(asset.key) && findings.length < 4) {
    findings.push(buildAssetFinding(asset));
    usedKeys.add(asset.key);
  }

  const location = byKey.get("incident.repeated_location");
  if (location && !usedKeys.has(location.key) && findings.length < 4) {
    findings.push(buildLocationFinding(location));
    usedKeys.add(location.key);
  }

  // Drop repeated_severity — usually overlaps facility frequency without adding insight.
  usedKeys.add("incident.repeated_severity");

  for (const signal of signals) {
    if (findings.length >= 4) break;
    if (usedKeys.has(signal.key)) continue;
    if (METADATA_SIGNAL_KEYS.has(signal.key)) {
      usedKeys.add(signal.key);
      continue;
    }
    const generic = buildGenericFinding(signal);
    if (generic) {
      findings.push(generic);
      usedKeys.add(signal.key);
    }
  }

  return {
    findings: findings.slice(0, 4),
    priorityAction: buildPriorityAction(findings, byKey),
    riskConclusion: risk ? humanizeRiskConclusion(risk) : null,
  };
}

/** Soften generic engine recommendation titles using synthesised context. */
export function humanizeRecommendationCopy(options: {
  recommendation: IntelligenceRecommendationView;
  priorityAction: string | null;
}): { title: string; description: string | null } {
  const { recommendation, priorityAction } = options;
  const rawTitle = recommendation.title?.trim() ?? "";
  const reason = recommendation.reason ?? "";

  const isGenericPrioritise =
    /prioritise_investigation/i.test(reason) ||
    /prioritise investigation and corrective action/i.test(rawTitle);

  const isGenericFacilityReview =
    /review_facility_asset_conditions/i.test(reason) ||
    /review contributing facility and asset conditions/i.test(rawTitle);

  const isPatternReview =
    /review_facility_incident_pattern/i.test(reason) ||
    /review recent incident pattern/i.test(rawTitle);

  if (
    (isGenericPrioritise || isPatternReview || isGenericFacilityReview) &&
    priorityAction
  ) {
    return {
      title: "Priority action",
      description: priorityAction,
    };
  }

  if (isGenericPrioritise && !priorityAction) {
    return {
      title: "Priority action",
      description:
        "Investigate this incident promptly and complete proportionate corrective action.",
    };
  }

  return {
    title: rawTitle || "Recommended action",
    description: recommendation.description?.trim()
      ? cleanupEnginePhrasing(recommendation.description)
      : null,
  };
}

/** @deprecated Prefer synthesizeIncidentIntelligence */
export type HumanSignalView = {
  key: string;
  title: string;
  body: string;
};

export function humanSignalTitle(key: string): string {
  const titles: Record<string, string> = {
    "incident.facility_frequency_7d": "Recurring pattern",
    "incident.facility_frequency_30d": "Recurring pattern",
    "incident.repeated_type": "Similar incidents",
    "incident.repeated_severity": "Similar severity pattern",
    "incident.repeated_asset": "Similar incidents",
    "incident.repeated_location": "Similar incidents",
    "incident.recent_maintenance_at_facility": "Related operational signal",
    "incident.is_emergency": "Emergency",
    "incident.severity_critical": "Critical severity",
    "incident.severity_high": "High severity",
    "incident.requires_work_order": "Work order context",
  };
  return titles[key] ?? labelForSignalKey(key);
}

export function humanizeSignal(signal: IntelligenceSignalView): HumanSignalView {
  const synthesised = synthesizeIncidentIntelligence({
    risk: null,
    signals: [signal],
  });
  const finding = synthesised.findings[0];
  return {
    key: signal.key,
    title: finding?.category ?? humanSignalTitle(signal.key),
    body: finding?.body ?? "An operational pattern was identified.",
  };
}
