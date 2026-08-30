import type {
  IntelligenceChange,
  IntelligencePattern,
  IntelligencePriority,
  OperationalStorySummary,
  OrganisationIntelligence,
} from "@/lib/intelligence";
import type {
  InsightConfidence,
  InsightEvidenceItem,
  InsightReasoningType,
  InsightRelatedEntity,
  InsightSuggestedAction,
  IntelligenceInsight,
  OrganisationInsightBundle,
} from "@/lib/intelligence/insights/types";
import { synthesizeInsightReasoning } from "@/lib/intelligence/insights/synthesizeInsightReasoning";
import {
  investigationFromEvidence,
  patternEvidenceValue,
  priorityEvidenceValue,
} from "../utils/evidenceDisplay";

function confidenceFromStory(
  value: OperationalStorySummary["confidence"]
): InsightConfidence {
  if (value === "high") return "High";
  if (value === "medium") return "Moderate";
  return "Emerging";
}

function confidenceFromPriority(
  p: IntelligencePriority,
  evidenceCount: number | null
): { confidence: InsightConfidence; basis: string } {
  const tagged = p.evidence?.find((e) => e.type === "confidence")?.value;
  if (tagged === "high") {
    return {
      confidence: "High",
      basis: "Multiple corroborating operational signals in the analysis window.",
    };
  }
  if (tagged === "medium") {
    return {
      confidence: "Moderate",
      basis: "Enough related activity to support a cautious conclusion.",
    };
  }
  if (tagged === "low") {
    return {
      confidence: "Emerging",
      basis: "Early signal — evidence is still limited.",
    };
  }
  if (p.severity === "critical" && (evidenceCount ?? 0) >= 3) {
    return {
      confidence: "High",
      basis: `Critical severity with ${evidenceCount} supporting evidence points.`,
    };
  }
  if (p.severity === "critical" || p.severity === "high") {
    return {
      confidence: "Moderate",
      basis: "Elevated severity with partial corroboration.",
    };
  }
  if ((evidenceCount ?? 0) >= 5) {
    return {
      confidence: "Moderate",
      basis: `${evidenceCount} related activities in the analysis window.`,
    };
  }
  return {
    confidence: "Emerging",
    basis: "Limited supporting activity so far.",
  };
}

function reasoningFromPriority(
  p: IntelligencePriority
): InsightReasoningType {
  switch (p.category) {
    case "risk":
      return "risk";
    case "incident_pattern":
      return "pattern";
    case "recommendation_response":
    case "recommendation_attention":
      return "recommendation";
    case "operational_story":
      return "correlation";
    case "operational_lifecycle":
      return "trend";
    default:
      return "pattern";
  }
}

function reasoningFromPattern(p: IntelligencePattern): InsightReasoningType {
  const cat = p.category.toLowerCase();
  if (cat.includes("recurrence") || cat.includes("repeat")) return "recurrence";
  if (cat.includes("concentration") || cat.includes("facility"))
    return "concentration";
  if (cat.includes("anomaly")) return "anomaly";
  if (cat.includes("risk")) return "risk";
  if (cat.includes("recommendation")) return "recommendation";
  if (cat.includes("capacity") || cat.includes("bottleneck")) return "capacity";
  if (cat.includes("positive") || cat.includes("stabilis")) return "positive";
  return "pattern";
}

function reasoningFromChange(c: IntelligenceChange): InsightReasoningType {
  if (c.direction === "emerging") return "predictive";
  if (c.category === "incident_risk") return "risk";
  if (c.category === "recommendation_behaviour") return "recommendation";
  return "trend";
}

function facilityEntity(facilityId?: string): InsightRelatedEntity[] {
  if (!facilityId?.trim()) return [];
  return [
    {
      kind: "facility",
      id: facilityId,
      label: facilityId.replace(/_/g, " "),
    },
  ];
}

function eventEntities(ids?: string[]): InsightRelatedEntity[] {
  if (!ids?.length) return [];
  return ids.slice(0, 12).map((id) => ({ kind: "event" as const, id }));
}

function asIdList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((id) => id.trim())
      .filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/[,\s]+/)
      .map((id) => id.trim())
      .filter(Boolean);
  }
  return [];
}

function classifyOperationalId(id: string): InsightRelatedEntity["kind"] | null {
  const upper = id.toUpperCase();
  if (upper.startsWith("INC-")) return "incident";
  if (upper.startsWith("MNT-")) return "maintenance";
  if (upper.startsWith("WO-")) return "work_order";
  if (upper.startsWith("FAC-")) return "facility";
  if (upper.startsWith("AST-") || upper.startsWith("ASSET-")) return "asset";
  return null;
}

/**
 * Plumb already-known operational IDs from priority/pattern evidence
 * onto relatedEntities so Take Action can open specific records.
 */
function operationalEntitiesFromEvidence(
  evidence?: Array<{ type: string; value?: unknown }>
): InsightRelatedEntity[] {
  if (!evidence?.length) return [];
  const map = new Map<string, InsightRelatedEntity>();
  const push = (kind: InsightRelatedEntity["kind"], id: string) => {
    const trimmed = id.trim();
    if (!trimmed) return;
    const key = `${kind}:${trimmed}`;
    if (map.has(key)) return;
    map.set(key, { kind, id: trimmed, label: trimmed });
  };

  for (const entry of evidence) {
    const type = entry.type;
    if (type === "incident_ids" || type === "linked_open_incident_ids") {
      for (const id of asIdList(entry.value)) push("incident", id);
    } else if (type === "maintenance_ids") {
      for (const id of asIdList(entry.value)) push("maintenance", id);
    } else if (type === "work_order_ids") {
      for (const id of asIdList(entry.value)) push("work_order", id);
    } else if (type === "facility_ids") {
      for (const id of asIdList(entry.value)) push("facility", id);
    } else if (type === "asset_ids") {
      for (const id of asIdList(entry.value)) push("asset", id);
    } else if (type === "entity_ids") {
      for (const id of asIdList(entry.value)) {
        const kind = classifyOperationalId(id);
        if (kind) push(kind, id);
      }
    }
  }

  return [...map.values()].slice(0, 24);
}

function operationalEntitiesFromStory(
  story: OperationalStorySummary
): InsightRelatedEntity[] {
  const map = new Map<string, InsightRelatedEntity>();
  const push = (kind: InsightRelatedEntity["kind"], id: string) => {
    const trimmed = id.trim();
    if (!trimmed) return;
    const key = `${kind}:${trimmed}`;
    if (map.has(key)) return;
    map.set(key, { kind, id: trimmed, label: trimmed });
  };

  for (const id of story.incidentIds ?? []) push("incident", id);
  for (const id of story.maintenanceIds ?? []) push("maintenance", id);
  for (const id of story.workOrderIds ?? []) push("work_order", id);
  for (const step of story.sequence ?? []) {
    if (!step.entityId) continue;
    const kind = classifyOperationalId(step.entityId);
    if (kind) push(kind, step.entityId);
  }

  return [...map.values()].slice(0, 24);
}

function evidenceFromInvestigation(
  items: Array<{ label: string; value: string }> | undefined
): InsightEvidenceItem[] {
  if (!items?.length) return [];
  return items
    .filter((item) => {
      // Hide raw internal ID dumps from human-facing evidence where possible
      const label = item.label.toLowerCase();
      return !(
        label.includes("activity ids") ||
        label.includes("event ids") ||
        label.includes("finding keys") ||
        label.includes("finding ids") ||
        label.includes("related ids")
      );
    })
    .map((item) => ({
      label: item.label,
      value: item.value,
      source: "organisation_intelligence" as const,
    }));
}

function factFromPriority(p: IntelligencePriority, count: number | null): string {
  const inv = investigationFromEvidence(p);
  if (inv?.whatItSaw?.trim()) return inv.whatItSaw.trim();
  if (count != null && count > 0) {
    return `${count} related operational activit${
      count === 1 ? "y was" : "ies were"
    } recorded in the analysis window${
      p.facilityId ? ` at ${p.facilityId.replace(/_/g, " ")}` : ""
    }.`;
  }
  return p.summary.trim();
}

function actionsForInsight(input: {
  facilityId?: string;
  investigation: string[];
  hasRecommendation: boolean;
}): InsightSuggestedAction[] {
  const actions: InsightSuggestedAction[] = [];
  for (const prompt of input.investigation.slice(0, 3)) {
    actions.push({
      kind: "investigate",
      label: prompt.length > 72 ? `${prompt.slice(0, 69)}…` : prompt,
    });
  }
  actions.push({
    kind: "investigate",
    label: "Review incidents",
    href: "/incidents",
  });
  if (input.facilityId) {
    actions.push({
      kind: "investigate",
      label: "Browse facilities",
      href: "/facilities",
    });
  }
  if (input.hasRecommendation) {
    actions.unshift({
      kind: "act",
      label: "Follow recommendation",
    });
  }
  return actions;
}

function mapStory(story: OperationalStorySummary): IntelligenceInsight | null {
  if (!story.whatItSaw?.trim() && !story.summary?.trim()) return null;
  if (story.findingIds.length === 0 && story.relatedEventIds.length === 0) {
    return null;
  }

  const evidence: InsightEvidenceItem[] = [
    {
      label: "Related findings",
      value: String(story.findingIds.length),
      source: "organisation_intelligence",
    },
    {
      label: "Related activities",
      value: String(story.relatedEventIds.length),
      source: "operational_events",
    },
  ];
  if (story.sequence.length > 0) {
    evidence.push({
      label: "Observed sequence",
      value: story.sequence
        .slice(0, 5)
        .map((step) => step.label)
        .join(" → "),
      source: "operational_events",
    });
  }
  if (story.assetIds.length > 0) {
    evidence.push({
      label: "Assets",
      value: String(story.assetIds.length),
      source: "organisation_intelligence",
    });
  }

  const reasoningType: InsightReasoningType =
    story.status === "deteriorating"
      ? "risk"
      : story.status === "stabilising" || story.status === "resolved"
        ? "positive"
        : "correlation";

  const reasoned = synthesizeInsightReasoning({
    title: story.title,
    observation: story.summary,
    factSeed: story.whatItSaw.trim() || story.summary,
    evidence,
    reasoningType,
    investigationPrompts: story.whatToInvestigate,
    legacyWhy: story.whyItMatters,
    storyStatus: story.status,
    facilityLabel: story.facilityId,
    assetCount: story.assetIds.length,
    findingCount: story.findingIds.length,
    eventCount: story.relatedEventIds.length,
    confidenceHint: confidenceFromStory(story.confidence),
    isPositive:
      story.status === "stabilising" || story.status === "resolved",
    isResolved: story.status === "resolved",
  });

  const outcomeStatus =
    story.status === "resolved"
      ? "resolved"
      : story.status === "deteriorating"
        ? "persisting"
        : story.status === "active"
          ? "interpreted"
          : story.status === "emerging"
            ? "detected"
            : "unknown";

  return {
    id: `story:${story.id}`,
    reasoningType,
    title: story.title,
    observation: story.summary,
    fact: reasoned.fact,
    inference: reasoned.inference,
    impact: reasoned.impact,
    recommendation: reasoned.recommendation,
    confidence: reasoned.confidence,
    confidenceBasis: reasoned.confidenceBasis,
    evidence,
    relatedEntities: [
      ...facilityEntity(story.facilityId),
      ...story.assetIds.slice(0, 6).map((id) => ({
        kind: "asset" as const,
        id,
      })),
      ...operationalEntitiesFromStory(story),
      ...eventEntities(story.relatedEventIds),
    ],
    suggestedActions: actionsForInsight({
      facilityId: story.facilityId,
      investigation: reasoned.investigation,
      hasRecommendation: Boolean(reasoned.recommendation),
    }),
    outcome: {
      status: outcomeStatus,
      summary:
        reasoned.outcomeSummary ??
        `Story status: ${story.status.replace(/_/g, " ")}`,
    },
    sourceRefs: { storyId: story.id },
  };
}

function mapPriority(p: IntelligencePriority): IntelligenceInsight | null {
  if (!p.title?.trim() || !p.summary?.trim()) return null;
  const count = priorityEvidenceValue(p);
  const inv = investigationFromEvidence(p);
  const { confidence: hint } = confidenceFromPriority(p, count);
  const fact = factFromPriority(p, count);
  if (!fact.trim()) return null;

  const evidence = evidenceFromInvestigation(inv?.evidenceItems);
  const reasoningType = reasoningFromPriority(p);
  const reasoned = synthesizeInsightReasoning({
    title: p.title,
    observation: p.summary,
    factSeed: fact,
    evidence,
    reasoningType,
    investigationPrompts: inv?.whatToInvestigate,
    legacyWhy: inv?.whyItMatters,
    storyStatus: inv?.storyStatus,
    facilityLabel: p.facilityId,
    eventCount: p.relatedEventIds?.length,
    confidenceHint: hint,
  });

  return {
    id: `priority:${p.id}`,
    reasoningType,
    title: p.title,
    observation: p.summary,
    fact: reasoned.fact,
    inference: reasoned.inference,
    impact: reasoned.impact,
    recommendation: reasoned.recommendation,
    confidence: reasoned.confidence,
    confidenceBasis: reasoned.confidenceBasis,
    evidence,
    relatedEntities: [
      ...facilityEntity(p.facilityId),
      ...operationalEntitiesFromEvidence(p.evidence),
      ...eventEntities(p.relatedEventIds),
    ],
    suggestedActions: actionsForInsight({
      facilityId: p.facilityId,
      investigation: reasoned.investigation,
      hasRecommendation: Boolean(reasoned.recommendation),
    }),
    outcome: reasoned.recommendation
      ? { status: "recommended" }
      : { status: "interpreted" },
    sourceRefs: { priorityId: p.id },
  };
}

function mapPattern(p: IntelligencePattern): IntelligenceInsight | null {
  if (!p.title?.trim() || !p.summary?.trim()) return null;
  const count = patternEvidenceValue(p);
  const inv = investigationFromEvidence(p);
  const fact =
    inv?.whatItSaw?.trim() ||
    (count != null
      ? `${count} related operational activit${
          count === 1 ? "y" : "ies"
        } support this pattern.`
      : p.summary);

  let confidenceHint: InsightConfidence = "Emerging";
  if (p.severity === "critical" && (count ?? 0) >= 3) {
    confidenceHint = "High";
  } else if (p.severity === "warning" || (count ?? 0) >= 3) {
    confidenceHint = "Moderate";
  }

  const evidence = evidenceFromInvestigation(inv?.evidenceItems);
  const reasoningType = reasoningFromPattern(p);
  const reasoned = synthesizeInsightReasoning({
    title: p.title,
    observation: p.summary,
    factSeed: fact,
    evidence,
    reasoningType,
    investigationPrompts: inv?.whatToInvestigate,
    legacyWhy: inv?.whyItMatters,
    storyStatus: inv?.storyStatus,
    facilityLabel: p.facilityId,
    eventCount: p.relatedEventIds?.length ?? count ?? undefined,
    confidenceHint,
    isPositive: reasoningType === "positive",
  });

  return {
    id: `pattern:${p.id}`,
    reasoningType,
    title: p.title,
    observation: p.summary,
    fact: reasoned.fact,
    inference: reasoned.inference,
    impact: reasoned.impact,
    recommendation: reasoned.recommendation,
    confidence: reasoned.confidence,
    confidenceBasis: reasoned.confidenceBasis,
    evidence,
    relatedEntities: [
      ...facilityEntity(p.facilityId),
      ...operationalEntitiesFromEvidence(p.evidence),
      ...eventEntities(p.relatedEventIds),
    ],
    suggestedActions: actionsForInsight({
      facilityId: p.facilityId,
      investigation: reasoned.investigation,
      hasRecommendation: Boolean(reasoned.recommendation),
    }),
    outcome: { status: "detected" },
    sourceRefs: { patternId: p.id },
  };
}

function mapChange(c: IntelligenceChange): IntelligenceInsight | null {
  // Only meaningful/significant movement becomes an insight — avoid noise
  if (c.intensity === "small" && c.direction === "stable") return null;
  if (c.recentCount <= 0 && c.previousCount <= 0) return null;
  if (!c.title?.trim() || !c.summary?.trim()) return null;

  const fact = `In the recent ${7}-day window, ${c.recentCount} matching activities were recorded compared with ${c.previousCount} in the prior window (difference ${c.difference >= 0 ? "+" : ""}${c.difference}).`;

  const evidence: InsightEvidenceItem[] = [
    {
      label: "Recent period count",
      value: String(c.recentCount),
      source: "operational_events",
    },
    {
      label: "Previous period count",
      value: String(c.previousCount),
      source: "operational_events",
    },
    {
      label: "Direction",
      value: c.direction,
      source: "organisation_intelligence",
    },
  ];
  if (c.category === "incident_risk") {
    evidence.push({
      label: "Recent incidents",
      value: String(c.recentCount),
      source: "operational_events",
    });
    evidence.push({
      label: "Previous-period incidents",
      value: String(c.previousCount),
      source: "operational_events",
    });
  }

  const confidenceHint: InsightConfidence =
    c.intensity === "significant"
      ? "High"
      : c.intensity === "meaningful"
        ? "Moderate"
        : "Emerging";

  const reasoningType = reasoningFromChange(c);
  const reasoned = synthesizeInsightReasoning({
    title: c.title,
    observation: c.summary,
    factSeed: fact,
    evidence,
    reasoningType,
    confidenceHint,
    isPositive: c.direction === "decreasing",
    eventCount: c.recentCount + c.previousCount,
  });

  return {
    id: `change:${c.id}`,
    reasoningType,
    title: c.title,
    observation: c.summary,
    fact: reasoned.fact,
    inference: reasoned.inference,
    impact: reasoned.impact,
    recommendation: reasoned.recommendation,
    confidence: reasoned.confidence,
    confidenceBasis: reasoned.confidenceBasis,
    evidence,
    relatedEntities: [],
    suggestedActions: [
      {
        kind: "investigate",
        label: "Explore changes",
        href: "/intelligence/changes",
      },
    ],
    outcome: { status: "detected" },
    sourceRefs: { changeId: c.id },
  };
}

function mapRecommendationHealth(
  data: OrganisationIntelligence
): IntelligenceInsight | null {
  const health = data.recommendationHealth;
  if (health.totalDecisions < 3) return null;
  const dismissedShare =
    health.totalDecisions > 0 ? health.dismissed / health.totalDecisions : 0;
  const acceptedShare =
    health.totalDecisions > 0 ? health.accepted / health.totalDecisions : 0;

  // Only surface when response behaviour is material
  if (dismissedShare < 0.4 && acceptedShare < 0.5) return null;
  if (health.responsePatterns.length === 0 && dismissedShare < 0.5) return null;

  const fact = `Of ${health.totalDecisions} recommendation decisions in the analysis window, ${health.accepted} were accepted, ${health.dismissed} dismissed, and ${health.deferred} deferred.`;
  const evidence: InsightEvidenceItem[] = [
    {
      label: "Accepted",
      value: String(health.accepted),
      source: "recommendation_decisions",
    },
    {
      label: "Dismissed",
      value: String(health.dismissed),
      source: "recommendation_decisions",
    },
    {
      label: "Deferred",
      value: String(health.deferred),
      source: "recommendation_decisions",
    },
    {
      label: "Related activities",
      value: String(health.totalDecisions),
      source: "recommendation_decisions",
    },
  ];

  const reasoned = synthesizeInsightReasoning({
    title:
      dismissedShare >= 0.5
        ? "Recommendation responses show elevated dismissal"
        : "Recommendation responses show solid acceptance",
    observation: fact,
    factSeed: fact,
    evidence,
    reasoningType: "recommendation",
    confidenceHint: health.totalDecisions >= 8 ? "Moderate" : "Emerging",
    isPositive: acceptedShare >= 0.5 && dismissedShare < 0.4,
    eventCount: health.totalDecisions,
  });

  return {
    id: "recommendation-health",
    reasoningType: "recommendation",
    title:
      dismissedShare >= 0.5
        ? "Recommendation responses show elevated dismissal"
        : "Recommendation responses show solid acceptance",
    observation: fact,
    fact: reasoned.fact,
    inference: reasoned.inference,
    impact: reasoned.impact,
    recommendation: reasoned.recommendation,
    confidence: reasoned.confidence,
    confidenceBasis: reasoned.confidenceBasis,
    evidence,
    relatedEntities: [],
    suggestedActions: actionsForInsight({
      investigation: reasoned.investigation,
      hasRecommendation: Boolean(reasoned.recommendation),
    }),
    outcome: {
      status: "action_taken",
      summary: "Derived from recorded recommendation decisions.",
    },
    sourceRefs: {},
  };
}
/**
 * Map OrganisationIntelligence → Insights.
 * Never invents findings: each insight requires grounded source material.
 */
export function mapOrganisationInsights(
  data: OrganisationIntelligence
): OrganisationInsightBundle {
  const insights: IntelligenceInsight[] = [];
  const seen = new Set<string>();

  // Stories first — richest correlation objects
  for (const story of data.stories ?? []) {
    const insight = mapStory(story);
    if (!insight || seen.has(insight.id)) continue;
    seen.add(insight.id);
    insights.push(insight);
  }

  // Priorities (attention / risk / lifecycle)
  const storyFindingIds = new Set(
    (data.stories ?? []).flatMap((s) => s.findingIds)
  );
  for (const priority of data.priorities) {
    // Prefer story representation when the priority is already clustered
    if (storyFindingIds.has(priority.id)) continue;
    const insight = mapPriority(priority);
    if (!insight || seen.has(insight.id)) continue;
    seen.add(insight.id);
    insights.push(insight);
  }

  // Patterns not already covered as priorities
  const priorityIds = new Set(data.priorities.map((p) => p.id));
  for (const pattern of data.patterns) {
    if (priorityIds.has(pattern.id)) continue;
    if (pattern.category === "recommendation_response") continue;
    const insight = mapPattern(pattern);
    if (!insight || seen.has(insight.id)) continue;
    seen.add(insight.id);
    insights.push(insight);
  }

  // Meaningful changes
  for (const change of data.changes) {
    const insight = mapChange(change);
    if (!insight || seen.has(insight.id)) continue;
    seen.add(insight.id);
    insights.push(insight);
  }

  const healthInsight = mapRecommendationHealth(data);
  if (healthInsight && !seen.has(healthInsight.id)) {
    insights.push(healthInsight);
  }

  const rank: Record<InsightConfidence, number> = {
    High: 0,
    Moderate: 1,
    Emerging: 2,
  };
  insights.sort((a, b) => {
    const c = rank[a.confidence] - rank[b.confidence];
    if (c !== 0) return c;
    return a.title.localeCompare(b.title);
  });

  return {
    asOf: data.window.to,
    windowDays: data.window.primaryDays,
    insights,
    status: {
      state: data.status.state,
      supported: data.status.supported,
      notes: data.status.notes,
      partial: data.status.state === "partial",
      processing: data.status.state === "processing",
    },
    recommendationHealth: {
      totalDecisions: data.recommendationHealth.totalDecisions,
      accepted: data.recommendationHealth.accepted,
      dismissed: data.recommendationHealth.dismissed,
      deferred: data.recommendationHealth.deferred,
    },
    exploration: {
      changeCount: data.changes.length,
      patternCount: data.patterns.length,
    },
  };
}
