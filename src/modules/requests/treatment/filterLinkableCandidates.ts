/** Pure local filter for link-treatment candidate catalogues (client-safe). */

import type { LinkableSearchHit } from "./types";

/** Collapse whitespace and lowercase for deterministic matching. */
export function normalizeLinkSearchQuery(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Case-insensitive, whitespace-tolerant match against id / title / status.
 * Empty query matches all candidates (deterministic order preserved by caller).
 */
export function filterLinkableCandidates(
  candidates: LinkableSearchHit[],
  search: string
): LinkableSearchHit[] {
  const query = normalizeLinkSearchQuery(search);
  if (!query) return candidates;

  return candidates.filter((hit) => {
    const haystack = normalizeLinkSearchQuery(
      [hit.id, hit.title, hit.status].filter(Boolean).join(" ")
    );
    return haystack.includes(query);
  });
}
