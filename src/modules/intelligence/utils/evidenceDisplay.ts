import type {
  IntelligenceChange,
  IntelligencePattern,
  IntelligencePriority,
} from "@/lib/intelligence";

const EVIDENCE_TYPES = [
  "count",
  "incident_count",
  "event_count",
  "evidence_count",
  "facility_count",
  "maintenance_event_count",
] as const;

export type BriefingInvestigation = {
  whatItSaw: string;
  sequence: string[];
  evidenceItems: Array<{ label: string; value: string }>;
  whyItMatters?: string;
  whatToInvestigate?: string[];
  relatedFindings?: string[];
  storyStatus?: string;
};

function asPositiveNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

function evidenceValue(
  evidence: Array<{ type: string; value?: unknown }> | undefined,
  type: string
): unknown {
  return evidence?.find((entry) => entry.type === type)?.value;
}

function formatEvidenceValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (Array.isArray(value)) {
    const items = value
      .map((item) => (typeof item === "string" ? item : String(item)))
      .filter((item) => item.trim().length > 0)
      .slice(0, 8);
    return items.length > 0 ? items.join(", ") : null;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => typeof item === "number")
      .map(([key, item]) => `${key} ${item}`);
    return entries.length > 0 ? entries.join(" · ") : null;
  }
  return null;
}

function humaniseStoryStatus(status: string): string {
  switch (status.trim().toLowerCase()) {
    case "deteriorating":
      return "Getting worse";
    case "stabilising":
    case "stabilizing":
      return "Settling";
    case "resolved":
      return "Resolved";
    case "active":
      return "Still active";
    default:
      return status.replace(/_/g, " ");
  }
}

const EVIDENCE_LABELS: Record<string, string> = {
  maintenance_event_count: "Maintenance activities",
  incident_event_count: "Incident activities",
  work_order_event_count: "Work order activities",
  event_count: "Related activities",
  facility_count: "Facilities",
  asset_count: "Assets",
  analysis_window_days: "Period (days)",
  event_ids: "Activity IDs",
  entity_ids: "Related IDs",
  facility_ids: "Facility IDs",
  asset_ids: "Asset IDs",
  delayed_work_order_count: "Delayed work orders",
  linked_open_incident_count: "Linked open incidents",
  open_maintenance_count: "Open maintenance",
  open_work_order_count: "Open work orders",
  unresolved_request_count: "Open requests",
  recent_incident_count: "Recent incidents",
  previous_incident_count: "Previous-period incidents",
  recent_response_count: "Recent responses",
  response_ratio: "Response rate",
  score: "Strength score",
  score_breakdown: "Score breakdown",
  association: "Relationship",
  issue_type: "Issue type",
  category_id: "Category",
  story_status: "Current picture",
  sequence_kind: "How it developed",
  finding_count: "Related findings",
  finding_keys: "Finding keys",
  finding_ids: "Finding IDs",
  why_it_matters: "Why it matters",
  what_to_investigate: "What to look at next",
  incident_ids: "Incident IDs",
  maintenance_ids: "Maintenance IDs",
  work_order_ids: "Work order IDs",
  confidence: "Confidence",
};

/** Extract display evidence from priority read model — UI only, no recalculation. */
export function priorityEvidenceValue(
  priority: IntelligencePriority
): number | null {
  for (const type of EVIDENCE_TYPES) {
    const entry = priority.evidence?.find((e) => e.type === type);
    const n = asPositiveNumber(entry?.value);
    if (n !== null) return n;
  }
  return null;
}

export function patternEvidenceValue(
  pattern: IntelligencePattern
): number | null {
  for (const type of EVIDENCE_TYPES) {
    const entry = pattern.evidence?.find((e) => e.type === type);
    const n = asPositiveNumber(entry?.value);
    if (n !== null) return n;
  }
  return pattern.relatedEventIds?.length
    ? pattern.relatedEventIds.length
    : null;
}

export function investigationFromEvidence(input: {
  whatItSaw?: string;
  sequence?: string[];
  evidence?: Array<{ type: string; value?: unknown }>;
  relatedEventIds?: string[];
}): BriefingInvestigation | undefined {
  const whatItSaw =
    input.whatItSaw ??
    (typeof evidenceValue(input.evidence, "what_it_saw") === "string"
      ? String(evidenceValue(input.evidence, "what_it_saw"))
      : "");
  const sequenceRaw = input.sequence ?? evidenceValue(input.evidence, "sequence");
  const sequence = Array.isArray(sequenceRaw)
    ? sequenceRaw.filter((item): item is string => typeof item === "string")
    : [];

  const whyItMatters =
    typeof evidenceValue(input.evidence, "why_it_matters") === "string"
      ? String(evidenceValue(input.evidence, "why_it_matters"))
      : undefined;
  const whatToInvestigateRaw = evidenceValue(input.evidence, "what_to_investigate");
  const whatToInvestigate = Array.isArray(whatToInvestigateRaw)
    ? whatToInvestigateRaw.filter((item): item is string => typeof item === "string")
    : undefined;
  const relatedFindingsRaw = evidenceValue(input.evidence, "finding_keys");
  const relatedFindings = Array.isArray(relatedFindingsRaw)
    ? relatedFindingsRaw
        .filter((item): item is string => typeof item === "string")
        .map((key) => key.replace(/^operational:/, "").replace(/_/g, " "))
    : undefined;
  const storyStatusRaw =
    typeof evidenceValue(input.evidence, "story_status") === "string"
      ? String(evidenceValue(input.evidence, "story_status"))
      : undefined;
  const storyStatus = storyStatusRaw
    ? humaniseStoryStatus(storyStatusRaw)
    : undefined;

  const skip = new Set([
    "what_it_saw",
    "sequence",
    "pattern_key",
    "window_end",
    "window_from",
    "why_it_matters",
    "what_to_investigate",
    "story_id",
  ]);
  const evidenceItems: Array<{ label: string; value: string }> = [];
  for (const entry of input.evidence ?? []) {
    if (skip.has(entry.type)) continue;
    const formatted = formatEvidenceValue(entry.value);
    if (!formatted) continue;
    evidenceItems.push({
      label: EVIDENCE_LABELS[entry.type] ?? entry.type.replace(/_/g, " "),
      value:
        entry.type === "analysis_window_days" ? `${formatted} days` : formatted,
    });
  }

  if (
    !evidenceItems.some((item) => item.label === "Event IDs") &&
    input.relatedEventIds &&
    input.relatedEventIds.length > 0
  ) {
    evidenceItems.push({
      label: "Event IDs",
      value: input.relatedEventIds.slice(0, 8).join(", "),
    });
  }

  if (
    !whatItSaw &&
    sequence.length === 0 &&
    evidenceItems.length === 0 &&
    !whyItMatters
  ) {
    return undefined;
  }

  return {
    whatItSaw,
    sequence,
    evidenceItems,
    ...(whyItMatters ? { whyItMatters } : {}),
    ...(whatToInvestigate && whatToInvestigate.length > 0
      ? { whatToInvestigate }
      : {}),
    ...(relatedFindings && relatedFindings.length > 0
      ? { relatedFindings }
      : {}),
    ...(storyStatus ? { storyStatus } : {}),
  };
}

export function formatEvidenceFigure(value: number): string {
  return value.toString().padStart(2, "0");
}

export function changeEvidencePair(change: IntelligenceChange): {
  recent: number;
  previous: number;
  delta: number;
} {
  return {
    recent: change.recentCount,
    previous: change.previousCount,
    delta: change.difference,
  };
}
