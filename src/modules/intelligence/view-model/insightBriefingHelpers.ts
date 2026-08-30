import type { IntelligenceInsight } from "@/lib/intelligence/insights/types";
import type { ClassifiedFinding } from "../view-model/buildIntelligenceExperience";

export type ActionableItem = {
  kind: "request" | "maintenance" | "incident" | "work_order" | "asset";
  id: string;
  label: string;
  href: string;
  /** Optional facility / location context when known from the insight. */
  context?: string;
};

/** Action destinations only — Facilities stay insight/evidence context, not actions. */
const GROUP_ORDER: ActionableItem["kind"][] = [
  "request",
  "maintenance",
  "incident",
  "work_order",
  "asset",
];

const ID_PATTERNS: Array<{
  kind: ActionableItem["kind"];
  re: RegExp;
}> = [
  { kind: "request", re: /\b(REQ-\d{4}-\d+)\b/gi },
  { kind: "maintenance", re: /\b(MNT-\d{4}-\d+)\b/gi },
  { kind: "incident", re: /\b(INC-\d{4}-\d+)\b/gi },
  { kind: "work_order", re: /\b(WO-\d{4}-\d+)\b/gi },
];

const INITIAL_PER_GROUP = 8;

function hrefFor(kind: ActionableItem["kind"], id: string): string {
  switch (kind) {
    case "request":
      return `/requests?id=${encodeURIComponent(id)}`;
    case "maintenance":
      return `/maintenance?id=${encodeURIComponent(id)}`;
    case "incident":
      return `/incidents?id=${encodeURIComponent(id)}`;
    case "work_order":
      return `/work-orders?id=${encodeURIComponent(id)}`;
    case "asset":
      return `/assets?id=${encodeURIComponent(id)}`;
  }
}

function pushUnique(
  map: Map<string, ActionableItem>,
  item: ActionableItem
) {
  const key = `${item.kind}:${item.id}`;
  if (!map.has(key)) map.set(key, item);
}

function facilityContext(insight: IntelligenceInsight): string | undefined {
  const facility = insight.relatedEntities.find((e) => e.kind === "facility");
  return facility?.label || facility?.id;
}

/**
 * Build actionable operational destinations from grounded Insight entities
 * and evidence text. Never fabricates IDs. Never falls back to generic module lists.
 */
export function buildActionableItems(
  insight: IntelligenceInsight
): ActionableItem[] {
  const map = new Map<string, ActionableItem>();
  const context = facilityContext(insight);

  for (const entity of insight.relatedEntities) {
    if (
      entity.kind === "asset" ||
      entity.kind === "incident" ||
      entity.kind === "maintenance" ||
      entity.kind === "work_order"
    ) {
      pushUnique(map, {
        kind: entity.kind,
        id: entity.id,
        label: entity.label || entity.id,
        href: hrefFor(entity.kind, entity.id),
        context,
      });
    }
  }

  const corpus = [
    insight.fact,
    insight.observation,
    insight.recommendation ?? "",
    ...insight.evidence.map((e) => `${e.label} ${e.value}`),
    ...insight.suggestedActions.map((a) => a.label),
  ].join("\n");

  for (const pattern of ID_PATTERNS) {
    pattern.re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.re.exec(corpus)) !== null) {
      const id = match[1].toUpperCase();
      pushUnique(map, {
        kind: pattern.kind,
        id,
        label: id,
        href: hrefFor(pattern.kind, id),
        context,
      });
    }
  }

  return [...map.values()];
}

export function groupActionableItems(
  items: ActionableItem[]
): Array<{ kind: ActionableItem["kind"]; label: string; rows: ActionableItem[] }> {
  const buckets = new Map<ActionableItem["kind"], ActionableItem[]>();
  for (const item of items) {
    const list = buckets.get(item.kind) ?? [];
    list.push(item);
    buckets.set(item.kind, list);
  }

  return GROUP_ORDER.filter((kind) => (buckets.get(kind)?.length ?? 0) > 0).map(
    (kind) => ({
      kind,
      label: groupHeading(kind),
      rows: (buckets.get(kind) ?? []).slice(0, INITIAL_PER_GROUP),
    })
  );
}

export function groupHeading(kind: ActionableItem["kind"]): string {
  switch (kind) {
    case "request":
      return "Requests";
    case "maintenance":
      return "Maintenance";
    case "incident":
      return "Incidents";
    case "work_order":
      return "Work Orders";
    case "asset":
      return "Assets";
  }
}

export function recordActionLabel(kind: ActionableItem["kind"]): string {
  if (kind === "asset" || kind === "work_order") {
    return "View →";
  }
  return "View / Treat →";
}

export function heroStatement(primary: ClassifiedFinding | null): {
  headline: string;
  support: string;
} {
  if (!primary) {
    return {
      headline: "Here's what SentraCore has learned",
      support:
        "SentraCore is watching operational activity. When evidence supports a conclusion, it will appear here.",
    };
  }
  if (primary.priority === "attention") {
    return {
      headline: "The operation needs attention",
      support:
        "SentraCore has analysed recent activity and identified what matters most right now.",
    };
  }
  if (primary.priority === "emerging") {
    return {
      headline: "Early signals are forming",
      support:
        "SentraCore has detected emerging patterns that may need closer watching.",
    };
  }
  if (primary.priority === "positive") {
    return {
      headline: "Some conditions are improving",
      support:
        "SentraCore has identified grounded positive signals in the recent analysis window.",
    };
  }
  return {
    headline: "Here's what SentraCore has learned",
    support:
      "SentraCore has reviewed recent operational activity and summarised the clearest findings.",
  };
}

export function insightAccent(
  finding: ClassifiedFinding
): "critical" | "high" | "normal" {
  const { insight, priority } = finding;
  if (
    priority === "attention" &&
    (insight.reasoningType === "risk" ||
      insight.reasoningType === "anomaly" ||
      insight.confidence === "High")
  ) {
    return "critical";
  }
  if (priority === "attention" || insight.confidence === "Moderate") {
    return "high";
  }
  return "normal";
}

export function displayInsightMetric(finding: ClassifiedFinding): string {
  const count = finding.evidenceCount;
  if (count > 0) return String(Math.min(count, 99)).padStart(2, "0");
  return "—";
}
