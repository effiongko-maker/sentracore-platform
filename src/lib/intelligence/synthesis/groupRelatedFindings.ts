import type { OperationalPatternFinding } from "@/lib/intelligence/patterns/detectOperationalLifecyclePatterns";
import { shouldMergeFindings } from "./correlateFindings";
import type { FindingAnchors, FindingCluster } from "./types";

/**
 * Union-find clustering of findings by correlation strength.
 * Single findings remain alone; weak facility-only links do not merge.
 */
export function groupRelatedFindings(
  findings: OperationalPatternFinding[],
  anchors: FindingAnchors[]
): FindingCluster[] {
  if (findings.length === 0) return [];

  const byId = new Map(findings.map((finding) => [finding.id, finding]));
  const anchorById = new Map(anchors.map((anchor) => [anchor.findingId, anchor]));
  const ids = findings.map((finding) => finding.id);

  const parent = new Map<string, string>();
  for (const id of ids) parent.set(id, id);

  function find(id: string): string {
    let current = id;
    while (parent.get(current) !== current) {
      const next = parent.get(current)!;
      parent.set(current, parent.get(next)!);
      current = next;
    }
    return current;
  }

  function union(a: string, b: string) {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA === rootB) return;
    parent.set(rootB, rootA);
  }

  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const anchorA = anchorById.get(ids[i]!);
      const anchorB = anchorById.get(ids[j]!);
      if (!anchorA || !anchorB) continue;
      if (shouldMergeFindings(anchorA, anchorB)) {
        union(ids[i]!, ids[j]!);
      }
    }
  }

  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const root = find(id);
    const list = groups.get(root) ?? [];
    list.push(id);
    groups.set(root, list);
  }

  const clusters: FindingCluster[] = [];
  let index = 0;
  for (const memberIds of groups.values()) {
    const clusterFindings = memberIds
      .map((id) => byId.get(id))
      .filter((finding): finding is OperationalPatternFinding => finding != null)
      .sort((a, b) => b.score - a.score);
    const clusterAnchors = memberIds
      .map((id) => anchorById.get(id))
      .filter((anchor): anchor is FindingAnchors => anchor != null);

    clusters.push({
      id: `cluster:${index}`,
      findings: clusterFindings,
      anchors: clusterAnchors,
    });
    index += 1;
  }

  return clusters;
}
