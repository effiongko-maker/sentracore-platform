import type {
  IntelligenceChange,
  IntelligencePattern,
  IntelligencePriority,
  IntelligencePrioritySeverity,
  OrganisationIntelligence,
} from "@/lib/intelligence";
import {
  investigationFromEvidence,
  patternEvidenceValue,
  priorityEvidenceValue,
  type BriefingInvestigation,
} from "../utils/evidenceDisplay";

export type BriefingLayer = "attention" | "change" | "patterns" | "explore";

export type BriefingConfidence = "High" | "Medium" | "Low";

export type BriefingPosture =
  | "forming"
  | "waiting"
  | "needs_attention"
  | "movement"
  | "steady";

export type BriefingFindingKind =
  | "priority"
  | "change"
  | "pattern"
  | "attention";

export type BriefingFinding = {
  id: string;
  kind: BriefingFindingKind;
  title: string;
  summary: string;
  severity?: IntelligencePrioritySeverity | IntelligencePattern["severity"];
  evidence: number | null;
  confidence?: BriefingConfidence;
  affectedArea?: string;
  basedOn?: string;
  investigation?: BriefingInvestigation;
  change?: {
    direction: IntelligenceChange["direction"];
    recent: number;
    previous: number;
    delta: number;
    intensity: IntelligenceChange["intensity"];
  };
};

export type BriefingViewModel = {
  posture: BriefingPosture;
  statement: string;
  statementSupport: string;
  processing: boolean;
  partial: boolean;
  windowDays: number;
  matterCount: number;
  changeCount: number;
  patternCount: number;
  primary: BriefingFinding | null;
  orbit: BriefingFinding[];
  attentionFindings: BriefingFinding[];
  changeFindings: BriefingFinding[];
  patternFindings: BriefingFinding[];
  recommendationHealth: OrganisationIntelligence["recommendationHealth"];
  operationalContext: OrganisationIntelligence["operationalContext"];
};

function severityRank(severity: IntelligencePrioritySeverity): number {
  switch (severity) {
    case "critical":
      return 3;
    case "high":
      return 2;
    default:
      return 1;
  }
}

function priorityScore(p: IntelligencePriority): number {
  return severityRank(p.severity) * 1000 + (priorityEvidenceValue(p) ?? 0);
}

function changeScore(c: IntelligenceChange): number {
  let score = 0;
  if (c.severity === "critical") score += 500;
  if (c.severity === "high") score += 300;
  if (c.intensity === "significant") score += 200;
  if (c.intensity === "meaningful") score += 100;
  if (c.direction === "emerging") score += 80;
  if (c.direction === "increasing") score += 60;
  score += Math.abs(c.difference);
  return score;
}

function deriveConfidence(
  p: IntelligencePriority,
  evidence: number | null
): BriefingConfidence {
  const evidenceConfidence = p.evidence?.find((e) => e.type === "confidence")
    ?.value;
  if (evidenceConfidence === "high") return "High";
  if (evidenceConfidence === "medium") return "Medium";
  if (evidenceConfidence === "low") return "Low";
  if (p.severity === "critical" && (evidence ?? 0) >= 3) return "High";
  if (p.severity === "critical" || p.severity === "high") return "Medium";
  return "Low";
}

function deriveAffectedArea(p: IntelligencePriority): string | undefined {
  if (p.facilityId) return p.facilityId.replace(/_/g, " ");
  const subject = p.evidence?.find((e) => e.type === "subject")?.value;
  if (typeof subject === "string" && subject.trim()) return subject.trim();
  return undefined;
}

function deriveBasedOn(p: IntelligencePriority, evidence: number | null): string {
  const count = evidence ?? p.relatedEventIds?.length ?? 0;
  if (p.category === "incident_pattern" && count > 0) {
    return `${count} related activit${count === 1 ? "y" : "ies"}`;
  }
  if (p.category === "recommendation_response" && count > 0) {
    return `${count} recommendation response${count === 1 ? "" : "s"}`;
  }
  if (p.category === "operational_lifecycle" && count > 0) {
    return `${count} related activit${count === 1 ? "y" : "ies"}`;
  }
  if (p.category === "operational_story" && count > 0) {
    return `${count} related activit${count === 1 ? "y" : "ies"}`;
  }
  if (count > 0) return `${count} related activit${count === 1 ? "y" : "ies"}`;
  return "Recent activity across SentraCore";
}

function toPriorityFinding(p: IntelligencePriority): BriefingFinding {
  const evidence = priorityEvidenceValue(p);
  return {
    id: p.id,
    kind: "priority",
    title: p.title,
    summary: p.summary,
    severity: p.severity,
    evidence,
    confidence: deriveConfidence(p, evidence),
    affectedArea: deriveAffectedArea(p),
    basedOn: deriveBasedOn(p, evidence),
    investigation: investigationFromEvidence(p),
  };
}

function toChangeFinding(c: IntelligenceChange): BriefingFinding {
  return {
    id: c.id,
    kind: "change",
    title: c.title,
    summary: c.summary,
    severity: c.severity,
    evidence: c.recentCount > 0 ? c.recentCount : null,
    change: {
      direction: c.direction,
      recent: c.recentCount,
      previous: c.previousCount,
      delta: c.difference,
      intensity: c.intensity,
    },
  };
}

function toPatternFinding(p: IntelligencePattern): BriefingFinding {
  return {
    id: p.id,
    kind: "pattern",
    title: p.title,
    summary: p.summary,
    severity: p.severity,
    evidence: patternEvidenceValue(p),
    basedOn:
      p.relatedEventIds && p.relatedEventIds.length > 0
        ? `${p.relatedEventIds.length} related activit${
            p.relatedEventIds.length === 1 ? "y" : "ies"
          }`
        : undefined,
    affectedArea: p.facilityId?.replace(/_/g, " "),
    investigation: investigationFromEvidence(p),
  };
}

function toAttentionFinding(p: IntelligencePriority): BriefingFinding {
  return {
    id: p.id,
    kind: "attention",
    title: p.title,
    summary: p.summary,
    severity: p.severity,
    evidence: priorityEvidenceValue(p),
    investigation: investigationFromEvidence(p),
  };
}

function isUrgent(severity: IntelligencePrioritySeverity): boolean {
  return severity === "critical" || severity === "high";
}

function derivePosture(input: {
  processing: boolean;
  hasActivity: boolean;
  urgentCount: number;
  changeCount: number;
}): BriefingPosture {
  if (input.processing) return "forming";
  if (!input.hasActivity) return "waiting";
  if (input.urgentCount > 0) return "needs_attention";
  if (input.changeCount > 0) return "movement";
  return "steady";
}

function deriveStatement(posture: BriefingPosture): {
  statement: string;
  support: string;
} {
  switch (posture) {
    case "forming":
      return {
        statement: "The picture is still forming",
        support:
          "SentraCore is still analysing recent activity. Findings will sharpen as more comes in.",
      };
    case "waiting":
      return {
        statement: "Not enough to go on yet",
        support:
          "There isn't enough recent activity for SentraCore to say much about the operation.",
      };
    case "needs_attention":
      return {
        statement: "The operation needs attention",
        support:
          "Here's what needs your attention based on recent activity.",
      };
    case "movement":
      return {
        statement: "Something has changed",
        support:
          "Nothing urgent right now, but the operation is shifting compared with the previous period.",
      };
    case "steady":
      return {
        statement: "The operation is holding steady",
        support:
          "No significant changes in the last period. Observations remain below.",
      };
  }
}

export function buildBriefingViewModel(
  data: OrganisationIntelligence
): BriefingViewModel {
  const {
    status,
    priorities,
    patterns,
    changes,
    recommendationHealth,
    operationalContext,
    window,
  } = data;

  const processing = status.state === "processing";
  const partial = status.state === "partial";
  const hasActivity =
    operationalContext.recentWorkCount30d > 0 ||
    operationalContext.recentIncidentCount30d > 0 ||
    recommendationHealth.totalDecisions > 0;

  const urgent = priorities
    .filter((p) => isUrgent(p.severity))
    .sort((a, b) => priorityScore(b) - priorityScore(a))
    .map(toPriorityFinding);

  const attentionOnly = priorities
    .filter((p) => !isUrgent(p.severity))
    .map(toAttentionFinding);

  const noticing = patterns
    .filter((p) => p.category !== "recommendation_response")
    .map(toPatternFinding);

  const changeFindings = [...changes]
    .sort((a, b) => changeScore(b) - changeScore(a))
    .map(toChangeFinding);

  const patternFindings = [...attentionOnly, ...noticing];

  const posture = derivePosture({
    processing,
    hasActivity,
    urgentCount: urgent.length,
    changeCount: changeFindings.length,
  });

  const { statement, support } = deriveStatement(posture);

  const primaryAttention = urgent[0] ?? null;
  const orbitAttention = urgent.slice(1);

  const primaryChange = changeFindings[0] ?? null;
  const orbitChange = changeFindings.slice(1);

  const primaryPattern = patternFindings[0] ?? null;
  const orbitPattern = patternFindings.slice(1);

  return {
    posture,
    statement,
    statementSupport: support,
    processing,
    partial,
    windowDays: window.primaryDays,
    matterCount: urgent.length,
    changeCount: changeFindings.length,
    patternCount: patternFindings.length,
    primary: primaryAttention,
    orbit: orbitAttention,
    attentionFindings: urgent,
    changeFindings,
    patternFindings,
    recommendationHealth,
    operationalContext,
  };
}

export function layerPrimary(
  vm: BriefingViewModel,
  layer: BriefingLayer
): BriefingFinding | null {
  switch (layer) {
    case "attention":
      return vm.attentionFindings[0] ?? null;
    case "change":
      return vm.changeFindings[0] ?? null;
    case "patterns":
      return vm.patternFindings[0] ?? null;
    case "explore":
      return null;
  }
}

export function layerOrbit(
  vm: BriefingViewModel,
  layer: BriefingLayer
): BriefingFinding[] {
  switch (layer) {
    case "attention":
      return vm.attentionFindings.slice(1);
    case "change":
      return vm.changeFindings.slice(1);
    case "patterns":
      return vm.patternFindings.slice(1);
    case "explore":
      return [];
  }
}

export function layerFindings(
  vm: BriefingViewModel,
  layer: BriefingLayer
): BriefingFinding[] {
  switch (layer) {
    case "attention":
      return vm.attentionFindings;
    case "change":
      return vm.changeFindings;
    case "patterns":
      return vm.patternFindings;
    case "explore":
      return [];
  }
}

export function layerCount(vm: BriefingViewModel, layer: BriefingLayer): number {
  if (layer === "explore") return 0;
  return layerFindings(vm, layer).length;
}
