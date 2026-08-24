import type { IntelligenceChange, IntelligencePriority } from "@/lib/intelligence";

const EVIDENCE_TYPES = [
  "count",
  "incident_count",
  "event_count",
  "evidence_count",
  "facility_count",
] as const;

function asPositiveNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

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
