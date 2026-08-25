import type { OperationalPatternFinding } from "@/lib/intelligence/patterns/detectOperationalLifecyclePatterns";
import {
  normalizeOperationalTimelineEvent,
} from "@/lib/operational/timeline/normalizeOperationalTimelineEvent";
import type {
  LifecycleEventRow,
  OperationalTimelineEvent,
} from "@/lib/operational/timeline/types";
import { buildOperationalStory } from "./buildOperationalStory";
import {
  enrichAnchorsFromTimelineEvents,
  extractFindingAnchors,
} from "./extractFindingAnchors";
import { groupRelatedFindings } from "./groupRelatedFindings";
import type { OperationalStory } from "./types";

export type SynthesisResult = {
  stories: OperationalStory[];
  /** Finding IDs absorbed into a story (supporting evidence, not standalone priority). */
  absorbedFindingIds: Set<string>;
  /** Findings that remain standalone (not synthesised). */
  standaloneFindings: OperationalPatternFinding[];
};

/**
 * Operational Intelligence Synthesis:
 * findings → correlate → cluster → sequence → story → score
 *
 * Deterministic and evidence-backed. Does not invent causation.
 */
export function synthesiseOperationalStories(input: {
  findings: OperationalPatternFinding[];
  events: LifecycleEventRow[];
  windowFrom: string;
  windowTo: string;
}): SynthesisResult {
  if (input.findings.length === 0) {
    return {
      stories: [],
      absorbedFindingIds: new Set(),
      standaloneFindings: [],
    };
  }

  const timeline: OperationalTimelineEvent[] = input.events
    .map(normalizeOperationalTimelineEvent)
    .filter((event): event is OperationalTimelineEvent => event != null)
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));

  const anchors = input.findings.map((finding) =>
    enrichAnchorsFromTimelineEvents(extractFindingAnchors(finding), timeline)
  );

  const clusters = groupRelatedFindings(input.findings, anchors);
  const stories: OperationalStory[] = [];
  const absorbedFindingIds = new Set<string>();

  let storyIndex = 0;
  for (const cluster of clusters) {
    const story = buildOperationalStory({
      cluster,
      events: timeline,
      windowFrom: input.windowFrom,
      windowTo: input.windowTo,
      index: storyIndex,
    });

    if (!story) continue;

    stories.push(story);
    for (const finding of story.findings) {
      absorbedFindingIds.add(finding.id);
    }
    storyIndex += 1;
  }

  stories.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return Date.parse(b.lastObservedAt) - Date.parse(a.lastObservedAt);
  });

  // Re-rank after sort for stable briefing competition.
  stories.forEach((story, index) => {
    story.rank = Math.min(94, story.rank - index);
  });

  const standaloneFindings = input.findings.filter(
    (finding) => !absorbedFindingIds.has(finding.id)
  );

  return {
    stories,
    absorbedFindingIds,
    standaloneFindings,
  };
}
