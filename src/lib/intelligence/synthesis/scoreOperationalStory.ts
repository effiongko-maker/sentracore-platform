import type { OperationalPatternFinding } from "@/lib/intelligence/patterns/detectOperationalLifecyclePatterns";
import type {
  OperationalStoryConfidence,
  OperationalStorySequenceKind,
  OperationalStorySeverity,
  OperationalStoryStatus,
} from "./types";

const SCORE_CAP = 100;
const PRIORITY_SCORE_AT = 52;

const ADDITIONAL_WEIGHTS = [0.35, 0.25, 0.15] as const;

/**
 * Story score with diminishing returns across related findings.
 * Avoids artificially inflating clusters by summing raw finding scores.
 */
export function scoreOperationalStory(input: {
  findings: OperationalPatternFinding[];
  status: OperationalStoryStatus;
  sequenceKind: OperationalStorySequenceKind;
  unresolvedDurationHours: number;
  moduleCount: number;
  entityCount: number;
  eventCount: number;
  confidence: OperationalStoryConfidence;
}): {
  score: number;
  breakdown: Record<string, number>;
  severity: OperationalStorySeverity;
  elevateToPriority: boolean;
  rank: number;
} {
  const sorted = [...input.findings].sort((a, b) => b.score - a.score);
  const base = sorted[0]?.score ?? 0;

  let additional = 0;
  for (let i = 1; i < sorted.length; i += 1) {
    const weight =
      i - 1 < ADDITIONAL_WEIGHTS.length
        ? ADDITIONAL_WEIGHTS[i - 1]!
        : 0.08;
    additional += (sorted[i]?.score ?? 0) * weight;
  }
  additional = Math.min(additional, 28);

  const deterioration =
    input.status === "deteriorating"
      ? 14
      : input.status === "active"
        ? 6
        : input.status === "stabilising"
          ? -4
          : input.status === "resolved"
            ? -10
            : 2;

  const sequenceBonus =
    input.sequenceKind === "deteriorating"
      ? 10
      : input.sequenceKind === "failed_intervention"
        ? 9
        : input.sequenceKind === "response_failure"
          ? 8
          : input.sequenceKind === "persistent_asset"
            ? 7
            : 3;

  const unresolved = Math.min((input.unresolvedDurationHours / 24) * 2.5, 12);
  const workflows = Math.min(Math.max(input.moduleCount - 1, 0) * 5, 15);
  const entities = Math.min(input.entityCount * 1.5, 10);
  const evidence = Math.min(input.eventCount * 0.8, 12);
  const confidence =
    input.confidence === "high" ? 8 : input.confidence === "medium" ? 4 : 1;

  const raw =
    base +
    additional +
    deterioration +
    sequenceBonus +
    unresolved +
    workflows +
    entities +
    evidence +
    confidence;

  const score = Math.round(Math.min(SCORE_CAP, Math.max(0, raw)) * 10) / 10;

  const breakdown = {
    base: Math.round(base * 10) / 10,
    additionalFindings: Math.round(additional * 10) / 10,
    deterioration,
    sequenceBonus,
    unresolvedDuration: Math.round(unresolved * 10) / 10,
    workflows,
    entities: Math.round(entities * 10) / 10,
    evidenceStrength: Math.round(evidence * 10) / 10,
    confidence,
  };

  const severity = storySeverity(input.findings, input.status, score);
  const elevateToPriority =
    score >= PRIORITY_SCORE_AT ||
    severity === "critical" ||
    severity === "high" ||
    (input.status === "deteriorating" && input.findings.length >= 2);

  const rank = Math.min(94, 40 + Math.round(score / 2));

  return { score, breakdown, severity, elevateToPriority, rank };
}

function storySeverity(
  findings: OperationalPatternFinding[],
  status: OperationalStoryStatus,
  score: number
): OperationalStorySeverity {
  if (status === "resolved") return "info";
  if (status === "deteriorating" && score >= 70) return "critical";
  if (findings.some((finding) => finding.severity === "critical") || score >= 75) {
    return "critical";
  }
  if (status === "deteriorating" || score >= 55) return "high";
  if (score >= 40) return "medium";
  if (score >= 25) return "low";
  return "info";
}

export function storyConfidence(input: {
  findingCount: number;
  eventCount: number;
  moduleCount: number;
  hasAssetLink: boolean;
  hasStrongEntityLink: boolean;
}): OperationalStoryConfidence {
  if (
    input.hasAssetLink &&
    input.findingCount >= 2 &&
    input.eventCount >= 5 &&
    input.moduleCount >= 2
  ) {
    return "high";
  }
  if (
    (input.hasStrongEntityLink || input.hasAssetLink) &&
    input.findingCount >= 2 &&
    input.eventCount >= 3
  ) {
    return "high";
  }
  if (input.findingCount >= 2 && input.eventCount >= 3) return "medium";
  if (input.eventCount >= 4 && input.moduleCount >= 2) return "medium";
  return "low";
}
