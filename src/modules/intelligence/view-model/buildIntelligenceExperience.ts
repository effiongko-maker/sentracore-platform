import type {
  InsightConfidence,
  IntelligenceInsight,
  OrganisationInsightBundle,
} from "@/lib/intelligence/insights/types";

export type FindingPriority =
  | "attention"
  | "emerging"
  | "observation"
  | "positive";

export type FindingFilter = "all" | "attention" | "emerging" | "positive";

export type ClassifiedFinding = {
  insight: IntelligenceInsight;
  priority: FindingPriority;
  evidenceSummary: string;
  evidenceCount: number;
};

export type IntelligenceExperienceViewModel = {
  asOf: string;
  windowDays: number;
  contextLine: string;
  summaryLine: string;
  counts: {
    total: number;
    attention: number;
    emerging: number;
    positive: number;
    observation: number;
    resolved: number;
  };
  primary: ClassifiedFinding | null;
  worthWatching: ClassifiedFinding[];
  positive: ClassifiedFinding[];
  recentlyResolved: ClassifiedFinding[];
  observations: ClassifiedFinding[];
  all: ClassifiedFinding[];
  partial: boolean;
  exploration: OrganisationInsightBundle["exploration"];
};

function evidenceCount(insight: IntelligenceInsight): number {
  if (insight.evidence.length > 0) return insight.evidence.length;
  const events = insight.relatedEntities.filter((e) => e.kind === "event").length;
  return events;
}

function evidenceSummary(insight: IntelligenceInsight): string {
  const count = evidenceCount(insight);
  if (count <= 0) return "Limited supporting evidence";
  const facility = insight.relatedEntities.find((e) => e.kind === "facility");
  const base =
    count === 1
      ? "1 evidence point"
      : `${count} evidence points`;
  if (facility?.label || facility?.id) {
    return `${base} · ${facility.label || facility.id}`;
  }
  return base;
}

/**
 * Classify an insight into the experience hierarchy.
 * Grounded only — uses confidence, reasoning type, and outcome already on the insight.
 */
export function classifyFinding(insight: IntelligenceInsight): FindingPriority {
  if (
    insight.reasoningType === "positive" ||
    insight.outcome?.status === "resolved"
  ) {
    // Resolved outcomes go to recentlyResolved separately; still mark positive when type is positive
    if (insight.reasoningType === "positive") return "positive";
  }

  if (insight.outcome?.status === "resolved") {
    return "positive";
  }

  if (
    insight.confidence === "Emerging" ||
    insight.reasoningType === "predictive"
  ) {
    return "emerging";
  }

  const needsAttention =
    (insight.confidence === "High" &&
      (insight.reasoningType === "risk" ||
        insight.reasoningType === "anomaly" ||
        insight.reasoningType === "correlation" ||
        insight.reasoningType === "recurrence" ||
        insight.reasoningType === "concentration" ||
        Boolean(insight.recommendation))) ||
    (insight.confidence === "Moderate" &&
      (insight.reasoningType === "risk" ||
        insight.reasoningType === "anomaly") &&
      Boolean(insight.recommendation)) ||
    insight.outcome?.status === "persisting";

  if (needsAttention) return "attention";

  return "observation";
}

function confidenceRank(c: InsightConfidence): number {
  if (c === "High") return 0;
  if (c === "Moderate") return 1;
  return 2;
}

function sortFindings(a: ClassifiedFinding, b: ClassifiedFinding): number {
  const c = confidenceRank(a.insight.confidence) - confidenceRank(b.insight.confidence);
  if (c !== 0) return c;
  return b.evidenceCount - a.evidenceCount;
}

function formatUpdated(asOf: string): string {
  const t = Date.parse(asOf);
  if (!Number.isFinite(t)) return "Updated recently";
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 2) return "Updated just now";
  if (mins < 60) return `Updated ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 36) return `Updated ${hours}h ago`;
  return "Updated recently";
}

export function buildIntelligenceExperience(
  bundle: OrganisationInsightBundle
): IntelligenceExperienceViewModel {
  const classified: ClassifiedFinding[] = bundle.insights.map((insight) => ({
    insight,
    priority: classifyFinding(insight),
    evidenceSummary: evidenceSummary(insight),
    evidenceCount: evidenceCount(insight),
  }));

  const resolved = classified.filter(
    (row) => row.insight.outcome?.status === "resolved"
  );
  const positive = classified
    .filter(
      (row) =>
        row.priority === "positive" &&
        row.insight.outcome?.status !== "resolved"
    )
    .sort(sortFindings);
  const attention = classified
    .filter((row) => row.priority === "attention")
    .sort(sortFindings);
  const emerging = classified
    .filter((row) => row.priority === "emerging")
    .sort(sortFindings);
  const observations = classified
    .filter((row) => row.priority === "observation")
    .sort(sortFindings);

  const primary = attention[0] ?? emerging[0] ?? observations[0] ?? positive[0] ?? null;

  const worthWatching = emerging.filter(
    (row) => !primary || row.insight.id !== primary.insight.id
  );

  const attentionRest = attention.filter(
    (row) => !primary || row.insight.id !== primary.insight.id
  );

  const total =
    attention.length +
    emerging.length +
    positive.length +
    observations.length;

  const parts: string[] = [];
  if (attention.length > 0) {
    parts.push(
      `${attention.length} require${attention.length === 1 ? "s" : ""} attention`
    );
  }
  if (emerging.length > 0) {
    parts.push(`${emerging.length} emerging`);
  }
  if (positive.length + resolved.length > 0) {
    parts.push(
      `${positive.length + resolved.length} positive`
    );
  }

  const summaryLine =
    total === 0
      ? "No meaningful findings yet"
      : `${total} meaningful finding${total === 1 ? "" : "s"}${
          parts.length ? ` · ${parts.join(" · ")}` : ""
        }`;

  return {
    asOf: bundle.asOf,
    windowDays: bundle.windowDays,
    contextLine: `Organisation intelligence · Last ${bundle.windowDays} days · ${formatUpdated(bundle.asOf)}`,
    summaryLine,
    counts: {
      total,
      attention: attention.length,
      emerging: emerging.length,
      positive: positive.length + resolved.length,
      observation: observations.length,
      resolved: resolved.length,
    },
    primary,
    worthWatching: [...worthWatching, ...attentionRest].slice(0, 6),
    positive,
    recentlyResolved: resolved,
    observations: observations.filter(
      (row) => !primary || row.insight.id !== primary.insight.id
    ),
    all: classified,
    partial: bundle.status.partial,
    exploration: bundle.exploration,
  };
}

export function filterFindings(
  vm: IntelligenceExperienceViewModel,
  filter: FindingFilter
): {
  primary: ClassifiedFinding | null;
  worthWatching: ClassifiedFinding[];
  positive: ClassifiedFinding[];
  recentlyResolved: ClassifiedFinding[];
  observations: ClassifiedFinding[];
} {
  if (filter === "all") {
    return {
      primary: vm.primary,
      worthWatching: vm.worthWatching,
      positive: vm.positive,
      recentlyResolved: vm.recentlyResolved,
      observations: vm.observations,
    };
  }
  if (filter === "attention") {
    const list = vm.all.filter((r) => r.priority === "attention");
    return {
      primary: list[0] ?? null,
      worthWatching: list.slice(1),
      positive: [],
      recentlyResolved: [],
      observations: [],
    };
  }
  if (filter === "emerging") {
    return {
      primary: null,
      worthWatching: vm.all.filter((r) => r.priority === "emerging"),
      positive: [],
      recentlyResolved: [],
      observations: [],
    };
  }
  return {
    primary: null,
    worthWatching: [],
    positive: vm.positive,
    recentlyResolved: vm.recentlyResolved,
    observations: [],
  };
}
