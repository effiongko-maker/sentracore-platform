import type { BriefingFinding, BriefingViewModel } from "../../view-model/buildBriefingViewModel";
import { formatEvidenceFigure } from "../../utils/evidenceDisplay";

export function buildEvidenceBullets(finding: BriefingFinding): string[] {
  const bullets: string[] = [];
  if (finding.basedOn) bullets.push(`Based on ${finding.basedOn.toLowerCase()}.`);
  if (finding.affectedArea) {
    bullets.push(
      `Most of this activity is linked to ${humaniseArea(finding.affectedArea)}.`
    );
  }
  if (finding.confidence) {
    bullets.push(`Confidence is ${finding.confidence.toLowerCase()}.`);
  }
  if (finding.change) {
    bullets.push(
      `${finding.change.recent} recent vs ${finding.change.previous} in the previous period.`
    );
  }
  if (finding.evidence !== null && finding.evidence > 0) {
    bullets.push(
      `${formatEvidenceFigure(finding.evidence)} related activit${
        finding.evidence === 1 ? "y" : "ies"
      } support this view.`
    );
  }
  return bullets.slice(0, 4);
}

function humaniseArea(area: string): string {
  const cleaned = area.replace(/_/g, " ").replace(/-/g, " ").trim();
  if (/^asset\b/i.test(cleaned)) {
    return cleaned.replace(/^asset\b/i, "Asset");
  }
  if (/^[A-Z]{2,}-/i.test(area) || /^[A-Z0-9]+-\d+/i.test(area)) {
    return cleaned;
  }
  return cleaned;
}

export function displayMetric(finding: BriefingFinding): string {
  if (finding.evidence !== null && finding.evidence > 0) {
    return formatEvidenceFigure(finding.evidence).padStart(2, "0");
  }
  return "—";
}

export function priorityAccent(
  severity?: BriefingFinding["severity"]
): "critical" | "high" | "normal" {
  if (severity === "critical") return "critical";
  if (severity === "high") return "high";
  return "normal";
}

export function relativeTimeLabel(index: number): string {
  const labels = ["9m ago", "24m ago", "1h ago", "2h ago", "3h ago", "5h ago"];
  return labels[index] ?? `${index + 1}h ago`;
}

export type ActivityItem = {
  id: string;
  label: string;
  tone: "critical" | "warning" | "info" | "neutral";
  time: string;
};

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

function uniqueFindings(findings: BriefingFinding[]): BriefingFinding[] {
  const seenIds = new Set<string>();
  const seenTitles = new Set<string>();
  const out: BriefingFinding[] = [];

  for (const finding of findings) {
    const titleKey = normalizeTitle(finding.title);
    if (seenIds.has(finding.id) || seenTitles.has(titleKey)) continue;
    seenIds.add(finding.id);
    seenTitles.add(titleKey);
    out.push(finding);
  }

  return out;
}

export type BriefingComposition = {
  /** NOW — strongest current operational priority */
  primaryPriority: BriefingFinding | null;
  /** NOW — other active priorities (excludes primary) */
  otherPriorities: BriefingFinding[];
  /** WHAT CHANGED — top meaningful changes (excludes NOW findings) */
  changesPreview: BriefingFinding[];
  /** EMERGING PATTERNS — top patterns (excludes NOW + changes) */
  patternsPreview: BriefingFinding[];
  /** Full change list for /intelligence/changes */
  allChanges: BriefingFinding[];
  /** Full pattern list for /intelligence/patterns */
  allPatterns: BriefingFinding[];
  recentActivity: ActivityItem[];
  usedFindingIds: Set<string>;
};

type ClaimTracker = {
  ids: Set<string>;
  titles: Set<string>;
  claim: (finding: BriefingFinding) => void;
  isFree: (finding: BriefingFinding) => boolean;
};

function createClaimTracker(): ClaimTracker {
  const ids = new Set<string>();
  const titles = new Set<string>();
  return {
    ids,
    titles,
    claim(finding) {
      ids.add(finding.id);
      titles.add(normalizeTitle(finding.title));
    },
    isFree(finding) {
      return (
        !ids.has(finding.id) && !titles.has(normalizeTitle(finding.title))
      );
    },
  };
}

/**
 * Intelligence Briefing composition — one continuous hierarchy.
 * A finding used in NOW cannot reappear in What Changed, Patterns, or
 * Recent Activity with the same title.
 */
export function composeBriefingSections(
  vm: BriefingViewModel
): BriefingComposition {
  const tracker = createClaimTracker();

  const attention = uniqueFindings(vm.attentionFindings);
  const changes = uniqueFindings(vm.changeFindings);
  const patterns = uniqueFindings(vm.patternFindings);

  const primaryPriority = attention[0] ?? null;
  if (primaryPriority) tracker.claim(primaryPriority);

  const otherPriorities = attention
    .filter((finding) => tracker.isFree(finding))
    .slice(0, 4);
  for (const finding of otherPriorities) tracker.claim(finding);

  const changesPreview = changes
    .filter((finding) => tracker.isFree(finding))
    .slice(0, 3);
  for (const finding of changesPreview) tracker.claim(finding);

  const patternsPreview = patterns
    .filter((finding) => tracker.isFree(finding))
    .slice(0, 3);
  for (const finding of patternsPreview) tracker.claim(finding);

  // Exploration pages show full pools, but still drop title-collisions
  // with the briefing primary so the story stays coherent.
  const allChanges = changes.filter(
    (finding) =>
      finding.id !== primaryPriority?.id &&
      normalizeTitle(finding.title) !==
        (primaryPriority ? normalizeTitle(primaryPriority.title) : "")
  );
  const allPatterns = patterns.filter(
    (finding) =>
      finding.id !== primaryPriority?.id &&
      normalizeTitle(finding.title) !==
        (primaryPriority ? normalizeTitle(primaryPriority.title) : "")
  );

  const recentActivity = buildRecentActivityFromContext(vm, tracker.titles);

  return {
    primaryPriority,
    otherPriorities,
    changesPreview,
    patternsPreview,
    allChanges,
    allPatterns,
    recentActivity,
    usedFindingIds: tracker.ids,
  };
}

/**
 * Chronological operational activity — not an intelligence finding list.
 */
export function buildRecentActivityFromContext(
  vm: BriefingViewModel,
  reservedTitles: Set<string> = new Set()
): ActivityItem[] {
  const ctx = vm.operationalContext;
  const locationHint =
    vm.attentionFindings.find((f) => f.affectedArea)?.affectedArea ??
    vm.patternFindings.find((f) => f.affectedArea)?.affectedArea ??
    vm.changeFindings.find((f) => f.affectedArea)?.affectedArea;

  const candidates: ActivityItem[] = [];

  if (ctx.recentIncidentCount7d > 0) {
    candidates.push({
      id: "activity-incident-7d",
      label: locationHint
        ? `Incident reported — ${locationHint}`
        : `${ctx.recentIncidentCount7d} incident${
            ctx.recentIncidentCount7d === 1 ? "" : "s"
          } reported this week`,
      tone: ctx.criticalRiskCount > 0 ? "critical" : "warning",
      time: relativeTimeLabel(candidates.length),
    });
  } else if (ctx.recentIncidentCount30d > 0) {
    candidates.push({
      id: "activity-incident-30d",
      label: locationHint
        ? `Incident reported — ${locationHint}`
        : "Incident reported across the organisation",
      tone: ctx.criticalRiskCount > 0 ? "critical" : "warning",
      time: relativeTimeLabel(candidates.length),
    });
  }

  if (ctx.maintenanceRequestedCount30d > 0) {
    candidates.push({
      id: "activity-maintenance",
      label: locationHint
        ? `Maintenance requested — ${locationHint}`
        : ctx.maintenanceRequestedCount30d === 1
          ? "Maintenance request submitted"
          : `${ctx.maintenanceRequestedCount30d} maintenance requests recorded`,
      tone: "warning",
      time: relativeTimeLabel(candidates.length),
    });
  }

  if (ctx.workOrdersCreatedCount30d > 0) {
    candidates.push({
      id: "activity-wo-created",
      label:
        ctx.workOrdersCreatedCount30d === 1
          ? "Work order created"
          : `${ctx.workOrdersCreatedCount30d} work orders created`,
      tone: "info",
      time: relativeTimeLabel(candidates.length),
    });
  }

  if (ctx.workOrdersCompletedCount30d > 0) {
    candidates.push({
      id: "activity-wo-complete",
      label:
        ctx.workOrdersCompletedCount30d === 1
          ? "Work order completed"
          : `${ctx.workOrdersCompletedCount30d} work orders completed`,
      tone: "info",
      time: relativeTimeLabel(candidates.length),
    });
  }

  if (ctx.lifecycleEventCount30d > 0) {
    candidates.push({
      id: "activity-lifecycle",
      label:
        ctx.lifecycleEventCount30d === 1
          ? "Status update recorded across incidents, maintenance, or work orders"
          : `${ctx.lifecycleEventCount30d} status updates across incidents, maintenance, and work orders`,
      tone: "neutral",
      time: relativeTimeLabel(candidates.length),
    });
  }

  const filtered = candidates.filter(
    (item) => !reservedTitles.has(normalizeTitle(item.label))
  );

  if (filtered.length > 0) return filtered.slice(0, 5);

  return [
    {
      id: "activity-none",
      label: "No recent activity recorded in this period",
      tone: "neutral",
      time: relativeTimeLabel(0),
    },
  ];
}
