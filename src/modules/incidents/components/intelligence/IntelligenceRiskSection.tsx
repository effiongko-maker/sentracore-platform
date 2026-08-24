"use client";

import { Badge } from "@/components/ui/Badge";
import type {
  IntelligenceRiskView,
  IntelligenceSignalView,
} from "@/lib/intelligence";
import type { StatusVariant } from "@/types";
import { synthesizeIncidentIntelligence } from "./humanizeIntelligence";

function riskVariant(level: string | null): StatusVariant {
  switch ((level ?? "").toLowerCase()) {
    case "critical":
      return "danger";
    case "high":
      return "warning";
    case "moderate":
    case "medium":
      return "info";
    case "low":
      return "neutral";
    default:
      return "default";
  }
}

function labelizeLevel(level: string): string {
  return level
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function IntelligenceRiskSection({
  risk,
  signals,
}: {
  risk: IntelligenceRiskView | null;
  signals: IntelligenceSignalView[];
}) {
  const { findings, riskConclusion } = synthesizeIncidentIntelligence({
    risk,
    signals,
  });

  const hasRisk =
    risk != null &&
    (Boolean(risk.riskLevel) ||
      risk.riskScore != null ||
      Boolean(risk.summary));

  if (!hasRisk && findings.length === 0) {
    return null;
  }

  const levelLabel = risk?.riskLevel
    ? labelizeLevel(risk.riskLevel)
    : "Not assessed";

  return (
    <section className="space-y-4">
      {hasRisk ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">Risk</h3>
            {risk?.riskLevel ? (
              <Badge
                variant={riskVariant(risk.riskLevel)}
                className="normal-case"
              >
                {levelLabel}
              </Badge>
            ) : null}
          </div>
          {riskConclusion ? (
            <p className="text-sm leading-relaxed text-muted">
              {riskConclusion}
            </p>
          ) : null}
        </div>
      ) : null}

      {findings.length > 0 ? (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            Why this needs attention
          </p>
          <ul className="space-y-3.5">
            {findings.map((finding) => (
              <li
                key={`${finding.category}:${finding.body}`}
                className="space-y-1 border-l-2 border-border/80 pl-3"
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                  {finding.category}
                </p>
                <p className="text-sm leading-relaxed text-foreground">
                  {finding.body}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : hasRisk ? (
        <p className="text-sm leading-relaxed text-muted">
          No additional synthesised findings beyond the risk assessment.
        </p>
      ) : null}
    </section>
  );
}
