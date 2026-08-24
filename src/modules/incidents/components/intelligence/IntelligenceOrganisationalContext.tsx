"use client";

import type { IntelligenceResponsePatternView } from "@/lib/intelligence";

function softenPatternSummary(summary: string): string {
  return summary
    .replace(/\bFAC-[A-Z0-9-]+\b/gi, "this facility")
    .replace(/\bat facility this facility\b/gi, "at this facility")
    .replace(/recommendation\.[a-z0-9_]+/gi, "similar recommendations")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function IntelligenceOrganisationalContext({
  responsePatterns,
}: {
  responsePatterns: IntelligenceResponsePatternView[];
}) {
  if (responsePatterns.length === 0) return null;

  const entries = responsePatterns.flatMap((pattern, patternIndex) =>
    pattern.signals
      .filter((signal) => signal.summary?.trim())
      .map((signal, signalIndex) => ({
        summary: softenPatternSummary(signal.summary.trim()),
        key: `${patternIndex}:${signalIndex}:${signal.summary}`,
      }))
  );

  if (entries.length === 0) return null;

  return (
    <section className="space-y-3 border-t border-border/50 pt-4">
      <div>
        <h3 className="text-sm font-medium text-muted">
          Organisational context
        </h3>
        <p className="mt-1 text-xs text-muted">
          Broader patterns in how similar guidance has been handled.
        </p>
      </div>

      <ul className="space-y-2.5">
        {entries.map((entry) => (
          <li key={entry.key} className="text-sm leading-relaxed text-muted">
            {entry.summary}
          </li>
        ))}
      </ul>
    </section>
  );
}
